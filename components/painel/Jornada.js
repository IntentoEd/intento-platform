'use client';

// Aba "Jornada" do /painel — a versão EXTERNA do progresso do aluno:
// Linha do Ano (marcos de ciclo), carimbos do Método e Selos.
// Gate: jornadaVisivel() em lib/selos.js (allowlist até o Encontro Bússola).
// Enquadramento obrigatório (decisão 18/08/2026): o Perfil é diagnóstico de
// ONDE APLICAR FORÇA, nunca nota — o texto desta tela sustenta isso.
// Sem alerta clínico aqui: sinal emocional é conversa com o mentor, não UI.

import { useEffect, useMemo, useState } from 'react';
import { LinhaDoAno, CarimboBadge, BarraCarimbo } from '@/components/Carimbos';
import { CARIMBO_LABEL } from '@/lib/carimboCores';
import { diagnosticoDimensional, registrosParaMetricas, cicloIdx, CICLOS_INFO, DIM_LABEL, marcoCicloPendente, resumoSimulados, nivelAlvoDosMarcos } from '@/lib/carimbos';
import { computarSelos } from '@/lib/selos';

// Selo postal: círculo navy com anel serrilhado; tier em romano no centro.
// Novo (não visto): anel em amarelo da marca + pill "nova desta semana".
function SeloVisual({ selo, naoVisto }) {
  const anel = naoVisto ? '#D4B726' : '#060242';
  return (
    <div className="flex flex-col items-center text-center w-28">
      <div className="relative">
        <svg viewBox="0 0 80 80" className="w-20 h-20" role="img"
          aria-label={`Selo ${selo.nome} — nível ${selo.tierRomano} (${selo.tierLabel})${naoVisto ? ' — nova desta semana' : ''}`}>
          <circle cx="40" cy="40" r="37" fill="none" stroke={anel} strokeWidth="2.5" strokeDasharray="4 3" />
          <circle cx="40" cy="40" r="30" fill="#060242" />
          <text x="40" y="38" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="700" fontFamily="Ubuntu, sans-serif">{selo.tierRomano}</text>
          <text x="40" y="52" textAnchor="middle" fill="#D4B726" fontSize="8" fontWeight="700" fontFamily="Ubuntu, sans-serif" letterSpacing="0.5">SELO</text>
        </svg>
        {naoVisto && (
          <span className="absolute -top-1 -right-2 text-[8px] font-bold bg-intento-yellow text-intento-blue px-1.5 py-0.5 rounded-full whitespace-nowrap">nova!</span>
        )}
      </div>
      <p className="text-xs font-bold text-intento-blue mt-1.5 leading-tight">{selo.nome}</p>
      <p className="text-[10px] font-semibold text-slate-500 leading-tight">{selo.tierLabel}</p>
      {selo.semanaEstampa && (
        <p className="text-[9px] text-slate-400 font-medium mt-0.5" title={`Estampado na semana ${selo.semanaEstampa}`}>
          {String(selo.semanaEstampa).split(' a ')[0]}
        </p>
      )}
    </div>
  );
}

// Próxima estampa: contorno tracejado + critério + barra de progresso quando
// mensurável. Convite, nunca cadeado.
function ProximaEstampa({ selo }) {
  const p = selo.proximo;
  return (
    <div className="flex items-center gap-4 bg-white border-2 border-dashed border-slate-300 rounded-xl p-4">
      <svg viewBox="0 0 80 80" className="w-14 h-14 shrink-0" role="img" aria-label={`Próxima estampa: ${selo.nome} nível ${p.tierRomano}`}>
        <circle cx="40" cy="40" r="36" fill="none" stroke="#CBD5E1" strokeWidth="2.5" strokeDasharray="5 4" />
        <text x="40" y="46" textAnchor="middle" fill="#94A3B8" fontSize="17" fontWeight="700" fontFamily="Ubuntu, sans-serif">{p.tierRomano}</text>
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-700">{selo.nome} · <span className="text-slate-500 font-semibold">{p.label}</span></p>
        <p className="text-xs text-slate-500 font-medium mt-0.5">{p.criterio}</p>
        {p.frac != null && (
          <div className="mt-2">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-intento-yellow" style={{ width: `${Math.round(p.frac * 100)}%` }} />
            </div>
            <p className="text-[10px] text-slate-400 font-semibold mt-1">{p.texto}</p>
          </div>
        )}
        {p.frac == null && p.texto && <p className="text-[10px] text-slate-400 font-semibold mt-1">{p.texto}</p>}
      </div>
    </div>
  );
}

