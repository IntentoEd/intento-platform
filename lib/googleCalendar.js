// Wrapper do Google Calendar pro fluxo de agenda da Intento.
// Usa Service Account com Domain-wide Delegation pra impersonar cada vendedor.
// Cada chamada passa o `userEmail` que será impersonado.
//
// Modelo de disponibilidade:
//   1. Vendedor declara janelas criando eventos no próprio Google Calendar
//      com título começando com "[Intento]" (ex: "[Intento] Disponível").
//      Pode ser recorrente.
//   2. Sistema lista esses eventos como "janelas declaradas".
//   3. Reuniões marcadas pelo sistema têm extendedProperty tipo=reuniao_intento.
//   4. Slot disponível = dentro de janela declarada AND sem reunião já marcada.
//   5. Vendedor é responsável por não declarar disponibilidade quando tem
//      outros compromissos no calendar (não fazemos esse double-check).

import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];
const TIMEZONE = 'America/Sao_Paulo';
const TAG = 'reuniao_intento';
const PREFIX_DISPONIBILIDADE = '[Intento]';

// Marcador deixado pelo Google quando alguém marca via Appointment Schedule
const APPT_SCHEDULE_TAG_KEY = 'goo.createdBySet';
const APPT_SCHEDULE_TAG_VAL = 'default_cita';

function getServiceAccountCreds() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY não configurado');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY inválido (não é JSON): ' + e.message);
  }
}

function getCalendarClient(impersonateEmail) {
  const creds = getServiceAccountCreds();
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: SCOPES,
    subject: impersonateEmail,
  });
  return google.calendar({ version: 'v3', auth });
}

// Lista as janelas declaradas pelo vendedor (eventos com título começando com [Intento]).
// Retorna [{start, end, summary, eventId}] já com instâncias recorrentes expandidas.
// Exclui eventos com tag tipo=reuniao_intento (esses são reuniões marcadas pelo sistema).
export async function listarJanelasDisponibilidade(vendedorEmail, timeMinISO, timeMaxISO) {
  const calendar = getCalendarClient(vendedorEmail);
  const items = [];
  let pageToken;
  do {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      q: PREFIX_DISPONIBILIDADE,
      pageToken,
    });
    for (const e of res.data.items || []) items.push(e);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return items
    .filter((e) => {
      const title = (e.summary || '').trim();
      if (!title.toLowerCase().startsWith(PREFIX_DISPONIBILIDADE.toLowerCase())) return false;
      // Exclui reuniões já marcadas pelo sistema (que poderiam, em tese, ter [Intento] no título)
      const tipo = e.extendedProperties?.private?.tipo;
      if (tipo === TAG) return false;
      return true;
    })
    .map((e) => ({
      start: e.start?.dateTime || e.start?.date,
      end:   e.end?.dateTime   || e.end?.date,
      summary: e.summary,
      eventId: e.id,
    }))
    .filter((e) => e.start && e.end);
}

// Lista reuniões já marcadas pelo sistema (extendedProperty tipo=reuniao_intento) no período.
export async function listarReunioesBooked(vendedorEmail, timeMinISO, timeMaxISO) {
  const calendar = getCalendarClient(vendedorEmail);
  const items = [];
  let pageToken;
  do {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      privateExtendedProperty: 'tipo=' + TAG,
      singleEvents: true,
      maxResults: 100,
      pageToken,
    });
    for (const e of res.data.items || []) items.push(e);
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return items.map((e) => ({
    start: e.start?.dateTime || e.start?.date,
    end:   e.end?.dateTime   || e.end?.date,
    eventId: e.id,
  }));
}

// Cria evento de reunião na agenda do vendedor com Google Meet.
// Retorna { eventId, htmlLink, meetLink }
export async function criarEvento({
  vendedorEmail,
  inicioISO,
  fimISO,
  titulo,
  descricao,
  convidados,
}) {
  const calendar = getCalendarClient(vendedorEmail);
  const requestBody = {
    summary: titulo,
    description: descricao,
    start: { dateTime: inicioISO, timeZone: TIMEZONE },
    end:   { dateTime: fimISO,   timeZone: TIMEZONE },
    attendees: (convidados || []).map((e) => ({ email: e })),
    extendedProperties: { private: { tipo: TAG } },
    conferenceData: {
      createRequest: {
        requestId: 'intento-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };
  const res = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody,
  });
  const ev = res.data;
  let meetLink = '';
  if (ev.conferenceData?.entryPoints) {
    const meet = ev.conferenceData.entryPoints.find((p) => p.entryPointType === 'video');
    if (meet) meetLink = meet.uri;
  }
  return {
    eventId: ev.id,
    htmlLink: ev.htmlLink || '',
    meetLink: meetLink || ev.hangoutLink || '',
  };
}

export async function cancelarEvento({ vendedorEmail, eventId }) {
  const calendar = getCalendarClient(vendedorEmail);
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });
    return { ok: true };
  } catch (e) {
    if (e.code === 404 || e.code === 410) return { ok: true, jaApagado: true };
    throw e;
  }
}

