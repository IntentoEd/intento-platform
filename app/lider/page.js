'use client';

import { apiFetch } from '@/lib/api';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { Bar, Line } from '@/components/Charts';
import { LoadingScreen } from '@/components/Loading';
import { getCache, setCache, tempoRelativo } from '@/lib/cacheClient';
import PushToggle from '@/components/PushToggle';
import PainelLiderPipeline from '@/components/PainelLiderPipeline';

const EMAILS_LIDER = ['filippe@metodointento.com.br', 'rafael@metodointento.com.br'];
const cardClass = "bg-white rounded-xl border border-slate-200 p-5 shadow-sm";

// ─────────────────────────────────────────────────────────────────────────────
// Status de DOIS eixos por mentoria (ver docs/REDESIGN_LIDER.md)
//   Processo (o mentor faz): encontros (régua intervalo-de-plano × 1,5) + acompanhamento
//   Aluno (como o aluno está): check-in por tendência + engajamento (horas vs meta, só app)
//   Rollup pro topo = pior-eixo. Sinal null = sem dado → não conta (neutro).
// ─────────────────────────────────────────────────────────────────────────────
const NIVEIS = { verde: 0, amarelo: 1, vermelho: 2 };
const COR_NIVEL = ['verde', 'amarelo', 'vermelho'];
const DOT = { verde: 'bg-emerald-500', amarelo: 'bg-amber-400', vermelho: 'bg-red-500', neutro: 'bg-slate-300' };
const TXT = { verde: 'text-emerald-600', amarelo: 'text-amber-600', vermelho: 'text-red-600', neutro: 'text-slate-400' };

function piorNivel(sinais) {
  const ns = sinais.filter(Boolean).map(s => NIVEIS[s.nivel]);
  if (!ns.length) return 'verde';
  return COR_NIVEL[Math.max(...ns)];
}

const naoUsaApp = (a) => a.statusApp === 'Não se adaptou' || a.statusApp === 'Nunca vai usar';

function parseDataBR(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) { const d = new Date(str); return isNaN(d) ? null : d; }
  const p = str.split(' ')[0].split('/');
  if (p.length === 3) { const d = new Date(+p[2], +p[1] - 1, +p[0]); return isNaN(d) ? null : d; }
  const d = new Date(str); return isNaN(d) ? null : d;
}
function diasDesde(dataStr) {
  const d = parseDataBR(dataStr);
  if (!d) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}
// 'YYYY-MM-DD' do domingo da semana corrente menos `offset` semanas
function domingoISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() - offset * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
// Última semana do histórico (mapa { label: {horas, meta, count} }) ordenado por data
function ultimaSemanaHist(hist) {
  if (!hist) return null;
  const labels = Object.keys(hist).sort((x, y) => {
    const pl = (l) => { const p = String(l).split(' a ')[0].split('/'); return new Date(+p[2], +p[1] - 1, +p[0]).getTime() || 0; };
    return pl(x) - pl(y);
  });
  const ult = labels[labels.length - 1];
  return ult ? hist[ult] : null;
}

// ── sinais individuais (retornam {nivel, motivo} ou null=neutro) ──
function sinalEncontros(a) {
  const esp = a.encontrosEsperados;
  if (!esp || esp <= 0) return null; // Custom/sem plano → neutro
  const intervalo = 30 / esp; // dias-alvo: 1/mês→30, 2/mês→15
  const dias = diasDesde(a.ultimoEncontro);
  if (dias === Infinity) return { nivel: 'vermelho', motivo: 'sem encontro registrado' };
  if (dias <= intervalo) return { nivel: 'verde', dias };
  if (dias <= intervalo * 1.5) return { nivel: 'amarelo', motivo: `${dias}d desde o último encontro`, dias };
  return { nivel: 'vermelho', motivo: `${dias}d sem encontro`, dias };
}
function sinalAcomp(a) {
  const ult = a.ultimaExportacao;
  if (ult === undefined) return null; // campo não exposto (GAS pré-deploy) → neutro
  if (ult && String(ult) >= domingoISO(0)) return { nivel: 'verde' };
  if (!ult || String(ult) < domingoISO(2)) return { nivel: 'vermelho', motivo: 'acompanhamento pendente 2+ sem' };
  return { nivel: 'amarelo', motivo: 'acompanhamento não enviado esta semana' };
}
function sinalCheckin(a) {
  const hist = a.metricas?.checkin4w;
  if (!Array.isArray(hist) || hist.length === 0) return null; // pré-deploy → neutro
  const ruins = hist.filter(w => (w.est != null && w.est <= 40) || (w.mot != null && w.mot <= 40)).length;
  if (ruins >= 2) return { nivel: 'vermelho', motivo: 'estresse/motivação ≤40 em 2+ semanas' };
  const mots = hist.map(w => w.mot).filter(v => v != null);
  if (mots.length >= 2) {
    const pico = Math.max(...mots), ult = mots[mots.length - 1];
    if (pico >= 60 && ult <= pico * 0.6) return { nivel: 'vermelho', motivo: 'motivação despencou' };
  }
  if (ruins === 1) return { nivel: 'amarelo', motivo: 'estresse/motivação ≤40 em 1 semana' };
  return { nivel: 'verde' };
}
function sinalEngajamento(a) {
  if (naoUsaApp(a)) return null; // engajamento só se aplica a quem usa o app
  const u = ultimaSemanaHist(a.metricas?.historico);
  if (!u || !(u.meta > 0)) return null;
  const pct = Math.round((u.horas / u.meta) * 100);
  if (pct >= 80) return { nivel: 'verde', pct };
  if (pct >= 50) return { nivel: 'amarelo', motivo: `horas ${pct}% da meta`, pct };
  return { nivel: 'vermelho', motivo: `horas ${pct}% da meta`, pct };
}

function statusDoAluno(a) {
  const enc = sinalEncontros(a), acmp = sinalAcomp(a), chk = sinalCheckin(a), eng = sinalEngajamento(a);
  const processo = piorNivel([enc, acmp]);
  const aluno = piorNivel([chk, eng]);
  const rollup = piorNivel([{ nivel: processo }, { nivel: aluno }]);
  const motivos = [enc, acmp, chk, eng].filter(s => s && s.nivel !== 'verde' && s.motivo).map(s => ({ nivel: s.nivel, motivo: s.motivo }));
  return { enc, acmp, chk, eng, processo, aluno, rollup, motivos };
}

