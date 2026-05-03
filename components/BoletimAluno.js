'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { auth } from '@/lib/firebase';
import Boletim from '@/components/Boletim';

export default function BoletimAluno({ idAluno }) {
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

  if (provas === null && !erro) {
    return <p className="text-sm text-slate-400 font-medium py-6 text-center">Carregando boletim…</p>;
  }
  if (erro) {
    return <p className="text-sm text-red-600 font-medium py-6 text-center">{erro}</p>;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-intento-blue">Boletim</h2>
        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Suas notas e desempenho por matéria — atualizado pelo mentor.</p>
      </div>
      <Boletim provas={provas} />
    </div>
  );
}
