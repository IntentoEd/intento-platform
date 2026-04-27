export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import webpush from 'web-push';

const VAPID_SUBJECT = 'mailto:filippe@metodointento.com.br';

function configurarVapid() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID keys ausentes em env vars');
  webpush.setVapidDetails(VAPID_SUBJECT, pub, priv);
}

async function buscarSubscriptions(emailOuEmails) {
  const body = Array.isArray(emailOuEmails) ? { emails: emailOuEmails } : { email: emailOuEmails };
  const res = await fetch(process.env.GOOGLE_APPSCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'listarPushSubscriptions', ...body }),
  });
  const data = await res.json();
  return data.subscriptions || [];
}

async function removerSubscriptionInvalida(endpoint) {
  try {
    await fetch(process.env.GOOGLE_APPSCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'unsubscribePush', endpoint }),
    });
  } catch {}
}

export async function POST(request) {
  try {
    configurarVapid();
    const { email, emails, title, body, url, ...rest } = await request.json();

    if (!title) return NextResponse.json({ status: 'erro', mensagem: 'title obrigatório' }, { status: 400 });

    const alvo = emails || email;
    if (!alvo) return NextResponse.json({ status: 'erro', mensagem: 'email ou emails obrigatório' }, { status: 400 });

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
