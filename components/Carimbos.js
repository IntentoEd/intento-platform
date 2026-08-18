'use client';

// Componentes visuais dos carimbos Fases e Ciclos (Aprendiz/Veterano/Mestre).
// Compartilhados entre /lider e /mentor — cores em lib/carimboCores.js e regras
// em lib/carimbos.js (fonte única). Nada de faixa ou cor hardcoded aqui.

import { useMemo, useState } from 'react';
import { corDe, CARIMBO_LABEL } from '@/lib/carimboCores';
import { diagnosticoDimensional, registrosParaMetricas, cicloIdx, cicloDeData, periodoDoCiclo, marcoCicloPendente, CICLOS_INFO, DIM_LABEL, STATUS_FORA_DO_APP } from '@/lib/carimbos';

export function CarimboBadge({ nivel, sufixo }) {
  if (!nivel) return <span className="text-slate-300 text-xs">—</span>;
  const c = corDe(nivel);
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: c.bg, color: c.texto }}>{CARIMBO_LABEL[nivel]}{sufixo || ''}</span>;
}

// Barra de 3 segmentos Apr|Vet|Mes com o nível atual destacado
export function BarraCarimbo({ nivel }) {
  const segs = [['aprendiz', 'Apr'], ['veterano', 'Vet'], ['mestre', 'Mes']];
  return (
    <span className="inline-flex rounded-md overflow-hidden border border-slate-200 shrink-0">
      {segs.map(([s, txt]) => {
        const on = s === nivel;
        return <span key={s} className="text-[9px] font-bold px-2.5 py-0.5" style={on ? { backgroundColor: corDe(s).solido, color: '#fff' } : { backgroundColor: '#F8FAFC', color: '#CBD5E1' }}>{txt}</span>;
      })}
    </span>
  );
}

// Os 4 selos dimensionais de um aluno lado a lado: Comportamento · Cobertura · Domínio · Simulado.
// Simulado === null (termômetro inativo até o aluno virar Veterano agregado) → selo cinza
// dessaturado com aria-label "Simulado inativo" — nunca colorido, nunca vazio, nunca inventado.
// ── Card de carimbos no /mentor/[id] ─────────────────────────────────────────
// Linguagem do Método é EXTERNA desde 18/08/2026 (rollout aos mentorados no
// Encontro Bússola): carimbos podem aparecer pro aluno. Cuidado que fica: o
// Perfil (elo mais fraco) é diagnóstico de ONDE APLICAR FORÇA, nunca nota.
// Sem alerta clínico aqui (sinal em validação). Perfil agregado = leitura
// contínua; o retrato oficial congela no Marco de Ciclo (BD_Marcos, via
// Fechamento de Ciclo no Modo Encontro — docs/GAMIFICACAO_MARCOS.md).
// Carimbos computados no front a partir do BD_Registro cru — mesmas fórmulas
// do /lider via lib/carimbos.js. Faixa compacta por padrão (colapsada);
// clique expande o detalhe por dimensão.
const NOTA_OVERSTUDYING = '2+ semanas acima de 105% da meta — atenção à sustentabilidade (trava Mestre)';

