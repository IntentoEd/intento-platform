'use client';

// Componentes visuais dos carimbos Fases e Ciclos (Aprendiz/Veterano/Mestre).
// Compartilhados entre /lider e /mentor — cores em lib/carimboCores.js e regras
// em lib/carimbos.js (fonte única). Nada de faixa ou cor hardcoded aqui.

import { corDe, CARIMBO_LABEL } from '@/lib/carimboCores';

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
