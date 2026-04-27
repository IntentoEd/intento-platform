'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ModalRegistro from '../../components/ModalRegistro';
import { auth } from '@/lib/firebase';
import { useMentor } from '@/lib/MentorContext';
import { LoadingScreen } from '@/components/Loading';
import PushToggle from '@/components/PushToggle';

// Chave da semana de referência (semana anterior, dom→sab) — mesma lógica do modal
function getSemanaKey() {
  const hoje = new Date();
  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - hoje.getDay() - 7);
  const sabado = new Date(domingo);
  sabado.setDate(domingo.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('pt-BR');
  return `${fmt(domingo)} a ${fmt(sabado)}`;
}

const STORAGE_KEY = 'intento_registros_semana';

function carregarRegistrosSemana() {
  try {
    const salvo = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const semanaAtual = getSemanaKey();
    // Limpa registros de semanas anteriores automaticamente
    if (salvo.semana !== semanaAtual) return {};
    return salvo.alunos || {};
  } catch {
    return {};
  }
}

function salvarRegistroSemana(idAluno) {
  const semanaAtual = getSemanaKey();
  const atual = carregarRegistrosSemana();
  const novo = { semana: semanaAtual, alunos: { ...atual, [idAluno]: true } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(novo));
}

export default function PainelGlobalMentor() {
  const router = useRouter();
  const { emailMentor, primeiroNome: mentorLogado, alunos, carregandoAlunos: carregando, prefetchAluno } = useMentor();
  const ehLider = emailMentor === 'filippe@metodointento.com.br';

  const [busca, setBusca] = useState('');
  const [registradosSemana, setRegistradosSemana] = useState({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [alunoPreSelecionado, setAlunoPreSelecionado] = useState(null);

  // Carrega estado dos registros da semana do localStorage
  useEffect(() => {
    setRegistradosSemana(carregarRegistrosSemana());
  }, []);

  const abrirModal = (aluno = null) => {
    setAlunoPreSelecionado(aluno);
    setIsModalOpen(true);
  };

  const fecharModal = () => {
    setIsModalOpen(false);
    setAlunoPreSelecionado(null);
  };

  const handleRegistroSalvo = useCallback((idAluno) => {
    salvarRegistroSemana(String(idAluno));
    setRegistradosSemana(prev => ({ ...prev, [String(idAluno)]: true }));
  }, []);

  const alunosFiltrados = alunos.filter(a =>
    a.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    a.email?.toLowerCase().includes(busca.toLowerCase())
  );

  const totalRegistrados = alunos.filter(a => registradosSemana[String(a.id)]).length;
  const semanaRef = getSemanaKey();

  if (carregando) return <LoadingScreen mensagem="Sincronizando Painel..." />;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Cabeçalho */}
        <div className="flex justify-between items-center border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-intento-blue">Painel do Mentor</h1>
            <p className="text-slate-400 text-sm font-medium mt-0.5">Bem-vindo(a), {mentorLogado}</p>
          </div>
          <div className="flex items-center gap-3">
            <PushToggle email={emailMentor} />
            {ehLider && (
              <button
                onClick={() => router.push('/selecionar-modo')}
                className="text-xs font-semibold text-intento-yellow border border-intento-yellow hover:bg-intento-yellow hover:text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                Painel do Líder ↔
              </button>
            )}
            <button
              onClick={() => { auth.signOut(); sessionStorage.removeItem('emailLogado'); router.push('/'); }}
              className="text-sm font-semibold text-slate-400 hover:text-red-500 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Painel de progresso semanal */}
        {alunos.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Registros desta semana</p>
                <p className="text-xs text-slate-400 font-medium">{semanaRef}</p>
              </div>
              <div className="flex items-center gap-4">
                {/* Barra de progresso */}
                <div className="flex-1 min-w-[140px]">
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="text-slate-500">{totalRegistrados} de {alunos.length}</span>
                    <span className="text-intento-blue">{alunos.length > 0 ? Math.round((totalRegistrados / alunos.length) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${totalRegistrados === alunos.length ? 'bg-emerald-500' : 'bg-intento-yellow'}`}
                      style={{ width: `${alunos.length > 0 ? (totalRegistrados / alunos.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
                {/* Badge de status geral */}
                {totalRegistrados === alunos.length && alunos.length > 0 ? (
                  <span className="shrink-0 bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full border border-emerald-200">
                    ✓ Todos registrados
                  </span>
                ) : (
                  <span className="shrink-0 bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-full border border-amber-200">
                    {alunos.length - totalRegistrados} pendente{alunos.length - totalRegistrados !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Avatares rápidos dos pendentes */}
            {totalRegistrados < alunos.length && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pendentes:</p>
                <div className="flex flex-wrap gap-2">
                  {alunos.filter(a => !registradosSemana[String(a.id)]).map(a => (
                    <button
                      key={a.id}
                      onClick={() => abrirModal(a)}
                      title={`Registrar ${a.nome}`}
                      className="flex items-center gap-2 bg-slate-50 border border-slate-200 hover:border-intento-yellow hover:bg-amber-50 px-3 py-1.5 rounded-full transition-all group"
                    >
                      <div className="w-5 h-5 rounded-full bg-slate-200 group-hover:bg-intento-yellow flex items-center justify-center shrink-0 transition-colors">
                        <span className="text-[9px] font-black text-slate-600 group-hover:text-white">{a.nome?.charAt(0)}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-600 group-hover:text-amber-700">{a.nome?.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Barra de busca + botão novo registro */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <h2 className="text-sm font-bold text-intento-blue">Todos os Mentorados ({alunos.length})</h2>
          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
              </svg>
              <input
                type="text"
                placeholder="Buscar aluno..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-sm font-medium text-intento-blue placeholder:text-slate-400 bg-white transition-all"
              />
            </div>
            <button
              onClick={() => abrirModal(null)}
              className="shrink-0 bg-intento-yellow hover:bg-yellow-500 text-white font-bold py-2.5 px-5 rounded-lg shadow-sm transition-all text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              Novo Registro
            </button>
          </div>
        </div>

        {busca && (
          <p className="text-xs font-medium text-slate-400 -mt-3">
            {alunosFiltrados.length} resultado{alunosFiltrados.length !== 1 ? 's' : ''} para &quot;{busca}&quot;
          </p>
        )}

        {/* Cards de alunos */}
        {alunos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-sm">
            <p className="text-slate-400 font-medium text-sm">Nenhum aluno sob a sua responsabilidade no momento.</p>
          </div>
        ) : alunosFiltrados.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-sm">
            <p className="text-slate-400 font-medium text-sm">Nenhum aluno encontrado para &quot;{busca}&quot;.</p>
            <button onClick={() => setBusca('')} className="text-xs text-intento-blue font-bold mt-2 hover:underline">
              Limpar busca
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {alunosFiltrados.map(aluno => {
              const jaRegistrado = registradosSemana[String(aluno.id)];
              return (
                <div key={aluno.id}
                  onMouseEnter={() => prefetchAluno(aluno.id)}
                  onFocus={() => prefetchAluno(aluno.id)}
                  className={`bg-white rounded-xl border-2 p-5 shadow-sm flex flex-col justify-between transition-all group
                    ${jaRegistrado
                      ? 'border-emerald-200 hover:border-emerald-300'
                      : 'border-slate-200 hover:border-intento-blue/25 hover:shadow-sm'
                    }`}
                >
                  <div className="mb-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="w-10 h-10 rounded-full bg-intento-blue/10 flex items-center justify-center shrink-0">
                        <span className="text-intento-blue font-black text-sm">{aluno.nome?.charAt(0)?.toUpperCase() || '?'}</span>
                      </div>
                      {/* Badge de status semanal */}
                      {jaRegistrado ? (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1 shrink-0">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                          </svg>
                          Registrado
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full border border-amber-200 shrink-0">
                          Pendente
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-intento-blue leading-tight">{aluno.nome}</h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-medium truncate">{aluno.email}</p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => router.push(`/mentor/${aluno.id}?nome=${encodeURIComponent(aluno.nome)}`)}
                      className="w-full bg-white border-2 border-intento-blue text-intento-blue font-bold py-2 rounded-lg hover:bg-intento-blue hover:text-white transition-all text-xs"
                    >
                      Abrir Dados
                    </button>
                    <button
                      onClick={() => abrirModal(aluno)}
                      className={`w-full font-bold py-2 rounded-lg transition-all text-xs
                        ${jaRegistrado
                          ? 'bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100'
                          : 'bg-white border-2 border-intento-yellow text-intento-yellow hover:bg-intento-yellow hover:text-white'
                        }`}
                    >
                      {jaRegistrado ? 'Novo Registro (já feito)' : '+ Novo Registro'}
                    </button>
                    <Link
                      href={`/mentor/ig/painel?id=${aluno.id}&nome=${encodeURIComponent(aluno.nome)}`}
                      className="w-full text-center text-xs text-slate-400 hover:text-intento-blue font-semibold py-1.5 transition"
                    >
                      Exportar Acompanhamento →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isModalOpen && (
        <ModalRegistro
          alunos={alunos}
          alunoPreSelecionado={alunoPreSelecionado}
          onClose={fecharModal}
          onRegistroSalvo={handleRegistroSalvo}
        />
      )}
    </div>
  );
}