export function CardCarimbosAluno({ registros, statusApp, marcos, diarios, tipoAluno }) {
  const foraDoApp = STATUS_FORA_DO_APP.includes(statusApp);
  const [aberto, setAberto] = useState(false);
  const d = useMemo(
    () => diagnosticoDimensional({ metricas: registrosParaMetricas(registros) }),
    [registros]
  );
  const ciclo = CICLOS_INFO[cicloIdx()];
  // Fechamento pendente (marcos undefined = GAS antigo ⇒ null; fora do escopo
  // ENEM+app ⇒ null — regra dentro do próprio helper, fonte única).
  const marcoPend = useMemo(
    () => marcoCicloPendente({ marcos, diarios, tipoAluno, statusApp }),
    [marcos, diarios, tipoAluno, statusApp]
  );
  // Linha do Ano segue o mesmo escopo do fluxo de marcos (decisão nº 5).
  const linhaDoAnoVisivel = Array.isArray(marcos) && tipoAluno === 'ENEM' && !foraDoApp;

  const compVal = d.compEmFormacao
    ? `em formação · ${d.semanasMensuraveis}/4 semanas mensuráveis`
    : `Presença ${CARIMBO_LABEL[d.presenca]} · Aproveitamento ${CARIMBO_LABEL[d.aproveitamento]}`;

  const detalhes = {
    comportamento: `${compVal}${d.overstudying ? ` · ${NOTA_OVERSTUDYING}` : ''}`,
    cobertura: d.cobMed != null ? `${Math.round(d.cobMed)}% do edital` : null,
    dominio: d.domMed != null ? `${Math.round(d.domMed)}% de acerto` : null,
  };

  const resumo = [
    d.compEmFormacao ? `comportamento em formação · ${d.semanasMensuraveis}/4 sem.` : null,
    d.cobMed != null ? `${Math.round(d.cobMed)}% edital` : null,
    d.domMed != null ? `${Math.round(d.domMed)}% acerto` : null,
  ].filter(Boolean).join(' · ');

  const linhas = [
    { key: 'comportamento', val: compVal, nota: d.overstudying ? NOTA_OVERSTUDYING : null },
    { key: 'cobertura', val: detalhes.cobertura || '—' },
    { key: 'dominio', val: detalhes.dominio || '—' },
  ];

  const strip = (
    <>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fases e Ciclos</span>
        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wider">{ciclo.id} {ciclo.nome}</span>
        {marcoPend && (
          <span className="text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full"
            title={`O ${marcoPend.ciclo.id} · ${marcoPend.ciclo.nome} de ${marcoPend.ano} terminou sem marco registrado — o Fechamento de Ciclo aparece automaticamente no próximo Diário de Bordo.`}>
            🏁 Fechamento {marcoPend.ciclo.id}{marcoPend.ano !== new Date().getFullYear() ? `/${marcoPend.ano}` : ''} pendente
          </span>
        )}
      </span>
      {foraDoApp ? (
        <span className="text-xs text-slate-400 font-medium">Sem dados dimensionais — aluno fora do app.</span>
      ) : (
        <>
          <CarimboDimensional d={d} detalhes={detalhes} alertas={{ comportamento: d.overstudying }} />
          {d.overstudying && <span className="text-[10px] text-amber-600 font-semibold" title={NOTA_OVERSTUDYING}>⚠ overstudying</span>}
          {resumo && <span className="text-[11px] text-slate-400 font-medium">{resumo}</span>}
        </>
      )}
      <span className="ml-auto flex items-center gap-1.5 shrink-0" title="Perfil — leitura contínua; o retrato oficial congela no Marco de Ciclo">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Perfil</span>
        <CarimboBadge nivel={d.perfil} />
        {!foraDoApp && <span className={`text-[10px] text-slate-400 transition-transform ${aberto ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>}
      </span>
    </>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      {foraDoApp ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">{strip}</div>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(v => !v)}
          aria-expanded={aberto}
          className="w-full flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-left cursor-pointer"
        >
          {strip}
        </button>
      )}
      {linhaDoAnoVisivel && (
        <div className="px-5 pb-3">
          <LinhaDoAno marcos={marcos} marcoPendente={marcoPend} />
        </div>
      )}
      {aberto && !foraDoApp && (
        <div className="px-5 pb-4 space-y-2.5 border-t border-slate-100 pt-3">
          {linhas.map(l => (
            <div key={l.key} className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600 w-32 shrink-0">{DIM_LABEL[l.key]}</span>
              <BarraCarimbo nivel={d[l.key]} />
              <span className="text-[11px] text-slate-400 font-medium flex-1 text-right">
                {l.val}
                {l.nota && <span className="block text-[9px] text-amber-600">{l.nota}</span>}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-3 opacity-60">
            <span className="text-xs font-semibold text-slate-600 w-32 shrink-0">Simulado</span>
            <span className="text-[10px] text-slate-400 font-semibold">em breve</span>
          </div>
          <details className="pt-1">
            <summary className="text-[10px] font-semibold text-slate-400 cursor-pointer select-none">Faixas dos carimbos</summary>
            <div className="text-[10px] text-slate-400 font-medium leading-relaxed mt-1 space-y-0.5">
              <p><b>Comportamento</b> — semanas válidas na janela de 4 mensuráveis (≥3 dias planejados): ≤2 Aprendiz · 3 Veterano · 4 (ou 3 + 1 rompida absorvida) Mestre. Presença: semana válida = no máx. 1 dia planejado sem registro. Aproveitamento: válida ≥70% da meta (Mestre exige ≥85%).</p>
              <p><b>Cobertura</b> — % do edital validado (último valor informado): &lt;30 Aprendiz · 30–70 Veterano · &gt;70 Mestre.</p>
              <p><b>Domínio</b> — % de acerto acumulado (último valor informado): &lt;70 Aprendiz · 70–80 Veterano · &gt;80 Mestre (nenhuma matéria &lt;70).</p>
              <p><b>Perfil</b> — a dimensão menos avançada (regra do elo mais fraco).</p>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// detalhes/alertas (opcionais, usados na faixa do /mentor/[id]): detalhes[key]
// enriquece o title do chip; alertas[key] pinta um ponto âmbar de atenção.
export function CarimboDimensional({ d, tamanho = 'md', detalhes, alertas }) {
  const DIMS = [
    { key: 'comportamento', curto: 'Com', nome: 'Comportamento' },
    { key: 'cobertura', curto: 'Cob', nome: 'Cobertura' },
    { key: 'dominio', curto: 'Dom', nome: 'Domínio' },
    { key: 'simulado', curto: 'Sim', nome: 'Simulado' },
  ];
  const cls = tamanho === 'sm' ? 'text-[8px] px-1.5 py-0.5' : 'text-[9px] px-2 py-0.5';
  return (
    <span className="inline-flex gap-1">
      {DIMS.map(({ key, curto, nome }) => {
        const nivel = d?.[key];
        const inativo = key === 'simulado' && d?.simulado === null;
        const c = corDe(nivel); // null/ausente → cinza neutro
        const base = inativo ? 'Simulado inativo' : nivel ? `${nome}: ${CARIMBO_LABEL[nivel]}` : `${nome} sem dado`;
        const extra = detalhes?.[key];
        const aria = extra ? (nivel ? `${base} — ${extra}` : `${nome}: ${extra}`) : base;
        return (
          <span key={key} aria-label={aria} title={aria}
            className={`relative font-bold rounded ${cls} ${inativo ? 'opacity-70' : ''}`}
            style={{ backgroundColor: c.bg, color: c.texto }}>
            {curto}
            {alertas?.[key] && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 border border-white" aria-hidden="true" />}
          </span>
        );
      })}
    </span>
  );
}

// ── Linha do Ano — timeline C1→C4 com nós de marco ───────────────────────────
// Barra do ano ancorada no ENEM: segmento por ciclo (passado preenchido, atual
// parcial com marcador "hoje" em amarelo, futuro vazio) e, no fim de cada
// segmento, o nó do marco: carimbado (verde — clique abre o retrato congelado),
// pendente (âmbar — fecha no próximo Diário de Bordo) ou futuro (contorno).
// `marcos` = linhas do BD_Marcos (payload buscarDadosAluno); só o ano corrente
// entra na barra nesta versão.
export function LinhaDoAno({ marcos, marcoPendente, hoje }) {
  const [retratoAberto, setRetratoAberto] = useState(null); // marco (objeto) | null
  const agora = hoje || new Date();
  const ano = agora.getFullYear();
  const atual = cicloDeData(agora);
  const porCiclo = useMemo(() => {
    const map = {};
    (marcos || []).forEach(m => { if (Number(m?.ano) === ano && m?.ciclo) map[m.ciclo] = m; });
    return map;
  }, [marcos, ano]);
  // Jan–mar o assunto vivo é o C4 do ano ANTERIOR (marcoCicloPendente só devolve
  // ano-1 nesse caso) — a barra é single-year, então ele entra como nó prefixo.
  const marcoC4Anterior = useMemo(
    () => (atual.idx === 0 ? (marcos || []).find(m => Number(m?.ano) === ano - 1 && m?.ciclo === 'C4') || null : null),
    [marcos, ano, atual.idx]
  );
  const pendC4Anterior = atual.idx === 0 && !!(marcoPendente && marcoPendente.ano === ano - 1);
  const { inicio, fim } = periodoDoCiclo(atual.idx, atual.ano);
  const frac = Math.min(1, Math.max(0, (agora - inicio) / (fim - inicio)));
  const mesmoMarco = (a, b) => !!a && !!b && a.ciclo === b.ciclo && Number(a.ano) === Number(b.ano);
  const alternar = (m) => setRetratoAberto(v => (mesmoMarco(v, m) ? null : m));

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider shrink-0" title={`Linha do Ano ${ano} — os nós são os Marcos de Ciclo`}>Linha do Ano</span>
        {(marcoC4Anterior || pendC4Anterior) && (
          <span className="flex items-center gap-1 shrink-0">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider hidden sm:block">C4·{ano - 1}</span>
            <NoMarco ciclo={{ id: `C4/${ano - 1}` }} marco={marcoC4Anterior} pendente={pendC4Anterior}
              aberto={mesmoMarco(retratoAberto, marcoC4Anterior)}
              onToggle={() => marcoC4Anterior && alternar(marcoC4Anterior)} />
          </span>
        )}
        {CICLOS_INFO.map((c, i) => {
          const marco = porCiclo[c.id];
          const pendente = !!(marcoPendente && marcoPendente.ciclo.id === c.id && marcoPendente.ano === ano);
          const passado = i < atual.idx;
          const corrente = i === atual.idx;
          return (
            <div key={c.id} className="flex items-center gap-1.5 flex-1 min-w-0">
              <div className="flex-1 min-w-0" title={`${c.id} · ${c.nome}`}>
                <p className={`text-[8px] font-bold uppercase tracking-wider truncate hidden sm:block ${corrente ? 'text-intento-blue' : 'text-slate-400'}`}>{c.id} · {c.nome}</p>
                <div className="relative h-1.5 rounded-full bg-slate-100 mt-0.5" role="img" aria-label={`${c.id} · ${c.nome}${corrente ? ' — ciclo atual' : passado ? ' — concluído' : ' — futuro'}`}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-intento-blue/80"
                    style={{ width: passado ? '100%' : corrente ? `${Math.round(frac * 100)}%` : '0%' }} />
                  {corrente && (
                    <span className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-intento-yellow border-2 border-white shadow-sm"
                      style={{ left: `calc(${Math.round(frac * 100)}% - 5px)` }} title="Hoje" role="img" aria-label="Hoje" />
                  )}
                </div>
              </div>
              <NoMarco ciclo={c} marco={marco} pendente={pendente} aberto={mesmoMarco(retratoAberto, marco)}
                onToggle={() => marco && alternar(marco)} />
            </div>
          );
        })}
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider shrink-0" title="O C4 termina na prova">ENEM</span>
      </div>
      {retratoAberto && <RetratoMarco marco={retratoAberto} onFechar={() => setRetratoAberto(null)} />}
    </div>
  );
}

function NoMarco({ ciclo, marco, pendente, aberto, onToggle }) {
  if (marco) {
    const tt = `Marco ${ciclo.id} · Perfil ${CARIMBO_LABEL[marco.perfil] || '—'} · ${marco.data || ''}${marco.origem === 'retroativo' ? ' · retroativo' : ''} — clique pra ver o retrato`;
    return (
      <button type="button" onClick={onToggle} title={tt} aria-label={tt} aria-expanded={aberto}
        className={`relative after:absolute after:-inset-1.5 after:content-[''] w-4 h-4 rounded-full bg-emerald-500 text-white text-[8px] font-black flex items-center justify-center shrink-0 border-2 shadow-sm hover:scale-110 transition-transform ${aberto ? 'border-intento-blue' : 'border-white'}`}>
        ✓
      </button>
    );
  }
  if (pendente) {
    const tt = `Fechamento do ${ciclo.id} pendente — acontece automaticamente no próximo Diário de Bordo`;
    return (
      <span title={tt} role="img" aria-label={tt}
        className="w-4 h-4 rounded-full bg-amber-100 border-2 border-amber-400 text-amber-700 text-[8px] font-black flex items-center justify-center shrink-0">
        !
      </span>
    );
  }
  const tt = `Marco do ${ciclo.id} — ainda não chegou`;
  return <span className="w-4 h-4 rounded-full bg-white border-2 border-slate-200 shrink-0" title={tt} role="img" aria-label={tt} />;
}

// Retrato congelado de um marco: carimbos + destaques + reflexões do aluno.
// Mostra VALORES gravados no BD_Marcos — nunca recomputa (a história não muda).
function RetratoMarco({ marco, onFechar }) {
  const info = CICLOS_INFO.find(c => c.id === marco.ciclo);
  const d = marco.destaques || {};
  const stats = [
    d.horas != null ? { label: 'Horas no ciclo', valor: `${d.horas}h` } : null,
    d.cobIni != null || d.cobFim != null ? { label: 'Cobertura', valor: `${d.cobIni ?? '—'}% → ${d.cobFim ?? '—'}%` } : null,
    d.domIni != null || d.domFim != null ? { label: 'Domínio', valor: `${d.domIni ?? '—'}% → ${d.domFim ?? '—'}%` } : null,
    d.simulados != null ? { label: 'Simulados', valor: d.simulados } : null,
    d.metasTotal ? { label: 'Metas batidas', valor: `${d.metasBatidas ?? 0}/${d.metasTotal}` } : null,
    d.questoes != null ? { label: 'Questões', valor: d.questoes } : null,
  ].filter(Boolean);
  const reflexoes = [
    ['Maior vitória do ciclo', marco.reflexaoVitoria],
    ['Maior aprendizado', marco.reflexaoAprendizado],
    ['O que muda no próximo', marco.reflexaoMudanca],
  ].filter(([, v]) => String(v || '').trim());

  return (
    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold text-intento-blue uppercase tracking-wider">🏁 Marco {marco.ciclo}{info ? ` · ${info.nome}` : ''} · {marco.ano}</span>
        {marco.data && <span className="text-[10px] text-slate-400 font-medium">carimbado em {marco.data}</span>}
        {marco.origem === 'retroativo' && (
          <span className="text-[9px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wider" title="Retrato computado do histórico — o ciclo fechou antes da feature existir">retroativo</span>
        )}
        <button type="button" onClick={onFechar} className="ml-auto text-[10px] font-bold text-slate-400 hover:text-intento-blue transition-colors">fechar ✕</button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {[['comportamento', 'Com'], ['cobertura', 'Cob'], ['dominio', 'Dom'], ['simulado', 'Sim']].map(([key, curto]) => (
          <span key={key} className="flex items-center gap-1">
            <span className="text-[9px] font-bold text-slate-400 uppercase">{curto}</span>
            <CarimboBadge nivel={marco[key]} />
          </span>
        ))}
        <span className="flex items-center gap-1 pl-2 border-l border-slate-200">
          <span className="text-[9px] font-bold text-slate-400 uppercase">Perfil</span>
          <CarimboBadge nivel={marco.perfil} />
        </span>
        {marco.nivelAlvo != null && (
          <span className="text-[10px] text-slate-400 font-medium ml-auto" title="Nível-alvo de simulado combinado pro ciclo seguinte">alvo simulado: {marco.nivelAlvo}%</span>
        )}
      </div>
      {stats.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {stats.map(s => (
            <span key={s.label} className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
              <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wide">{s.label}</span>
              <span className="text-xs font-bold text-intento-blue">{s.valor}</span>
            </span>
          ))}
        </div>
      )}
      {reflexoes.length > 0 && (
        <div className="space-y-1.5">
          {reflexoes.map(([label, v]) => (
            <div key={label}>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
              <p className="text-xs text-slate-600 font-medium leading-snug whitespace-pre-wrap">{v}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
