export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { chamarGAS } from '@/lib/gasClient';
import { verificarUsuario } from '@/lib/auth';

const VAPID_SUBJECT = 'mailto:filippe@metodointento.com.br';

function configurarVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID keys ausentes em env vars');
  webpush.setVapidDetails(VAPID_SUBJECT, pub, priv);
}

async function buscarSubscriptions(emailOuEmails) {
  const body = Array.isArray(emailOuEmails) ? { emails: emailOuEmails } : { email: emailOuEmails };
  const data = await chamarGAS({ acao: 'listarPushSubscriptions', ...body });
  return data.subscriptions || [];
}

async function removerSubscriptionInvalida(endpoint) {
  try {
    await chamarGAS({ acao: 'unsubscribePush', endpoint });
  } catch {}
}

export async function POST(request) {
  try {
    // Auth: cron do GAS (x-agent-token) OU usuário logado — que só pode notificar
    // a si mesmo. Sem isso, qualquer um dispara push com a "voz" da Intento pra
    // qualquer inscrito (vetor de phishing).
    const agentToken = request.headers.get('x-agent-token');
    const isAgent = !!agentToken && agentToken === process.env.AGENT_API_TOKEN;
    let callerEmail = null;
    if (!isAgent) {
      const usuario = await verificarUsuario(request);
      if (!usuario) {
        return NextResponse.json({ status: 'erro', mensagem: 'Não autorizado' }, { status: 401 });
      }
      callerEmail = usuario.email;
    }

    configurarVapid();
    const { email, emails, title, body, url, ...rest } = await request.json();

    if (!title) return NextResponse.json({ status: 'erro', mensagem: 'title obrigatório' }, { status: 400 });

    const alvo = emails || email;
    if (!alvo) return NextResponse.json({ status: 'erro', mensagem: 'email ou emails obrigatório' }, { status: 400 });

    // Usuário logado (não-cron) só pode notificar o próprio email.
    if (!isAgent) {
      const lista = (Array.isArray(alvo) ? alvo : [alvo]).map((e) => String(e).toLowerCase().trim());
      if (lista.length !== 1 || lista[0] !== callerEmail) {
        return NextResponse.json({ status: 'erro', mensagem: 'Sem permissão para notificar terceiros' }, { status: 403 });
      }
    }

    const subs = await buscarSubscriptions(alvo);
    if (!subs.length) return NextResponse.json({ status: 'sucesso', enviadas: 0, alvo: subs.length });

    const payload = JSON.stringify({ title, body: body || '', url: url || '/', ...rest });

    const resultados = await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
          return { email: s.email, ok: true };
        } catch (err) {
          // 410 = subscription expirada, 404 = endpoint inválido → remove do banco
          if (err.statusCode === 410 || err.statusCode === 404) {
            await removerSubscriptionInvalida(s.endpoint);
          }
          return { email: s.email, ok: false, erro: err.message, statusCode: err.statusCode };
        }
      })
    );

    const enviadas = resultados.filter(r => r.ok).length;
    return NextResponse.json({ status: 'sucesso', enviadas, total: subs.length, resultados });
  } catch (error) {
    console.error('push/send EXCEPTION:', error);
    return NextResponse.json({ status: 'erro', mensagem: error.message }, { status: 500 });
  }
}
