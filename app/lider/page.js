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
import { corDe, CARIMBO_LABEL } from '@/lib/carimboCores';
import {
  CARIMBOS, ORD_CAR, DIM_LABEL, CICLOS_INFO, cicloIdx,
  diagnosticoDimensional, sinalCheckin, ultimaSemanaHist, motivosAcao,
} from '@/lib/carimbos';
import { CarimboBadge, BarraCarimbo, CarimboDimensional } from '@/components/Carimbos';

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


// ─────────────────────────────────────────────────────────────────────────────
// Diagnóstico Fases e Ciclos (camada ?diagnostico=1)
// Motor, faixas e janelas moram em lib/carimbos.js (fonte única, compartilhada
// com o /mentor) — aqui só a lente operacional do líder (fila, distribuições).
// ─────────────────────────────────────────────────────────────────────────────

// Avatar de iniciais (até 2 palavras)
const iniciais = (nome) => String(nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// Célula de métrica pequena (cards de mentor)
function Metrica({ label, valor, sub, tom }) {
  const bg = tom === 'ambar' ? '#FEF3C7' : tom === 'vermelho' ? '#FEE2E2' : '#F8FAFC';
  const cor = tom === 'ambar' ? '#92400E' : tom === 'vermelho' ? '#B91C1C' : '#1E293B';
  return (
    <div className="rounded-lg p-2 text-center border border-slate-100" style={{ backgroundColor: bg }}>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
      <p className="text-base font-bold leading-tight mt-0.5" style={{ color: cor }}>{valor}</p>
      {sub && <p className="text-[8px] text-slate-400 font-medium">{sub}</p>}
    </div>
  );
}

// Barra de distribuição em segmentos arredondados proporcionais (Aprendiz/Veterano/Mestre).
function BarraSegmentos({ dist, total, altura = 'h-2.5' }) {
  const segs = [['aprendiz', dist.aprendiz], ['veterano', dist.veterano], ['mestre', dist.mestre]].filter(([, n]) => n > 0);
  if (!segs.length) return <span className={`flex-1 ${altura} rounded-full bg-slate-100`} />;
  return (
    <span className={`flex-1 flex items-center gap-1 ${altura}`}>
      {segs.map(([nivel, n]) => (
        <span key={nivel} className={`${altura} rounded-full`} style={{ flexGrow: n, flexBasis: 0, backgroundColor: corDe(nivel).solido }} />
      ))}
    </span>
  );
}
// Barra empilhada de distribuição (heatmap dimensional): Aprendiz/Veterano/Mestre
function DistribDim({ label, dist, total }) {
  const seg = (n, nivel) => n > 0 ? <span className="h-full" style={{ width: `${(n / total) * 100}%`, backgroundColor: corDe(nivel).solido }} /> : null;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-semibold w-32 text-slate-500">{label}</span>
      <span className="flex-1 flex h-3 rounded-full overflow-hidden bg-slate-100">
        {seg(dist.aprendiz, 'aprendiz')}{seg(dist.veterano, 'veterano')}{seg(dist.mestre, 'mestre')}
      </span>
      <span className="text-[10px] text-slate-400 tabular-nums w-14 text-right">{dist.aprendiz}/{dist.veterano}/{dist.mestre}</span>
    </div>
  );
}
// O ÁTOMO: dashboard dimensional de um aluno (manual: "apresentar o dashboard dimensional")
function CardDimensional({ a, d, ciclo, onClose }) {
  const linhas = [
    {
      key: 'comportamento',
      val: d.compEmFormacao
        ? `em formação · ${d.semanasMensuraveis}/4 semanas mensuráveis`
        : `Presença ${CARIMBO_LABEL[d.presenca]} · Aproveit. ${CARIMBO_LABEL[d.aproveitamento]}`,
      nota: d.aprov != null ? `última semana: ${d.aprov}% da meta` : null,
    },
    { key: 'cobertura', val: d.cobMed != null ? `${Math.round(d.cobMed)}% do edital` : '—' },
    { key: 'dominio', val: d.domMed != null ? `${Math.round(d.domMed)}% de acerto` : '—' },
  ];
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-intento-blue truncate">{a.nome}</h2>
            <p className="text-[11px] text-slate-400 font-medium">{a.mentorNome || a.mentor} · {a.plano || '—'} · {ciclo.id} {ciclo.nome}</p>
          </div>
          <CarimboBadge nivel={d.perfil} />
        </div>
        <div className="p-6 space-y-3">
          {d.alerta && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs font-semibold text-red-700">🚨 Alerta clínico ativo{d.alertaMotivo && <span className="font-medium"> — {d.alertaMotivo}</span>}</div>}
          {d.overstudying && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs font-semibold text-amber-700">⚠️ Overstudying — 2+ semanas seguidas acima de 105% da meta (trava Mestre)</div>}
          {linhas.map(l => (
            <div key={l.key} className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600 w-28 shrink-0">{DIM_LABEL[l.key]}</span>
              <BarraCarimbo nivel={d[l.key]} />
              <span className="text-[11px] text-slate-400 font-medium flex-1 text-right">{l.val}{l.nota && <span className="block text-[9px] text-slate-300">{l.nota}</span>}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 opacity-60">
            <span className="text-xs font-semibold text-slate-600 w-28 shrink-0">Simulado</span>
            <span className="text-[10px] text-slate-400 font-semibold">Fase 2 — aba de simulados da planilha</span>
          </div>
        </div>
        <div className="bg-slate-50 px-6 py-3 flex justify-between items-center border-t border-slate-100">
          <button onClick={() => window.open(`/mentor/${a.idAluno}?nome=${encodeURIComponent(a.nome)}`, '_blank')} className="text-xs font-semibold text-intento-blue hover:underline">Abrir perfil ↗</button>
          <button onClick={onClose} className="text-xs font-semibold text-slate-400 hover:text-slate-700 px-3 py-1">Fechar</button>
        </div>
      </div>
    </div>
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
// dom = domínio central, prog = cobertura central (% médio do edital)
const _mat = (dom, prog) => ({
  domBio: dom + 4, cDomBio: 1, domQui: dom, cDomQui: 1, domFis: dom - 4, cDomFis: 1, domMat: dom - 6, cDomMat: 1,
  progBio: prog + 4, cProgBio: 1, progQui: prog, cProgQui: 1, progFis: prog - 3, cProgFis: 1, progMat: prog - 5, cProgMat: 1,
});
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
    _aluno({ nome: 'Maria Silva', mentor: 'Ana', mentorEmail: 'ana@x', plano: 'Quinzenal', esp: 2, feitos: 1, ultEnc: _iso(-8), acomp: _iso(-1), tipo: 'EM', escola: 'Colégio X', sim: 1, materias: _mat(74, 45), historico: _hist(['26/05 a 01/06', 16, 20], ['02/06 a 08/06', 18, 20], ['09/06 a 15/06', 19, 20]), checkin: [{ est: 70, mot: 80 }, { est: 65, mot: 75 }, { est: 70, mot: 80 }] }),
    _aluno({ nome: 'João Souza', mentor: 'Ana', mentorEmail: 'ana@x', plano: 'Mensal', esp: 1, feitos: 1, ultEnc: _iso(-12), acomp: _iso(-2), sim: 0, materias: _mat(76, 18), historico: _hist(['09/06 a 15/06', 17, 20]), checkin: [{ est: 60, mot: 70 }, { est: 60, mot: 65 }] }),
    _aluno({ nome: 'Ana Pereira', mentor: 'Bruno', mentorEmail: 'bruno@x', plano: 'Quinzenal', esp: 2, feitos: 0, ultEnc: _iso(-26), acomp: _iso(-18), sim: 2, materias: _mat(58, 25), historico: _hist(['09/06 a 15/06', 8, 20]), checkin: [{ est: 35, mot: 30 }, { est: 38, mot: 35 }] }),
    _aluno({ nome: 'Pedro Lima', mentor: 'Bruno', mentorEmail: 'bruno@x', plano: 'Mensal', esp: 1, feitos: 1, ultEnc: _iso(-20), acomp: _iso(-9), sim: 0, materias: _mat(74, 45), historico: _hist(['09/06 a 15/06', 26, 20]), checkin: [{ est: 70, mot: 70 }, { est: 65, mot: 70 }] }),
    _aluno({ nome: 'Beatriz Costa', mentor: 'Carla', mentorEmail: 'carla@x', plano: 'Quinzenal', esp: 2, feitos: 2, ultEnc: _iso(-5), acomp: _iso(-1), tipo: 'EM', sim: 1, materias: _mat(84, 76), historico: _hist(['09/06 a 15/06', 21, 22]), checkin: [{ est: 75, mot: 80 }, { est: 78, mot: 82 }] }),
    _aluno({ nome: 'Lucas Almeida', mentor: 'Carla', mentorEmail: 'carla@x', plano: 'Mensal', esp: 1, feitos: 0, ultEnc: '', acomp: '', statusApp: 'Não se adaptou', sim: 0, materias: {}, historico: {}, checkin: [] }),
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
  const [alunoDiag, setAlunoDiag] = useState(null); // {a, d} aberto no card dimensional
  const [explorar, setExplorar] = useState(false);  // drill da base (analytics) sob demanda
  const [subAba, setSubAba] = useState('visao');           // visao | mentores | mentorados
  const [mentoresOrder, setMentoresOrder] = useState('carga'); // carga | alertas
  const [mentoradosChip, setMentoradosChip] = useState('todos'); // todos | acao | aprendiz | veterano | mestre

  const [seccoesAbertas, setSeccoesAbertas] = useState({ mentores: true, analitica: false });
  const toggleSeccao = (key) => setSeccoesAbertas(prev => ({ ...prev, [key]: !prev[key] }));

  const [alunoDesignar, setAlunoDesignar] = useState(null);
  const [mentorEscolhido, setMentorEscolhido] = useState('');
  const [planoEscolhido, setPlanoEscolhido] = useState('');
  const [designando, setDesignando] = useState(false);
  const [mensagemSucesso, setMensagemSucesso] = useState('');
  const PLANOS_DISPONIVEIS = ['Mensal', 'Quinzenal', 'Semanal', 'Padrão', 'Custom'];

  // Detecta ?demo=1 (client-side, evita Suspense de useSearchParams)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setEhDemo(p.get('demo') === '1');
  }, []);

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

  // Diagnóstico dimensional do Método Intento — espinha do painel (só /lider, líder-only)
  const diagnostico = useMemo(() => ativos.map(a => ({ a, d: diagnosticoDimensional(a) })), [ativos]);
  const ciclo = CICLOS_INFO[cicloIdx()];

  // ── KPIs de processo (Visão Geral) — sobre TODOS os filtrados, inclusive
  // fora do app: encontros e acompanhamento valem pra eles também. ──
  const encontrosMes = useMemo(() => {
    let feitos = 0, esperados = 0;
    alunosFiltrados.forEach(a => { if (a.encontrosEsperados > 0) { esperados += a.encontrosEsperados; feitos += (a.encontrosMesCorrente || 0); } });
    return { feitos, esperados, pct: esperados > 0 ? Math.round((feitos / esperados) * 100) : null };
  }, [alunosFiltrados]);
  const acompStats = useMemo(() => {
    let verde = 0, total = 0;
    alunosFiltrados.forEach(a => { const s = sinalAcomp(a); if (s) { total++; if (s.nivel === 'verde') verde++; } });
    return { verde, total, pct: total > 0 ? Math.round((verde / total) * 100) : null };
  }, [alunosFiltrados]);

  // Saúde da base: distribuição de perfis + distribuição por dimensão (onde a base trava)
  const diagResumo = useMemo(() => {
    if (!diagnostico.length) return null;
    const z = () => ({ aprendiz: 0, veterano: 0, mestre: 0 });
    const perfil = z(), porDim = { comportamento: z(), cobertura: z(), dominio: z() };
    let alertas = 0;
    diagnostico.forEach(({ d }) => {
      if (d.perfil) perfil[d.perfil]++;
      ['comportamento', 'cobertura', 'dominio'].forEach(k => { if (d[k]) porDim[k][d[k]]++; });
      if (d.alerta) alertas++;
    });
    // gargalo = dimensão com mais Aprendizes
    const gargalo = ['comportamento', 'cobertura', 'dominio'].sort((x, y) => porDim[y].aprendiz - porDim[x].aprendiz)[0];
    return { perfil, porDim, alertas, total: diagnostico.length, gargalo: porDim[gargalo].aprendiz > 0 ? gargalo : null };
  }, [diagnostico]);

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

  // ── Fila OPERAÇÃO (Visão Geral): só o administrativo que o líder resolve ──
  // designação > sem diagnóstico > encontro de 60 dias. O clínico mora na fila
  // da aba Mentores; trajetória (cobertura/Aprendiz) fica no chip "Precisam de
  // ação" em Mentorados. Ver docs/REDESIGN_LIDER_CLINICO_E_MENTOR.md.
  const operacao = useMemo(() => {
    const items = [];
    alunosAguardando.forEach(a => items.push({ prioridade: 0, tipo: 'designar', a, motivo: a.mentor && !a.mentorAtivo ? 'mentor inativo' : 'aguardando designação', acao: 'designar' }));
    // Sem diagnóstico fica aqui mesmo com mentor ativo — é etapa prévia à mentoria.
    pendenciasDiagnostico.forEach(a => items.push({ prioridade: 1, tipo: 'diagnostico', a, motivo: 'sem diagnóstico', acao: (!a.mentor || !a.mentorAtivo) ? 'designar' : 'perfil' }));
    // Encontro de 60 dias líder↔mentorado: janela 60-90 dias desde o 1º diário,
    // sem data registrada. Vale pra toda a base (inclusive fora do app); some
    // sozinho aos 90 dias se não realizado.
    (dados?.alunos || []).forEach(a => {
      if (a.encontroLider) return;
      const dias = diasDesde(a.primeiroEncontro); // Infinity se sem diário → fora da janela
      if (dias >= 60 && dias <= 90) items.push({ prioridade: 2, tipo: 'encontro60', a, motivo: `encontro de 60 dias · ${dias}d desde o 1º diário`, acao: 'encontro60' });
    });
    const seen = new Map();
    items.forEach(it => { const k = (it.a.idAluno || '') + it.a.nome; if (!seen.has(k) || it.prioridade < seen.get(k).prioridade) seen.set(k, it); });
    return [...seen.values()].sort((x, y) => x.prioridade - y.prioridade);
  }, [alunosAguardando, pendenciasDiagnostico, dados]);

  // ── Fila CLÍNICA (aba Mentores): casa canônica dos alertas, com nomes ──
  // Inclui aluno sem mentor ativo (tag + designar inline) — o administrativo
  // não engole mais o clínico. Gravidade = nº de motivos ativos.
  const filaClinica = useMemo(() =>
    diagnostico.filter(({ d }) => d.alerta)
      .map(({ a, d }) => ({ a, d, semMentor: !(a.mentor && a.mentorAtivo) }))
      .sort((x, y) => (y.d.alertaMotivo || '').split(' + ').length - (x.d.alertaMotivo || '').split(' + ').length
        || (x.a.nome || '').localeCompare(y.a.nome || '')),
  [diagnostico]);

  // ── ETAPA 4: cards por mentor (camada de apresentação sobre o diagnóstico) ──
  // Reusa diagnostico (carimbos prontos). Não recalcula carimbo.
  const mentoresCards = useMemo(() => {
    const g = {};
    diagnostico.forEach(({ a, d }) => {
      if (!(a.mentor && a.mentorAtivo)) return; // casa com dados.mentoresAtivos
      const k = a.mentor;
      if (!g[k]) g[k] = { email: k, nome: a.mentorNome || k, alunos: [], planos: new Set(), aprendiz: 0, veterano: 0, mestre: 0, alertas: 0, acompTot: 0, acompVerde: 0, encFeitos: 0, encEsp: 0 };
      const grp = g[k];
      grp.alunos.push({ a, d });
      if (a.plano) grp.planos.add(String(a.plano).replace('Padrao', 'Padrão'));
      if (d.perfil) grp[d.perfil]++;
      if (d.alerta) grp.alertas++;
      const sa = sinalAcomp(a); if (sa) { grp.acompTot++; if (sa.nivel === 'verde') grp.acompVerde++; } // acompanhamento enviado (semana)
      if (a.encontrosEsperados > 0) { grp.encEsp += a.encontrosEsperados; grp.encFeitos += (a.encontrosMesCorrente || 0); } // encontros do mês
    });
    return Object.values(g).map(grp => {
      grp.carga = grp.alunos.length;
      grp.atrasados = grp.alunos.filter(({ d }) => d.cobMed != null && d.cobMed < ciclo.cobMin).length;
      grp.acompPct = grp.acompTot ? Math.round(grp.acompVerde / grp.acompTot * 100) : null;
      grp.encPct = grp.encEsp ? Math.round(grp.encFeitos / grp.encEsp * 100) : null;
      grp.distrib = { aprendiz: grp.aprendiz, veterano: grp.veterano, mestre: grp.mestre };
      grp.distTotal = grp.aprendiz + grp.veterano + grp.mestre;
      grp.planosArr = [...grp.planos];
      return grp;
    });
  }, [diagnostico, ciclo]);

  const mentoresCardsOrdenados = useMemo(() => {
    const arr = [...mentoresCards];
    arr.sort((x, y) => mentoresOrder === 'alertas' ? y.alertas - x.alertas : y.carga - x.carga);
    return arr;
  }, [mentoresCards, mentoresOrder]);

  // ── ETAPA 5: linhas de Mentorados (diagnostico já filtrado) + chip de perfil/ação ──
  // Com o chip "Precisam de ação" ativo, cada linha carrega os motivos que dispararam.
  const mentoradosFiltrados = useMemo(() => {
    if (mentoradosChip === 'acao') {
      return diagnostico
        .map(({ a, d }) => ({ a, d, motivos: motivosAcao(d, ciclo) }))
        .filter(({ motivos }) => motivos.length > 0);
    }
    if (['aprendiz', 'veterano', 'mestre'].includes(mentoradosChip)) return diagnostico.filter(({ d }) => d.perfil === mentoradosChip);
    return diagnostico;
  }, [diagnostico, mentoradosChip, ciclo]);

  const mentoradosContagens = useMemo(() => ({
    todos: diagnostico.length,
    acao: diagnostico.filter(({ d }) => motivosAcao(d, ciclo).length > 0).length,
    aprendiz: diagnostico.filter(({ d }) => d.perfil === 'aprendiz').length,
    veterano: diagnostico.filter(({ d }) => d.perfil === 'veterano').length,
    mestre: diagnostico.filter(({ d }) => d.perfil === 'mestre').length,
  }), [diagnostico, ciclo]);

  // ── Registrar saída (inativar aluno com motivo) — restrito ao gestor ──
  // Espelho de MOTIVOS_SAIDA do GAS (gas/Code.gs) — manter em sincronia.
  const MOTIVOS_SAIDA = ['Pós-ENEM', 'Aprovação', 'Financeiro', 'Insatisfação', 'Desistiu de Estudar', 'Não se Adaptou', 'Questões Psicológicas'];
  const ehGestor = ehDemo || emailLogado === 'filippe@metodointento.com.br';
  const [alunoSaida, setAlunoSaida] = useState(null);
  const [motivoSaida, setMotivoSaida] = useState('');
  const [obsSaida, setObsSaida] = useState('');
  const [registrandoSaida, setRegistrandoSaida] = useState(false);
  const [mensagemSaida, setMensagemSaida] = useState('');
  const abrirSaida = (aluno) => { setAlunoSaida(aluno); setMotivoSaida(''); setObsSaida(''); };
  const registrarSaida = async () => {
    if (!alunoSaida || !motivoSaida || registrandoSaida) return;
    if (ehDemo) { alert('Modo demo: ação desabilitada.'); return; }
    setRegistrandoSaida(true);
    try {
      const r = await apiFetch('/api/mentor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'inativarAluno', idAluno: alunoSaida.idAluno, motivo: motivoSaida, observacao: obsSaida.trim() }) });
      const data = await r.json();
      if (data.status === 'sucesso') {
        setDados(prev => prev ? { ...prev, alunos: (prev.alunos || []).filter(a => a.idAluno !== alunoSaida.idAluno), pendencias: (prev.pendencias || []).filter(a => a.idAluno !== alunoSaida.idAluno) } : prev);
        setMensagemSaida(`${alunoSaida.nome} · ${motivoSaida}`);
        setAlunoSaida(null);
        setTimeout(() => setMensagemSaida(''), 6000);
      } else { alert('Erro: ' + (data.mensagem || 'falha ao registrar saída')); }
    } catch (e) { alert('Erro de conexão ao registrar saída.'); }
    finally { setRegistrandoSaida(false); }
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

  // ── Encontro de 60 dias (líder↔mentorado) — botão "encontro feito" na fila ──
  const [marcandoEncontro60, setMarcandoEncontro60] = useState(null);
  const [mensagemEncontro60, setMensagemEncontro60] = useState('');
  const marcarEncontro60 = async (aluno) => {
    if (marcandoEncontro60) return;
    if (ehDemo) { alert('Modo demo: ação desabilitada.'); return; }
    setMarcandoEncontro60(aluno.idAluno);
    try {
      const res = await apiFetch('/api/mentor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'marcarEncontroLider', email: emailLogado, idAluno: aluno.idAluno }) });
      const data = await res.json();
      if (data.status !== 'sucesso') { alert('Erro: ' + (data.mensagem || 'falha ao registrar encontro')); return; }
      setDados(prev => prev ? { ...prev, alunos: (prev.alunos || []).map(a => a.idAluno === aluno.idAluno ? { ...a, encontroLider: data.data } : a) } : prev);
      setMensagemEncontro60(`Encontro de 60 dias registrado: ${aluno.nome}`);
      setTimeout(() => setMensagemEncontro60(''), 5000);
    } catch (e) { alert('Erro de conexão.'); }
    finally { setMarcandoEncontro60(null); }
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

        {/* Pipeline (CRM) saiu do /lider — funil comercial roda em software externo. */}

        {/* ── SUB-ABAS (Visão geral · Mentores · Mentorados) + Ciclo ── */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200">
          <div className="flex gap-1">
            {[['visao', 'Visão geral'], ['mentores', 'Mentores'], ['mentorados', 'Mentorados']].map(([k, label]) => (
              <button key={k} onClick={() => setSubAba(k)} className={`px-4 py-2 text-sm font-semibold transition border-b-2 ${subAba === k ? 'text-intento-blue border-intento-azul' : 'text-slate-400 border-transparent hover:text-slate-600'}`}>{label}</button>
            ))}
          </div>
          <span className="text-[11px] font-semibold text-slate-400 pb-2 shrink-0">{ciclo.id} · {ciclo.nome} · <b className="text-slate-500">{ativos.length + foraDoApp.length}</b> ativos</span>
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

            <div className="relative flex-1 min-w-[200px]">
              <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno por nome ou email..." className="w-full text-xs font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400" />
            </div>

            {haFiltroAtivo && <button onClick={limparFiltros} className="text-xs font-semibold text-slate-400 hover:text-red-500 px-3 py-2 transition">Limpar tudo</button>}
          </div>
        </div>

        {subAba === 'visao' && (<>
        {/* ── SCOREBOARD (4 KPIs) — administrativo primeiro (decisão 07/08):
            Operação > processo (encontros, acompanhamentos). Alertas clínicos
            é só ponteiro — a casa dos nomes é a aba Mentores. ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <div className="rounded-xl border p-5 shadow-sm" style={{ backgroundColor: '#FAEEDA', borderColor: '#EFDFBC' }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#92400E' }}>⚙ Operação</p>
            <p className="text-3xl font-bold leading-none" style={{ color: '#854F0B' }}>{operacao.length}</p>
            <p className="text-[11px] font-medium mt-2" style={{ color: '#92400E' }}>pendências administrativas</p>
          </div>
          <div className={cardClass}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Encontros do mês</p>
            <p className="text-3xl font-bold text-intento-blue leading-none">{encontrosMes.pct != null ? `${encontrosMes.pct}%` : '—'}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-2">{encontrosMes.esperados > 0 ? `${encontrosMes.feitos} de ${encontrosMes.esperados} esperados` : 'sem dado'}</p>
          </div>
          <div className={cardClass}>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Acompanhamentos da semana</p>
            <p className="text-3xl font-bold text-intento-blue leading-none">{acompStats.pct != null ? `${acompStats.pct}%` : '—'}</p>
            <p className="text-[11px] text-slate-400 font-medium mt-2">{acompStats.total > 0 ? `${acompStats.verde} de ${acompStats.total} enviados` : 'sem dado'}</p>
          </div>
          <button onClick={() => setSubAba('mentores')} className="rounded-xl border p-5 shadow-sm text-left hover:brightness-95 transition cursor-pointer" style={{ backgroundColor: '#FBEAEA', borderColor: '#F1D2D2' }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9B1C1C' }}>🚨 Alertas clínicos</p>
            <p className="text-3xl font-bold leading-none" style={{ color: '#B91C1C' }}>{filaClinica.length}</p>
            <p className="text-[11px] font-medium mt-2" style={{ color: '#9B1C1C' }}>ver na aba Mentores →</p>
          </button>
        </div>

        {/* ── OPERAÇÃO — fila administrativa (designação > sem diagnóstico > encontro 60d) ── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-intento-blue">⚙ Operação</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${operacao.length ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{operacao.length}</span>
            </div>
            <button onClick={() => setExplorar(v => !v)} className="text-[11px] font-semibold text-intento-blue hover:underline">{explorar ? 'fechar base' : 'explorar base →'}</button>
          </div>
          {operacao.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium text-center py-8">Sem pendências administrativas nos filtros atuais.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {operacao.map(it => (
                <div key={(it.a.idAluno || '') + it.a.nome} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: it.tipo === 'encontro60' ? '#D97706' : '#94A3B8' }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{it.a.nome} <span className="text-slate-400 font-normal">· {it.a.mentorNome || it.a.mentor || 'sem mentor'}</span></p>
                      <p className={`text-[11px] font-medium truncate ${it.tipo === 'encontro60' ? 'text-amber-700' : 'text-slate-500'}`}>{it.motivo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {it.acao === 'designar'
                      ? <button onClick={() => abrirDesignacao(it.a)} className="text-[11px] font-semibold bg-intento-yellow text-white px-3 py-1.5 rounded-lg hover:bg-yellow-500 transition">designar</button>
                      : it.acao === 'encontro60'
                        ? <button onClick={() => marcarEncontro60(it.a)} disabled={marcandoEncontro60 === it.a.idAluno} className="text-[11px] font-semibold bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed">{marcandoEncontro60 === it.a.idAluno ? 'Salvando...' : 'encontro feito ✓'}</button>
                        : <button onClick={() => window.open(`/mentor/${it.a.idAluno}?nome=${encodeURIComponent(it.a.nome)}`, '_blank')} className="text-[11px] font-semibold text-intento-blue hover:underline">perfil ↗</button>}
                    {ehGestor && <button onClick={() => abrirSaida(it.a)} title="Registrar saída da mentoria" className="text-[11px] font-semibold text-slate-300 hover:text-red-600 transition">saída</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {diagResumo && (<>
        {/* ── DISTRIBUIÇÃO POR DIMENSÃO (perfil da base, largura cheia) ── */}
        <div className={cardClass}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Perfil da base · por dimensão</p>
              <div className="flex items-center gap-3 shrink-0">
                {[['aprendiz', diagResumo.perfil.aprendiz], ['veterano', diagResumo.perfil.veterano], ['mestre', diagResumo.perfil.mestre]].map(([n, v]) => (
                  <span key={n} className="flex items-center gap-1.5 text-sm font-bold" style={{ color: corDe(n).texto }}><span className="w-2 h-2 rounded-full" style={{ backgroundColor: corDe(n).solido }} />{v}</span>
                ))}
                <span className="text-[10px] text-slate-400 font-medium">· {foraDoApp.length} sem diagnóstico</span>
              </div>
            </div>
            <div className="space-y-3">
              {[['comportamento', 'Comportamento'], ['cobertura', 'Cobertura'], ['dominio', 'Domínio']].map(([k, label]) => {
                const dd = diagResumo.porDim[k];
                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="text-[13px] font-semibold text-slate-600 w-28 shrink-0">{label}</span>
                    <BarraSegmentos dist={dd} total={diagResumo.total} />
                    <span className="text-[11px] text-slate-400 tabular-nums w-14 text-right shrink-0">{dd.aprendiz}·{dd.veterano}·{dd.mestre}</span>
                  </div>
                );
              })}
              {/* Simulado — Fase 2 (sem score; não inventar distribuição) */}
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-semibold text-slate-400 w-28 shrink-0">Simulado</span>
                <span className="flex-1 flex items-center gap-2">
                  <span className="h-2.5 w-20 rounded-full bg-slate-200 opacity-60" />
                  <span className="text-[11px] text-slate-400 italic">{diagResumo.perfil.aprendiz} ainda Aprendiz</span>
                </span>
                <span className="text-[11px] text-slate-300 w-14 text-right shrink-0">Fase 2</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-slate-400 mt-4 pt-3 border-t border-slate-100">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: corDe('aprendiz').solido }} />Aprendiz</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: corDe('veterano').solido }} />Veterano</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: corDe('mestre').solido }} />Mestre</span>
              <span className="ml-auto italic">Simulado ativa a partir de Veterano</span>
            </div>
          </div>

        </>)}

        {/* Toasts */}
        {mensagemSucesso && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-3"><span className="text-xs font-semibold text-emerald-800">Designado: {mensagemSucesso}</span></div>}
        {mensagemEdicao && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-3"><span className="text-xs font-semibold text-emerald-800">{mensagemEdicao}</span></div>}
        {mensagemSaida && <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 flex items-center gap-3"><span className="text-xs font-semibold text-slate-700">Saída registrada: {mensagemSaida}</span></div>}
        {mensagemEncontro60 && <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center gap-3"><span className="text-xs font-semibold text-emerald-800">{mensagemEncontro60}</span></div>}

        {/* ── EXPLORAR BASE — analytics sob demanda (drill) ── */}
        {explorar && (<>
          {/* Evolução + bem-estar */}
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
                <p className="text-[10px] font-medium text-slate-400 mb-4">média da base · último valor de cada aluno</p>
                <div className="h-56"><Bar data={{ labels: ['Biologia', 'Química', 'Física', 'Matemática'], datasets: [{ data: [dominio.bio || 0, dominio.qui || 0, dominio.fis || 0, dominio.mat || 0], backgroundColor: ['#10b981', '#3b82f6', '#f97316', '#ef4444'], borderRadius: 4 }] }} options={{ ...chartOptions, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100, grid: { color: 'rgba(150,150,150,0.1)' } } } }} /></div>
              </div>
              <div className={cardClass}>
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Progresso médio por matéria</h3>
                <p className="text-[10px] font-medium text-slate-400 mb-4">média da base · último valor de cada aluno</p>
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
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide">Horas estudadas vs Meta — média da base</h3>
                <select value={periodoFiltro} onChange={e => setPeriodoFiltro(e.target.value)} className="text-[10px] font-semibold text-intento-blue bg-slate-50 border border-slate-200 px-2 py-1 rounded outline-none cursor-pointer">
                  <option value="4">4 sem</option><option value="8">8 sem</option><option value="tudo">tudo</option>
                </select>
              </div>
              <p className="text-[10px] font-medium text-slate-400 mb-4">{periodoFiltro === 'tudo' ? 'todo o período' : `últimas ${periodoFiltro} semanas`}</p>
              <div className="h-64"><Line data={{ labels: historico.map(h => String(h.semana || '').split(' a ')[0] || ''), datasets: [{ label: 'Horas (média)', data: historico.map(h => h.mediaHoras), borderColor: '#3b82f6', backgroundColor: '#3b82f6', tension: 0.3 }, { label: 'Meta (média)', data: historico.map(h => h.mediaMeta), borderColor: '#94a3b8', backgroundColor: 'transparent', borderDash: [6, 4], tension: 0.3 }] }} options={chartOptions} /></div>
            </div>

            {/* Fora do app (non-adopters) */}
            {foraDoApp.length > 0 && (
              <div className={cardClass}>
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fora do app</p>
                  <span className="bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full">{foraDoApp.length}</span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium mb-3">Não se adaptaram / não vão usar o app — fora do diagnóstico dimensional. Encontros e acompanhamento ainda valem; acompanhe pelo perfil.</p>
                <div className="flex flex-wrap gap-2">
                  {foraDoApp.map(a => (
                    <span key={a.idAluno + a.nome} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full">
                      <button onClick={() => window.open(`/mentor/${a.idAluno}?nome=${encodeURIComponent(a.nome)}`, '_blank')} className="hover:text-intento-blue transition">
                        {a.nome} <span className="text-slate-400 font-normal">· {a.mentorNome || a.mentor}</span>
                      </button>
                      {ehGestor && <>
                        <button onClick={() => abrirDesignacao(a)} title="Trocar de mentor" className="text-slate-400 hover:text-intento-blue transition px-0.5">⇄</button>
                        <button onClick={() => abrirSaida(a)} title="Registrar saída da mentoria" className="text-slate-400 hover:text-red-600 transition px-0.5">×</button>
                      </>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </SeccaoColapsavel>
        </>)}
        </>)}

        {/* ── MENTORES (Etapa 4): fila clínica (casa dos alertas) + cards ── */}
        {subAba === 'mentores' && (<>
          {/* Alunos em risco — casa canônica do alerta clínico, com nomes e motivo */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: filaClinica.length ? '#F1D2D2' : '#E2E8F0' }}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2" style={filaClinica.length ? { backgroundColor: '#FBEAEA' } : undefined}>
              <h2 className="text-base font-semibold" style={{ color: filaClinica.length ? '#9B1C1C' : '#1E3A8A' }}>🚨 Alunos em risco</h2>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${filaClinica.length ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>{filaClinica.length}</span>
            </div>
            {filaClinica.length === 0 ? (
              <p className="text-sm text-slate-400 font-medium text-center py-8">Nenhum alerta clínico ativo nos filtros atuais.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {filaClinica.map(({ a, d, semMentor }) => (
                  <div key={(a.idAluno || '') + a.nome} className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: '#7F1D1D' }} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">
                          {a.nome}{' '}
                          {semMentor
                            ? <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded uppercase tracking-wider">sem mentor</span>
                            : <span className="text-slate-400 font-normal">· {a.mentorNome || a.mentor}</span>}
                        </p>
                        <p className="text-[11px] font-medium truncate text-red-700">{d.alertaMotivo || 'alerta clínico'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {d.perfil && <CarimboBadge nivel={d.perfil} />}
                      {semMentor && <button onClick={() => abrirDesignacao(a)} className="text-[11px] font-semibold bg-intento-yellow text-white px-3 py-1.5 rounded-lg hover:bg-yellow-500 transition">designar</button>}
                      <button onClick={() => setAlunoDiag({ a, d })} className="text-[11px] font-semibold text-intento-blue hover:underline">abrir →</button>
                      {ehGestor && <button onClick={() => abrirSaida(a)} title="Registrar saída da mentoria" className="text-[11px] font-semibold text-slate-300 hover:text-red-600 transition">saída</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{mentoresCardsOrdenados.length} mentores</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Ordenar</span>
              {[['carga', 'Carga'], ['alertas', 'Alertas']].map(([k, l]) => (
                <button key={k} onClick={() => setMentoresOrder(k)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${mentoresOrder === k ? 'text-white border-transparent bg-intento-blue' : 'text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>{l}</button>
              ))}
            </div>
          </div>
          {mentoresCardsOrdenados.length === 0 ? (
            <div className={cardClass}><p className="text-sm text-slate-400 font-medium text-center py-8">Nenhum mentor com alunos no app nos filtros atuais.</p></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {mentoresCardsOrdenados.map(m => (
                <div key={m.email} className={cardClass}>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-intento-blue">{iniciais(m.nome)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-intento-blue truncate">{m.nome}</p>
                      <p className="text-[11px] text-slate-400 font-medium truncate">{m.planosArr.join(' · ') || 'sem plano'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    <Metrica label="Carga" valor={m.carga} />
                    <Metrica label="Acomp." valor={m.acompPct != null ? `${m.acompPct}%` : '—'} sub="enviado" />
                    <Metrica label="Encontros" valor={m.encPct != null ? `${m.encPct}%` : '—'} sub="do mês" />
                    <Metrica label="Alertas" valor={m.alertas} tom={m.alertas ? 'vermelho' : null} />
                  </div>
                  <DistribDim label="Perfis" dist={m.distrib} total={m.distTotal || 1} />
                  <button onClick={() => { setMentoresSelecionados([m.email]); setSubAba('mentorados'); }} className="mt-3 text-[11px] font-semibold text-intento-azul hover:underline">ver alunos de {m.nome.split(' ')[0]} →</button>
                </div>
              ))}
            </div>
          )}
        </>)}

        {/* ── MENTORADOS (Etapa 5) ── */}
        {subAba === 'mentorados' && (<>
          <div className="flex flex-wrap items-center gap-2">
            {[['todos', 'Todos'], ['acao', 'Precisam de ação'], ['aprendiz', 'Aprendiz'], ['veterano', 'Veterano'], ['mestre', 'Mestre']].map(([k, l]) => {
              const on = mentoradosChip === k;
              return (
                <button key={k} onClick={() => setMentoradosChip(k)} className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition ${on ? 'text-white border-transparent bg-intento-blue' : 'text-slate-500 bg-white border-slate-200 hover:bg-slate-50'}`}>
                  {l} <span className={on ? 'text-white/60' : 'text-slate-400'}>{mentoradosContagens[k] ?? 0}</span>
                </button>
              );
            })}
            <span className="text-[10px] text-slate-400 font-medium ml-auto">use os Filtros acima p/ buscar por nome/mentor/plano</span>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="text-[10px] text-slate-400 uppercase tracking-wide border-b border-slate-100 bg-slate-50">
                  <tr>
                    <th className="text-left font-bold p-3">Aluno</th>
                    <th className="text-left font-bold p-3">Mentor</th>
                    <th className="text-left font-bold p-3">Perfil</th>
                    <th className="text-left font-bold p-3">Carimbos</th>
                    {mentoradosChip === 'acao' && <th className="text-left font-bold p-3">Motivo</th>}
                    <th className="font-bold p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {mentoradosFiltrados.length === 0 ? (
                    <tr><td colSpan={mentoradosChip === 'acao' ? 6 : 5} className="text-center text-sm text-slate-400 font-medium py-8">Nenhum aluno nos filtros atuais.</td></tr>
                  ) : mentoradosFiltrados.map(({ a, d, motivos }) => {
                    return (
                      <tr key={(a.idAluno || '') + a.nome} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 bg-intento-blue">{iniciais(a.nome)}</span>
                            <span className="font-semibold text-slate-700 truncate max-w-[160px]">{a.nome}</span>
                          </div>
                        </td>
                        <td className="p-3 text-slate-500 truncate max-w-[120px]">{a.mentorNome || a.mentor || '—'}</td>
                        <td className="p-3"><CarimboBadge nivel={d.perfil} /></td>
                        <td className="p-3"><CarimboDimensional d={d} /></td>
                        {mentoradosChip === 'acao' && (
                          <td className="p-3">
                            {(motivos || []).map(m => (
                              <p key={m.tipo} className={`text-[11px] font-medium whitespace-normal ${m.tipo === 'clinico' ? 'text-red-700' : 'text-amber-700'}`}>{m.tipo === 'clinico' ? '🚨 ' : ''}{m.texto}</p>
                            ))}
                          </td>
                        )}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button onClick={() => setAlunoDiag({ a, d })} className="text-[11px] font-semibold text-intento-azul hover:underline">abrir</button>
                            {ehGestor && <>
                              <button onClick={() => abrirDesignacao(a)} title="Trocar de mentor" className="text-[11px] font-semibold text-slate-400 hover:text-intento-blue transition">trocar mentor</button>
                              <button onClick={() => abrirSaida(a)} title="Registrar saída da mentoria" className="text-[11px] font-semibold text-slate-300 hover:text-red-600 transition">saída</button>
                            </>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {alunoDiag && <CardDimensional a={alunoDiag.a} d={alunoDiag.d} ciclo={ciclo} onClose={() => setAlunoDiag(null)} />}

        {/* Modal de designação */}
        {alunoDesignar && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget) setAlunoDesignar(null); }}>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{alunoDesignar.mentor ? 'Trocar mentor' : 'Designar mentor'}</p>
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

        {/* Modal de saída (inativar com motivo) */}
        {alunoSaida && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in" onClick={(e) => { if (e.target === e.currentTarget && !registrandoSaida) setAlunoSaida(null); }}>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Registrar saída</p>
                <h2 className="text-base font-semibold text-intento-blue mt-0.5">{alunoSaida.nome}</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{alunoSaida.email}{(alunoSaida.mentorNome || alunoSaida.mentor) ? <> · mentor: <span className="font-semibold text-slate-500">{alunoSaida.mentorNome || alunoSaida.mentor}</span></> : null}</p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Motivo da saída</label>
                  <select value={motivoSaida} onChange={(e) => setMotivoSaida(e.target.value)} className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-sm font-medium text-intento-blue">
                    <option value="">— Escolha o motivo —</option>
                    {MOTIVOS_SAIDA.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Observação <span className="normal-case font-medium text-slate-400">(opcional)</span></label>
                  <textarea rows={3} value={obsSaida} onChange={(e) => setObsSaida(e.target.value)} placeholder="Contexto da saída, combinados, follow-up..." className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-sm font-medium text-intento-blue placeholder:text-slate-400 resize-none" />
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">O aluno sai do painel do líder e da lista do mentor; o histórico fica preservado na planilha. <b>Nenhum email é enviado.</b> Reversível pelo Sheets (limpar as células dt_saida/motivo_saida).</p>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
                <button onClick={() => setAlunoSaida(null)} disabled={registrandoSaida} className="text-sm font-semibold text-slate-500 hover:text-intento-blue px-4 py-2 transition disabled:opacity-40">Cancelar</button>
                <button onClick={registrarSaida} disabled={!motivoSaida || registrandoSaida} className="text-sm font-semibold bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">{registrandoSaida ? 'Registrando...' : 'Registrar saída'}</button>
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

      </div>
    </div>
  );
}
