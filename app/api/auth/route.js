// app/api/auth/route.js — DESATIVADA.
// Esta rota era pública e proxiava a ação `login` do GAS, que devolve o painel
// COMPLETO de qualquer aluno a partir do email (IDOR: sem token, sem authz).
// Não tem mais caller no client (o login usa `loginGlobal` via /api/mentor).
// Mantida só como 410 pra não reintroduzir a exposição. Pode ser deletada.
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    { error: 'Endpoint desativado. Use /api/mentor (autenticado).' },
    { status: 410 }
  );
}
