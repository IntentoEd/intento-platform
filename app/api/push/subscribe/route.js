export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const dados = await request.json();
    const res = await fetch(process.env.GOOGLE_APPSCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'subscribePush', ...dados }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ status: 'erro', mensagem: error.message }, { status: 500 });
  }
}
