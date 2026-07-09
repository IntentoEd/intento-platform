'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { apiFetch } from '@/lib/api';

const MentorContext = createContext(null);

export function useMentor() {
  const ctx = useContext(MentorContext);
  if (!ctx) throw new Error('useMentor precisa estar dentro de MentorProvider');
  return ctx;
}

export function MentorProvider({ children }) {
  const router = useRouter();
  const [emailMentor, setEmailMentor] = useState('');
  const [primeiroNome, setPrimeiroNome] = useState('');
  const [alunos, setAlunos] = useState([]);
  const [carregandoAlunos, setCarregandoAlunos] = useState(true);
  const [erroAlunos, setErroAlunos] = useState(null);
  const [tentativa, setTentativa] = useState(0);
  const prefetched = useRef(new Set());

  // Auth gate. Sem fallback de sessionStorage: todas as ações do mentor são
  // autenticadas no gateway via ID token do Firebase — sem `user` aqui, toda
  // chamada retornaria 401 e a página viraria um "sem alunos" enganoso.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Sessão Firebase ausente (ou quebrou no meio do login): limpa o
        // resquício que deixava o guard passar e volta pro login.
        sessionStorage.removeItem('emailLogado');
        router.push('/');
        return;
      }
      const email = user.email?.toLowerCase() || '';
      if (!email.endsWith('@metodointento.com.br')) {
        router.push('/');
        return;
      }
      setEmailMentor(email);
      const primeiro = email.split('@')[0];
      setPrimeiroNome(primeiro.charAt(0).toUpperCase() + primeiro.slice(1));
    });
    return () => unsub();
  }, [router]);

  // Carrega lista de alunos (camada 1.1 cacheia 5min). `tentativa` permite
  // retry manual via recarregarAlunos.
  useEffect(() => {
    if (!emailMentor) return;
    let cancelado = false;
    let redirecionando = false;
    setCarregandoAlunos(true);
    setErroAlunos(null);
    apiFetch('/api/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'listaAlunosMentor' }),
    })
      .then(r => {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(d => {
        if (cancelado) return;
        if (d.status === 'sucesso' || d.status === 200) setAlunos(d.alunos || []);
        else throw new Error(d.mensagem || 'resposta_inesperada');
      })
      .catch((e) => {
        if (cancelado) return;
        console.warn('[MentorContext] listaAlunosMentor falhou:', e?.message);
        if (e?.message === 'http_401') {
          // Token inválido/ausente no servidor: sessão está quebrada de
          // verdade — força novo login em vez de renderizar lista vazia.
          redirecionando = true;
          auth.signOut().catch(() => {});
          sessionStorage.removeItem('emailLogado');
          router.push('/');
          return;
        }
        setErroAlunos(e?.message || 'erro');
      })
      .finally(() => { if (!cancelado && !redirecionando) setCarregandoAlunos(false); });
    return () => { cancelado = true; };
  }, [emailMentor, tentativa, router]);

  const recarregarAlunos = useCallback(() => setTentativa(t => t + 1), []);

  // Prefetch dos dados de um aluno (chamado on-hover) — depende do cache do API route
  const prefetchAluno = useCallback((idPlanilha) => {
    if (!idPlanilha || prefetched.current.has(idPlanilha)) return;
    prefetched.current.add(idPlanilha);
    apiFetch('/api/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'buscarDadosAluno', idPlanilhaAluno: idPlanilha }),
    }).catch(() => prefetched.current.delete(idPlanilha));
  }, []);

  // Define o status do aluno em relação ao app (acordado em reunião pelo mentor).
  // Atualiza o estado local de forma otimista; reverte se a API falhar.
  const atualizarStatusApp = useCallback(async (idAluno, statusApp) => {
    let anterior;
    setAlunos(prev => prev.map(a => {
      if (String(a.id) === String(idAluno)) { anterior = a.statusApp || ''; return { ...a, statusApp }; }
      return a;
    }));
    try {
      const r = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'salvarStatusApp', idAluno, statusApp }),
      });
      const d = await r.json();
      if (d.status !== 'sucesso') throw new Error(d.mensagem || 'falha');
      return true;
    } catch (e) {
      console.warn('[MentorContext] salvarStatusApp falhou:', e?.message);
      setAlunos(prev => prev.map(a => String(a.id) === String(idAluno) ? { ...a, statusApp: anterior } : a));
      return false;
    }
  }, []);

  // Marca otimista de "acompanhamento exportado" pra um aluno. Chamado pelas
  // páginas de exportação após o download bem-sucedido — evita F5 pra ver
  // o badge 'Enviado' no /mentor.
  const marcarAcompanhamentoExportado = useCallback((idAluno) => {
    const hojeISO = new Date().toISOString().slice(0, 10);
    setAlunos(prev => prev.map(a =>
      String(a.id) === String(idAluno) ? { ...a, ultimaExportacao: hojeISO } : a
    ));
  }, []);

  // Toggle manual do checklist: o mentor marca/desmarca "enviado" na semana,
  // independente do export. Otimista; reverte se a API falhar.
  const marcarAcompanhamento = useCallback(async (idAluno, enviado) => {
    const hojeISO = new Date().toISOString().slice(0, 10);
    let anterior;
    setAlunos(prev => prev.map(a => {
      if (String(a.id) === String(idAluno)) { anterior = a.ultimaExportacao || ''; return { ...a, ultimaExportacao: enviado ? hojeISO : '' }; }
      return a;
    }));
    try {
      const r = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'marcarAcompanhamento', idAluno, enviado }),
      });
      const d = await r.json();
      if (d.status !== 'sucesso') throw new Error(d.mensagem || 'falha');
      return true;
    } catch (e) {
      console.warn('[MentorContext] marcarAcompanhamento falhou:', e?.message);
      setAlunos(prev => prev.map(a => String(a.id) === String(idAluno) ? { ...a, ultimaExportacao: anterior } : a));
      return false;
    }
  }, []);

  return (
    <MentorContext.Provider value={{ emailMentor, primeiroNome, alunos, carregandoAlunos, erroAlunos, recarregarAlunos, prefetchAluno, atualizarStatusApp, marcarAcompanhamentoExportado, marcarAcompanhamento }}>
      {children}
    </MentorContext.Provider>
  );
}