export default function Jornada({ sessao, caderno }) {
  const dados = sessao?.dadosPainel || {};
  const email = String(sessao?.email || '').trim().toLowerCase();
  const registros = dados.registros || [];
  const marcos = dados.marcos; // undefined = GAS antigo ⇒ Linha do Ano dorme

  const selos = useMemo(
    () => computarSelos({
      registros,
      diarios: dados.diariosMetas || [],
      simulados: dados.sim?.lista || [],
      caderno: caderno || [],
      marcos,
    }),
    [registros, dados.diariosMetas, dados.sim, caderno, marcos]
  );

  const diag = useMemo(
    () => diagnosticoDimensional({ metricas: {
      ...registrosParaMetricas(registros),
      simuladoResumo: resumoSimulados(dados.sim?.lista || []),
      nivelAlvoSimulado: nivelAlvoDosMarcos(marcos),
    } }),
    [registros, dados.sim, marcos]
  );
  const ciclo = CICLOS_INFO[cicloIdx()];
  const marcoPend = useMemo(
    () => marcoCicloPendente({ marcos, diarios: dados.diariosMetas || [], tipoAluno: 'ENEM', statusApp: sessao?.statusApp || '' }),
    [marcos, dados.diariosMetas, sessao?.statusApp]
  );

  // Visto/não-visto por aluno em localStorage: lê UMA vez no mount (o anel
  // amarelo dura a visita) e persiste o estado atual pra próxima.
  const [vistosIniciais] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`jornada_vistos_${email}`) || '{}'); } catch { return {}; }
  });
  useEffect(() => {
    // Merge com o mapa ATUAL (não substituição): render a partir de cache
    // antigo/parcial não pode rebaixar tiers já vistos, nem clobberar outra aba.
    try {
      const atual = JSON.parse(localStorage.getItem(`jornada_vistos_${email}`) || '{}');
      selos.estampados.forEach(s => { atual[s.id] = Math.max(atual[s.id] ?? -1, s.tierIdx); });
      localStorage.setItem(`jornada_vistos_${email}`, JSON.stringify(atual));
    } catch { /* quota/parse */ }
  }, [selos, email]);
  const naoVisto = (s) => s.tierIdx > (vistosIniciais[s.id] ?? -1) && s.novo;

  const dims = [
    { key: 'comportamento', texto: diag.compEmFormacao ? `em formação · ${diag.semanasMensuraveis}/4 semanas` : `${CARIMBO_LABEL[diag.comportamento] || '—'}` },
    { key: 'cobertura', texto: diag.cobMed != null ? `${Math.round(diag.cobMed)}% do edital` : 'sem dado' },
    { key: 'dominio', texto: diag.domMed != null ? `${Math.round(diag.domMed)}% de acerto` : 'sem dado' },
    {
      key: 'simulado',
      texto: diag.simulado
        ? `${Math.round(diag.simMed)}% de aproveitamento`
        : 'sem simulado recente — que tal um Ensaio Geral?',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          {/* Único título da aba: a página oculta o h1 genérico na Jornada
              (padrão das abas com header próprio, como Simulados e Caderno). */}
          <h1 className="text-2xl font-semibold text-intento-blue">Sua Jornada</h1>
          <p className="text-sm text-slate-500 font-medium">O ano em ciclos, seus carimbos do Método e os selos que você já estampou.</p>
        </div>
        <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded uppercase tracking-wider">{ciclo.id} · {ciclo.nome}</span>
      </div>

      {/* Linha do Ano */}
      {Array.isArray(marcos) && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <LinhaDoAno marcos={marcos} marcoPendente={marcoPend} />
          <p className="text-[10px] text-slate-400 font-medium mt-3">
            O ano da mentoria se divide em 4 ciclos. No fim de cada um, a Reunião de Fechamento com seu mentor estampa o marco — clique nos nós verdes pra rever cada retrato.
          </p>
        </div>
      )}

      {/* Carimbos do Método */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carimbos do Método · leitura desta semana</p>
          <span className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Perfil</span>
            <CarimboBadge nivel={diag.perfil} />
          </span>
        </div>
        <div className="space-y-2.5">
          {dims.map(d => (
            <div key={d.key} className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600 w-32 shrink-0">{DIM_LABEL[d.key]}</span>
              {d.key === 'simulado' && !diag.simulado
                ? <span className="text-[10px] text-slate-400 font-semibold">{d.texto}</span>
                : <>
                    <BarraCarimbo nivel={diag[d.key]} />
                    <span className="text-[11px] text-slate-400 font-medium flex-1 text-right">{d.texto}</span>
                  </>}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-3 border-t border-slate-100 pt-2.5">
          O Perfil segue sua dimensão <b>menos avançada</b> — ele não é nota, é a bússola de onde aplicar força agora.
          Um Aprendiz em Comportamento com Domínio de Mestre não precisa de mais conteúdo: precisa de rotina.
          O retrato oficial é carimbado com seu mentor no fechamento de cada ciclo.
        </p>
      </div>

      {/* Selos estampados */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4">Selos estampados · {selos.estampados.length}</p>
        {selos.estampados.length === 0 ? (
          <p className="text-sm text-slate-400 font-medium">Seus primeiros selos chegam com as primeiras semanas de estudo registradas — a jornada começa agora.</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-6">
            {selos.estampados.map(s => <SeloVisual key={s.id} selo={s} naoVisto={naoVisto(s)} />)}
          </div>
        )}
      </div>

      {/* Próximas estampas — no máx. 2, sempre alcançáveis */}
      {selos.proximas.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Próximas estampas</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {selos.proximas.map(s => <ProximaEstampa key={s.id} selo={s} />)}
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-400 font-medium">
        Os selos são estampados no fechamento de cada semana (domingo) — sequências pausam em semana sem dado, e selo estampado é seu pra sempre.
      </p>
    </div>
  );
}
