'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import { auth } from '@/lib/firebase';

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const TIPO_LABEL = {
  bimestral: 'Bimestral',
  mensal: 'Mensal',
  semanal: 'Semanal',
  recuperacao: 'Recuperação',
};

function inicioDoDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()}/${MESES[d.getMonth()]}`;
}
function diasAte(iso) {
  if (!iso) return null;
  return Math.round((inicioDoDia(new Date(iso)) - inicioDoDia(new Date())) / (1000 * 60 * 60 * 24));
}
function countdown(dias) {
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `em ${dias} dias`;
}
function corPorDias(dias) {
  if (dias <= 3) return { borda: 'border-l-red-500', txt: 'text-red-600' };
  if (dias <= 7) return { borda: 'border-l-amber-500', txt: 'text-amber-700' };
  return { borda: 'border-l-slate-200', txt: 'text-slate-500' };
}

export default function ProvasAluno({ idAluno }) {
  const [provas, setProvas] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const res = await apiFetch('/api/mentor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            acao: 'listarAvaliacoesAluno',
            email: auth.currentUser?.email || '',
            idAluno,
          }),
        });
        const data = await res.json();
        if (!ativo) return;
        if (data.status !== 'sucesso') { setErro(data.mensagem || 'Erro ao carregar.'); return; }
        setProvas(data.avaliacoes || []);
      } catch (e) {
        if (ativo) setErro('Erro de conexão.');
      }
    })();
    return () => { ativo = false; };
  }, [idAluno]);

  const proximas = useMemo(() => {
    if (!provas) return [];
    const hoje = inicioDoDia(new Date());
    return provas
      .filter(p => inicioDoDia(new Date(p.data)) >= hoje)
      .sort((a, b) => new Date(a.data) - new Date(b.data));
  }, [provas]);

  if (provas === null && !erro) {
    return null; // silencioso enquanto carrega — não polui o painel
  }
  if (erro || proximas.length === 0) {
    return null; // sem provas próximas, sem card
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-intento-blue">📅 Próximas provas</h2>
        <span className="text-[10px] font-medium text-slate-400">{proximas.length}</span>
      </div>
      <div className="space-y-2">
        {proximas.slice(0, 5).map(p => {
          const dias = diasAte(p.data);
          const cor = corPorDias(dias);
          return (
            <div key={p.id} className={`bg-slate-50 border border-slate-200 border-l-4 ${cor.borda} rounded-lg p-3`}>
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{TIPO_LABEL[p.tipo] || p.tipo}</span>
                <span className="text-sm font-semibold text-slate-800">{p.materia}</span>
              </div>
              <p className="text-xs font-medium text-slate-500">
                {formatarData(p.data)} · <span className={`font-bold ${cor.txt}`}>{countdown(dias)}</span>
              </p>
              {p.observacao && <p className="text-[11px] text-slate-500 mt-1 italic">{p.observacao}</p>}
            </div>
          );
        })}
      </div>
      {proximas.length > 5 && (
        <p className="text-[11px] text-slate-400 text-center mt-3 italic">
          +{proximas.length - 5} prova{proximas.length - 5 !== 1 ? 's' : ''} a seguir
        </p>
      )}
    </div>
  );
}
