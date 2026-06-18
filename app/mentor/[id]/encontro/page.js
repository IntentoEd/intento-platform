'use client';

import { apiFetch } from '@/lib/api';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { LoadingScreen } from '@/components/Loading';
import ConfirmDialog from '@/components/ConfirmDialog';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes espelhadas de app/mentor/[id]/page.js — mantidas idênticas pra que
// o payload de salvarNovoEncontro/salvarSemanaLote continue compatível.
// ─────────────────────────────────────────────────────────────────────────────
const DIAS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const DIAS_CURTO = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const HORARIOS = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

const CATEGORIAS_DESAFIO = ['Codificação', 'Revisão', 'Hábitos', 'Prova'];
const EDIT_CATEGORIAS = ['Codificação', 'Revisão', 'Hábitos', 'Aula', 'Simulados', 'Outros'];
const CAT_COR = {
  'Codificação': 'bg-blue-100 text-blue-800 border-blue-200',
  'Revisão': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Hábitos': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Aula': 'bg-violet-100 text-violet-800 border-violet-200',
  'Simulados': 'bg-red-100 text-red-800 border-red-200',
  'Prova': 'bg-red-100 text-red-800 border-red-200',
  'Outros': 'bg-slate-100 text-slate-700 border-slate-200',
};
const CAT_DOT = {
  'Codificação': 'bg-blue-500', 'Revisão': 'bg-emerald-500', 'Hábitos': 'bg-yellow-500',
  'Aula': 'bg-violet-500', 'Simulados': 'bg-red-500', 'Prova': 'bg-red-500', 'Outros': 'bg-slate-400',
};

const STATUS_META_OPCOES = ['Batida', 'Parcial', 'Não batida'];
const COR_STATUS_META = {
  'Batida': 'bg-emerald-100 text-emerald-800',
  'Parcial': 'bg-yellow-100 text-yellow-800',
  'Não batida': 'bg-red-100 text-red-800',
};
const RESULTADO_OPCOES = ['Realizado', 'Realizado Parcialmente', 'Não realizado'];
const COR_RESULTADO = {
  'Realizado': 'bg-emerald-100 text-emerald-800',
  'Realizado Parcialmente': 'bg-yellow-100 text-yellow-800',
  'Não realizado': 'bg-red-100 text-red-800',
};

const DISCIPLINAS = [
  { key: 'BIO', label: 'Biologia',   dCol: 12, pCol: 13, cor: 'bg-emerald-500' },
  { key: 'QUI', label: 'Química',    dCol: 14, pCol: 15, cor: 'bg-blue-500' },
  { key: 'FIS', label: 'Física',     dCol: 16, pCol: 17, cor: 'bg-orange-500' },
  { key: 'MAT', label: 'Matemática', dCol: 18, pCol: 19, cor: 'bg-purple-500' },
];

const MAX_METAS = 3;
const parseMetas = (raw) => {
  const arr = String(raw || '').split('\n').map(s => s.trim());
  return Array.from({ length: MAX_METAS }, (_, i) => arr[i] || '');
};
const serializeMetas = (metasArr) =>
  (metasArr || []).map(m => String(m || '').trim()).filter(Boolean).join('\n');
const serializeStatusMetas = (statusArr) =>
  (statusArr || []).slice(0, MAX_METAS).map(s => String(s || '').trim()).join('\n');

