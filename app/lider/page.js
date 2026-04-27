'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Bar, Line } from '@/components/Charts';
import { LoadingScreen } from '@/components/Loading';
import { getCache, setCache, tempoRelativo } from '@/lib/cacheClient';
import PushToggle from '@/components/PushToggle';

const EMAIL_LIDER = 'filippe@metodointento.com.br';

const cardClass = "bg-white rounded-xl border border-slate-200 p-5 shadow-sm";

const FAIXAS_HORAS = [
  { faixa: '0–5h',   color: '#ef4444' },
  { faixa: '5–10h',  color: '#f97316' },
  { faixa: '10–15h', color: '#eab308' },
  { faixa: '15–20h', color: '#10b981' },
  { faixa: '20h+',   color: '#3b82f6' },
];

export default function PainelLider() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);
  const [cacheTs, setCacheTs] = useState(null);

  // Filtros
  const [mentoresSelecionados, setMentoresSelecionados] = useState([]);
  const [filtroDesempenho, setFiltroDesempenho] = useState('');
  const [busca, setBusca] = useState('');
  const [mentoresExpandidos, setMentoresExpandidos] = useState({});

  // Designação de mentor
  const [alunoDesignar, setAlunoDesignar] = useState(null);
  const [mentorEscolhido, setMentorEscolhido] = useState('');
  const [designando, setDesignando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState('');

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const email = user?.email?.toLowerCase() || (typeof window !== 'undefined' ? sessionStorage.getItem('emailLogado') : null);
      if (!email) { router.push('/'); return; }
      if (email !== EMAIL_LIDER) {
        if (email.endsWith('@metodointento.com.br')) router.push('/mentor');
        else router.push('/painel');
        return;
      }
      setAutorizado(true);
    });
    return () => unsub();
  }, [router]);

  // Fetch (com cache client-side: exibe último estado conhecido enquanto rede carrega)
  useEffect(() => {
    if (!autorizado) return;

    // 1) Tenta servir do cache imediatamente
    const cached = getCache('dashboardLider');
    if (cached) {
      setDados(cached.data);
      setCacheTs(cached.ts);
      setCarregando(false);
      setAtualizando(true); // mostra "atualizando..." em background
    } else {
      setCarregando(true);
    }
    setErro('');

    // 2) Em paralelo dispara fetch real
    fetch('/api/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'dashboardLider', email: EMAIL_LIDER }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.status !== 'sucesso') {
          if (!cached) setErro(d.mensagem || 'Erro ao carregar dashboard.');
          return;
        }
        setDados(d);
        setCache('dashboardLider', d);
        setCacheTs(Date.now());
      })
      .catch(() => { if (!cached) setErro('Erro de conexão.'); })
      .finally(() => { setCarregando(false); setAtualizando(false); });
  }, [autorizado]);

  // Lista de mentores únicos (do agregado)
  const listaMentoresUnicos = useMemo(() => {
    if (!dados?.alunos) return [];
    const mapa = {};
    dados.alunos.forEach(a => {
      if (!a.mentor) return;
      if (!mapa[a.mentor]) mapa[a.mentor] = { email: a.mentor, nome: a.mentorNome || a.mentor, count: 0, ativo: a.mentorAtivo };
      mapa[a.mentor].count++;
    });
    return Object.values(mapa).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dados]);

  // Aplica filtros
  const alunosFiltrados = useMemo(() => {
    if (!dados?.alunos) return [];
    return dados.alunos.filter(a => {
      if (mentoresSelecionados.length > 0 && !mentoresSelecionados.includes(a.mentor)) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (!a.nome?.toLowerCase().includes(q) && !a.email?.toLowerCase().includes(q)) return false;
      }
      // Filtro desempenho ainda não tem dado per-aluno (precisaria de mais campos no agregado)
      // Mantém por compatibilidade futura
      return true;
    });
  }, [dados, mentoresSelecionados, busca]);

  // Agrupa filtrados por mentor
  const alunosAgrupados = useMemo(() => {
    const grupos = {};
    alunosFiltrados.forEach(a => {
      const key = a.mentor || 'sem-mentor';
      if (!grupos[key]) grupos[key] = { mentor: a.mentor, mentorNome: a.mentorNome || a.mentor, mentorAtivo: a.mentorAtivo, alunos: [] };
      grupos[key].alunos.push(a);
    });
    return Object.values(grupos).sort((x, y) => x.mentorNome.localeCompare(y.mentorNome));
  }, [alunosFiltrados]);

  // KPIs derivados
  const totalAlunos = alunosFiltrados.length;
  const registrados = alunosFiltrados.filter(a => a.registrouSemanaAtual).length;
  const taxaRegistro = totalAlunos > 0 ? Math.round((registrados / totalAlunos) * 100) : 0;

  const sair = async () => {
    await auth.signOut();
    sessionStorage.removeItem('emailLogado');
    router.push('/');
  };

  // Lista de alunos sem mentor ativo (mentor vazio ou inativo)
  const alunosAguardando = useMemo(() => {
    return (dados?.alunos || []).filter(a => !a.mentor || !a.mentorAtivo);
  }, [dados]);

  const abrirDesignacao = (aluno) => {
    setAlunoDesignar(aluno);
    setMentorEscolhido('');
  };

  const designarMentor = async () => {
    if (!alunoDesignar || !mentorEscolhido || designando) return;
    setDesignando(true);
    setMensagemSucesso('');
    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'designarMentor',
          email: EMAIL_LIDER,
          idAluno: alunoDesignar.idAluno,
          emailMentor: mentorEscolhido,
        }),
      });
      const data = await res.json();
      if (data.status !== 'sucesso') {
        alert('Erro: ' + (data.mensagem || 'falha na designação'));
        return;
      }
      const partsEnviados = [];
      if (data.emailsEnviados?.aluno)  partsEnviados.push('aluno');
      if (data.emailsEnviados?.mentor) partsEnviados.push('mentor');
      const msg = data.aluno?.nome + ' → ' + data.mentorNome +
        (partsEnviados.length ? ' · email enviado a ' + partsEnviados.join(' e ') : ' · sem emails');
      setMensagemSucesso(msg);
      setAlunoDesignar(null);
      // Refetch dashboard pra refletir mudança
      const refetched = await fetch('/api/mentor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'dashboardLider', email: EMAIL_LIDER }),
      });
      const novosDados = await refetched.json();
      if (novosDados.status === 'sucesso') setDados(novosDados);
      setTimeout(() => setMensagemSucesso(''), 6000);
    } catch (e) {
      alert('Erro de conexão.');
    } finally {
      setDesignando(false);
    }
  };

  if (!autorizado) return <LoadingScreen mensagem="Carregando..." />;
  if (carregando) return <LoadingScreen mensagem="Sincronizando painel — pode levar até 1 minuto na primeira carga..." />;

  if (erro) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <p className="text-sm text-red-600 font-medium mb-4">Erro: {erro}</p>
        <button onClick={() => window.location.reload()} className="text-sm font-semibold text-intento-blue hover:underline">Tentar novamente</button>
      </div>
    );
  }

  const ag = dados?.agregado || {};
  const distribuicao = ag.horasEstudadas?.distribuicao || [];
  const historico = ag.horasEstudadas?.historico8Semanas || [];
  const dominio = ag.dominioPorMateria || {};
  const progresso = ag.progressoPorMateria || {};
  const bemEstar = ag.bemEstar || {};
  const simulados = ag.simuladosUltimas4Semanas || 0;

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 10 } } } },
    scales: { y: { beginAtZero: true, grid: { color: 'rgba(150,150,150,0.1)' } }, x: { grid: { display: false } } },
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center gap-4 justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/selecionar-modo')} className="text-sm font-medium text-slate-400 hover:text-intento-blue transition">← Voltar</button>
          <div>
            <h1 className="text-base font-semibold text-intento-blue">Painel do Líder</h1>
            <p className="text-[11px] text-slate-400 font-medium">
              Semana de referência: {dados?.semanaAtual || '—'}
              {cacheTs && (
                <span className="ml-2">
                  ·{' '}
                  {atualizando ? (
                    <span className="text-amber-600 inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      atualizando…
                    </span>
                  ) : (
                    <span className="text-emerald-600">atualizado {tempoRelativo(cacheTs)}</span>
                  )}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PushToggle email={EMAIL_LIDER} />
          <button onClick={sair} className="text-sm font-semibold text-slate-400 hover:text-red-500 transition">Sair</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">

        {/* KPIs no topo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={cardClass + ' text-center'}>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Alunos Ativos</p>
            <p className="text-3xl font-bold text-intento-blue">{totalAlunos}</p>
          </div>
          <div className={cardClass + ' text-center'}>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Registrados na semana</p>
            <p className={`text-3xl font-bold ${taxaRegistro >= 80 ? 'text-emerald-600' : taxaRegistro >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{registrados}<span className="text-base text-slate-400 font-medium">/{totalAlunos}</span></p>
            <p className="text-[10px] font-medium text-slate-400 mt-1">{taxaRegistro}%</p>
          </div>
          <div className={cardClass + ' text-center'}>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Mentores Ativos</p>
            <p className="text-3xl font-bold text-intento-blue">{listaMentoresUnicos.filter(m => m.ativo).length}</p>
          </div>
          <div className={cardClass + ' text-center border-b-2 border-b-intento-yellow'}>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Simulados (últ. 4 sem.)</p>
            <p className="text-3xl font-bold text-intento-yellow">{simulados}</p>
          </div>
        </div>

        {/* Filtros */}
        <div className={cardClass}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Filtros</p>
          <div className="flex flex-wrap gap-3 items-center">

            {/* Filtro Mentor */}
            <details className="relative">
              <summary className="cursor-pointer list-none text-xs font-semibold text-intento-blue bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg transition">
                Mentor {mentoresSelecionados.length > 0 && <span className="bg-intento-blue text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">{mentoresSelecionados.length}</span>}
              </summary>
              <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[260px] z-10 max-h-[300px] overflow-y-auto">
                {listaMentoresUnicos.map(m => (
                  <label key={m.email} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-slate-50 px-2 rounded">
                    <input
                      type="checkbox"
                      checked={mentoresSelecionados.includes(m.email)}
                      onChange={(e) => {
                        if (e.target.checked) setMentoresSelecionados(prev => [...prev, m.email]);
                        else setMentoresSelecionados(prev => prev.filter(x => x !== m.email));
                      }}
                      className="w-3.5 h-3.5"
                    />
                    <span className="text-xs font-medium text-slate-700 flex-1 truncate">{m.nome}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{m.count}</span>
                  </label>
                ))}
                {mentoresSelecionados.length > 0 && (
                  <button onClick={() => setMentoresSelecionados([])} className="text-[10px] text-intento-blue font-bold hover:underline mt-2">Limpar</button>
                )}
              </div>
            </details>

            {/* Filtro busca */}
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar aluno por nome ou email..."
                className="w-full text-xs font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400"
              />
            </div>

            {/* Limpar todos */}
            {(mentoresSelecionados.length > 0 || busca) && (
              <button
                onClick={() => { setMentoresSelecionados([]); setBusca(''); }}
                className="text-xs font-semibold text-slate-400 hover:text-red-500 px-3 py-2 transition"
              >
                Limpar tudo
              </button>
            )}
          </div>
        </div>

        {/* Aguardando Designação — destaque pra alunos sem mentor */}
        {alunosAguardando.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"/></svg>
                <h2 className="text-sm font-bold text-amber-800">Aguardando designação</h2>
                <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{alunosAguardando.length}</span>
              </div>
            </div>
            <p className="text-xs text-amber-700/80 font-medium mb-4">Alunos sem mentor ativo cadastrado. Designe um mentor para que ele entre em contato.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {alunosAguardando.map(a => (
                <div key={a.idAluno} className="bg-white border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 truncate">{a.nome}</p>
                    <p className="text-[11px] text-slate-400 font-medium truncate">{a.email}</p>
                    {a.mentor && !a.mentorAtivo && (
                      <p className="text-[10px] text-amber-600 font-medium mt-0.5 truncate">mentor inativo: {a.mentor}</p>
                    )}
                  </div>
                  <button
                    onClick={() => abrirDesignacao(a)}
                    className="text-xs font-semibold bg-intento-yellow text-white px-3 py-1.5 rounded-lg hover:bg-yellow-500 transition shrink-0"
                  >
                    Designar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toast de sucesso da designação */}
        {mensagemSucesso && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-3">
            <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
            <span className="text-xs font-semibold text-emerald-800">Designado: {mensagemSucesso}</span>
          </div>
        )}

        {/* Modal de designação */}
        {alunoDesignar && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in"
               onClick={(e) => { if (e.target === e.currentTarget) setAlunoDesignar(null); }}>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Designar mentor</p>
                <h2 className="text-base font-semibold text-intento-blue mt-0.5">{alunoDesignar.nome}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{alunoDesignar.email}</p>
                {alunoDesignar.mentor && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    Mentor atual: <span className="font-semibold">{alunoDesignar.mentorNome || alunoDesignar.mentor}</span>
                    {!alunoDesignar.mentorAtivo && <span className="ml-1 text-amber-600">(inativo)</span>}
                  </p>
                )}
              </div>

              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Selecione o mentor</label>
                  <select
                    value={mentorEscolhido}
                    onChange={(e) => setMentorEscolhido(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-sm font-medium text-intento-blue"
                  >
                    <option value="">— Escolha um mentor ativo —</option>
                    {(dados?.mentoresAtivos || []).map(m => (
                      <option key={m.email} value={m.email}>{m.nome}</option>
                    ))}
                  </select>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Ao confirmar, o sistema atualiza o mentor na planilha e <b>envia email automático</b> para o aluno e para o mentor com os dados de contato.
                </p>
              </div>

              <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  onClick={() => setAlunoDesignar(null)}
                  className="text-sm font-semibold text-slate-500 hover:text-intento-blue px-4 py-2 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={designarMentor}
                  disabled={!mentorEscolhido || designando}
                  className="text-sm font-semibold bg-intento-blue hover:bg-blue-900 text-white px-5 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {designando ? 'Enviando...' : 'Designar e notificar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Visão analítica — sempre visão geral, não respeita filtros */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3 pt-4">
          <h2 className="text-base font-semibold text-intento-blue">Visão analítica</h2>
          <span className="text-[11px] text-slate-400 font-medium">visão geral da base · não respeita os filtros</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Histograma de horas */}
          <div className={cardClass}>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Distribuição de horas estudadas</h3>
            <p className="text-[10px] font-medium text-slate-400 mb-4">semana de referência · todos os alunos</p>
            <div className="h-56">
              <Bar
                data={{
                  labels: distribuicao.map(d => d.faixa),
                  datasets: [{
                    data: distribuicao.map(d => d.count),
                    backgroundColor: distribuicao.map((_, i) => FAIXAS_HORAS[i]?.color || '#94a3b8'),
                    borderRadius: 4,
                  }],
                }}
                options={{ ...chartOptions, indexAxis: 'y', plugins: { legend: { display: false } } }}
              />
            </div>
          </div>

          {/* Domínio por matéria */}
          <div className={cardClass}>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Domínio médio por matéria</h3>
            <p className="text-[10px] font-medium text-slate-400 mb-4">média da base · últimas 4 semanas</p>
            <div className="h-56">
              <Bar
                data={{
                  labels: ['Biologia', 'Química', 'Física', 'Matemática'],
                  datasets: [{
                    data: [dominio.bio || 0, dominio.qui || 0, dominio.fis || 0, dominio.mat || 0],
                    backgroundColor: ['#10b981', '#3b82f6', '#f97316', '#ef4444'],
                    borderRadius: 4,
                  }],
                }}
                options={{ ...chartOptions, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, grid: { color: 'rgba(150,150,150,0.1)' } } } }}
              />
            </div>
          </div>

          {/* Progresso por matéria */}
          <div className={cardClass}>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Progresso médio por matéria</h3>
            <p className="text-[10px] font-medium text-slate-400 mb-4">média da base · últimas 4 semanas</p>
            <div className="h-56">
              <Bar
                data={{
                  labels: ['Biologia', 'Química', 'Física', 'Matemática'],
                  datasets: [{
                    data: [progresso.bio || 0, progresso.qui || 0, progresso.fis || 0, progresso.mat || 0],
                    backgroundColor: ['#10b981', '#3b82f6', '#f97316', '#ef4444'],
                    borderRadius: 4,
                  }],
                }}
                options={{ ...chartOptions, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, grid: { color: 'rgba(150,150,150,0.1)' } } } }}
              />
            </div>
          </div>

          {/* Bem-estar */}
          <div className={cardClass}>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Bem-estar — média da base</h3>
            <p className="text-[10px] font-medium text-slate-400 mb-4">semana de referência · escala 0–5</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Estresse',  valor: bemEstar.estresse,  cor: '#ef4444', invertido: true },
                { label: 'Ansiedade', valor: bemEstar.ansiedade, cor: '#f97316', invertido: true },
                { label: 'Motivação', valor: bemEstar.motivacao, cor: '#10b981' },
                { label: 'Sono',      valor: bemEstar.sono,      cor: '#a855f7' },
              ].map(b => (
                <div key={b.label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">{b.label}</p>
                  <p className="text-2xl font-bold" style={{ color: b.cor }}>{b.valor || 0}<span className="text-xs text-slate-400 font-medium">/5</span></p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">{b.invertido ? 'menor é melhor' : 'maior é melhor'}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Histórico horas vs meta */}
        <div className={cardClass}>
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Horas estudadas vs Meta — média da base</h3>
          <p className="text-[10px] font-medium text-slate-400 mb-4">últimas 8 semanas</p>
          <div className="h-64">
            <Line
              data={{
                labels: historico.map(h => String(h.semana || '').split(' a ')[0] || ''),
                datasets: [
                  { label: 'Horas (média da base)', data: historico.map(h => h.mediaHoras), borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.3 },
                  { label: 'Meta (média da base)',  data: historico.map(h => h.mediaMeta),  borderColor: '#94a3b8', backgroundColor: 'transparent', borderDash: [6,4], tension: 0.3 },
                ],
              }}
              options={chartOptions}
            />
          </div>
        </div>

        {/* Lista hierárquica — respeita filtros */}
        <div className="space-y-3 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3">
            <h2 className="text-base font-semibold text-intento-blue">Mentores e mentorados</h2>
            <span className="text-[11px] text-slate-400 font-medium">respeita os filtros acima</span>
          </div>
          {alunosAgrupados.length === 0 ? (
            <div className={cardClass + ' text-center py-10'}>
              <p className="text-sm text-slate-400 font-medium">Nenhum aluno encontrado com os filtros atuais.</p>
            </div>
          ) : alunosAgrupados.map(grupo => {
            const expandido = mentoresExpandidos[grupo.mentor] !== false; // default expandido
            const registradosGrupo = grupo.alunos.filter(a => a.registrouSemanaAtual).length;
            return (
              <div key={grupo.mentor} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => setMentoresExpandidos(prev => ({ ...prev, [grupo.mentor]: !expandido }))}
                  className="w-full px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-intento-blue/10 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-intento-blue">{(grupo.mentorNome || '?').charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="text-left min-w-0">
                      <p className="text-sm font-semibold text-intento-blue truncate">
                        {grupo.mentorNome}
                        {!grupo.mentorAtivo && <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase">não cadastrado</span>}
                      </p>
                      <p className="text-[11px] text-slate-400 font-medium">{grupo.alunos.length} mentorado{grupo.alunos.length !== 1 ? 's' : ''} · {registradosGrupo} registrado{registradosGrupo !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expandido ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                </button>
                {expandido && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {grupo.alunos.map(a => (
                      <div key={a.idAluno} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50 transition">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${a.registrouSemanaAtual ? 'bg-emerald-500' : 'bg-red-400'}`} title={a.registrouSemanaAtual ? 'Registrado' : 'Pendente'}/>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{a.nome}</p>
                            <p className="text-[10px] text-slate-400 font-medium truncate">
                              {a.ultimoEncontro ? `Último encontro: ${a.ultimoEncontro}` : 'Sem encontros registrados'}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => window.open(`/mentor/${a.idAluno}?nome=${encodeURIComponent(a.nome)}`, '_blank')}
                          className="text-[11px] font-semibold text-intento-blue hover:underline shrink-0"
                        >
                          Ver detalhes ↗
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
