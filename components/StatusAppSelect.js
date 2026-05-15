'use client';

// Select compacto pro mentor definir se o aluno usa o Aplicativo.
// O status é acordado em reunião e controla se o cron de integração
// tenta puxar o registro semanal do app pra esse aluno.
//
// Props:
//   valor    — '' | 'Usa' | 'Não se adaptou' | 'Nunca vai usar'
//   onChange — recebe o novo valor (string)
//   salvando — desabilita o select durante a chamada à API

const OPCOES = [
  { valor: '',                label: 'App: não definido' },
  { valor: 'Usa',             label: 'App: usa' },
  { valor: 'Não se adaptou',  label: 'App: não se adaptou' },
  { valor: 'Nunca vai usar',  label: 'App: nunca vai usar' },
];

export default function StatusAppSelect({ valor, onChange, salvando }) {
  return (
    <select
      value={valor || ''}
      disabled={salvando}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      title="Status do aluno em relação ao Aplicativo"
      className="text-[11px] font-semibold border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-500 outline-none focus:ring-1 focus:ring-intento-blue disabled:opacity-50 cursor-pointer"
    >
      {OPCOES.map((o) => (
        <option key={o.valor} value={o.valor}>{o.label}</option>
      ))}
    </select>
  );
}
