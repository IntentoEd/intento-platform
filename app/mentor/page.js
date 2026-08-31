'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { apiFetch } from '@/lib/api';
import { useMentor } from '@/lib/MentorContext';
import { LoadingScreen } from '@/components/Loading';
import PushToggle from '@/components/PushToggle';
import { diagnosticoDimensional, motivosAcao, CICLOS_INFO, cicloIdx } from '@/lib/carimbos';

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

// Rótulo do plano contratado (BD Mestre grava "Padrao" sem acento).
const planoLabel = p => p ? String(p).replace('Padrao', 'Padrão') : null;

// Roteia a exportação pelo status_app: quem não usa o app vai pra /diario;
// resto vai pro /painel (template completo).
function rotaExportacao(aluno) {
  const semApp = aluno?.statusApp === 'Não se adaptou' || aluno?.statusApp === 'Nunca vai usar';
  const base = semApp ? '/mentor/ig/diario' : '/mentor/ig/painel';
  return `${base}?id=${aluno.id}&nome=${encodeURIComponent(aluno.nome || '')}`;
}

// ── Faixa "Alerta" — mesma leitura do líder, recortada pros alunos do mentor ──
// (docs/REDESIGN_LIDER_CLINICO_E_MENTOR.md §6). Busca dashboardMentor e roda o
// motor compartilhado (lib/carimbos.js). Invisível quando vazia, em demo ou em
// falha de rede/GAS sem a ação (degradação silenciosa — o resto da home é o
// fluxo de trabalho e não pode depender disso).
const naoUsaAppAlerta = (a) => a.statusApp === 'Não se adaptou' || a.statusApp === 'Nunca vai usar';

// ── Check "ciente" da faixa Alerta ───────────────────────────────────────────
// O mentor marca um alerta como ciente e ele some até segunda-feira 00h: a
// chave guarda a segunda da semana corrente, então na virada a chave muda e os
// checks da semana anterior expiram sozinhos (sem cron). Por device+mentor
// (localStorage). Guarda os TIPOS de motivo no momento do check: se surgir um
// motivo novo no meio da semana (ex: alerta clínico num aluno checado por
// cobertura), o alerta volta a aparecer.
function segundaAtualISO() {
  const hoje = new Date();
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
  seg.setHours(0, 0, 0, 0);
  return seg.toISOString().slice(0, 10);
}

const chaveCientes = (email) => `alertaCientes:${email || 'anon'}`;

function lerCientes(email) {
  try {
    const raw = JSON.parse(localStorage.getItem(chaveCientes(email)) || 'null');
    return raw && raw.semana === segundaAtualISO() ? (raw.alunos || {}) : {};
  } catch { return {}; }
}

function salvarCientes(email, alunos) {
  try { localStorage.setItem(chaveCientes(email), JSON.stringify({ semana: segundaAtualISO(), alunos })); } catch { /* modo privado/quota → check só não persiste */ }
}

function useCientesAlerta(email) {
  const [cientes, setCientes] = useState({});
  useEffect(() => { setCientes(lerCientes(email)); }, [email]);
  const marcarCiente = useCallback((chaveAluno, tipos) => {
    setCientes(prev => { const nx = { ...prev, [chaveAluno]: tipos }; salvarCientes(email, nx); return nx; });
  }, [email]);
  const desfazerCientes = useCallback(() => { setCientes({}); salvarCientes(email, {}); }, [email]);
  return { cientes, marcarCiente, desfazerCientes };
}