const COL_ORIGEM = 20;
const toPercent = (val) => {
  const n = parseFloat(String(val ?? '').replace(',', '.'));
  if (isNaN(n)) return null;
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
};
const toPercentCheckin = (val, origem) => {
  const n = parseFloat(String(val ?? '').replace(',', '.'));
  if (isNaN(n)) return null;
  const usaEscala01 = origem === 'auto' || origem === 'revisado';
  return Math.round((n / (usaEscala01 ? 1 : 5)) * 100);
};
const numOrNull = (val) => {
  const n = parseFloat(String(val ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

// Passos do roteiro, na ordem real da reunião. Abertura e Exploração saíram:
// a abertura repetia a revisão da meta; a exploração permeia tudo (painel fixo).
// `retro: true` = só aparece quando existe um encontro anterior.
const STEPS = [
  { id: 'meta-anterior', n: 1, titulo: 'Revisão da meta anterior',  sub: 'Bateu o combinado?', retro: true },
  { id: 'plano-anterior',n: 2, titulo: 'Revisão do plano de ação',  sub: 'O que foi feito', retro: true },
  { id: 'balanco',       n: 3, titulo: 'Vitórias e Obstáculos',     sub: 'Balanço do período' },
  { id: 'foco',          n: 4, titulo: 'Foco do encontro',          sub: 'Categoria do desafio' },
  { id: 'meta-proxima',  n: 5, titulo: 'Meta do próximo encontro',  sub: 'O que vamos combinar' },
  { id: 'plano-proximo', n: 6, titulo: 'Plano de ação do próximo',  sub: 'Passos práticos' },
];

const labelClass = 'block text-xs font-medium text-slate-500 uppercase tracking-wider';
const inputClass = 'w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-sm font-medium text-slate-700 placeholder:text-slate-400 transition-all';

const StarRating = ({ rating, setRating, readOnly = false, small = false }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map(star => (
      <button key={star} type="button" onClick={() => !readOnly && setRating(star)}
        className={`${small ? 'text-base' : 'text-3xl'} transition-transform ${star <= rating ? 'text-intento-yellow' : 'text-slate-200'} ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}>
        ★
      </button>
    ))}
  </div>
);

const FORM_VAZIO = {
  autoavaliacao: 0, vitorias: '', desafios: '', categoriaDesafio: 'Codificação',
  metas: ['', '', ''], exploracao: '', planosAcao: ['', '', '', '', ''], notasPrivadas: '',
  statusMetasAnteriores: ['', '', ''], resultadosAnteriores: ['', '', '', '', ''],
};

// ── Modo demo (/mentor/demo/encontro): dados de exemplo pra revisão offline ──
const _row = (semana, meta, horas, dom, prog, rev, est, ans, mot, son, disc) => {
  const r = new Array(21).fill('');
  r[0] = semana; r[3] = meta; r[4] = horas; r[5] = dom; r[6] = prog; r[7] = rev;
  r[8] = est; r[9] = ans; r[10] = mot; r[11] = son;
  const d = disc || {};
  r[12] = d.bio?.[0]; r[13] = d.bio?.[1]; r[14] = d.qui?.[0]; r[15] = d.qui?.[1];
  r[16] = d.fis?.[0]; r[17] = d.fis?.[1]; r[18] = d.mat?.[0]; r[19] = d.mat?.[1];
  r[20] = 'auto';
  return r;
};
const DEMO_DATA = {
  nome: 'Maria Silva (exemplo)',
  metaHorasSemanal: '25',
  registros: [
    _row('14/04–20/04', 25, 12, 0.48, 0.30, 8, 0.5, 0.45, 0.6, 0.55, { bio: [0.45, 0.30], qui: [0.35, 0.25], fis: [0.50, 0.35], mat: [0.40, 0.28] }),
    _row('21/04–27/04', 25, 14, 0.50, 0.34, 7, 0.55, 0.50, 0.6, 0.55, { bio: [0.48, 0.33], qui: [0.38, 0.28], fis: [0.52, 0.38], mat: [0.43, 0.30] }),
    _row('28/04–04/05', 25, 16, 0.53, 0.38, 6, 0.55, 0.50, 0.65, 0.6, { bio: [0.50, 0.36], qui: [0.40, 0.30], fis: [0.55, 0.40], mat: [0.45, 0.33] }),
    _row('05/05–11/05', 25, 15, 0.55, 0.40, 5, 0.6, 0.5, 0.7, 0.6, { bio: [0.52, 0.38], qui: [0.42, 0.32], fis: [0.57, 0.42], mat: [0.47, 0.35] }),
    _row('02/06–08/06', 25, 18, 0.59, 0.46, 3, 0.65, 0.55, 0.75, 0.65, { bio: [0.56, 0.42], qui: [0.46, 0.36], fis: [0.61, 0.46], mat: [0.51, 0.39] }),
    _row('09/06–15/06', 25, 21, 0.62, 0.51, 2, 0.7, 0.6, 0.8, 0.7, { bio: [0.60, 0.45], qui: [0.50, 0.40], fis: [0.65, 0.50], mat: [0.55, 0.42] }),
  ],
  semana: (() => {
    const g = HORARIOS.map(() => new Array(7).fill(''));
    const set = (hora, dia, cat, txt) => { g[HORARIOS.indexOf(hora)][DIAS.indexOf(dia)] = `[${cat}] - ${txt}`; };
    ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'].forEach(d => {
      set('08:00', d, 'Revisão', 'Revisão');
      set('09:00', d, 'Codificação', 'Matéria principal');
      set('10:00', d, 'Codificação', 'Matéria principal');
      set('14:00', d, 'Revisão', 'Revisão');
    });
    ['Segunda-feira', 'Quarta-feira', 'Sexta-feira'].forEach(d => set('17:00', d, 'Hábitos', 'Exercício físico'));
    set('15:00', 'Sábado', 'Simulados', 'Simulado completo');
    return g;
  })(),
  diarios: [
    {
      linha: 7,
      data: '2026-05-21',
      autoavaliacao: 3,
      categoria: 'Codificação',
      vitorias: 'Manteve a rotina de manhã a semana toda e fechou a frente de Cinemática.',
      desafios: 'Travou em Química Orgânica e perdeu o ritmo de revisão na quinta/sexta.',
      exploracao: 'Conversamos sobre ansiedade antes dos simulados. Combinamos técnica de respiração.',
      meta: 'Terminar a frente de Cinemática\nFazer 2 simulados de Química\nDormir 7h por noite',
      acoes: ['Resolver a lista 3 de Física', 'Revisar flashcards de Química todo dia', 'Marcar consulta com a nutricionista', '', ''],
      resultados: ['Realizado', 'Realizado Parcialmente', 'Não realizado', '', ''],
      notasPrivadas: 'Parece sobrecarregada com a escola. Sondar com cuidado.',
    },
  ],
};

// Converte a grade 2D (semana[i=hora][j=dia]) no mapa de edição `${dia}_${hora}`.
const gradeFromSemana = (semana) => {
  const g = {};
  (semana || []).forEach((linha, i) => (linha || []).forEach((cel, j) => {
    if (cel && String(cel).trim()) {
      const m = String(cel).match(/\[(.*?)\]/);
      g[`${DIAS[j]}_${HORARIOS[i]}`] = { categoria: m ? m[1] : 'Outros', label: cel };
    }
  }));
  return g;
};

export default function ModoEncontro() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ehDemo = params.id === 'demo';

  const draftKey = `encontro_draft_${params.id}`;

  const [carregando, setCarregando] = useState(true);
  const [nomeAluno, setNomeAluno] = useState(searchParams.get('nome') || '');
  const [historicoDiarios, setHistoricoDiarios] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [grade, setGrade] = useState({});
  const [metaHorasSemanal, setMetaHorasSemanal] = useState('');

  const [stepAtivo, setStepAtivo] = useState('balanco');
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [finalizado, setFinalizado] = useState(false);
  const [confirma, setConfirma] = useState(null);
  const [explorExpandida, setExplorExpandida] = useState(false);
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [modalSemana, setModalSemana] = useState(false);
  const [modalRegistros, setModalRegistros] = useState(false);
  const [salvandoSemana, setSalvandoSemana] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const baseline = useRef(JSON.stringify(FORM_VAZIO));
  const ultimo = historicoDiarios[0] || null;

  const upd = (patch) => setForm(prev => ({ ...prev, ...patch }));
  const updArr = (campo, idx, valor) => setForm(prev => {
    const arr = [...prev[campo]]; arr[idx] = valor; return { ...prev, [campo]: arr };
  });
  const flash = (m) => { setStatusMsg(m); setTimeout(() => setStatusMsg(''), 3000); };

  // ── Carregar dados ──────────────────────────────────────────────────────────
  useEffect(() => {
    const aplicar = (data) => {
      if (data.nome) setNomeAluno(data.nome);
      setRegistros(data.registros || []);
      setGrade(gradeFromSemana(data.semana));
      setMetaHorasSemanal(data.metaHorasSemanal == null ? '' : String(data.metaHorasSemanal));
      const diarios = (data.diarios || []).map(d => ({ ...d, metas: parseMetas(d.meta) }));
      setHistoricoDiarios(diarios);

      const salvo = typeof window !== 'undefined' ? localStorage.getItem(draftKey) : null;
      const ult = diarios[0];
      const resultadosBase = ult ? [0, 1, 2, 3, 4].map(i => String(ult.resultados?.[i] || '')) : ['', '', '', '', ''];
      const inicial = { ...FORM_VAZIO, resultadosAnteriores: resultadosBase };
      if (salvo) {
        try { setForm({ ...inicial, ...JSON.parse(salvo) }); } catch { setForm(inicial); }
      } else { setForm(inicial); }
      baseline.current = JSON.stringify(inicial);
      setStepAtivo(ult ? 'meta-anterior' : 'balanco');
    };

    const carregar = async () => {
      setCarregando(true);
      if (ehDemo) { aplicar(DEMO_DATA); setCarregando(false); return; }
      try {
        const res = await apiFetch('/api/mentor', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'buscarDadosAluno', idPlanilhaAluno: params.id }),
        });
        const data = await res.json();
        if (data.status === 'sucesso') aplicar(data);
      } catch (e) {
        console.error('[encontro] erro ao carregar', e);
      } finally { setCarregando(false); }
    };
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const sujo = useMemo(() => JSON.stringify(form) !== baseline.current, [form]);

  // ── Autosave do diário em localStorage ──────────────────────────────────────
  useEffect(() => {
    if (carregando || finalizado || !sujo) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, JSON.stringify(form)); } catch { /* quota */ }
    }, 600);
    return () => clearTimeout(t);
  }, [form, carregando, finalizado, sujo, draftKey]);

  useEffect(() => {
    const handler = (e) => { if (sujo && !finalizado) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sujo, finalizado]);

  const voltarUrl = ehDemo ? '/mentor' : `/mentor/${params.id}?nome=${encodeURIComponent(nomeAluno)}`;

  const tentarSair = () => {
    if (sujo && !finalizado) {
      setConfirma({
        descricao: 'Você tem um encontro em andamento (salvo como rascunho neste navegador). Sair sem finalizar?',
        onConfirmar: () => router.push(voltarUrl),
      });
    } else { router.push(voltarUrl); }
  };

  const finalizarEncontro = async () => {
    if (salvando) return;
    if (ehDemo) { localStorage.removeItem(draftKey); setFinalizado(true); return; }
    setSalvando(true);
    try {
      const res = await apiFetch('/api/mentor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'salvarNovoEncontro', idPlanilha: params.id, ...form,
          meta: serializeMetas(form.metas),
          statusMetasAnteriores: serializeStatusMetas(form.statusMetasAnteriores),
          autoavaliacao: form.autoavaliacao, acoes: form.planosAcao,
          linhaAnterior: ultimo ? ultimo.linha : null,
          resultadosAnteriores: form.resultadosAnteriores,
        }),
      });
      if (res.ok) { localStorage.removeItem(draftKey); setFinalizado(true); }
      else { setConfirma({ descricao: 'Não consegui salvar o encontro. Tentar de novo?', onConfirmar: () => {} }); }
    } catch (e) {
      setConfirma({ descricao: 'Erro de conexão ao salvar. Seu rascunho está guardado neste navegador. Tentar de novo?', onConfirmar: () => {} });
    } finally { setSalvando(false); }
  };

  const salvarSemana = async () => {
    setSalvandoSemana(true);
    const rotina = Object.entries(grade).map(([k, v]) => {
      const [dia, hora] = k.split('_');
      return { dia, hora, atividade: v ? v.label : '' };
    });
    if (ehDemo) { setSalvandoSemana(false); setModalSemana(false); flash('Semana padrão atualizada (demo).'); return; }
    try {
      await apiFetch('/api/mentor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'salvarSemanaLote', idPlanilhaAluno: params.id, rotina, metaHoras: metaHorasSemanal.trim() }),
      });
      setModalSemana(false); flash('Semana padrão salva!');
    } catch (e) { flash('Erro ao salvar a semana.'); }
    finally { setSalvandoSemana(false); }
  };

  const descartarRascunho = () => {
    setConfirma({
      descricao: 'Descartar tudo que você escreveu neste encontro?',
      onConfirmar: () => {
        localStorage.removeItem(draftKey);
        const resultadosBase = ultimo ? [0, 1, 2, 3, 4].map(i => String(ultimo.resultados?.[i] || '')) : ['', '', '', '', ''];
        const inicial = { ...FORM_VAZIO, resultadosAnteriores: resultadosBase };
        setForm(inicial); baseline.current = JSON.stringify(inicial);
        setStepAtivo(ultimo ? 'meta-anterior' : 'balanco');
      },
    });
  };

  const stepsVisiveis = useMemo(() => STEPS.filter(s => !s.retro || !!ultimo), [ultimo]);
  const idxAtivo = stepsVisiveis.findIndex(s => s.id === stepAtivo);
  const irPara = (delta) => { const novo = stepsVisiveis[idxAtivo + delta]; if (novo) setStepAtivo(novo.id); };

  const snapshot = useMemo(() => {
    if (!registros.length) return null;
    const ult = registros[registros.length - 1];
    const ant = registros.length > 1 ? registros[registros.length - 2] : null;
    const delta = (a, b) => (a != null && b != null) ? a - b : null;
    return {
      semanaLabel: ult[0] || '',
      horas: numOrNull(ult[4]),
      meta: numOrNull(ult[3]),
      dominio: toPercent(ult[5]),
      progresso: toPercent(ult[6]),
      revisoes: numOrNull(ult[7]),
      dDelta: delta(toPercent(ult[5]), ant ? toPercent(ant[5]) : null),
      hDelta: delta(numOrNull(ult[4]), ant ? numOrNull(ant[4]) : null),
    };
  }, [registros]);

  if (carregando) return <LoadingScreen mensagem="Preparando o encontro..." />;

  if (finalizado) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-10 max-w-md w-full text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-intento-blue">Encontro registrado</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">O diário de {nomeAluno || 'do aluno'} já aparece no painel dele e alimenta o acompanhamento da semana.</p>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <button onClick={() => router.push(voltarUrl)} className="w-full bg-intento-blue text-white font-bold py-2.5 rounded-lg hover:bg-intento-blue/90 transition-all text-sm">
              {ehDemo ? 'Voltar' : 'Ver no histórico do aluno'}
            </button>
            <button onClick={() => router.push('/mentor')} className="w-full bg-white border border-slate-200 text-slate-500 font-bold py-2.5 rounded-lg hover:bg-slate-50 transition-all text-sm">
              Voltar para a lista
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* ── Barra superior ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={tentarSair} className="text-sm font-medium text-slate-400 hover:text-intento-blue transition-colors shrink-0">← Sair</button>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-intento-yellow uppercase tracking-wider">Conduzindo encontro</p>
              <h1 className="text-base font-bold text-intento-blue truncate">{nomeAluno || 'Aluno'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
              {sujo
                ? <><svg className="w-3 h-3 animate-spin text-slate-300" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg> rascunho salvo localmente</>
                : <>✓ tudo em rascunho</>}
            </span>
            <button onClick={() => setMostrarPreview(true)} title="Tela limpa pra compartilhar com o aluno"
              className="hidden md:flex items-center gap-1.5 text-[11px] font-semibold text-intento-blue border border-intento-blue/30 rounded-lg px-2.5 py-1 hover:bg-intento-blue/5 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              Vista do aluno
            </button>
            <button onClick={finalizarEncontro} disabled={salvando}
              className="bg-intento-yellow hover:bg-yellow-500 text-white font-bold px-5 py-2 rounded-lg shadow-sm transition-all text-sm disabled:opacity-60">
              {salvando ? 'Salvando...' : 'Finalizar encontro'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[180px_1fr_320px] gap-6">

        {/* ── Roteiro (rail) ───────────────────────────────────────────────── */}
        <nav className="lg:sticky lg:top-20 lg:self-start">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3 hidden lg:block">Roteiro</p>
          <div className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0">
            {stepsVisiveis.map((s) => {
              const ativo = s.id === stepAtivo;
              return (
                <button key={s.id} onClick={() => setStepAtivo(s.id)}
                  className={`text-left rounded-lg px-3 py-2 transition-all shrink-0 lg:w-full border ${ativo ? 'bg-intento-blue text-white border-intento-blue shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-intento-blue/40'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${ativo ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{s.n}</span>
                    <span className="text-xs font-bold whitespace-nowrap lg:whitespace-normal">{s.titulo}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── Centro: passo ativo + Exploração fixa ────────────────────────── */}
        <main className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col">
            <PassoAtivo stepAtivo={stepAtivo} form={form} upd={upd} updArr={updArr} ultimo={ultimo} nomeAluno={nomeAluno} />
            <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between">
              <button onClick={() => irPara(-1)} disabled={idxAtivo <= 0}
                className="text-sm font-semibold text-slate-400 hover:text-intento-blue transition-colors disabled:opacity-30">← Anterior</button>
              <span className="text-[11px] font-medium text-slate-300">{idxAtivo + 1} de {stepsVisiveis.length}</span>
              {idxAtivo < stepsVisiveis.length - 1 ? (
                <button onClick={() => irPara(1)} className="text-sm font-semibold text-intento-blue hover:text-intento-blue/70 transition-colors">Próximo →</button>
              ) : (
                <button onClick={finalizarEncontro} disabled={salvando} className="text-sm font-bold text-intento-yellow hover:text-yellow-600 transition-colors disabled:opacity-50">Finalizar ✓</button>
              )}
            </div>
          </div>

          {/* Exploração — fixa, permeia o encontro todo */}
          <div className="bg-white border-2 border-intento-blue/15 rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-bold text-intento-blue">Exploração</h3>
                <p className="text-[11px] text-slate-400 font-medium">Sempre aberta — anote durante toda a reunião</p>
              </div>
              <button onClick={() => setExplorExpandida(true)}
                className="text-[11px] font-bold text-intento-blue border border-intento-blue/30 rounded-lg px-2.5 py-1 hover:bg-intento-blue/5 transition-all shrink-0">
                expandir ⤢
              </button>
            </div>
            <textarea className={inputClass + ' resize-y'} rows="6"
              placeholder="Espaço livre pra desenvolver os focos do encontro — resumos, descobertas, o que surgir na conversa..."
              value={form.exploracao} onChange={e => upd({ exploracao: e.target.value })} />
          </div>

          <button onClick={descartarRascunho} className="text-[11px] text-slate-300 hover:text-red-400 font-semibold transition-colors">descartar rascunho</button>
        </main>

        {/* ── Painel de contexto (consulta + ações) ────────────────────────── */}
        <aside className="lg:sticky lg:top-20 lg:self-start space-y-4">
          {/* Onde paramos */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Onde paramos</p>
            {!ultimo ? (
              <p className="text-xs text-slate-400 font-medium">Primeiro encontro registrado — sem histórico anterior.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-500">Último encontro · {ultimo.data ? new Date(ultimo.data).toLocaleDateString('pt-BR') : '—'}</p>
                {(ultimo.metas || []).filter(m => String(m || '').trim()).map((m, i) => (
                  <div key={i} className="flex gap-1.5 items-start text-xs text-slate-600">
                    <span className="text-intento-yellow font-black shrink-0">•</span>
                    <span className="font-medium leading-snug">{m}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Snapshot dos números + atalho pro mês */}
          {snapshot && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">📈 Última semana · {snapshot.semanaLabel}</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <Metric label="Horas" valor={snapshot.horas != null ? `${snapshot.horas}h` : '—'} delta={snapshot.hDelta} />
                <Metric label="Domínio" valor={snapshot.dominio != null ? `${snapshot.dominio}%` : '—'} delta={snapshot.dDelta} pct />
                <Metric label="Progresso" valor={snapshot.progresso != null ? `${snapshot.progresso}%` : '—'} />
                <Metric label="Revisões atras." valor={snapshot.revisoes != null ? snapshot.revisoes : '—'} invertido />
              </div>
              <button onClick={() => setModalRegistros(true)}
                className="w-full mt-3 bg-intento-blue/5 text-intento-blue font-bold text-xs py-2 rounded-lg hover:bg-intento-blue/10 transition-all">
                Ver mês, tendência e disciplinas →
              </button>
            </div>
          )}

          {/* Semana Padrão — consulta + edição */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">🗓️ Semana Padrão</p>
              <button onClick={() => setModalSemana(true)} className="text-[11px] font-bold text-intento-blue hover:text-intento-blue/70 transition-colors">Editar ✎</button>
            </div>
            <SemanaHeatmap grade={grade} />
            {metaHorasSemanal && <p className="text-[10px] text-slate-400 font-medium mt-2">Meta de horas: {metaHorasSemanal}h</p>}
          </div>

          {/* Nota privada (fixa) */}
          <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">🔒 Anotação privada</p>
              <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider">Só você vê</span>
            </div>
            <textarea
              className="w-full p-2.5 text-xs font-medium text-slate-700 bg-white border border-amber-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-amber-300"
              rows="4" placeholder="Observações que NÃO aparecem pro aluno..."
              value={form.notasPrivadas} onChange={e => upd({ notasPrivadas: e.target.value })} />
          </div>
        </aside>
      </div>

      {/* ── Exploração fullscreen ─────────────────────────────────────────── */}
      {explorExpandida && (
        <div className="fixed inset-0 z-40 bg-white flex flex-col animate-in fade-in">
          <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-intento-blue">Exploração · {nomeAluno || 'Aluno'}</h2>
              <p className="text-[11px] text-slate-400 font-medium">O texto é o mesmo do painel — salvo no rascunho automaticamente</p>
            </div>
            <button onClick={() => setExplorExpandida(false)}
              className="text-sm font-bold text-intento-blue border border-intento-blue/30 rounded-lg px-3 py-1.5 hover:bg-intento-blue/5 transition-all">recolher ✕</button>
          </div>
          <textarea autoFocus className="flex-1 w-full p-8 text-base font-medium text-slate-700 outline-none resize-none leading-relaxed"
            placeholder="Espaço livre pra desenvolver os focos do encontro..."
            value={form.exploracao} onChange={e => upd({ exploracao: e.target.value })} />
        </div>
      )}

      {mostrarPreview && (
        <PreviewAluno form={form} registros={registros} snapshot={snapshot} nomeAluno={nomeAluno} onClose={() => setMostrarPreview(false)} />
      )}

      {modalSemana && (
        <SemanaModal grade={grade} setGrade={setGrade} metaHoras={metaHorasSemanal} setMetaHoras={setMetaHorasSemanal}
          onSalvar={salvarSemana} salvando={salvandoSemana} onClose={() => setModalSemana(false)} />
      )}
      {modalRegistros && (
        <RegistrosModal registros={registros} onClose={() => setModalRegistros(false)} />
      )}

      {statusMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold ${statusMsg.toLowerCase().includes('erro') ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
          {statusMsg}
        </div>
      )}

      <ConfirmDialog
        aberto={!!confirma}
        titulo="Confirmar"
        descricao={confirma?.descricao || ''}
        textoConfirmar="Confirmar"
        tom="danger"
        onConfirmar={() => { const fn = confirma?.onConfirmar; setConfirma(null); if (fn) fn(); }}
        onCancelar={() => setConfirma(null)}
      />
    </div>
  );
}

// ── Métrica compacta com delta ────────────────────────────────────────────────
function Metric({ label, valor, delta, pct, invertido }) {
  const bom = delta != null && (invertido ? delta < 0 : delta > 0);
  const ruim = delta != null && (invertido ? delta > 0 : delta < 0);
  return (
    <div className="bg-slate-50 rounded-lg p-2">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-bold text-intento-blue">{valor}</span>
        {delta != null && delta !== 0 && (
          <span className={`text-[10px] font-bold ${bom ? 'text-emerald-600' : ruim ? 'text-red-500' : 'text-slate-400'}`}>
            {delta > 0 ? '▲' : '▼'}{Math.abs(delta)}{pct ? '%' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Heatmap compacto da Semana Padrão (read-only) ─────────────────────────────
function SemanaHeatmap({ grade }) {
  const linhas = HORARIOS
    .map(hora => ({ hora, celulas: DIAS.map(dia => grade[`${dia}_${hora}`] || null) }))
    .filter(l => l.celulas.some(Boolean));
  if (!linhas.length) return <p className="text-xs text-slate-400 font-medium mt-2">Nenhuma rotina definida.</p>;
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead><tr>
          <th className="p-0.5"></th>
          {DIAS_CURTO.map(d => <th key={d} className="text-[8px] text-slate-400 font-bold p-0.5">{d}</th>)}
        </tr></thead>
        <tbody>
          {linhas.map(({ hora, celulas }) => (
            <tr key={hora}>
              <td className="text-[8px] text-slate-400 font-bold p-0.5 whitespace-nowrap">{hora}</td>
              {celulas.map((cel, j) => (
                <td key={j} className="p-0.5">
                  <div title={cel?.label || ''} className={`h-3 rounded-sm ${cel ? (CAT_DOT[cel.categoria] || 'bg-slate-300') : 'bg-slate-50'}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Modal: editar a Semana Padrão ─────────────────────────────────────────────
function SemanaModal({ grade, setGrade, metaHoras, setMetaHoras, onSalvar, salvando, onClose }) {
  const [sel, setSel] = useState(null); // `${dia}_${hora}`
  const [cat, setCat] = useState('Codificação');
  const [txt, setTxt] = useState('');

  const selecionar = (key) => {
    setSel(key);
    const atual = grade[key];
    if (atual) {
      setCat(atual.categoria);
      const m = String(atual.label).match(/\] - (.*)$/);
      setTxt(m ? m[1] : '');
    } else { setCat('Codificação'); setTxt(''); }
  };
  const aplicar = () => {
    if (!sel) return;
    const label = `[${cat}] - ${txt.trim() || cat}`;
    setGrade(prev => ({ ...prev, [sel]: { categoria: cat, label } }));
  };
  const limpar = () => {
    if (!sel) return;
    setGrade(prev => { const n = { ...prev }; delete n[sel]; return n; });
  };

  const resumo = Object.values(grade).reduce((acc, v) => { acc[v.categoria] = (acc[v.categoria] || 0) + 1; return acc; }, {});

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-intento-blue">Editar Semana Padrão</h2>
            <p className="text-[11px] text-slate-400 font-medium">Clique numa célula pra definir a atividade</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <table className="w-full border-collapse">
            <thead><tr>
              <th className="text-[9px] text-slate-300 p-1"></th>
              {DIAS_CURTO.map(d => <th key={d} className="text-[10px] text-slate-500 font-bold p-1">{d}</th>)}
            </tr></thead>
            <tbody>
              {HORARIOS.map(hora => (
                <tr key={hora}>
                  <td className="text-[9px] text-slate-400 font-bold p-1 whitespace-nowrap">{hora}</td>
                  {DIAS.map(dia => {
                    const key = `${dia}_${hora}`;
                    const cel = grade[key];
                    const selecionado = sel === key;
                    return (
                      <td key={key} className="p-0.5">
                        <button onClick={() => selecionar(key)} title={cel?.label || ''}
                          className={`w-full h-7 rounded text-[8px] font-bold border transition-all ${selecionado ? 'ring-2 ring-intento-blue ring-offset-1' : ''} ${cel ? CAT_COR[cel.categoria] : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                          {cel ? cel.categoria.slice(0, 3) : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Editor da célula selecionada */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50">
          {!sel ? (
            <p className="text-xs text-slate-400 font-medium text-center">Selecione uma célula acima para editar.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] font-bold text-intento-blue">{sel.replace('_', ' · ')}</p>
              <div className="flex flex-wrap gap-1.5">
                {EDIT_CATEGORIAS.map(c => (
                  <button key={c} onClick={() => setCat(c)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-md border transition-all ${cat === c ? CAT_COR[c] + ' ring-1 ring-intento-blue/40' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                    {c}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={txt} onChange={e => setTxt(e.target.value)} placeholder="Descrição (ex: Matéria principal)"
                  className="flex-1 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue" />
                <button onClick={aplicar} className="bg-intento-blue text-white font-bold text-xs px-4 rounded-lg hover:bg-intento-blue/90 transition-all">Aplicar</button>
                <button onClick={limpar} className="bg-white border border-slate-200 text-slate-500 font-bold text-xs px-3 rounded-lg hover:bg-red-50 hover:text-red-500 transition-all">Limpar</button>
              </div>
            </div>
          )}
        </div>

        {/* Meta de horas estudadas (manual) */}
        <div className="border-t border-slate-200 px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <label className="text-xs font-bold text-intento-blue whitespace-nowrap">Meta de horas estudadas / semana</label>
          <div className="flex items-center gap-2">
            <input type="number" min="0" step="1" value={metaHoras}
              onChange={e => setMetaHoras(e.target.value)} placeholder="ex: 25"
              className="w-24 p-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue text-center font-semibold" />
            <span className="text-xs text-slate-400 font-medium">horas</span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium sm:ml-auto">Vazio = cálculo automático pela grade.</p>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(resumo).map(([c, n]) => (
              <span key={c} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CAT_COR[c] || 'bg-slate-100'}`}>{c}: {n}h</span>
            ))}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-700 transition-colors">Cancelar</button>
            <button onClick={onSalvar} disabled={salvando} className="bg-intento-yellow hover:bg-yellow-500 text-white font-bold text-sm px-6 py-2 rounded-lg transition-all disabled:opacity-60">
              {salvando ? 'Salvando...' : 'Salvar semana'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Modal: consulta de registros (mês, tendência, disciplinas) ────────────────
function RegistrosModal({ registros, onClose }) {
  const ult = registros[registros.length - 1];
  const primeiro = registros[0];
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-intento-blue">Registros — mês e tendência</h2>
            <p className="text-[11px] text-slate-400 font-medium">{registros.length} semana(s) · consulta durante o encontro</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Disciplinas: domínio e progresso (último registro, delta vs início) */}
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Por disciplina · domínio e progresso</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {DISCIPLINAS.map(d => {
                const dom = ult ? toPercent(ult[d.dCol]) : null;
                const prog = ult ? toPercent(ult[d.pCol]) : null;
                const domIni = primeiro ? toPercent(primeiro[d.dCol]) : null;
                const dDelta = (dom != null && domIni != null) ? dom - domIni : null;
                return (
                  <div key={d.key} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-intento-blue">{d.label}</span>
                      {dDelta != null && dDelta !== 0 && (
                        <span className={`text-[10px] font-bold ${dDelta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{dDelta > 0 ? '▲' : '▼'}{Math.abs(dDelta)}% no período</span>
                      )}
                    </div>
                    <Barra label="Domínio" valor={dom} cor={d.cor} />
                    <Barra label="Progresso" valor={prog} cor="bg-slate-300" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tabela completa de semanas */}
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">Histórico semanal</p>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-[10px] text-slate-500 uppercase tracking-wide">
                    <th className="text-left font-bold p-2.5">Semana</th>
                    <th className="font-bold p-2.5">Horas</th>
                    <th className="font-bold p-2.5">Meta</th>
                    <th className="font-bold p-2.5">Domínio</th>
                    <th className="font-bold p-2.5">Progresso</th>
                    <th className="font-bold p-2.5">Revisões</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="text-left p-2.5 font-semibold text-slate-700 whitespace-nowrap">{r[0] || '—'}</td>
                      <td className="text-center p-2.5 text-slate-600">{numOrNull(r[4]) ?? '—'}h</td>
                      <td className="text-center p-2.5 text-slate-400">{numOrNull(r[3]) ?? '—'}h</td>
                      <td className="text-center p-2.5 font-bold text-intento-blue">{toPercent(r[5]) != null ? `${toPercent(r[5])}%` : '—'}</td>
                      <td className="text-center p-2.5 font-bold text-emerald-600">{toPercent(r[6]) != null ? `${toPercent(r[6])}%` : '—'}</td>
                      <td className="text-center p-2.5 text-slate-600">{numOrNull(r[7]) ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Barra({ label, valor, cor }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-[10px] font-semibold mb-1">
        <span className="text-slate-400 uppercase tracking-wide">{label}</span>
        <span className="text-slate-600">{valor != null ? `${valor}%` : '—'}</span>
      </div>
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${valor || 0}%` }} />
      </div>
    </div>
  );
}

// ── Vista do aluno: prévia ao vivo do que vai pro /painel (sem nota privada) ──
function BigStat({ label, valor }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className="text-xl font-bold text-intento-blue">{valor}</p>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  );
}
function PreviewBloco({ titulo, texto }) {
  return (
    <div className="bg-slate-50 border border-slate-100 rounded-lg p-4">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{titulo}</p>
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{String(texto || '').trim() || '—'}</p>
    </div>
  );
}
function PreviewAluno({ form, registros, snapshot, nomeAluno, onClose }) {
  const metas = (form.metas || []).filter(m => String(m || '').trim());
  const metaPrincipal = metas[0] || null;
  const planos = (form.planosAcao || []).filter(p => String(p || '').trim());
  const ult = registros[registros.length - 1];
  return (
    <div className="fixed inset-0 z-40 bg-slate-50 flex flex-col animate-in fade-in">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold text-intento-yellow uppercase tracking-wider shrink-0">Vista do aluno</span>
          <span className="text-xs text-slate-400 font-medium truncate">· {nomeAluno || 'Aluno'} · prévia ao vivo (ainda não salvo)</span>
        </div>
        <button onClick={onClose} className="text-sm font-bold text-intento-blue border border-intento-blue/30 rounded-lg px-3 py-1.5 hover:bg-intento-blue/5 transition-all shrink-0">fechar prévia ✕</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {/* Meta principal */}
          <div className="bg-intento-blue rounded-2xl p-8 text-center text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80 mb-3">Meta Principal</p>
            <p className="text-2xl md:text-4xl font-bold leading-tight">{metaPrincipal || 'A definir neste encontro'}</p>
          </div>

          {/* Números */}
          {snapshot && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Sua semana · {snapshot.semanaLabel}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <BigStat label="Horas" valor={snapshot.horas != null ? `${snapshot.horas}h` : '—'} />
                <BigStat label="Domínio" valor={snapshot.dominio != null ? `${snapshot.dominio}%` : '—'} />
                <BigStat label="Progresso" valor={snapshot.progresso != null ? `${snapshot.progresso}%` : '—'} />
                <BigStat label="Revisões atras." valor={snapshot.revisoes != null ? snapshot.revisoes : '—'} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {DISCIPLINAS.map(d => (
                  <div key={d.key}>
                    <p className="text-xs font-bold text-slate-600 mb-1.5">{d.label}</p>
                    <Barra label="Domínio" valor={ult ? toPercent(ult[d.dCol]) : null} cor={d.cor} />
                    <Barra label="Progresso" valor={ult ? toPercent(ult[d.pCol]) : null} cor="bg-slate-300" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card do encontro */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-intento-blue">Resumo do encontro</h3>
              <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(n => <span key={n} className={`text-base ${n <= form.autoavaliacao ? 'text-intento-yellow' : 'text-slate-200'}`}>★</span>)}</div>
            </div>
            {form.categoriaDesafio && (
              <span className={`inline-flex text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${CAT_COR[form.categoriaDesafio] || 'bg-slate-100 text-slate-700'}`}>Foco: {form.categoriaDesafio}</span>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PreviewBloco titulo="Vitórias" texto={form.vitorias} />
              <PreviewBloco titulo="Maiores desafios" texto={form.desafios} />
            </div>
            {String(form.exploracao || '').trim() && <PreviewBloco titulo="Exploração" texto={form.exploracao} />}
            {metas.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 border-l-4 border-l-intento-yellow rounded-lg p-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Metas para o próximo encontro</p>
                {metas.map((m, i) => <p key={i} className="text-sm font-semibold text-slate-700 leading-relaxed">• {m}</p>)}
              </div>
            )}
            {planos.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Plano de Ação</p>
                <div className="space-y-2">
                  {planos.map((p, i) => (
                    <div key={i} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 flex items-center gap-3">
                      <span className="w-5 h-5 rounded-full bg-intento-blue text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-sm text-slate-700 font-medium">{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Conteúdo de cada passo ────────────────────────────────────────────────────
function PassoAtivo({ stepAtivo, form, upd, updArr, ultimo, nomeAluno }) {
  const step = STEPS.find(s => s.id === stepAtivo);
  if (!step) return null;
  const Cabecalho = () => (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-full bg-intento-blue text-white text-xs font-black flex items-center justify-center">{step.n}</span>
        <h2 className="text-lg font-bold text-intento-blue">{step.titulo}</h2>
      </div>
      <p className="text-xs text-slate-400 font-medium mt-1 ml-9">{step.sub}</p>
    </div>
  );

  if (stepAtivo === 'meta-anterior') {
    const metasAnteriores = (ultimo?.metas || []).map((m, idx) => ({ idx, meta: m })).filter(x => String(x.meta || '').trim());
    return (
      <div className="flex-1">
        <Cabecalho />
        {metasAnteriores.length === 0 ? (
          <p className="text-sm text-slate-400 font-medium">O último encontro não deixou metas registradas.</p>
        ) : (
          <div className="space-y-3">
            {metasAnteriores.map(({ idx, meta }) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row gap-3 md:items-center">
                <div className="flex gap-2 items-start flex-1">
                  <span className="w-6 h-6 shrink-0 bg-intento-blue/10 text-intento-blue rounded-md flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                  <span className="text-sm font-semibold text-slate-800 leading-relaxed">{meta}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {STATUS_META_OPCOES.map(opt => {
                    const ativo = form.statusMetasAnteriores[idx] === opt;
                    return (
                      <button key={opt} type="button" onClick={() => updArr('statusMetasAnteriores', idx, ativo ? '' : opt)}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-md uppercase tracking-wide transition-all ${ativo ? COR_STATUS_META[opt] + ' ring-2 ring-offset-1 ring-intento-blue/40' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (stepAtivo === 'plano-anterior') {
    const acoes = (ultimo?.acoes || []).map((a, idx) => ({ idx, acao: a })).filter(x => String(x.acao || '').trim());
    return (
      <div className="flex-1">
        <Cabecalho />
        {acoes.length === 0 ? (
          <p className="text-sm text-slate-400 font-medium">O último encontro não deixou plano de ação registrado.</p>
        ) : (
          <div className="space-y-3">
            {acoes.map(({ idx, acao }) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col md:flex-row gap-3 md:items-center">
                <div className="flex gap-2 items-start flex-1">
                  <span className="w-6 h-6 shrink-0 bg-amber-100 text-amber-800 rounded-md flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                  <span className="text-sm font-semibold text-slate-800 leading-relaxed">{acao}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {RESULTADO_OPCOES.map(opt => {
                    const ativo = form.resultadosAnteriores[idx] === opt;
                    return (
                      <button key={opt} type="button" onClick={() => updArr('resultadosAnteriores', idx, ativo ? '' : opt)}
                        className={`text-[10px] font-bold px-3 py-1.5 rounded-md uppercase tracking-wide transition-all ${ativo ? COR_RESULTADO[opt] + ' ring-2 ring-offset-1 ring-amber-400' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (stepAtivo === 'balanco') {
    return (
      <div className="flex-1 space-y-5">
        <Cabecalho />
        <div className="bg-slate-50 rounded-lg p-4 flex items-center justify-between gap-3">
          <label className={labelClass}>Autoavaliação do aluno</label>
          <StarRating rating={form.autoavaliacao} setRating={(v) => upd({ autoavaliacao: v })} />
        </div>
        <div>
          <label className={labelClass}>Vitórias da semana</label>
          <textarea className={inputClass + ' mt-2'} rows="4" placeholder="O que correu bem?" value={form.vitorias} onChange={e => upd({ vitorias: e.target.value })} />
        </div>
        <div>
          <label className={labelClass}>Maiores desafios</label>
          <textarea className={inputClass + ' mt-2'} rows="4" placeholder="Onde o aluno travou?" value={form.desafios} onChange={e => upd({ desafios: e.target.value })} />
        </div>
      </div>
    );
  }

  if (stepAtivo === 'foco') {
    return (
      <div className="flex-1">
        <Cabecalho />
        <p className="text-sm text-slate-500 font-medium mb-4">Qual a categoria do desafio central deste encontro?</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CATEGORIAS_DESAFIO.map(c => {
            const ativo = form.categoriaDesafio === c;
            return (
              <button key={c} type="button" onClick={() => upd({ categoriaDesafio: c })}
                className={`rounded-xl border-2 px-3 py-4 text-sm font-bold transition-all ${ativo ? CAT_COR[c] + ' ring-2 ring-offset-1 ring-intento-blue/30' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                {c}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (stepAtivo === 'meta-proxima') {
    return (
      <div className="flex-1">
        <Cabecalho />
        <p className="text-xs text-slate-400 font-medium mb-3">Até 3 metas. Aparecem como destaque no painel do aluno e no acompanhamento da semana.</p>
        <div className="space-y-3">
          {[0, 1, 2].map(idx => (
            <div key={idx} className="flex gap-2 items-center">
              <div className="w-8 h-8 shrink-0 bg-intento-blue/10 text-intento-blue rounded-md flex items-center justify-center text-sm font-bold">{idx + 1}</div>
              <input type="text" className={inputClass} placeholder={idx === 0 ? 'Qual a grande meta da semana?' : 'Meta opcional'}
                value={form.metas[idx]} onChange={e => updArr('metas', idx, e.target.value)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (stepAtivo === 'plano-proximo') {
    return (
      <div className="flex-1">
        <Cabecalho />
        <p className="text-xs text-slate-400 font-medium mb-3">Passos práticos. O aluno marca cada um como feito no painel dele.</p>
        <div className="space-y-3">
          {form.planosAcao.map((p, i) => (
            <div key={i} className="flex gap-3 items-center">
              <div className="w-9 h-9 shrink-0 bg-intento-blue rounded-lg flex items-center justify-center font-bold text-white text-sm">{i + 1}</div>
              <input type="text" className={inputClass} placeholder={`Descreva o ${i + 1}º passo prático...`}
                value={p} onChange={e => updArr('planosAcao', i, e.target.value)} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
