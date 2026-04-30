// Wrapper do Google Calendar — usado APENAS pra criar/cancelar eventos
// quando o agente marca uma reunião. Disponibilidade do vendedor não é
// lida do Calendar (vem de BD_Vendedores.horarios_padrao + BD_Disponibilidade_Excecoes).

import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];
const TIMEZONE = 'America/Sao_Paulo';
const TAG = 'reuniao_intento';

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

// Cria evento de reunião na agenda do vendedor com Google Meet automático.
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

// === Helpers de tempo ===

const DIAS_KEY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

export function diaDaSemana(date) {
  return DIAS_KEY[date.getDay()];
}

// Formata horário pra exibição PT-BR ("Terça-feira, 06/05 às 19h00")
export function formatarHorarioBR(iso) {
  const d = new Date(iso);
  const dias = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dias[d.getDay()]}, ${dd}/${mm} às ${hh}h${min}`;
}

// Verifica se [inicio, fim] cabe inteiramente em alguma janela do dia.
// horariosDoDia: array de strings "HH:MM-HH:MM"
// inicio, fim: Date
export function cabeEmJanelas(inicio, fim, horariosDoDia) {
  if (!horariosDoDia || horariosDoDia.length === 0) return false;
  for (const j of horariosDoDia) {
    const m = String(j).match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
    if (!m) continue;
    const inicioJ = new Date(inicio); inicioJ.setHours(+m[1], +m[2], 0, 0);
    const fimJ    = new Date(inicio); fimJ.setHours(+m[3], +m[4], 0, 0);
    if (inicio >= inicioJ && fim <= fimJ) return true;
  }
  return false;
}

// Verifica se [inicio, fim] colide com algum bloqueio.
// excecoes: array de {tipo, dtInicio (ISO), dtFim (ISO)}
// Considera apenas tipo === 'bloqueio'.
export function colideComBloqueio(inicio, fim, excecoes) {
  for (const e of excecoes || []) {
    if (e.tipo !== 'bloqueio') continue;
    const eIni = new Date(e.dtInicio);
    const eFim = new Date(e.dtFim);
    if (inicio < eFim && fim > eIni) return true;
  }
  return false;
}

// Gera slots de 30/30 min dentro das janelas do padrão do vendedor pros próximos N dias,
// respeitando exceções de bloqueio.
// horariosPadrao: { seg: ["09:00-12:00", ...], ter: [...], ... }
// excecoes: lista de exceções
// dias: número de dias à frente
// durMin: duração de cada slot
// antecedenciaMinHoras: slots só a partir de agora + Xh
export function gerarSlotsLivres(horariosPadrao, excecoes, dias, durMin, antecedenciaMinHoras) {
  const out = [];
  if (!horariosPadrao) return out;
  const agora = new Date();
  const minimo = new Date(agora.getTime() + antecedenciaMinHoras * 60 * 60 * 1000);
  const fimPeriodo = new Date(agora.getTime() + dias * 24 * 60 * 60 * 1000);

  let cursor = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  while (cursor <= fimPeriodo) {
    const dia = DIAS_KEY[cursor.getDay()];
    const janelas = horariosPadrao[dia] || [];
    for (const j of janelas) {
      const m = String(j).match(/^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/);
      if (!m) continue;
      const inicioJ = new Date(cursor); inicioJ.setHours(+m[1], +m[2], 0, 0);
      const fimJ    = new Date(cursor); fimJ.setHours(+m[3], +m[4], 0, 0);
      let t = new Date(inicioJ);
      while (true) {
        const slotFim = new Date(t.getTime() + durMin * 60 * 1000);
        if (slotFim > fimJ) break;
        if (t >= minimo && !colideComBloqueio(t, slotFim, excecoes)) {
          out.push(t.toISOString());
        }
        t = new Date(t.getTime() + 30 * 60 * 1000);
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return out;
}
