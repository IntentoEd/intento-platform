'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { useMentor } from '@/lib/MentorContext';
import { LoadingScreen } from '@/components/Loading';
import PushToggle from '@/components/PushToggle';

// Semana de trabalho do mentor (Dom-Sáb que ACABOU de fechar; o mentor
// entra na segunda pra revisar/exportar). Usado pra display.
function getSemanaKey() {
  const hoje = new Date();
  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - hoje.getDay() - 7);
  const sabado = new Date(domingo);
  sabado.setDate(domingo.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('pt-BR');
  return `${fmt(domingo)} a ${fmt(sabado)}`;
}

// ISO 'YYYY-MM-DD' do domingo da semana corrente.
function inicioSemanaAtualISO() {
  const hoje = new Date();
  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - hoje.getDay());
  domingo.setHours(0, 0, 0, 0);
  return domingo.toISOString().slice(0, 10);
}

// True se o mentor exportou o .png desse aluno desde o último domingo.
function exportouNessaSemana(aluno) {
  const ult = aluno?.ultimaExportacao;
  if (!ult) return false;
  return String(ult) >= inicioSemanaAtualISO();
}

// Roteia a exportação pelo status_app: quem não usa o app vai pra /diario;
// resto vai pro /painel (template completo).
function rotaExportacao(aluno) {
  const semApp = aluno?.statusApp === 'Não se adaptou' || aluno?.statusApp === 'Nunca vai usar';
  const base = semApp ? '/mentor/ig/diario' : '/mentor/ig/painel';
  return `${base}?id=${aluno.id}&nome=${encodeURIComponent(aluno.nome || '')}`;
}

// ── Dados de exemplo (/mentor?demo=1): revisão offline da lista ──────────────
const HOJE_ISO = new Date().toISOString().slice(0, 10);
const DEMO_ALUNOS = [
  { id: 'demo', nome: 'Maria Silva',    email: 'maria@exemplo.com',  tipoAluno: 'EM',   ultimaExportacao: HOJE_ISO, encontrosMes: 1, encontrosEsperados: 2, statusApp: 'Usa direto' },
  { id: 'demo', nome: 'João Souza',     email: 'joao@exemplo.com',   tipoAluno: 'ENEM', ultimaExportacao: '',        encontrosMes: 0, encontrosEsperados: 1, statusApp: 'Usa direto' },
  { id: 'demo', nome: 'Ana Pereira',    email: 'ana@exemplo.com',    tipoAluno: 'ENEM', ultimaExportacao: HOJE_ISO, encontrosMes: 2, encontrosEsperados: 2, statusApp: 'Usa direto' },
  { id: 'demo', nome: 'Pedro Lima',     email: 'pedro@exemplo.com',  tipoAluno: 'ENEM', ultimaExportacao: '',        encontrosMes: 1, encontrosEsperados: 2, statusApp: 'Não se adaptou' },
  { id: 'demo', nome: 'Beatriz Costa',  email: 'bia@exemplo.com',    tipoAluno: 'EM',   ultimaExportacao: HOJE_ISO, encontrosMes: 0, encontrosEsperados: 1, statusApp: 'Usa direto' },
  { id: 'demo', nome: 'Lucas Almeida',  email: 'lucas@exemplo.com',  tipoAluno: 'ENEM', ultimaExportacao: '',        encontrosMes: 1, encontrosEsperados: 1, statusApp: 'Usa direto' },
].map((a, i) => ({ ...a, _key: `demo-${i}` }));

