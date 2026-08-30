export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { verificarUsuario } from '@/lib/auth';
import { chamarGAS } from '@/lib/gasClient';

export async function POST(request) {
  try {
    // Auth: exige Firebase token (o endpoint é uma capability; mesmo assim não
    // deixamos anônimo remover subscriptions).
    const usuario = await verificarUsuario(request);
    if (!usuario) {
      return NextResponse.json({ status: 'erro', mensagem: 'Não autorizado' }, { status: 401 });
    }
    const dados = await request.json();
    const data = await chamarGAS({ acao: 'unsubscribePush', ...dados });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ status: 'erro', mensagem: error.message }, { status: 500 });
  }
}