// Conta reuniões marcadas pelo sistema no mês corrente — usado pra round-robin.
export async function contarReunioesDoMes(vendedorEmail) {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString();
  const fim    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString();
  const lista = await listarReunioesBooked(vendedorEmail, inicio, fim);
  return lista.length;
}

// === Helpers de tempo ===

// Verifica se [inicio, fim] cabe inteiramente dentro de alguma janela declarada.
export function dentroDeJanela(inicio, fim, janelas) {
  for (const j of janelas) {
    const jStart = new Date(j.start);
    const jEnd   = new Date(j.end);
    if (inicio >= jStart && fim <= jEnd) return true;
  }
  return false;
}

// Verifica se [inicio, fim] colide com alguma reunião já marcada.
export function colideComReuniao(inicio, fim, reunioesBooked) {
  for (const r of reunioesBooked) {
    const rStart = new Date(r.start);
    const rEnd   = new Date(r.end);
    if (inicio < rEnd && fim > rStart) return true;
  }
  return false;
}

// Gera slots de 30 em 30 minutos dentro de cada janela declarada.
// janelas: [{start, end}] em ISO. Retorna ISO[] dos starts.
export function slotsDentroJanelas(janelas, durMin, antecedenciaMinHoras) {
  const out = [];
  const minimo = new Date(Date.now() + antecedenciaMinHoras * 60 * 60 * 1000);
  for (const j of janelas) {
    const jStart = new Date(j.start);
    const jEnd   = new Date(j.end);
    let t = new Date(jStart);
    while (true) {
      const fimSlot = new Date(t.getTime() + durMin * 60 * 1000);
      if (fimSlot > jEnd) break;
      if (t >= minimo) out.push(t.toISOString());
      t = new Date(t.getTime() + 30 * 60 * 1000);
    }
  }
  return out;
}

// Lista bookings criados via Google Appointment Schedule no calendar do vendedor.
// Filtra por sharedExtendedProperty goo.createdBySet=default_cita — marcador
// que o Google adiciona automaticamente nesses eventos.
export async function listarBookingsAppointment(vendedorEmail, timeMinISO, timeMaxISO) {
  const calendar = getCalendarClient(vendedorEmail);
  const items = [];
  let pageToken;
  do {
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      sharedExtendedProperty: `${APPT_SCHEDULE_TAG_KEY}=${APPT_SCHEDULE_TAG_VAL}`,
      singleEvents: true,
      maxResults: 250,
      pageToken,
    });
    for (const e of res.data.items || []) items.push(e);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return items;
}

// Extrai dados do lead (nome, email, telefone) do description HTML que o Google
// gera quando alguém marca via Appointment Schedule.
// Padrão: "<b>Reservado por</b>\nNome\nemail@x.com\n+55 11 99999-9999"
export function parseLeadFromDescription(html) {
  if (!html) return { nome: '', email: '', telefone: '' };
  // Decodifica entities básicos + remove tags
  const texto = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(b|strong|i|em|p|div|span|a)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
  // Procura pela âncora "Reservado por" (PT) ou "Booked by" (EN)
  const ancoraIdx = linhas.findIndex((l) => /reservado por|booked by/i.test(l));
  const subset = ancoraIdx >= 0 ? linhas.slice(ancoraIdx + 1) : linhas;
  const nome = subset[0] || '';
  const email = subset.find((l) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(l)) || '';
  // Telefone: linha com dígitos e caracteres comuns de telefone, com >= 8 dígitos
  const telefone = subset.find((l) => {
    if (/@/.test(l)) return false;
    const digits = l.replace(/\D/g, '');
    return digits.length >= 8 && /[\d\s\-\(\)\+\.]+/.test(l);
  }) || '';
  return { nome, email, telefone };
}

export function formatarHorarioBR(iso) {
  const d = new Date(iso);
  const dias = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dias[d.getDay()]}, ${dd}/${mm} às ${hh}h${min}`;
}