function useAlertaMentor(ehDemo) {
  const [itens, setItens] = useState([]);
  // Fechamento de Ciclo pendente por aluno (idAluno → {ciclo, ano}), extraído do
  // MESMO payload do dashboardMentor (metricas.marcoPendente, calculado no GAS
  // em agregarMetricasBase_) — nenhuma chamada extra. Alimenta o chip do card.
  const [marcosPendentes, setMarcosPendentes] = useState({});
  useEffect(() => {
    if (ehDemo) return;
    let vivo = true;
    (async () => {
      try {
        const r = await apiFetch('/api/mentor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'dashboardMentor' }) });
        const d = await r.json();
        if (!vivo || d.status !== 'sucesso') return;
        const ciclo = CICLOS_INFO[cicloIdx()];
        const lista = (d.alunos || [])
          .filter(a => !naoUsaAppAlerta(a))
          .map(a => ({ a, motivos: motivosAcao(diagnosticoDimensional(a), ciclo) }))
          .filter(it => it.motivos.length > 0)
          .sort((x, y) => (y.motivos.some(m => m.tipo === 'clinico') - x.motivos.some(m => m.tipo === 'clinico'))
            || (x.a.nome || '').localeCompare(y.a.nome || ''));
        const pend = {};
        (d.alunos || []).forEach(a => { if (a?.metricas?.marcoPendente) pend[String(a.idAluno)] = a.metricas.marcoPendente; });
        if (vivo) { setItens(lista); setMarcosPendentes(pend); }
      } catch { /* rede/GAS indisponível → faixa fica oculta */ }
    })();
    return () => { vivo = false; };
  }, [ehDemo]);
  return { itens, marcosPendentes };
}

const chaveAlunoAlerta = (a) => a.idAluno || a.nome;

function FaixaAlerta({ itens, perfilHref, cientes, marcarCiente, desfazerCientes }) {
  // Some da faixa quem foi marcado ciente E não ganhou motivo novo desde o check.
  const visiveis = itens.filter(({ a, motivos }) => {
    const vistos = cientes[chaveAlunoAlerta(a)];
    return !(vistos && motivos.every(m => vistos.includes(m.tipo)));
  });
  const numCientes = itens.length - visiveis.length;
  if (!visiveis.length) return null;
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: '#F1D2D2' }}>
      <div className="px-5 py-3.5 flex items-center gap-2" style={{ backgroundColor: '#FBEAEA' }}>
        <h2 className="text-sm font-bold" style={{ color: '#9B1C1C' }}>🚨 Alerta</h2>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">{visiveis.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {visiveis.map(({ a, motivos }) => (
          <div key={a.idAluno + a.nome} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-700 truncate">{a.nome}</p>
              {motivos.map(m => (
                <p key={m.tipo} className={`text-[11px] font-medium ${m.tipo === 'clinico' ? 'text-red-700' : 'text-amber-700'}`}>
                  {m.tipo === 'clinico' ? '🚨 ' : ''}{m.texto}
                </p>
              ))}
            </div>
            <Link href={perfilHref({ id: a.idAluno, nome: a.nome })} className="text-xs font-semibold text-intento-blue hover:underline shrink-0">Perfil →</Link>
            <button
              type="button"
              onClick={() => marcarCiente(chaveAlunoAlerta(a), motivos.map(m => m.tipo))}
              title="Ciente — ocultar este alerta até segunda-feira"
              aria-label={`Marcar alerta de ${a.nome} como ciente até segunda-feira`}
              className="shrink-0 w-7 h-7 rounded-full border border-slate-200 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center justify-center"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
            </button>
          </div>
        ))}
      </div>
      {numCientes > 0 && (
        <div className="px-5 py-2 border-t border-slate-100 bg-slate-50/60">
          <button type="button" onClick={desfazerCientes} className="text-[11px] font-medium text-slate-500 hover:text-slate-600 hover:underline">
            {numCientes} alerta{numCientes > 1 ? 's' : ''} ciente{numCientes > 1 ? 's' : ''} nesta semana · desfazer
          </button>
        </div>
      )}
    </div>
  );
}