export default function PainelGlobalMentor() {
  const router = useRouter();
  const { emailMentor, primeiroNome, alunos: alunosCtx, carregandoAlunos, erroAlunos, recarregarAlunos, prefetchAluno, marcarAcompanhamento } = useMentor();

  // Detecta ?demo=1 no client (evita Suspense de useSearchParams numa página estática).
  const [ehDemo, setEhDemo] = useState(false);
  const [demoAlunos, setDemoAlunos] = useState(DEMO_ALUNOS);
  useEffect(() => {
    setEhDemo(new URLSearchParams(window.location.search).get('demo') === '1');
  }, []);

  const [marcandoEnvio, setMarcandoEnvio] = useState({});

  const alunos = ehDemo ? demoAlunos : alunosCtx;
  const carregando = ehDemo ? false : carregandoAlunos;
  const erroCarga = ehDemo ? null : erroAlunos;
  const mentorLogado = ehDemo ? 'Filippe (demo)' : primeiroNome;
  const ehLider = emailMentor === 'filippe@metodointento.com.br';

  const handleToggleEnvio = useCallback(async (idx, idAluno, enviado) => {
    if (ehDemo) {
      setDemoAlunos(prev => prev.map((a, i) => i === idx ? { ...a, ultimaExportacao: enviado ? HOJE_ISO : '' } : a));
      return;
    }
    setMarcandoEnvio(prev => ({ ...prev, [idAluno]: true }));
    await marcarAcompanhamento(idAluno, enviado);
    setMarcandoEnvio(prev => ({ ...prev, [idAluno]: false }));
  }, [ehDemo, marcarAcompanhamento]);

  const alunosOrdenados = [...alunos].sort((a, b) =>
    (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' })
  );

  const totalEnviados = alunos.filter(exportouNessaSemana).length;
  const pct = alunos.length ? Math.round((totalEnviados / alunos.length) * 100) : 0;
  const semanaRef = getSemanaKey();

  const perfilHref = (aluno) => ehDemo ? '/mentor/demo' : `/mentor/${aluno.id}?nome=${encodeURIComponent(aluno.nome || '')}`;
  const irParaPerfil = (aluno) => router.push(perfilHref(aluno));

  if (carregando) return <LoadingScreen mensagem="Sincronizando Painel..." />;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">

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

        {/* Resumo enxuto da semana */}
        {alunos.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Acompanhamentos da semana</p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">{semanaRef}</p>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-64">
              <div className="flex-1">
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-slate-500">{totalEnviados} de {alunos.length} enviados</span>
                  <span className="text-intento-blue">{pct}%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${totalEnviados === alunos.length ? 'bg-emerald-500' : 'bg-intento-yellow'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <h2 className="text-sm font-bold text-intento-blue">Mentorados{erroCarga ? '' : ` (${alunos.length})`}</h2>

        {/* Cards */}
        {erroCarga ? (
          <div className="bg-white border border-red-200 rounded-xl p-10 text-center shadow-sm space-y-3">
            <p className="text-red-500 font-semibold text-sm">Não foi possível carregar seus mentorados.</p>
            <p className="text-slate-400 text-xs font-medium">Falha de comunicação com o servidor ({erroCarga}). Seus alunos continuam lá — é só a carga que falhou.</p>
            <button
              onClick={recarregarAlunos}
              className="bg-intento-blue text-white font-bold py-2 px-5 rounded-lg hover:bg-blue-900 transition-all text-xs"
            >
              Tentar de novo
            </button>
          </div>
        ) : alunos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-sm">
            <p className="text-slate-400 font-medium text-sm">Nenhum aluno sob a sua responsabilidade no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alunosOrdenados.map((aluno, idx) => {
              const jaEnviou = exportouNessaSemana(aluno);
              const temMetaEncontros = aluno.encontrosEsperados != null;
              const encFeitos = aluno.encontrosMes || 0;
              const encEsperados = aluno.encontrosEsperados || 0;
              return (
                <div
                  key={aluno._key || aluno.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => irParaPerfil(aluno)}
                  onKeyDown={(e) => { if (e.key === 'Enter') irParaPerfil(aluno); }}
                  onMouseEnter={() => { if (!ehDemo) prefetchAluno(aluno.id); }}
                  className={`bg-white rounded-xl border-2 p-5 shadow-sm cursor-pointer transition-all flex flex-col gap-3 group
                    ${jaEnviou ? 'border-emerald-200 hover:border-emerald-300' : 'border-slate-200 hover:border-intento-blue/30'}`}
                >
                  {/* Topo: identidade + selo enviado */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-intento-blue/10 flex items-center justify-center shrink-0">
                        <span className="text-intento-blue font-black text-sm">{aluno.nome?.charAt(0)?.toUpperCase() || '?'}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-bold text-intento-blue leading-tight truncate">{aluno.nome}</h3>
                          {aluno.tipoAluno === 'EM' && (
                            <span className="text-[9px] font-bold bg-intento-yellow/15 text-intento-yellow border border-intento-yellow/30 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">EM</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium truncate">{aluno.email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={!!marcandoEnvio[aluno.id]}
                      onClick={(e) => { e.stopPropagation(); handleToggleEnvio(idx, aluno.id, !jaEnviou); }}
                      title={jaEnviou ? 'Enviado nesta semana — clique para marcar como pendente' : 'Clique para marcar como enviado'}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border flex items-center gap-1 shrink-0 transition-colors disabled:opacity-50
                        ${jaEnviou
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200'
                          : 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                        }`}
                    >
                      {marcandoEnvio[aluno.id] ? (
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                      ) : jaEnviou ? (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                      )}
                      {jaEnviou ? 'Enviado' : 'Pendente'}
                    </button>
                  </div>

                  {/* Encontros do mês */}
                  {temMetaEncontros && (
                    <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {encFeitos}/{encEsperados} encontros no mês
                    </p>
                  )}

                  {/* Ações */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {ehDemo ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleEnvio(idx, aluno.id, true); }}
                        className={`font-bold py-2 px-4 rounded-lg transition-all text-xs
                          ${jaEnviou ? 'bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100' : 'bg-intento-yellow text-white hover:bg-yellow-500'}`}
                      >
                        {jaEnviou ? 'Exportar de novo' : 'Exportar →'}
                      </button>
                    ) : (
                      <Link
                        href={rotaExportacao(aluno)}
                        onClick={(e) => e.stopPropagation()}
                        className={`font-bold py-2 px-4 rounded-lg transition-all text-xs text-center
                          ${jaEnviou ? 'bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100' : 'bg-intento-yellow text-white hover:bg-yellow-500'}`}
                      >
                        {jaEnviou ? 'Exportar de novo' : 'Exportar →'}
                      </Link>
                    )}
                    <span className="text-xs font-semibold text-slate-400 group-hover:text-intento-blue transition-colors">Perfil →</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
