'use client';

import { useEffect, useRef, useState } from 'react';

// Controle do status do aluno em relação ao Aplicativo. O status é acordado
// em reunião e controla se o cron de integração tenta puxar o registro
// semanal do app pra esse aluno.
//
// Visual: pill com dot colorido por estado (coerente com o resto da
// plataforma) + dropdown próprio — substitui o <select> nativo.
//
// Props:
//   valor    — '' | 'Usa' | 'Não se adaptou' | 'Nunca vai usar'
//   onChange — recebe o novo valor (string)
//   salvando — desabilita o controle durante a chamada à API

const OPCOES = [
  { valor: 'Usa',             label: 'Usa o app',      dot: 'bg-emerald-500', texto: 'text-emerald-700', borda: 'border-emerald-200', fundo: 'bg-emerald-50' },
  { valor: 'Não se adaptou',  label: 'Não se adaptou', dot: 'bg-amber-500',   texto: 'text-amber-700',   borda: 'border-amber-200',   fundo: 'bg-amber-50' },
  { valor: 'Nunca vai usar',  label: 'Nunca vai usar', dot: 'bg-slate-400',   texto: 'text-slate-600',   borda: 'border-slate-200',   fundo: 'bg-slate-50' },
  { valor: '',                label: 'Não definido',   dot: 'bg-slate-300',   texto: 'text-slate-500',   borda: 'border-slate-200',   fundo: 'bg-white' },
];

const porValor = (v) => OPCOES.find((o) => o.valor === (v || '')) || OPCOES[3];

export default function StatusAppSelect({ valor, onChange, salvando }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);
  const atual = porValor(valor);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={salvando}
        onClick={() => setAberto((v) => !v)}
        title="Status do aluno em relação ao Aplicativo"
        className={`flex items-center gap-1.5 text-[11px] font-semibold border rounded-full pl-2 pr-1.5 py-1 transition-colors disabled:opacity-50 ${atual.fundo} ${atual.texto} ${atual.borda} hover:brightness-95`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${atual.dot}`} />
        <span className="truncate">App: {atual.label}</span>
        <svg className={`w-3 h-3 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
      </button>

      {aberto && (
        <div className="absolute z-20 mt-1 left-0 min-w-[170px] bg-white border border-slate-200 rounded-lg shadow-lg py-1 animate-in fade-in">
          {OPCOES.map((o) => (
            <button
              key={o.valor || 'vazio'}
              type="button"
              onClick={() => { onChange(o.valor); setAberto(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-left hover:bg-slate-50 transition-colors ${o.valor === (valor || '') ? 'bg-slate-50' : ''}`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${o.dot}`} />
              <span className="text-slate-600">{o.label}</span>
              {o.valor === (valor || '') && (
                <svg className="w-3.5 h-3.5 ml-auto text-intento-blue shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