// ── Dados de exemplo (/mentor?demo=1): revisão offline da lista ──────────────
const HOJE_ISO = new Date().toISOString().slice(0, 10);
const DEMO_ALUNOS = [
  { id: 'demo', nome: 'Maria Silva',    email: 'maria@exemplo.com',  tipoAluno: 'EM',   ultimaExportacao: HOJE_ISO, encontrosMes: 1, encontrosEsperados: 2, statusApp: 'Usa direto', plano: 'Quinzenal' },
  { id: 'demo', nome: 'João Souza',     email: 'joao@exemplo.com',   tipoAluno: 'ENEM', ultimaExportacao: '',        encontrosMes: 0, encontrosEsperados: 1, statusApp: 'Usa direto', plano: 'Mensal' },
  { id: 'demo', nome: 'Ana Pereira',    email: 'ana@exemplo.com',    tipoAluno: 'ENEM', ultimaExportacao: HOJE_ISO, encontrosMes: 2, encontrosEsperados: 2, statusApp: 'Usa direto', plano: 'Quinzenal' },
  { id: 'demo', nome: 'Pedro Lima',     email: 'pedro@exemplo.com',  tipoAluno: 'ENEM', ultimaExportacao: '',        encontrosMes: 1, encontrosEsperados: 2, statusApp: 'Não se adaptou', plano: 'Quinzenal' },
  { id: 'demo', nome: 'Beatriz Costa',  email: 'bia@exemplo.com',    tipoAluno: 'EM',   ultimaExportacao: HOJE_ISO, encontrosMes: 0, encontrosEsperados: 1, statusApp: 'Usa direto', plano: 'Mensal' },
  { id: 'demo', nome: 'Lucas Almeida',  email: 'lucas@exemplo.com',  tipoAluno: 'ENEM', ultimaExportacao: '',        encontrosMes: 1, encontrosEsperados: 1, statusApp: 'Usa direto', plano: 'Semanal' },
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

  const { itens: alertaItens, marcosPendentes } = useAlertaMentor(ehDemo);
  const { cientes, marcarCiente, desfazerCientes } = useCientesAlerta(emailMentor);

  if (carregando) return <LoadingScreen mensagem="Sincronizando Painel..." />;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Cabeçalho */}
        <div className="flex justify-between items-center border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-intento-blue">Painel do Mentor</h1>
            <p className="text-slate-500 text-sm font-medium mt-0.5">Bem-vindo(a), {mentorLogado}</p>
          </div>
          <div className="flex items-center gap-3">
            <PushToggle email={emailMentor} />
            {ehLider && (
              <button
                onClick={() => router.push('/selecionar-modo')}
                className="text-xs font-semibold text-intento-yellow border border-intento-yellow hover:bg-intento-yellow hover:text-intento-blue px-3 py-1.5 rounded-lg transition-colors"
              >
                Painel do Líder ↔
              </button>
            )}
            <button
              onClick={() => { auth.signOut(); sessionStorage.removeItem('emailLogado'); router.push('/'); }}
              className="text-sm font-semibold text-slate-500 hover:text-red-500 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>

        {/* Alerta — alunos em risco / precisando de ação (motor compartilhado c/ o líder) */}
        <FaixaAlerta itens={alertaItens} perfilHref={perfilHref} cientes={cientes} marcarCiente={marcarCiente} desfazerCientes={desfazerCientes} />

        {/* Resumo enxuto da semana */}
        {alunos.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Acompanhamentos da semana</p>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">{semanaRef}</p>
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
            <p className="text-slate-500 text-xs font-medium">Falha de comunicação com o servidor ({erroCarga}). Seus alunos continuam lá — é só a carga que falhou.</p>
            <button
              onClick={recarregarAlunos}
              className="bg-intento-blue text-white font-bold py-2 px-5 rounded-lg hover:bg-blue-900 transition-all text-xs"
            >
              Tentar de novo
            </button>
          </div>
        ) : alunos.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center shadow-sm">
            <p className="text-slate-500 font-medium text-sm">Nenhum aluno sob a sua responsabilidade no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alunosOrdenados.map((aluno, idx) => {
              const jaEnviou = exportouNessaSemana(aluno);
              const temMetaEncontros = aluno.encontrosEsperados != null;
              const plano = planoLabel(aluno.plano);
              const encFeitos = aluno.encontrosMes || 0;
              const encEsperados = aluno.encontrosEsperados || 0;
              return (
                <div
                  key={aluno._key || aluno.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => irParaPerfil(aluno)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irParaPerfil(aluno); } }}
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
                        <p className="text-xs text-slate-500 font-medium truncate">{aluno.email}</p>
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

                  {/* Plano/cadência + encontros do mês. Sem meta calculável (Custom),
                      NUNCA mostrar o contador — o GAS manda 0 enganoso nesse caso. */}
                  {(temMetaEncontros || plano) && (
                    <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      {temMetaEncontros
                        ? `${plano ? `${plano} · ` : ''}${encFeitos}/${encEsperados} encontros no mês`
                        : `${plano} · encontros sob medida`}
                    </p>
                  )}

                  {/* Próxima prova (Ciclo de Provas — EM: escolar, ENEM: vestibular) */}
                  {aluno.proximaProva && (
                    <p className={`text-[11px] font-semibold flex items-center gap-1.5 ${aluno.proximaProva.dias <= 3 ? 'text-red-600' : aluno.proximaProva.dias <= 7 ? 'text-amber-700' : 'text-slate-500'}`}>
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Prova: {aluno.proximaProva.materia} · {aluno.proximaProva.dias === 0 ? 'hoje' : aluno.proximaProva.dias === 1 ? 'amanhã' : `em ${aluno.proximaProva.dias} dias`}
                    </p>
                  )}

                  {/* Fechamento de Ciclo pendente (dado do dashboardMentor — ver useAlertaMentor) */}
                  {marcosPendentes[String(aluno.id)] && (
                    <p className="text-xs">
                      <span className="inline-flex items-center gap-1 font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">🏁 Fechamento de ciclo no próximo encontro</span>
                    </p>
                  )}

                  {/* Ações */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    {ehDemo ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleEnvio(idx, aluno.id, true); }}
                        className={`font-bold py-2 px-4 rounded-lg transition-all text-xs
                          ${jaEnviou ? 'bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100' : 'bg-intento-yellow text-intento-blue hover:bg-yellow-500'}`}
                      >
                        {jaEnviou ? 'Exportar de novo' : 'Exportar →'}
                      </button>
                    ) : (
                      <Link
                        href={rotaExportacao(aluno)}
                        onClick={(e) => e.stopPropagation()}
                        className={`font-bold py-2 px-4 rounded-lg transition-all text-xs text-center
                          ${jaEnviou ? 'bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100' : 'bg-intento-yellow text-intento-blue hover:bg-yellow-500'}`}
                      >
                        {jaEnviou ? 'Exportar de novo' : 'Exportar →'}
                      </Link>
                    )}
                    <span className="text-xs font-semibold text-slate-500 group-hover:text-intento-blue transition-colors">Perfil →</span>
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
