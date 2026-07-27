'use client';

// Componentes visuais dos carimbos Fases e Ciclos (Aprendiz/Veterano/Mestre).
// Compartilhados entre /lider e /mentor — cores em lib/carimboCores.js e regras
// em lib/carimbos.js (fonte única). Nada de faixa ou cor hardcoded aqui.

import { useMemo } from 'react';
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
const STATUS_FORA_DO_APP = ['Não se adaptou', 'Nunca vai usar'];

export function CardCarimbosAluno({ registros, statusApp }) {
  const foraDoApp = STATUS_FORA_DO_APP.includes(statusApp);
  const d = useMemo(
    () => diagnosticoDimensional({ metricas: registrosParaMetricas(registros) }),
    [registros]
  );
  const ciclo = CICLOS_INFO[cicloIdx()];

  const linhas = [
    {
      key: 'comportamento',
      val: d.compEmFormacao
        ? `em formação · ${d.semanasMensuraveis}/4 semanas mensuráveis`
        : `Presença ${CARIMBO_LABEL[d.presenca]} · Aproveitamento ${CARIMBO_LABEL[d.aproveitamento]}`,
      nota: d.overstudying ? '2+ semanas acima de 105% da meta — atenção à sustentabilidade (trava Mestre)' : null,
    },
    { key: 'cobertura', val: d.cobMed != null ? `${Math.round(d.cobMed)}% do edital` : '—' },
    { key: 'dominio', val: d.domMed != null ? `${Math.round(d.domMed)}% de acerto` : '—' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fases e Ciclos</p>
          <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase tracking-wider">{ciclo.id} {ciclo.nome}</span>
          <span className="text-[9px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded uppercase tracking-wider" title="Linguagem interna da equipe — não compartilhar com aluno/família nesta fase.">uso interno</span>
        </div>
        <div className="text-right shrink-0">
          <CarimboBadge nivel={d.perfil} />
          <p className="text-[9px] text-slate-400 font-medium mt-0.5">Perfil — leitura preliminar do ciclo</p>
        </div>
      </div>
      {foraDoApp ? (
        <p className="text-xs text-slate-400 font-medium">Sem dados dimensionais — aluno fora do app.</p>
      ) : (
        <div className="space-y-2.5">
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

export function CarimboDimensional({ d, tamanho = 'md' }) {
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
        const aria = inativo ? 'Simulado inativo' : nivel ? `${nome}: ${CARIMBO_LABEL[nivel]}` : `${nome} sem dado`;
        return (
          <span key={key} aria-label={aria} title={aria}
            className={`font-bold rounded ${cls} ${inativo ? 'opacity-70' : ''}`}
            style={{ backgroundColor: c.bg, color: c.texto }}>{curto}</span>
        );
      })}
    </span>
  );
}
