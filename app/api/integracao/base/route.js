// app/api/integracao/base/route.js — NOVO ARQUIVO no repo intento-platform.
// Porta máquina-a-máquina pro Intento Base: valida o header x-integracao-token
// (env INTEGRACAO_TOKEN, o mesmo do Base) e repassa pro GAS só as ações da
// integração, com o GAS_API_TOKEN (que nunca sai daqui). Não passa pelo
// /api/mentor: essas ações NÃO entram na allowlist de browser.

export const dynamic = 'force-dynamic';

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { chamarGAS } from '@/lib/gasClient';

const ACOES = new Set(['upsertRegistroSemanal', 'provisionarAlunoBase', 'buscarMentoriaAluno', 'salvarChecksPlanoBase']);
// O Base chama 'salvarChecksPlano'; aqui vira a variante por e-mail.
const TRADUZ = { salvarChecksPlano: 'salvarChecksPlanoBase' };

function autorizado(request) {
  const segredo = process.env.INTEGRACAO_TOKEN;
  const dado = request.headers.get('x-integracao-token') || '';
  if (!segredo || dado.length !== segredo.length) return false;
  return timingSafeEqual(Buffer.from(dado), Buffer.from(segredo));
}

export async function POST(request) {
  if (!autorizado(request)) return NextResponse.json({ status: 'erro', mensagem: 'Não autorizado' }, { status: 401 });
  let dados;
  try {
    dados = await request.json();
  } catch {
    return NextResponse.json({ status: 'erro', mensagem: 'JSON inválido' }, { status: 400 });
  }
  const acao = TRADUZ[dados.acao] || dados.acao;
  if (!ACOES.has(acao)) return NextResponse.json({ status: 'erro', mensagem: 'Ação não permitida' }, { status: 400 });
  const email = typeof dados.email === 'string' ? dados.email.trim().toLowerCase() : '';
  if (!email) return NextResponse.json({ status: 'erro', mensagem: 'email obrigatório' }, { status: 400 });
  try {
    const r = await chamarGAS({ ...dados, acao, email });
    const status = r && r.status === 'erro' ? (r.codigo === 'nao_encontrado' ? 404 : 400) : 200;
    return NextResponse.json(r, { status });
  } catch (e) {
    console.error('[integracao/base]', acao, e.message);
    return NextResponse.json({ status: 'erro', mensagem: e.message }, { status: 502 });
  }
}
