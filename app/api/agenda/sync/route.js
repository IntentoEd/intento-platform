export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { listarBookingsAppointment, parseLeadFromDescription, formatarHorarioBR } from '@/lib/googleCalendar';

const DIAS_OLHAR_FRENTE = 30;
const DIAS_OLHAR_TRAS = 7;

async function gas(payload) {
  const res = await fetch(process.env.GOOGLE_APPSCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function autorizado(request) {
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.replace(/^Bearer\s+/i, '');
  const cron = process.env.CRON_SECRET && bearer === process.env.CRON_SECRET;
  const headerToken = request.headers.get('x-agent-token') || '';
  const agente = process.env.AGENT_API_TOKEN && headerToken === process.env.AGENT_API_TOKEN;
  return cron || agente;
}

export async function POST(request) {
  if (!autorizado(request)) {
    return NextResponse.json({ status: 'erro', mensagem: 'Não autorizado' }, { status: 401 });
  }
  return executarSync();
}

export async function GET(request) {
  if (!autorizado(request)) {
    return NextResponse.json({ status: 'erro', mensagem: 'Não autorizado' }, { status: 401 });
  }
  return executarSync();
}

async function executarSync() {
  const inicio = Date.now();
  try {
    const vendResp = await gas({ acao: 'listarVendedoresAtendimento' });
    if (vendResp.status !== 'sucesso') {
      return NextResponse.json({ status: 'erro', mensagem: vendResp.mensagem || 'falha listar vendedores' }, { status: 500 });
    }
    const vendedores = vendResp.vendedores || [];

    const agora = new Date();
    const timeMin = new Date(agora.getTime() - DIAS_OLHAR_TRAS * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(agora.getTime() + DIAS_OLHAR_FRENTE * 24 * 60 * 60 * 1000).toISOString();

    const stats = {
      vendedoresProcessados: 0,
      bookingsLidos: 0,
      jaProcessados: 0,
      novosVinculados: 0,
      novosCriados: 0,
      erros: 0,
      detalhes: [],
    };

    for (const v of vendedores) {
      try {
        const events = await listarBookingsAppointment(v.email, timeMin, timeMax);
        stats.vendedoresProcessados++;
        stats.bookingsLidos += events.length;

        for (const ev of events) {
          try {
            // 1. Skip se já processado (gcal_event_id já em algum lead)
            const dedup = await gas({ acao: 'buscarLeadPorGcalEventId', gcalEventId: ev.id });
            if (dedup.status === 'sucesso' && dedup.lead) {
              stats.jaProcessados++;
              continue;
            }

            // 2. Parse lead info do description
            const info = parseLeadFromDescription(ev.description || '');
            if (!info.email) {
              stats.erros++;
              stats.detalhes.push({
                eventId: ev.id,
                vendedor: v.email,
                erro: 'sem email no description',
                summary: ev.summary,
              });
              continue;
            }

            const dataReuniao = (ev.start?.dateTime || '').slice(0, 10);
            const inicioISO = ev.start?.dateTime || '';

            // 3. Busca lead existente por email
            const leadResp = await gas({ acao: 'buscarLeadPorEmail', email: info.email });

            if (leadResp.status === 'sucesso' && leadResp.lead) {
              // Atualiza lead existente
              await gas({
                acao: 'editarLead',
                idLead: leadResp.lead.idLead,
                vendedor: v.email,
                dataProximaAcao: dataReuniao,
                gcalEventId: ev.id,
                porEmail: 'sync@sistema',
              });
              await gas({
                acao: 'moverLeadFase',
                idLead: leadResp.lead.idLead,
                novaFase: 'Reuniao agendada',
                porEmail: 'sync@sistema',
              });
              stats.novosVinculados++;
              stats.detalhes.push({
                eventId: ev.id,
                vendedor: v.email,
                acao: 'vinculou',
                idLead: leadResp.lead.idLead,
                horario: formatarHorarioBR(inicioISO),
              });
            } else {
              // Cria novo lead — origem appointment_direct
              const criar = await gas({
                acao: 'criarLead',
                nome: info.nome,
                email: info.email,
                telefone: info.telefone,
                origem: 'appointment_direct',
                vendedor: v.email,
                fase: 'Reuniao agendada',
                porEmail: 'sync@sistema',
              });
              if (criar.status === 'sucesso' && criar.idLead) {
                // Edita pra adicionar dados que criarLead não aceita
                await gas({
                  acao: 'editarLead',
                  idLead: criar.idLead,
                  dataProximaAcao: dataReuniao,
                  gcalEventId: ev.id,
                  porEmail: 'sync@sistema',
                });
                stats.novosCriados++;
                stats.detalhes.push({
                  eventId: ev.id,
                  vendedor: v.email,
                  acao: 'criou_lead',
                  idLead: criar.idLead,
                  horario: formatarHorarioBR(inicioISO),
                });
              } else {
                stats.erros++;
                stats.detalhes.push({
                  eventId: ev.id,
                  vendedor: v.email,
                  erro: 'falha criarLead: ' + (criar.mensagem || 'unknown'),
                });
              }
            }
          } catch (eEv) {
            stats.erros++;
            stats.detalhes.push({ eventId: ev.id, vendedor: v.email, erro: eEv.message });
          }
        }
      } catch (eVend) {
        stats.erros++;
        stats.detalhes.push({ vendedor: v.email, erro: eVend.message });
      }
    }

    return NextResponse.json({
      status: 'sucesso',
      stats,
      duracaoMs: Date.now() - inicio,
      ranAt: agora.toISOString(),
    });
  } catch (e) {
    console.error('[/api/agenda/sync]', e);
    return NextResponse.json({ status: 'erro', mensagem: e.message }, { status: 500 });
  }
}