function SeccaoColapsavel({ titulo, subtitulo, resumo, aberto, onToggle, children }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <button onClick={onToggle} aria-expanded={aberto}
        className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-base font-semibold text-intento-blue">{titulo}</h2>
            {subtitulo && <span className="text-[11px] text-slate-400 font-medium">{subtitulo}</span>}
          </div>
          {resumo && <div className="text-[11px] text-slate-500 font-medium mt-1 flex flex-wrap gap-x-3 gap-y-0.5">{resumo}</div>}
        </div>
        <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {aberto && <div className="border-t border-slate-100 p-5 space-y-5">{children}</div>}
    </div>
  );
}

const FAIXAS_HORAS = [
  { faixa: '0–5h', color: '#ef4444' }, { faixa: '5–10h', color: '#f97316' },
  { faixa: '10–15h', color: '#eab308' }, { faixa: '15–20h', color: '#10b981' }, { faixa: '20h+', color: '#3b82f6' },
];

// ── Selo de nível (rollup / eixo) ──
function Selo({ nivel, label }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${TXT[nivel] || TXT.neutro}`}>
      <span className={`w-2 h-2 rounded-full ${DOT[nivel] || DOT.neutro}`} />{label}
    </span>
  );
}
function Pilula({ v, a, r }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-bold tabular-nums">
      <span className="text-emerald-600">🟢{v}</span>
      <span className="text-amber-600">🟡{a}</span>
      <span className="text-red-600">🔴{r}</span>
    </span>
  );
}

// ── Demo (/lider?demo=1) ─────────────────────────────────────────────────────
function _hist(...semanas) { // semanas: [label, horas, meta]
  const m = {};
  semanas.forEach(([l, h, mt]) => { m[l] = { horas: h, meta: mt, count: 1 }; });
  return m;
}
function _aluno(o) {
  return {
    idAluno: 'demo', nome: o.nome, email: (o.nome.split(' ')[0] + '@exemplo.com').toLowerCase(),
    mentor: o.mentorEmail, mentorNome: o.mentor, mentorAtivo: true,
    plano: o.plano, tipoAluno: o.tipo || 'ENEM', escola: o.escola || '', statusApp: o.statusApp || 'Usa',
    encontrosEsperados: o.esp, encontrosMesCorrente: o.feitos ?? 0, ultimoEncontro: o.ultEnc || '',
    ultimaExportacao: o.acomp, registrouSemanaAtual: true,
    metricas: {
      faixaHoras: o.faixa ?? 2,
      bem: {}, materias: o.materias || {},
      historico: o.historico, simulados4w: o.sim ?? 0,
      checkin4w: o.checkin || [],
    },
  };
}
const D_HOJE = new Date();
const _iso = (dOffset) => { const d = new Date(D_HOJE); d.setDate(d.getDate() + dOffset); return d.toISOString().slice(0, 10); };
const _matBoa = { domBio: 70, cDomBio: 1, domQui: 64, cDomQui: 1, domFis: 60, cDomFis: 1, domMat: 58, cDomMat: 1, progBio: 50, cProgBio: 1, progQui: 45, cProgQui: 1, progFis: 42, cProgFis: 1, progMat: 40, cProgMat: 1 };
const DEMO_LIDER = {
  status: 'sucesso',
  semanaAtual: '14/06 a 20/06/2026',
  mentoresAtivos: [
    { email: 'ana@x', nome: 'Ana' }, { email: 'bruno@x', nome: 'Bruno' }, { email: 'carla@x', nome: 'Carla' },
  ],
  pendencias: [
    { idAluno: 'demo', nome: 'Novato Sem Diag', email: 'novato@exemplo.com', mentor: '', mentorNome: '', mentorAtivo: false, tipoAluno: 'ENEM' },
  ],
  alunos: [
    _aluno({ nome: 'Maria Silva', mentor: 'Ana', mentorEmail: 'ana@x', plano: 'Quinzenal', esp: 2, feitos: 1, ultEnc: _iso(-8), acomp: _iso(-1), tipo: 'EM', escola: 'Colégio X', sim: 1, materias: _matBoa, historico: _hist(['26/05 a 01/06', 16, 20], ['02/06 a 08/06', 18, 20], ['09/06 a 15/06', 19, 20]), checkin: [{ est: 70, mot: 80 }, { est: 65, mot: 75 }, { est: 70, mot: 80 }] }),
    _aluno({ nome: 'João Souza', mentor: 'Ana', mentorEmail: 'ana@x', plano: 'Mensal', esp: 1, feitos: 1, ultEnc: _iso(-12), acomp: _iso(-2), sim: 0, materias: _matBoa, historico: _hist(['09/06 a 15/06', 17, 20]), checkin: [{ est: 60, mot: 70 }, { est: 60, mot: 65 }] }),
    _aluno({ nome: 'Ana Pereira', mentor: 'Bruno', mentorEmail: 'bruno@x', plano: 'Quinzenal', esp: 2, feitos: 0, ultEnc: _iso(-26), acomp: _iso(-18), sim: 2, materias: _matBoa, historico: _hist(['09/06 a 15/06', 8, 20]), checkin: [{ est: 35, mot: 30 }, { est: 38, mot: 35 }] }),
    _aluno({ nome: 'Pedro Lima', mentor: 'Bruno', mentorEmail: 'bruno@x', plano: 'Mensal', esp: 1, feitos: 1, ultEnc: _iso(-20), acomp: _iso(-9), sim: 0, materias: _matBoa, historico: _hist(['09/06 a 15/06', 12, 20]), checkin: [{ est: 70, mot: 38 }, { est: 65, mot: 70 }] }),
    _aluno({ nome: 'Beatriz Costa', mentor: 'Carla', mentorEmail: 'carla@x', plano: 'Quinzenal', esp: 2, feitos: 2, ultEnc: _iso(-5), acomp: _iso(-1), tipo: 'EM', sim: 1, materias: _matBoa, historico: _hist(['09/06 a 15/06', 21, 22]), checkin: [{ est: 75, mot: 80 }, { est: 78, mot: 82 }] }),
    _aluno({ nome: 'Lucas Almeida', mentor: 'Carla', mentorEmail: 'carla@x', plano: 'Mensal', esp: 1, feitos: 0, ultEnc: '', acomp: '', statusApp: 'Não se adaptou', sim: 0, materias: _matBoa, historico: {}, checkin: [] }),
  ],
  agregado: {
    horasEstudadas: {
      distribuicao: [{ faixa: '0-5h', count: 0 }, { faixa: '5-10h', count: 1 }, { faixa: '10-15h', count: 1 }, { faixa: '15-20h', count: 2 }, { faixa: '20h+', count: 1 }],
      historico8Semanas: [
        { semana: '26/05 a 01/06', mediaHoras: 14, mediaMeta: 20 },
        { semana: '02/06 a 08/06', mediaHoras: 15, mediaMeta: 20 },
        { semana: '09/06 a 15/06', mediaHoras: 16, mediaMeta: 20 },
      ],
    },
    dominioPorMateria: { bio: 66, qui: 60, fis: 57, mat: 54 },
    progressoPorMateria: { bio: 48, qui: 43, fis: 40, mat: 38 },
    bemEstar: { estresse: 62, ansiedade: 58, motivacao: 64, sono: 60 },
    simuladosUltimas4Semanas: 4,
  },
};

export default function PainelLider() {
  const router = useRouter();
  const [ehDemo, setEhDemo] = useState(false);
  const [autorizado, setAutorizado] = useState(false);
  const [emailLogado, setEmailLogado] = useState('');
  const [aba, setAba] = useState('mentoria');
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState(null);
  const [cacheTs, setCacheTs] = useState(null);

  // Filtros
  const [mentoresSelecionados, setMentoresSelecionados] = useState([]);
  const [busca, setBusca] = useState('');
  const [tipoAlunoFiltro, setTipoAlunoFiltro] = useState('');
  const [planoFiltro, setPlanoFiltro] = useState('');
  const [periodoFiltro, setPeriodoFiltro] = useState('4'); // semanas no gráfico de evolução
  const [mentoresExpandidos, setMentoresExpandidos] = useState({});

  const [alunoEditando, setAlunoEditando] = useState(null);
  const [editTipo, setEditTipo] = useState('ENEM');
  const [editEscola, setEditEscola] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [mensagemEdicao, setMensagemEdicao] = useState('');

  const [seccoesAbertas, setSeccoesAbertas] = useState({ mentores: true, analitica: false });
  const toggleSeccao = (key) => setSeccoesAbertas(prev => ({ ...prev, [key]: !prev[key] }));

  const [alunoDesignar, setAlunoDesignar] = useState(null);
  const [mentorEscolhido, setMentorEscolhido] = useState('');
  const [planoEscolhido, setPlanoEscolhido] = useState('');
  const [designando, setDesignando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState('');
  const PLANOS_DISPONIVEIS = ['Mensal', 'Quinzenal', 'Semanal', 'Padrão', 'Custom'];

  // Detecta ?demo=1 (client-side, evita Suspense de useSearchParams em página estática)
  useEffect(() => { setEhDemo(new URLSearchParams(window.location.search).get('demo') === '1'); }, []);

  // Auth
  useEffect(() => {
    if (ehDemo) { setEmailLogado('demo'); setAutorizado(true); return; }
    const unsub = onAuthStateChanged(auth, (user) => {
      const email = user?.email?.toLowerCase() || (typeof window !== 'undefined' ? sessionStorage.getItem('emailLogado') : null);
      if (!email) { router.push('/'); return; }
      if (!EMAILS_LIDER.includes(email)) {
        if (email.endsWith('@metodointento.com.br')) router.push('/mentor');
        else router.push('/painel');
        return;
      }
      setEmailLogado(email);
      setAutorizado(true);
    });
    return () => unsub();
  }, [router, ehDemo]);

  // Fetch (com cache client-side)
  useEffect(() => {
    if (!autorizado) return;
    if (ehDemo) { setDados(DEMO_LIDER); setCarregando(false); return; }

    const cached = getCache('dashboardLider');
    if (cached) { setDados(cached.data); setCacheTs(cached.ts); setCarregando(false); setAtualizando(true); }
    else setCarregando(true);
    setErro('');

    apiFetch('/api/mentor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'dashboardLider', email: emailLogado }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.status !== 'sucesso') { if (!cached) setErro(d.mensagem || 'Erro ao carregar dashboard.'); return; }
        setDados(d); setCache('dashboardLider', d); setCacheTs(Date.now());
      })
      .catch(() => { if (!cached) setErro('Erro de conexão.'); })
      .finally(() => { setCarregando(false); setAtualizando(false); });
  }, [autorizado, emailLogado, ehDemo]);

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

  const planosDisponiveis = useMemo(() => {
    const s = new Set();
    (dados?.alunos || []).forEach(a => { if (a.plano) s.add(a.plano); });
    return [...s].sort();
  }, [dados]);

  // Filtros aplicados
  const alunosFiltrados = useMemo(() => {
    if (!dados?.alunos) return [];
    return dados.alunos.filter(a => {
      if (mentoresSelecionados.length > 0 && !mentoresSelecionados.includes(a.mentor)) return false;
      if (tipoAlunoFiltro && (a.tipoAluno || 'ENEM') !== tipoAlunoFiltro) return false;
      if (planoFiltro && (a.plano || '') !== planoFiltro) return false;
      if (busca) {
        const q = busca.toLowerCase();
        if (!a.nome?.toLowerCase().includes(q) && !a.email?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [dados, mentoresSelecionados, busca, tipoAlunoFiltro, planoFiltro]);

  // Separa non-adopters (fora do status/fila) dos alunos ativos no app
  const { ativos, foraDoApp } = useMemo(() => {
    const ativos = [], foraDoApp = [];
    alunosFiltrados.forEach(a => (naoUsaApp(a) ? foraDoApp : ativos).push(a));
    return { ativos, foraDoApp };
  }, [alunosFiltrados]);

  // Status de 2 eixos por aluno (só app-adopters)
  const comStatus = useMemo(() => ativos.map(a => ({ a, st: statusDoAluno(a) })), [ativos]);

  // Contagens pro herói (rollup + drill por eixo)
  const resumoStatus = useMemo(() => {
    const z = () => ({ verde: 0, amarelo: 0, vermelho: 0 });
    const rollup = z(), processo = z(), aluno = z();
    comStatus.forEach(({ st }) => { rollup[st.rollup]++; processo[st.processo]++; aluno[st.aluno]++; });
    return { rollup, processo, aluno, total: comStatus.length };
  }, [comStatus]);

  // Fila de atenção: rollup != verde, ordenada por gravidade
  const fila = useMemo(() => {
    return comStatus
      .filter(({ st }) => st.rollup !== 'verde')
      .map(({ a, st }) => ({ a, st }))
      .sort((x, y) => NIVEIS[y.st.rollup] - NIVEIS[x.st.rollup]);
  }, [comStatus]);

  // Tabela de mentores (só app-adopters dos filtros)
  const mentoresTabela = useMemo(() => {
    const grupos = {};
    comStatus.forEach(({ a, st }) => {
      const key = a.mentor || 'sem-mentor';
      if (!grupos[key]) grupos[key] = { mentor: a.mentor, nome: a.mentorNome || a.mentor || 'Sem mentor', ativo: a.mentorAtivo, alunos: [], roll: { verde: 0, amarelo: 0, vermelho: 0 }, acompVerde: 0, acompTot: 0, encVerde: 0, encTot: 0, dom: 0, domC: 0, engPct: 0, engC: 0, chkVerde: 0, chkTot: 0 };
      const g = grupos[key];
      g.alunos.push(a); g.roll[st.rollup]++;
      if (st.acmp) { g.acompTot++; if (st.acmp.nivel === 'verde') g.acompVerde++; }
      if (st.enc) { g.encTot++; if (st.enc.nivel === 'verde') g.encVerde++; }
      if (st.chk) { g.chkTot++; if (st.chk.nivel === 'verde') g.chkVerde++; }
      if (st.eng && st.eng.pct != null) { g.engPct += st.eng.pct; g.engC++; }
      const mt = a.metricas?.materias;
      if (mt) {
        const ds = [['domBio', 'cDomBio'], ['domQui', 'cDomQui'], ['domFis', 'cDomFis'], ['domMat', 'cDomMat']];
        let s = 0, c = 0; ds.forEach(([v, cc]) => { s += mt[v] || 0; c += mt[cc] || 0; });
        if (c > 0) { g.dom += s / c; g.domC++; }
      }
    });
    return Object.values(grupos).sort((x, y) => y.roll.vermelho - x.roll.vermelho || (y.roll.amarelo - x.roll.amarelo));
  }, [comStatus]);

  // Check-in em alerta (eixo Aluno, sinal de check-in vermelho)
  const checkinAlertas = useMemo(() => comStatus.filter(({ st }) => st.chk?.nivel === 'vermelho').length, [comStatus]);

  // Visão analítica (recalc por filtro) — base no agregado quando sem filtro
  const haFiltroAtivo = mentoresSelecionados.length > 0 || busca.trim().length > 0 || !!tipoAlunoFiltro || !!planoFiltro;
  const agregadoVisivel = useMemo(() => {
    if (!haFiltroAtivo) return dados?.agregado || {};
    if (!alunosFiltrados.some(a => a.metricas)) return dados?.agregado || {};
    const FAIXAS = ['0-5h', '5-10h', '10-15h', '15-20h', '20h+'];
    const distribuicao = FAIXAS.map(faixa => ({ faixa, count: 0 }));
    const histPorSemana = {};
    const somas = { domBio: 0, cDomBio: 0, domQui: 0, cDomQui: 0, domFis: 0, cDomFis: 0, domMat: 0, cDomMat: 0, progBio: 0, cProgBio: 0, progQui: 0, cProgQui: 0, progFis: 0, cProgFis: 0, progMat: 0, cProgMat: 0 };
    const bem = { est: 0, cEst: 0, ans: 0, cAns: 0, mot: 0, cMot: 0, son: 0, cSon: 0 };
    let simulados4w = 0;
    alunosFiltrados.forEach(a => {
      const mx = a.metricas; if (!mx) return;
      if (mx.faixaHoras >= 0 && mx.faixaHoras < distribuicao.length) distribuicao[mx.faixaHoras].count++;
      ['est', 'cEst', 'ans', 'cAns', 'mot', 'cMot', 'son', 'cSon'].forEach(k => { bem[k] += mx.bem?.[k] || 0; });
      Object.keys(somas).forEach(k => { somas[k] += mx.materias?.[k] || 0; });
      Object.entries(mx.historico || {}).forEach(([lbl, h]) => {
        if (!histPorSemana[lbl]) histPorSemana[lbl] = { horas: 0, meta: 0, count: 0 };
        histPorSemana[lbl].horas += h.horas || 0; histPorSemana[lbl].meta += h.meta || 0; histPorSemana[lbl].count += h.count || 0;
      });
      simulados4w += mx.simulados4w || 0;
    });
    const avg = (s, c) => c > 0 ? +(s / c).toFixed(1) : 0;
    const labels = Object.keys(histPorSemana).sort((x, y) => {
      const pl = (l) => { const p = l.split(' a ')[0].split('/'); return new Date(+p[2], +p[1] - 1, +p[0]).getTime(); };
      return pl(x) - pl(y);
    }).slice(-8);
    return {
      horasEstudadas: { distribuicao, historico8Semanas: labels.map(l => ({ semana: l, mediaHoras: avg(histPorSemana[l].horas, histPorSemana[l].count), mediaMeta: avg(histPorSemana[l].meta, histPorSemana[l].count) })) },
      dominioPorMateria: { bio: avg(somas.domBio, somas.cDomBio), qui: avg(somas.domQui, somas.cDomQui), fis: avg(somas.domFis, somas.cDomFis), mat: avg(somas.domMat, somas.cDomMat) },
      progressoPorMateria: { bio: avg(somas.progBio, somas.cProgBio), qui: avg(somas.progQui, somas.cProgQui), fis: avg(somas.progFis, somas.cProgFis), mat: avg(somas.progMat, somas.cProgMat) },
      bemEstar: { estresse: avg(bem.est, bem.cEst), ansiedade: avg(bem.ans, bem.cAns), motivacao: avg(bem.mot, bem.cMot), sono: avg(bem.son, bem.cSon) },
      simuladosUltimas4Semanas: simulados4w,
    };
  }, [haFiltroAtivo, alunosFiltrados, dados]);

  const pendenciasDiagnostico = useMemo(() => dados?.pendencias || [], [dados]);
  const alunosAguardando = useMemo(() => (dados?.alunos || []).filter(a => !a.mentor || !a.mentorAtivo), [dados]);

  const [inativando, setInativando] = useState(null);
  const inativarAluno = async (aluno) => {
    if (ehDemo) { alert('Modo demo: ação desabilitada.'); return; }
    if (!confirm(`Marcar ${aluno.nome} como INATIVO? Ele some do painel do líder e da lista do mentor. Reversível pelo Sheets (limpar célula dt_saida).`)) return;
    setInativando(aluno.idAluno);
    try {
      const r = await apiFetch('/api/mentor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'inativarAluno', idAluno: aluno.idAluno }) });
      const data = await r.json();
      if (data.status === 'sucesso') {
        setDados(prev => prev ? { ...prev, alunos: (prev.alunos || []).filter(a => a.idAluno !== aluno.idAluno), pendencias: (prev.pendencias || []).filter(a => a.idAluno !== aluno.idAluno) } : prev);
      } else { alert('Erro: ' + (data.mensagem || 'falha ao inativar')); }
    } catch (e) { alert('Erro de conexão ao inativar.'); }
    finally { setInativando(null); }
  };

  const abrirDesignacao = (aluno) => {
    setAlunoDesignar(aluno);
    setMentorEscolhido(aluno.mentor || '');
    const planoAtual = (aluno.plano || '').replace('Padrao', 'Padrão');
    setPlanoEscolhido(PLANOS_DISPONIVEIS.includes(planoAtual) ? planoAtual : '');
  };
  const designarMentor = async () => {
    if (!alunoDesignar || !mentorEscolhido || !planoEscolhido || designando) return;
    if (ehDemo) { alert('Modo demo: ação desabilitada.'); return; }
    setDesignando(true); setMensagemSucesso('');
    try {
      const res = await apiFetch('/api/mentor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'designarMentor', email: emailLogado, idAluno: alunoDesignar.idAluno, emailMentor: mentorEscolhido, plano: planoEscolhido }) });
      const data = await res.json();
      if (data.status !== 'sucesso') { alert('Erro: ' + (data.mensagem || 'falha na designação')); return; }
      const partsEnviados = [];
      if (data.emailsEnviados?.aluno) partsEnviados.push('aluno');
      if (data.emailsEnviados?.mentor) partsEnviados.push('mentor');
      setMensagemSucesso(data.aluno?.nome + ' → ' + data.mentorNome + (partsEnviados.length ? ' · email enviado a ' + partsEnviados.join(' e ') : ' · sem emails'));
      setAlunoDesignar(null);
      const refetched = await apiFetch('/api/mentor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'dashboardLider', email: emailLogado }) });
      const novosDados = await refetched.json();
      if (novosDados.status === 'sucesso') setDados(novosDados);
      setTimeout(() => setMensagemSucesso(''), 6000);
    } catch (e) { alert('Erro de conexão.'); }
    finally { setDesignando(false); }
  };

  const abrirEdicao = (aluno) => { setAlunoEditando(aluno); setEditTipo(aluno.tipoAluno || 'ENEM'); setEditEscola(aluno.escola || ''); setMensagemEdicao(''); };
  const salvarEdicao = async () => {
    if (!alunoEditando || salvandoEdicao) return;
    if (ehDemo) { alert('Modo demo: ação desabilitada.'); return; }
    setSalvandoEdicao(true); setMensagemEdicao('');
    try {
      const res = await apiFetch('/api/mentor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'atualizarDadosAluno', email: emailLogado, idAluno: alunoEditando.idAluno, tipoAluno: editTipo, escola: editEscola }) });
      const data = await res.json();
      if (data.status !== 'sucesso') { alert('Erro: ' + (data.mensagem || 'falha ao salvar')); return; }
      setDados(prev => prev ? { ...prev, alunos: prev.alunos.map(a => a.idAluno === alunoEditando.idAluno ? { ...a, tipoAluno: editTipo, escola: editEscola } : a) } : prev);
      setMensagemEdicao(`${alunoEditando.nome} atualizado.`); setAlunoEditando(null);
      setTimeout(() => setMensagemEdicao(''), 5000);
    } catch (e) { alert('Erro de conexão.'); }
    finally { setSalvandoEdicao(false); }
  };

  const sair = async () => { await auth.signOut(); sessionStorage.removeItem('emailLogado'); router.push('/'); };

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

  const ag = agregadoVisivel || {};
  const distribuicao = ag.horasEstudadas?.distribuicao || [];
  const historicoFull = ag.horasEstudadas?.historico8Semanas || [];
  const historico = periodoFiltro === 'tudo' ? historicoFull : historicoFull.slice(-Number(periodoFiltro));
  const dominio = ag.dominioPorMateria || {};
  const progresso = ag.progressoPorMateria || {};
  const bemEstar = ag.bemEstar || {};
  const simulados = ag.simuladosUltimas4Semanas || 0;
  const mentoresAtivosN = listaMentoresUnicos.filter(m => m.ativo).length;
  const acompVerdeTotal = comStatus.filter(({ st }) => st.acmp?.nivel === 'verde').length;
  const acompComDado = comStatus.filter(({ st }) => st.acmp).length;
  const acompPct = acompComDado > 0 ? Math.round((acompVerdeTotal / acompComDado) * 100) : null;

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 10 } } } },
    scales: { y: { beginAtZero: true, grid: { color: 'rgba(150,150,150,0.1)' } }, x: { grid: { display: false } } },
  };

  const limparFiltros = () => { setMentoresSelecionados([]); setBusca(''); setTipoAlunoFiltro(''); setPlanoFiltro(''); };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center gap-4 justify-between sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/selecionar-modo')} className="text-sm font-medium text-slate-400 hover:text-intento-blue transition">← Voltar</button>
          <div>
            <h1 className="text-base font-semibold text-intento-blue">Painel do Líder{ehDemo && <span className="ml-2 text-[10px] font-bold text-intento-yellow uppercase">demo</span>}</h1>
            <p className="text-[11px] text-slate-400 font-medium">
              Semana de referência: {dados?.semanaAtual || '—'}
              {cacheTs && (<span className="ml-2">· {atualizando ? <span className="text-amber-600 inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />atualizando…</span> : <span className="text-emerald-600">atualizado {tempoRelativo(cacheTs)}</span>}</span>)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PushToggle email={emailLogado} />
          <button onClick={sair} className="text-sm font-semibold text-slate-400 hover:text-red-500 transition">Sair</button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 lg:p-6 space-y-6">

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 -mt-2">
          <button onClick={() => setAba('mentoria')} className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 ${aba === 'mentoria' ? 'text-intento-blue border-intento-blue' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>Mentoria</button>
          <button onClick={() => setAba('pipeline')} className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 ${aba === 'pipeline' ? 'text-intento-blue border-intento-blue' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>Pipeline (CRM)</button>
        </div>

        {aba === 'pipeline' && <PainelLiderPipeline email={emailLogado} />}

        {aba === 'mentoria' && (<>

        {/* ── HERÓI: as mentorias estão bem encaminhadas? ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">As mentorias estão bem encaminhadas?</p>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div className="flex items-center gap-4">
              <span className="text-3xl font-bold text-emerald-600">🟢 {resumoStatus.rollup.verde}</span>
              <span className="text-3xl font-bold text-amber-500">🟡 {resumoStatus.rollup.amarelo}</span>
              <span className="text-3xl font-bold text-red-500">🔴 {resumoStatus.rollup.vermelho}</span>
              <span className="text-xs text-slate-400 font-medium self-end mb-1">de {resumoStatus.total} no app</span>
            </div>
          </div>
          {/* drill nos 2 eixos */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Processo (mentor)</span>
              <Pilula v={resumoStatus.processo.verde} a={resumoStatus.processo.amarelo} r={resumoStatus.processo.vermelho} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Aluno (estado)</span>
              <Pilula v={resumoStatus.aluno.verde} a={resumoStatus.aluno.amarelo} r={resumoStatus.aluno.vermelho} />
            </div>
          </div>
          {/* KPIs de operação */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-xs font-medium text-slate-500">
            <span>Acomp. semana: <b className="text-intento-blue">{acompPct != null ? `${acompPct}%` : '—'}</b></span>
            <span>Mentores ativos: <b className="text-intento-blue">{mentoresAtivosN}</b></span>
            <span>Alunos/mentor: <b className="text-intento-blue">{mentoresAtivosN > 0 ? (ativos.length / mentoresAtivosN).toFixed(1) : '—'}</b></span>
            <span>Simulados (4 sem): <b className="text-intento-blue">{simulados}</b></span>
            <span>Fora do app: <b className="text-slate-600">{foraDoApp.length}</b></span>
          </div>
        </div>

        {/* Filtros */}
        <div className={cardClass}>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Filtros</p>
          <div className="flex flex-wrap gap-3 items-center">
            <details className="relative">
              <summary className="cursor-pointer list-none text-xs font-semibold text-intento-blue bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg transition">
                Mentor {mentoresSelecionados.length > 0 && <span className="bg-intento-blue text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">{mentoresSelecionados.length}</span>}
              </summary>
              <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[260px] z-10 max-h-[300px] overflow-y-auto">
                {listaMentoresUnicos.map(m => (
                  <label key={m.email} className="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-slate-50 px-2 rounded">
                    <input type="checkbox" checked={mentoresSelecionados.includes(m.email)} onChange={(e) => { if (e.target.checked) setMentoresSelecionados(prev => [...prev, m.email]); else setMentoresSelecionados(prev => prev.filter(x => x !== m.email)); }} className="w-3.5 h-3.5" />
                    <span className="text-xs font-medium text-slate-700 flex-1 truncate">{m.nome}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{m.count}</span>
                  </label>
                ))}
                {mentoresSelecionados.length > 0 && <button onClick={() => setMentoresSelecionados([])} className="text-[10px] text-intento-blue font-bold hover:underline mt-2">Limpar</button>}
              </div>
            </details>

            <select value={planoFiltro} onChange={e => setPlanoFiltro(e.target.value)} className="text-xs font-semibold text-intento-blue bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue cursor-pointer">
              <option value="">Todos os planos</option>
              {planosDisponiveis.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            <select value={tipoAlunoFiltro} onChange={e => setTipoAlunoFiltro(e.target.value)} className="text-xs font-semibold text-intento-blue bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue cursor-pointer">
              <option value="">Todos os tipos</option>
              <option value="ENEM">ENEM</option>
              <option value="EM">Ensino Médio</option>
            </select>

            <select value={periodoFiltro} onChange={e => setPeriodoFiltro(e.target.value)} className="text-xs font-semibold text-intento-blue bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue cursor-pointer" title="Janela do gráfico de evolução">
              <option value="4">Últimas 4 semanas</option>
              <option value="8">Últimas 8 semanas</option>
              <option value="tudo">Todo o período</option>
            </select>

            <div className="relative flex-1 min-w-[200px]">
              <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno por nome ou email..." className="w-full text-xs font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400" />
            </div>

            {haFiltroAtivo && <button onClick={limparFiltros} className="text-xs font-semibold text-slate-400 hover:text-red-500 px-3 py-2 transition">Limpar tudo</button>}
          </div>
        </div>

        {/* ── FILA DE ATENÇÃO ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-intento-blue">Fila de atenção</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fila.length ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{fila.length}</span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">ordenada por gravidade · respeita filtros</span>
          </div>
          {fila.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium text-center py-8">Nenhuma mentoria fora do trilho nos filtros atuais. 🎉</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {fila.map(({ a, st }) => (
                <div key={a.idAluno + a.nome} className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${DOT[st.rollup]}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{a.nome} <span className="text-slate-400 font-normal">· {a.mentorNome || a.mentor}</span></p>
                      <p className="text-[11px] text-slate-500 font-medium truncate">
                        {st.motivos.map((m, i) => (
                          <span key={i} className={m.nivel === 'vermelho' ? 'text-red-600' : 'text-amber-600'}>{i > 0 ? ' · ' : ''}{m.motivo}</span>
                        ))}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => window.open(`/mentor/${a.idAluno}?nome=${encodeURIComponent(a.nome)}`, '_blank')} className="text-[11px] font-semibold text-intento-blue hover:underline shrink-0">Perfil ↗</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pendências de diagnóstico */}
        {pendenciasDiagnostico.length > 0 && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-blue-800">Pendências de diagnóstico</h2>
              <span className="bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{pendenciasDiagnostico.length}</span>
            </div>
            <p className="text-xs text-blue-700/80 font-medium mb-4">Alunos que fizeram onboarding mas ainda não fizeram o diagnóstico teórico. Designe mentor (se faltar) e/ou cobre o diagnóstico.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendenciasDiagnostico.map(a => (
                <div key={a.idAluno + a.nome} className="bg-white border border-blue-200 rounded-lg p-3 flex flex-col gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 truncate">{a.nome}</p>
                    <p className="text-[11px] text-slate-400 font-medium truncate">{a.email}</p>
                    {a.mentor && a.mentorAtivo && <p className="text-[10px] text-slate-500 font-medium mt-0.5 truncate">mentor: {a.mentorNome || a.mentor}</p>}
                    {!a.mentor && <p className="text-[10px] text-blue-700 font-medium mt-0.5">sem mentor designado</p>}
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    {(!a.mentor || !a.mentorAtivo) && <button onClick={() => abrirDesignacao(a)} className="text-[11px] font-semibold bg-intento-yellow text-white px-3 py-1.5 rounded-lg hover:bg-yellow-500 transition shrink-0">Designar</button>}
                    <button onClick={() => inativarAluno(a)} disabled={inativando === a.idAluno} className="text-[11px] font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1.5 rounded transition disabled:opacity-50">{inativando === a.idAluno ? '...' : 'Inativar'}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Aguardando designação */}
        {alunosAguardando.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-amber-800">Aguardando designação</h2>
              <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{alunosAguardando.length}</span>
            </div>
            <p className="text-xs text-amber-700/80 font-medium mb-4">Alunos sem mentor ativo cadastrado. Designe um mentor para que ele entre em contato.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {alunosAguardando.map(a => (
                <div key={a.idAluno + a.nome} className="bg-white border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 truncate">{a.nome}</p>
                    <p className="text-[11px] text-slate-400 font-medium truncate">{a.email}</p>
                  </div>
                  <button onClick={() => abrirDesignacao(a)} className="text-xs font-semibold bg-intento-yellow text-white px-3 py-1.5 rounded-lg hover:bg-yellow-500 transition shrink-0">Designar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Toasts */}
        {mensagemSucesso && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-3"><span className="text-xs font-semibold text-emerald-800">Designado: {mensagemSucesso}</span></div>}
        {mensagemEdicao && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-3"><span className="text-xs font-semibold text-emerald-800">{mensagemEdicao}</span></div>}

        {/* ── TABELA DE MENTORES ── */}
        <SeccaoColapsavel
          titulo="Mentores" subtitulo="respeita filtros · clique pra filtrar nele"
          aberto={seccoesAbertas.mentores} onToggle={() => toggleSeccao('mentores')}
          resumo={<><span><b className="text-intento-blue">{mentoresTabela.length}</b> mentor(es)</span><span><b className="text-intento-blue">{ativos.length}</b> aluno(s) no app</span></>}
        >
          {mentoresTabela.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium text-center py-6">Nenhum aluno (no app) nos filtros atuais.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="text-[10px] text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <tr>
                    <th className="text-left font-bold p-2.5">Mentor</th>
                    <th className="font-bold p-2.5">Alunos</th>
                    <th className="font-bold p-2.5">🟢/🟡/🔴</th>
                    <th className="font-bold p-2.5 border-l border-slate-100">Acomp.</th>
                    <th className="font-bold p-2.5">Encontros</th>
                    <th className="font-bold p-2.5 border-l border-slate-100">Domínio</th>
                    <th className="font-bold p-2.5">Horas/meta</th>
                    <th className="font-bold p-2.5">Check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {mentoresTabela.map(g => {
                    const pctAcomp = g.acompTot > 0 ? Math.round((g.acompVerde / g.acompTot) * 100) : null;
                    const pctEnc = g.encTot > 0 ? Math.round((g.encVerde / g.encTot) * 100) : null;
                    const dom = g.domC > 0 ? Math.round(g.dom / g.domC) : null;
                    const eng = g.engC > 0 ? Math.round(g.engPct / g.engC) : null;
                    const chk = g.chkTot > 0 ? Math.round((g.chkVerde / g.chkTot) * 100) : null;
                    const corPct = (p) => p == null ? 'text-slate-300' : p >= 80 ? 'text-emerald-600' : p >= 50 ? 'text-amber-600' : 'text-red-600';
                    const filtrarNoMentor = () => { setMentoresSelecionados([g.mentor]); window.scrollTo({ top: 0, behavior: 'smooth' }); };
                    return (
                      <tr key={g.mentor + g.nome} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={filtrarNoMentor}>
                        <td className="text-left p-2.5 font-semibold text-intento-blue">{g.nome}{!g.ativo && <span className="ml-1.5 text-[9px] font-bold text-amber-600">inativo</span>}</td>
                        <td className="text-center p-2.5 text-slate-600">{g.alunos.length}</td>
                        <td className="text-center p-2.5"><Pilula v={g.roll.verde} a={g.roll.amarelo} r={g.roll.vermelho} /></td>
                        <td className={`text-center p-2.5 font-bold tabular-nums border-l border-slate-100 ${corPct(pctAcomp)}`}>{pctAcomp != null ? `${pctAcomp}%` : '—'}</td>
                        <td className={`text-center p-2.5 font-bold tabular-nums ${corPct(pctEnc)}`}>{pctEnc != null ? `${pctEnc}%` : '—'}</td>
                        <td className="text-center p-2.5 font-bold tabular-nums text-intento-blue border-l border-slate-100">{dom != null ? `${dom}%` : '—'}</td>
                        <td className={`text-center p-2.5 font-bold tabular-nums ${corPct(eng)}`}>{eng != null ? `${eng}%` : '—'}</td>
                        <td className={`text-center p-2.5 font-bold tabular-nums ${corPct(chk)}`}>{chk != null ? `${chk}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[10px] text-slate-400 font-medium mt-3">Acomp./Encontros/Check-in = % de alunos 🟢 no sinal · Horas/meta e Domínio = média (só quem usa o app). Autoavaliação e metas batidas entram na Fase 2.</p>
            </div>
          )}
        </SeccaoColapsavel>

        {/* Fora do app (non-adopters) */}
        {foraDoApp.length > 0 && (
          <div className={cardClass}>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fora do app</p>
              <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{foraDoApp.length}</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium mb-3">Não se adaptaram / não vão usar o app — fora do status e da fila (o engajamento por horas não se aplica). Encontros e acompanhamento ainda valem; acompanhe pelo perfil.</p>
            <div className="flex flex-wrap gap-2">
              {foraDoApp.map(a => (
                <button key={a.idAluno + a.nome} onClick={() => window.open(`/mentor/${a.idAluno}?nome=${encodeURIComponent(a.nome)}`, '_blank')} className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 hover:border-intento-blue/40 px-3 py-1.5 rounded-full transition">
                  {a.nome} <span className="text-slate-400 font-normal">· {a.mentorNome || a.mentor}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── EVOLUÇÃO + BEM-ESTAR ── */}
        <SeccaoColapsavel
          titulo="Evolução da base e bem-estar" subtitulo={haFiltroAtivo ? 'recalculado com base nos filtros' : 'visão geral da base'}
          aberto={seccoesAbertas.analitica} onToggle={() => toggleSeccao('analitica')}
          resumo={<><span><b className="text-intento-blue">{haFiltroAtivo ? alunosFiltrados.length : (dados?.alunos || []).length}</b> aluno(s)</span><span><b className={checkinAlertas ? 'text-red-600' : 'text-emerald-600'}>{checkinAlertas}</b> em alerta de check-in</span></>}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={cardClass}>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Distribuição de horas estudadas</h3>
              <p className="text-[10px] font-medium text-slate-400 mb-4">semana de referência</p>
              <div className="h-56"><Bar data={{ labels: distribuicao.map(d => d.faixa), datasets: [{ data: distribuicao.map(d => d.count), backgroundColor: distribuicao.map((_, i) => FAIXAS_HORAS[i]?.color || '#94a3b8'), borderRadius: 4 }] }} options={{ ...chartOptions, indexAxis: 'y', plugins: { legend: { display: false } } }} /></div>
            </div>
            <div className={cardClass}>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Domínio médio por matéria</h3>
              <p className="text-[10px] font-medium text-slate-400 mb-4">média · últimas 4 semanas</p>
              <div className="h-56"><Bar data={{ labels: ['Biologia', 'Química', 'Física', 'Matemática'], datasets: [{ data: [dominio.bio || 0, dominio.qui || 0, dominio.fis || 0, dominio.mat || 0], backgroundColor: ['#10b981', '#3b82f6', '#f97316', '#ef4444'], borderRadius: 4 }] }} options={{ ...chartOptions, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, grid: { color: 'rgba(150,150,150,0.1)' } } } }} /></div>
            </div>
            <div className={cardClass}>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Progresso médio por matéria</h3>
              <p className="text-[10px] font-medium text-slate-400 mb-4">média · últimas 4 semanas</p>
              <div className="h-56"><Bar data={{ labels: ['Biologia', 'Química', 'Física', 'Matemática'], datasets: [{ data: [progresso.bio || 0, progresso.qui || 0, progresso.fis || 0, progresso.mat || 0], backgroundColor: ['#10b981', '#3b82f6', '#f97316', '#ef4444'], borderRadius: 4 }] }} options={{ ...chartOptions, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, grid: { color: 'rgba(150,150,150,0.1)' } } } }} /></div>
            </div>
            <div className={cardClass}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Bem-estar — média da base</h3>
                {checkinAlertas > 0 && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{checkinAlertas} em alerta</span>}
              </div>
              <p className="text-[10px] font-medium text-slate-400 mb-4">maior = melhor (inclusive estresse) · alerta ≤ 40</p>
              <div className="grid grid-cols-2 gap-3">
                {[{ label: 'Sono', valor: bemEstar.sono, cor: '#a855f7' }, { label: 'Motivação', valor: bemEstar.motivacao, cor: '#10b981' }, { label: 'Ansiedade', valor: bemEstar.ansiedade, cor: '#f97316' }, { label: 'Estresse', valor: bemEstar.estresse, cor: '#ef4444' }].map(b => (
                  <div key={b.label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">{b.label}</p>
                    <p className="text-2xl font-bold" style={{ color: (b.valor || 0) <= 40 ? '#ef4444' : b.cor }}>{b.valor || 0}<span className="text-xs text-slate-400 font-medium">%</span></p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={cardClass}>
            <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Horas estudadas vs Meta — média da base</h3>
            <p className="text-[10px] font-medium text-slate-400 mb-4">{periodoFiltro === 'tudo' ? 'todo o período' : `últimas ${periodoFiltro} semanas`}</p>
            <div className="h-64"><Line data={{ labels: historico.map(h => String(h.semana || '').split(' a ')[0] || ''), datasets: [{ label: 'Horas (média)', data: historico.map(h => h.mediaHoras), borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.3 }, { label: 'Meta (média)', data: historico.map(h => h.mediaMeta), borderColor: '#94a3b8', backgroundColor: 'transparent', borderDash: [6, 4], tension: 0.3 }] }} options={chartOptions} /></div>
          </div>
        </SeccaoColapsavel>

        {/* Modal de designação */}
        {alunoDesignar && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setAlunoDesignar(null); }}>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Designar mentor</p>
                <h2 className="text-base font-semibold text-intento-blue mt-0.5">{alunoDesignar.nome}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{alunoDesignar.email}</p>
                {alunoDesignar.mentor && <p className="text-[11px] text-slate-500 mt-2">Mentor atual: <span className="font-semibold">{alunoDesignar.mentorNome || alunoDesignar.mentor}</span>{!alunoDesignar.mentorAtivo && <span className="ml-1 text-amber-600">(inativo)</span>}</p>}
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Selecione o mentor</label>
                  <select value={mentorEscolhido} onChange={(e) => setMentorEscolhido(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-sm font-medium text-intento-blue">
                    <option value="">— Escolha um mentor ativo —</option>
                    {(dados?.mentoresAtivos || []).map(m => <option key={m.email} value={m.email}>{m.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Plano contratado{alunoDesignar.plano && <span className="ml-2 normal-case text-slate-400 font-medium">(atual: {alunoDesignar.plano})</span>}</label>
                  <select value={planoEscolhido} onChange={(e) => setPlanoEscolhido(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-sm font-medium text-intento-blue">
                    <option value="">— Escolha o plano —</option>
                    {PLANOS_DISPONIVEIS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">Ao confirmar, o sistema atualiza o mentor e o plano na planilha e <b>envia email automático</b> para o aluno e para o mentor com os dados de contato.</p>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                <button onClick={() => setAlunoDesignar(null)} className="text-sm font-semibold text-slate-500 hover:text-intento-blue px-4 py-2 transition">Cancelar</button>
                <button onClick={designarMentor} disabled={!mentorEscolhido || !planoEscolhido || designando} className="text-sm font-semibold bg-intento-blue hover:bg-blue-900 text-white px-5 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">{designando ? 'Enviando...' : 'Designar e notificar'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de edição */}
        {alunoEditando && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setAlunoEditando(null); }}>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Editar dados do aluno</p>
                <h2 className="text-base font-semibold text-intento-blue mt-0.5">{alunoEditando.nome}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{alunoEditando.email}</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tipo de aluno</label>
                  <select value={editTipo} onChange={(e) => setEditTipo(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-sm font-medium text-intento-blue">
                    <option value="ENEM">ENEM</option>
                    <option value="EM">Ensino Médio</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Escola</label>
                  <input type="text" value={editEscola} onChange={(e) => setEditEscola(e.target.value)} placeholder="Nome da escola" className="w-full p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-sm font-medium text-intento-blue placeholder:text-slate-400" />
                </div>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                <button onClick={() => setAlunoEditando(null)} className="text-sm font-semibold text-slate-500 hover:text-intento-blue px-4 py-2 transition">Cancelar</button>
                <button onClick={salvarEdicao} disabled={salvandoEdicao} className="text-sm font-semibold bg-intento-blue hover:bg-blue-900 text-white px-5 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">{salvandoEdicao ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </div>
          </div>
        )}

        </>)}
      </div>
    </div>
  );
}
