'use client';

// Componentes visuais dos carimbos Fases e Ciclos (Aprendiz/Veterano/Mestre).
// Compartilhados entre /lider e /mentor — cores em lib/carimboCores.js e regras
// em lib/carimbos.js (fonte única). Nada de faixa ou cor hardcoded aqui.

import { useMemo, useState } from 'react';
import { corDe, CARIMBO_LABEL } from '@/lib/carimboCores';
import { diagnosticoDimensional, registrosParaMetricas, cicloIdx, CICLOS_INFO, DIM_LABEL } from '@/lib/carimbos';

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
// USO INTERNO: linguagem da empresa — não compartilhar com aluno/família nesta
// fase (versão externa é pendência registrada). Sem alerta clínico aqui (sinal
// em validação). Perfil agregado = leitura preliminar do ciclo (o freeze no
// Marco de Ciclo ainda não existe). Carimbos computados no front a partir do
// BD_Registro cru — mesmas fórmulas do /lider via lib/carimbos.js.
// Faixa compacta por padrão (colapsada); clique em qualquer ponto expande o
// detalhe por dimensão — economiza a dobra e reduz exposição da linguagem
// interna em tela compartilhada.
const STATUS_FORA_DO_APP = ['Não se adaptou', 'Nunca vai usar'];

const NOTA_OVERSTUDYING = '2+ semanas acima de 105% da meta — atenção à sustentabilidade (trava Mestre)';

export function CardCarimbosAluno({ registros, statusApp }) {
  const foraDoApp = STATUS_FORA_DO_APP.includes(statusApp);
  const [aberto, setAberto] = useState(false);
  const d = useMemo(
    () => diagnosticoDimensional({ metricas: registrosParaMetricas(registros) }),
    [registros]
  );
  const ciclo = CICLOS_INFO[cicloIdx()];

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
      <span className="flex items-center gap-2 shrink-0" title="Linguagem interna da equipe — não compartilhar com aluno/família nesta fase.">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fases e Ciclos</span>
        <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wider">{ciclo.id} {ciclo.nome}</span>
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
      <span className="ml-auto flex items-center gap-1.5 shrink-0" title="Perfil — leitura preliminar do ciclo">
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
              <p><b>Cobertura</b> — % do edital validado: &lt;30 Aprendiz · 30–70 Veterano · &gt;70 Mestre.</p>
              <p><b>Domínio</b> — % de acerto (média 4 semanas): &lt;70 Aprendiz · 70–80 Veterano · &gt;80 Mestre (nenhuma matéria &lt;70).</p>
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
