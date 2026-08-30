export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { verificarUsuario } from '@/lib/auth';
import { chamarGAS } from '@/lib/gasClient';

export async function POST(request) {
  try {
    // Auth: exige Firebase token. Sem isso, qualquer um registra uma subscription
    // no nome de outra pessoa e passa a receber os pushes dela.
    const usuario = await verificarUsuario(request);
    if (!usuario) {
      return NextResponse.json({ status: 'erro', mensagem: 'Não autorizado' }, { status: 401 });
    }
    const dados = await request.json();
    // Força o email do token verificado (ignora o que o client mandar).
    const data = await chamarGAS({ acao: 'subscribePush', ...dados, email: usuario.email });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ status: 'erro', mensagem: error.message }, { status: 500 });
  }
}
