export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

// Cache em memória: chave -> { ts, data }
const cache = new Map();

const TTL_MS = {
  buscarTopicosGlobais: 24 * 60 * 60 * 1000, // 24h
  listaAlunosMentor:    5  * 60 * 1000,      // 5min
  buscarOnboarding:     60 * 60 * 1000,      // 1h
  buscarDadosAluno:     60 * 1000,           // 60s
  dashboardLider:       2  * 60 * 1000,      // 2min — dashboard do líder, dados mudam a cada write
};

// Quais ações de escrita invalidam quais ações de leitura
function chavesParaInvalidar(acaoEscrita, dados) {
  const ids = [dados.idPlanilha, dados.idPlanilhaAluno, dados.idAluno].filter(Boolean);
  switch (acaoEscrita) {
    case 'salvarRegistroGlobal':
    case 'editarRegistro':
    case 'salvarNovoEncontro':
    case 'avaliarEncontroPassado':
    case 'editarEncontro':
    case 'salvarSemanaLote':
    case 'salvarSimulado':
    case 'salvarAutopsia':
    case 'salvarCardCaderno':
    case 'incrementarRepeticao':
    case 'deletarCardCaderno':
    case 'registrarRevisaoCaderno':
      return [
        ...ids.flatMap(id => [`buscarDadosAluno|${id}`, `buscarOnboarding|${id}`]),
        'dashboardLider|*',  // qualquer mutação invalida o dashboard do líder
      ];
    case 'onboarding':
    case 'diagnostico':
      return ['listaAlunosMentor|*', 'dashboardLider|*'];
    default:
      return [];
  }
}

function chaveCache(acao, dados) {
  const id = dados.idPlanilhaAluno || dados.idAluno || dados.idPlanilha || dados.email || '*';
  return `${acao}|${id}`;
}

async function chamarGAS(dados) {
  const GAS_URL = process.env.GOOGLE_APPSCRIPT_URL;
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  return res.json();
}

export async function POST(request) {
  try {
    const dados = await request.json();
    const acao = dados.acao || dados.tipo || '';
    const ttl = TTL_MS[acao];

    // Leitura cacheável
    if (ttl) {
      const chave = chaveCache(acao, dados);
      const hit = cache.get(chave);
      if (hit && Date.now() - hit.ts < ttl) {
        return NextResponse.json(hit.data);
      }
      const data = await chamarGAS(dados);
      if (data && data.status !== 'erro') cache.set(chave, { ts: Date.now(), data });
      return NextResponse.json(data);
    }

    // Escrita: invalida cache relacionado, depois chama GAS
    const chavesInvalidar = chavesParaInvalidar(acao, dados);
    for (const padrao of chavesInvalidar) {
      if (padrao.endsWith('|*')) {
        const prefixo = padrao.slice(0, -1);
        for (const k of cache.keys()) if (k.startsWith(prefixo)) cache.delete(k);
      } else {
        cache.delete(padrao);
      }
    }

    const data = await chamarGAS(dados);
    return NextResponse.json(data);

  } catch (error) {
    console.error('❌ [API] Erro Crítico na Rota:', error);
    return NextResponse.json(
      { status: 'erro', mensagem: 'Falha na comunicação com o Google', detalhes: error.message },
      { status: 500 }
    );
  }
}
