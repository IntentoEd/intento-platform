'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Line } from '@/components/Charts';
import { LoadingScreen, LoadingInline } from '@/components/Loading';

// ── Colunas do histórico (índices da array retornada pelo backend) ──────────
// [0]Semana [1]Mês [2]Data [3]Meta [4]Horas [5]Domínio [6]Progresso [7]Revisões
// [8]Estresse [9]Ansiedade [10]Motivação [11]Sono
// [12]D.BIO [13]P.BIO [14]D.QUI [15]P.QUI [16]D.FIS [17]P.FIS [18]D.MAT [19]P.MAT

// Colunas que chegam como decimal (0–1) e devem ser exibidas como %
const COLUNAS_PERCENT = new Set([5, 6, 12, 13, 14, 15, 16, 17, 18, 19]);

const toPercent = (val) => {
  const n = parseFloat(String(val ?? '').replace(',', '.'));
  if (isNaN(n)) return null;
  // Se já for maior que 1, assume que veio formatado (ex: 68 = 68%)
  return n <= 1 ? Math.round(n * 100) : Math.round(n);
};

const VISOES = [
  { id: 'geral',      label: 'Geral',       cols: [0, 3, 4, 5, 6, 7] },
  { id: 'emocional',  label: 'Emocional',   cols: [0, 8, 9, 10, 11] },
  { id: 'disciplinas',label: 'Disciplinas', cols: [0, 12, 13, 14, 15, 16, 17, 18, 19] },
];

const COL_LABELS = [
  'Semana','Mês','Data','Meta','Horas','Domínio (%)','Progresso (%)','Revisões Atras.',
  'Estresse','Ansiedade','Motivação','Sono',
  'D. BIO','P. BIO','D. QUI','P. QUI','D. FIS','P. FIS','D. MAT','P. MAT',
];

const COL_COLORS = [
  '','','','','','','','',
  '','','','',
  'text-emerald-600','text-emerald-600','text-blue-500','text-blue-500',
  'text-orange-500','text-orange-500','text-purple-500','text-purple-500',
];

function valorColor() {
  return '';
}

// Datasets por visão para o gráfico temporal
// Para a visão "geral", yAxisID separa escalas: yPercent (0-100%) e yRaw (valores brutos)
const CHART_VISOES = {
  geral: [
    { label: 'Domínio (%)',      col: 5,  color: '#D4B726', yAxisID: 'yPercent' },
    { label: 'Progresso (%)',    col: 6,  color: '#10b981', yAxisID: 'yPercent' },
    { label: 'Horas Estudadas',  col: 4,  color: '#060242', yAxisID: 'yRaw' },
    { label: 'Meta Semanal',     col: 3,  color: '#94a3b8', yAxisID: 'yRaw' },
    { label: 'Revisões Atras.',  col: 7,  color: '#f87171', yAxisID: 'yRaw' },
  ],
  emocional: [
    { label: 'Estresse',   col: 8,  color: '#f87171' },
    { label: 'Ansiedade',  col: 9,  color: '#fb923c' },
    { label: 'Motivação',  col: 10, color: '#10b981' },
    { label: 'Sono',       col: 11, color: '#a855f7' },
  ],
  disciplinas: [
    { label: 'Biologia',   col: 12, color: '#10b981' },
    { label: 'Química',    col: 14, color: '#3b82f6' },
    { label: 'Física',     col: 16, color: '#fb923c' },
    { label: 'Matemática', col: 18, color: '#a855f7' },
  ],
};

function GraficoTemporal({ registros, visao }) {
  const labels = registros.map(r => r[0] || '');
  const series = CHART_VISOES[visao] || CHART_VISOES.geral;

  const isGeral = visao === 'geral';

  const data = {
    labels,
    datasets: series.map(s => ({
      label: s.label,
      data: registros.map(r => {
        if (COLUNAS_PERCENT.has(s.col)) return toPercent(r[s.col]);
        const v = parseFloat(String(r[s.col] ?? '').replace(',', '.'));
        return isNaN(v) ? null : v;
      }),
      borderColor: s.color,
      backgroundColor: s.color + '18',
      pointBackgroundColor: s.color,
      pointRadius: registros.length <= 8 ? 4 : 2,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.35,
      fill: false,
      spanGaps: true,
      ...(isGeral && s.yAxisID ? { yAxisID: s.yAxisID } : {}),
    })),
  };

  const axisBase = {
    grid: { color: '#f1f5f9' },
    ticks: {
      font: { size: 10, family: 'ui-sans-serif, system-ui, sans-serif' },
      color: '#94a3b8',
      padding: 8,
    },
    border: { display: false, dash: [4, 4] },
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'end',
        labels: {
          boxWidth: 8,
          boxHeight: 8,
          borderRadius: 4,
          useBorderRadius: true,
          font: { size: 11, family: 'ui-sans-serif, system-ui, sans-serif', weight: '600' },
          color: '#64748b',
          padding: 16,
        },
      },
      tooltip: {
        backgroundColor: '#0f172a',
        titleColor: '#94a3b8',
        bodyColor: '#f1f5f9',
        padding: 12,
        cornerRadius: 8,
        titleFont: { size: 11 },
        bodyFont: { size: 12, weight: '600' },
        callbacks: {
          label: (ctx) => {
            const s = series[ctx.datasetIndex];
            const suffix = COLUNAS_PERCENT.has(s.col) ? '%' : '';
            return ` ${ctx.dataset.label}: ${ctx.parsed.y ?? '—'}${suffix}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          font: { size: 10, family: 'ui-sans-serif, system-ui, sans-serif' },
          color: '#94a3b8',
          maxRotation: 35,
          maxTicksLimit: 12,
        },
        border: { display: false },
      },
      ...(isGeral ? {
        yPercent: {
          ...axisBase,
          type: 'linear',
          position: 'left',
          min: 0,
          max: 100,
          ticks: {
            ...axisBase.ticks,
            callback: (v) => v + '%',
          },
          title: {
            display: true,
            text: 'Domínio / Progresso',
            font: { size: 9, weight: '600' },
            color: '#94a3b8',
          },
        },
        yRaw: {
          ...axisBase,
          type: 'linear',
          position: 'right',
          grid: { display: false },
          ticks: {
            ...axisBase.ticks,
            color: '#cbd5e1',
          },
          title: {
            display: true,
            text: 'Horas / Revisões',
            font: { size: 9, weight: '600' },
            color: '#cbd5e1',
          },
        },
      } : {
        y: {
          ...axisBase,
        },
      }),
    },
  };

  return (
    <div style={{ height: 220 }}>
      <Line data={data} options={options} />
    </div>
  );
}

const EDIT_FIELDS = [
  { idx: 0,  label: 'Semana',        type: 'text' },
  { idx: 1,  label: 'Mês',           type: 'text' },
  { idx: 2,  label: 'Data',          type: 'date' },
  { idx: 3,  label: 'Meta (h)',       type: 'number' },
  { idx: 4,  label: 'Horas Estudadas', type: 'number' },
  { idx: 5,  label: 'Domínio (0–1)',  type: 'number', step: '0.01' },
  { idx: 6,  label: 'Progresso (0–1)', type: 'number', step: '0.01' },
  { idx: 7,  label: 'Revisões Atras.', type: 'number' },
  { idx: 8,  label: 'Estresse (1–10)', type: 'number' },
  { idx: 9,  label: 'Ansiedade (1–10)', type: 'number' },
  { idx: 10, label: 'Motivação (1–10)', type: 'number' },
  { idx: 11, label: 'Sono (h)',       type: 'number' },
  { idx: 12, label: 'Domínio BIO',   type: 'number', step: '0.01' },
  { idx: 13, label: 'Prog. BIO',     type: 'number', step: '0.01' },
  { idx: 14, label: 'Domínio QUI',   type: 'number', step: '0.01' },
  { idx: 15, label: 'Prog. QUI',     type: 'number', step: '0.01' },
  { idx: 16, label: 'Domínio FIS',   type: 'number', step: '0.01' },
  { idx: 17, label: 'Prog. FIS',     type: 'number', step: '0.01' },
  { idx: 18, label: 'Domínio MAT',   type: 'number', step: '0.01' },
  { idx: 19, label: 'Prog. MAT',     type: 'number', step: '0.01' },
];

function HistoricoAnalitico({ registros, cardClass, idPlanilha, onUpdate }) {
  const [visao, setVisao] = useState('geral');
  const [editIdx, setEditIdx] = useState(null);
  const [formEdit, setFormEdit] = useState({});
  const [salvando, setSalvando] = useState(false);

  const cols = VISOES.find(v => v.id === visao)?.cols || VISOES[0].cols;

  const abrirEdit = (i) => {
    const row = registros[i];
    const form = {};
    EDIT_FIELDS.forEach(f => { form[f.idx] = row[f.idx] ?? ''; });
    setFormEdit(form);
    setEditIdx(i);
  };

  const salvarEdit = async () => {
    if (salvando) return;
    setSalvando(true);
    const novaRow = registros[editIdx].map((_, ci) => formEdit[ci] !== undefined ? formEdit[ci] : registros[editIdx][ci]);
    try {
      await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'editarRegistro', idPlanilha, semana: registros[editIdx][0], dataRegistro: registros[editIdx][2], valores: novaRow }),
      });
      onUpdate?.(editIdx, novaRow);
      setEditIdx(null);
    } catch { /* silencia */ }
    finally { setSalvando(false); }
  };

  if (!registros || registros.length === 0) {
    return (
      <div className={cardClass + ' text-center py-12 text-slate-400 text-sm font-medium'}>
        Nenhum registro encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in">

      {/* ── Gráfico temporal ── */}
      <div className={cardClass}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-sm font-bold text-intento-blue">Evolução Temporal</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {registros.length} semana{registros.length !== 1 ? 's' : ''} registrada{registros.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex bg-slate-100 rounded-lg p-1 gap-1">
            {VISOES.map(v => (
              <button key={v.id} onClick={() => setVisao(v.id)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${visao === v.id ? 'bg-white text-intento-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
        <GraficoTemporal registros={registros} visao={visao} />
      </div>

      {/* ── Tabela de dados brutos ── */}
      <div className={cardClass + ' overflow-hidden'}>
        <h2 className="text-sm font-bold text-intento-blue mb-4">Dados Brutos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {cols.map(ci => (
                  <th key={ci} className={`p-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${ci === 0 ? 'sticky left-0 bg-slate-50' : ''} ${COL_COLORS[ci] || 'text-slate-400'}`}>
                    {COL_LABELS[ci]}
                  </th>
                ))}
                <th className="p-3 text-[10px] font-bold uppercase tracking-wider text-slate-300"></th>
              </tr>
            </thead>
            <tbody>
              {registros.map((reg, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                  {cols.map((ci) => (
                    <td key={ci} className={`p-3 whitespace-nowrap ${ci === 0 ? 'sticky left-0 bg-white font-bold text-intento-blue text-xs' : `font-medium ${valorColor(ci, reg[ci]) || 'text-slate-600'}`}`}>
                      {COLUNAS_PERCENT.has(ci)
                        ? (toPercent(reg[ci]) !== null ? `${toPercent(reg[ci])}%` : '—')
                        : (reg[ci] ?? '—')}
                    </td>
                  ))}
                  <td className="p-3">
                    <button onClick={() => abrirEdit(i)} className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-intento-blue" title="Editar registro">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal de edição ── */}
      {editIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-lg flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h2 className="text-sm font-semibold text-intento-blue">Editar Registro — {registros[editIdx][0]}</h2>
              <button onClick={() => setEditIdx(null)} className="text-slate-300 hover:text-slate-500 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="overflow-y-auto p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {EDIT_FIELDS.map(f => (
                  <div key={f.idx}>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">{f.label}</label>
                    <input
                      type={f.type}
                      step={f.step || undefined}
                      className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-medium text-intento-blue outline-none focus:ring-2 focus:ring-intento-blue"
                      value={formEdit[f.idx] ?? ''}
                      onChange={e => setFormEdit(prev => ({ ...prev, [f.idx]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              <button onClick={() => setEditIdx(null)} className="px-5 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">Cancelar</button>
              <button onClick={salvarEdit} disabled={salvando} className="px-5 py-2 rounded-lg bg-intento-blue text-white text-sm font-semibold hover:bg-blue-900 transition-all disabled:opacity-60">
                {salvando ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- ESTÉTICA INTENTO ---
const cardClass = "bg-white rounded-xl border border-slate-200 p-6 shadow-sm transition-colors";
const inputClass = "w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue transition-all font-medium text-intento-blue";
const labelClass = "block text-xs font-medium text-slate-400 uppercase mb-2 tracking-wider";

// --- CONSTANTES ---
const DIAS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
const HORARIOS = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
const CATEGORIAS = {
  'Codificação': { cor: 'bg-blue-100 text-blue-800 border-blue-200',    btn: 'bg-blue-500 hover:bg-blue-600 text-white',    dot: 'bg-blue-500'    },
  'Revisão':     { cor: 'bg-emerald-100 text-emerald-800 border-emerald-200', btn: 'bg-emerald-500 hover:bg-emerald-600 text-white', dot: 'bg-emerald-500' },
  'Hábitos':     { cor: 'bg-yellow-100 text-yellow-800 border-yellow-200',  btn: 'bg-yellow-500 hover:bg-yellow-600 text-white',  dot: 'bg-yellow-500'  },
  'Simulados':   { cor: 'bg-red-100 text-red-800 border-red-200',          btn: 'bg-red-500 hover:bg-red-600 text-white',          dot: 'bg-red-500'    },
  'Outros':      { cor: 'bg-slate-100 text-slate-800 border-slate-200',    btn: 'bg-slate-400 hover:bg-slate-500 text-white',    dot: 'bg-slate-400'   },
};

const TEMPLATE_BASE = (() => {
  const dias = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const exercicio = new Set(['Segunda-feira', 'Quarta-feira', 'Sexta-feira']);
  const tpl = {};
  dias.forEach(dia => {
    tpl[`${dia}_08:00`] = { categoria: 'Revisão',     label: '[Revisão] - Revisão' };
    tpl[`${dia}_09:00`] = { categoria: 'Codificação', label: '[Codificação] - Matéria principal' };
    tpl[`${dia}_10:00`] = { categoria: 'Codificação', label: '[Codificação] - Matéria principal' };
    tpl[`${dia}_11:00`] = { categoria: 'Codificação', label: '[Codificação] - Matéria principal' };
    tpl[`${dia}_14:00`] = { categoria: 'Revisão',     label: '[Revisão] - Revisão' };
    tpl[`${dia}_15:00`] = { categoria: 'Codificação', label: '[Codificação] - Matéria principal' };
    tpl[`${dia}_16:00`] = { categoria: 'Codificação', label: '[Codificação] - Matéria principal' };
    if (exercicio.has(dia)) {
      tpl[`${dia}_17:00`] = { categoria: 'Hábitos',   label: '[Hábitos] - Exercício Físico' };
    }
  });
  return tpl;
})();

// As opções restritas para o Diário
const CATEGORIAS_DESAFIO = ['Codificação', 'Revisão', 'Hábitos', 'Prova'];

// COMPONENTE: Estrelas de Avaliação
const StarRating = ({ rating, setRating, readOnly = false, small = false }) => {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => !readOnly && setRating(star)}
          className={`${small ? 'text-sm' : 'text-3xl'} transition-transform ${star <= rating ? 'text-intento-yellow' : 'text-slate-200'} ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
        >
          ★
        </button>
      ))}
    </div>
  );
};

export default function GestaoIndividualAluno() {
  const params = useParams();
  const searchParams = useSearchParams();
  const nomeAluno = searchParams.get('nome');
  const router = useRouter();

  const [carregando, setCarregando] = useState(true);
  const [historicoDiarios, setHistoricoDiarios] = useState([]);
  const [historicoRegistros, setHistoricoRegistros] = useState([]);
  const [abaInterna, setAbaInterna] = useState('diario');
  const [statusMsg, setStatusMsg] = useState("");
  const [salvandoEncontro, setSalvandoEncontro] = useState(false);
  const [gradeModificada, setGradeModificada] = useState(false);
  const [salvandoRotina, setSalvandoRotina] = useState(false);
  const [dadosOnboarding, setDadosOnboarding] = useState(null);
  const [carregandoOnboarding, setCarregandoOnboarding] = useState(false);
  const [erroOnboarding, setErroOnboarding] = useState('');

  // ESTADOS DO DIÁRIO
  const [avaliacaoPendente, setAvaliacaoPendente] = useState(false);
  const [encontroPendente, setEncontroPendente] = useState(null);
  const [formAvaliacao, setFormAvaliacao] = useState(["", "", "", "", ""]);
  const [expandidoId, setExpandidoId] = useState(null); 
  
  // O Estado do Modal
  const [modalAberto, setModalAberto] = useState(false);
  const [metaPassada, setMetaPassada] = useState("");

  // Edição de encontro do diário
  const [encontroEdit, setEncontroEdit] = useState(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [formDiario, setFormDiario] = useState({
    autoavaliacao: 0, vitorias: "", desafios: "", categoriaDesafio: "Codificação",
    meta: "", exploracao: "", planosAcao: ["", "", "", "", ""]
  });

  const [grade, setGrade] = useState({});
  const [gradeHistorico, setGradeHistorico] = useState([]); // stack de undo
  const [selecaoAtual, setSelecaoAtual] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [configSemana, setConfigSemana] = useState({ categoria: 'Codificação', detalhe: '', foco: false });

  const iniciarSelecao = (id) => { setIsDragging(true); setSelecaoAtual([id]); };
  const passarMouse = (id) => { if (isDragging && !selecaoAtual.includes(id)) setSelecaoAtual(prev => [...prev, id]); };
  const finalizarSelecao = () => setIsDragging(false);

  // Undo: salva estado anterior e reverte
  const pushHistorico = (g) => setGradeHistorico(prev => [...prev.slice(-19), g]);
  const desfazer = () => {
    if (gradeHistorico.length === 0) return;
    const anterior = gradeHistorico[gradeHistorico.length - 1];
    setGrade(anterior);
    setGradeHistorico(prev => prev.slice(0, -1));
  };

  // Resumo de horas por categoria
  const resumoHoras = Object.values(grade).reduce((acc, item) => {
    if (!item) return acc;
    acc[item.categoria] = (acc[item.categoria] || 0) + 1;
    return acc;
  }, {});

  // =========================================================================
  // CARREGAR DADOS DO GOOGLE
  // =========================================================================
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape' && modalAberto) setModalAberto(false); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [modalAberto]);

  useEffect(() => {
    const carregarDados = async () => {
      setCarregando(true);
      try {
        const res = await fetch('/api/mentor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'buscarDadosAluno', idPlanilhaAluno: params.id })
        });
        const data = await res.json();
        
        if (data.status === 'sucesso') {
          // GRADE DA SEMANA
          const novaGrade = {};
          if (data.semana && data.semana.length > 0) {
            data.semana.forEach((linha, i) => {
              linha.forEach((celula, j) => {
                if (celula && celula.trim() !== "") {
                  const match = celula.match(/\[(.*?)\]/);
                  novaGrade[`${DIAS[j]}_${HORARIOS[i]}`] = { categoria: match ? match[1] : 'Outros', label: celula };
                }
              });
            });
          }
          setGrade(novaGrade);
          setHistoricoRegistros(data.registros || []);

          // DIÁRIOS
          const diariosCarregados = data.diarios || [];
          setHistoricoDiarios(diariosCarregados);

          if (diariosCarregados.length > 0) {
            const ultimo = diariosCarregados[0];
            setMetaPassada(ultimo.meta || ""); // Puxa a meta antiga para o Placeholder
            
            let precisaAvaliar = false;
            for (let i = 0; i < 5; i++) {
              if (String(ultimo.acoes[i] || "").trim() !== "" && String(ultimo.resultados[i] || "").trim() === "") {
                precisaAvaliar = true; break;
              }
            }
            if (precisaAvaliar) {
              setAvaliacaoPendente(true);
              setEncontroPendente(ultimo);
            }
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCarregando(false);
      }
    };
    carregarDados();
  }, [params.id]);

  // =========================================================================
  // SALVAR AVALIAÇÃO OBRIGATÓRIA
  // =========================================================================
  const enviarAvaliacao = async () => {
    const temFuro = encontroPendente.acoes.some((acao, i) => String(acao || "").trim() !== "" && formAvaliacao[i] === "");
    if (temFuro) { alert("Preencha o resultado de todas as tarefas."); return; }

    setStatusMsg("Salvando Avaliação...");
    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'avaliarEncontroPassado', idPlanilha: params.id, linha: encontroPendente.linha, resultados: formAvaliacao })
      });
      if (res.ok) {
        setStatusMsg("Avaliação Salva!");
        setAvaliacaoPendente(false);
        const novoHist = [...historicoDiarios];
        novoHist[0].resultados = formAvaliacao;
        setHistoricoDiarios(novoHist);
        setTimeout(() => setStatusMsg(""), 4000);
      }
    } catch (e) { setStatusMsg("Erro ao salvar."); }
  };

  // =========================================================================
  // SALVAR NOVO DIÁRIO
  // =========================================================================
  const salvarNovoEncontro = async () => {
    if (salvandoEncontro) return;
    setSalvandoEncontro(true);
    setStatusMsg("Salvando Encontro...");
    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'salvarNovoEncontro', idPlanilha: params.id, ...formDiario, autoavaliacao: formDiario.autoavaliacao, acoes: formDiario.planosAcao })
      });
      if (res.ok) {
        setStatusMsg("Encontro Salvo!");
        setModalAberto(false);
        window.location.reload();
      } else { setStatusMsg("Erro ao salvar."); }
    } catch (e) { setStatusMsg("Erro."); }
    finally { setSalvandoEncontro(false); }
  };

  const abrirEdicaoEncontro = (enc) => {
    const dataFmt = enc.data instanceof Date
      ? enc.data.toLocaleDateString('pt-BR')
      : (typeof enc.data === 'string' ? new Date(enc.data).toLocaleDateString('pt-BR') : String(enc.data ?? ''));
    setEncontroEdit({
      linha: enc.linha,
      data: dataFmt,
      autoavaliacao: parseInt(enc.autoavaliacao) || 0,
      vitorias: enc.vitorias || '',
      desafios: enc.desafios || '',
      categoria: enc.categoria || 'Codificação',
      meta: enc.meta || '',
      exploracao: enc.exploracao || '',
      acoes: [0,1,2,3,4].map(i => enc.acoes?.[i] || ''),
      resultados: [0,1,2,3,4].map(i => enc.resultados?.[i] || ''),
    });
  };

  const salvarEdicaoEncontro = async () => {
    if (salvandoEdicao || !encontroEdit) return;
    setSalvandoEdicao(true);
    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'editarEncontro', idPlanilha: params.id, ...encontroEdit }),
      });
      const data = await res.json();
      if (data.status === 'sucesso') {
        setHistoricoDiarios(prev => prev.map(e => e.linha === encontroEdit.linha ? {
          ...e,
          data: encontroEdit.data,
          autoavaliacao: encontroEdit.autoavaliacao,
          vitorias: encontroEdit.vitorias,
          desafios: encontroEdit.desafios,
          categoria: encontroEdit.categoria,
          meta: encontroEdit.meta,
          exploracao: encontroEdit.exploracao,
          acoes: [...encontroEdit.acoes],
          resultados: [...encontroEdit.resultados],
        } : e));
        setEncontroEdit(null);
      } else {
        alert('Erro ao salvar: ' + (data.mensagem || 'desconhecido'));
      }
    } catch (e) {
      alert('Erro de conexão.');
    } finally {
      setSalvandoEdicao(false);
    }
  };

  const carregarOnboarding = async () => {
    if (dadosOnboarding !== null) return;
    setCarregandoOnboarding(true);
    setErroOnboarding('');
    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'buscarOnboarding', idPlanilhaAluno: params.id })
      });
      const data = await res.json();
      if (data.status === 'sucesso') {
        setDadosOnboarding(data.onboarding || {});
      } else {
        setErroOnboarding(data.mensagem || 'Erro desconhecido retornado pelo servidor.');
      }
    } catch (e) {
      setErroOnboarding('Falha na comunicação com a API: ' + e.message);
    }
    finally { setCarregandoOnboarding(false); }
  };

  const aplicarCarimbo = () => {
    pushHistorico({ ...grade });
    const label = `[${configSemana.categoria}]${configSemana.detalhe ? ' - ' + configSemana.detalhe : ''}`;
    const novaGrade = { ...grade };
    selecaoAtual.forEach(id => { novaGrade[id] = { categoria: configSemana.categoria, label }; });
    setGrade(novaGrade);
    setSelecaoAtual([]);
    setConfigSemana(prev => ({ ...prev, detalhe: '' }));
    setGradeModificada(true);
  };

  const limparHorarios = () => {
    pushHistorico({ ...grade });
    const novaGrade = { ...grade };
    selecaoAtual.forEach(id => { novaGrade[id] = null; });
    setGrade(novaGrade);
    setSelecaoAtual([]);
    setGradeModificada(true);
  };

  const carregarTemplate = () => {
    pushHistorico({ ...grade });
    setGrade(TEMPLATE_BASE);
    setSelecaoAtual([]);
  };

  // Atalho Ctrl+Z global (só ativo na aba semana)
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && abaInterna === 'semana') {
        e.preventDefault();
        desfazer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [abaInterna, gradeHistorico]);

  // Aviso ao tentar sair com alterações não salvas na Semana Padrão
  useEffect(() => {
    const handler = (e) => {
      if (abaInterna === 'semana' && gradeModificada) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [abaInterna, gradeModificada]);

  const salvarSemana = async () => {
    setSalvandoRotina(true);
    const rotina = Object.entries(grade).map(([chave, item]) => {
      const [dia, hora] = chave.split('_');
      return { dia, hora, atividade: item ? item.label : '' };
    });
    try {
      await fetch('/api/mentor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'salvarSemanaLote', idPlanilhaAluno: params.id, rotina }) });
      setStatusMsg("Rotina salva com sucesso!");
      setGradeModificada(false);
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (e) { setStatusMsg("Erro ao salvar."); }
    finally { setSalvandoRotina(false); }
  };

  if (carregando) return <LoadingScreen mensagem="Carregando dados do aluno..." />;

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 font-sans" onMouseUp={finalizarSelecao}>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* HEADER GERAL */}
        <div className="flex justify-between items-center">
          <button onClick={() => router.push('/mentor')} className="text-sm font-medium text-slate-400 hover:text-intento-blue transition-colors">← Voltar ao Painel Global</button>
          <div className="flex gap-2">
            <button onClick={() => setAbaInterna('diario')} className={`px-5 py-2 font-semibold rounded-lg transition-all text-sm ${abaInterna === 'diario' ? 'bg-intento-blue text-white' : 'bg-slate-50 text-slate-600 border border-slate-300 hover:border-intento-blue hover:text-intento-blue hover:bg-white'}`}>Diário de Bordo</button>
            <button onClick={() => setAbaInterna('semana')} className={`px-5 py-2 font-semibold rounded-lg transition-all text-sm ${abaInterna === 'semana' ? 'bg-intento-blue text-white' : 'bg-slate-50 text-slate-600 border border-slate-300 hover:border-intento-blue hover:text-intento-blue hover:bg-white'}`}>Semana Padrão</button>
            <button onClick={() => setAbaInterna('registros')} className={`px-5 py-2 font-semibold rounded-lg transition-all text-sm ${abaInterna === 'registros' ? 'bg-intento-blue text-white' : 'bg-slate-50 text-slate-600 border border-slate-300 hover:border-intento-blue hover:text-intento-blue hover:bg-white'}`}>Histórico Analítico</button>
            <button onClick={() => { setAbaInterna('onboarding'); carregarOnboarding(); }} className={`px-5 py-2 font-semibold rounded-lg transition-all text-sm ${abaInterna === 'onboarding' ? 'bg-intento-blue text-white' : 'bg-slate-50 text-slate-600 border border-slate-300 hover:border-intento-blue hover:text-intento-blue hover:bg-white'}`}>Onboarding</button>
          </div>
        </div>

        <div className="bg-intento-blue text-white p-6 rounded-xl flex justify-between items-center shadow-sm">
          <h1 className="text-2xl font-semibold">{nomeAluno || "Gestão Individual"}</h1>
        </div>

        {/* Toast de status global */}
        {statusMsg && (
          <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-semibold animate-in fade-in slide-in-from-bottom-2 ${statusMsg.toLowerCase().includes('erro') ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'}`}>
            {statusMsg}
          </div>
        )}

        {/* ================================================================== */}
        {/* ABA DIÁRIO DE BORDO */}
        {/* ================================================================== */}
        {abaInterna === 'diario' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            
            {/* AVALIAÇÃO PENDENTE — alerta não bloqueante */}
            {avaliacaoPendente && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="w-8 h-8 bg-amber-500 text-white rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold">!</div>
                    <div>
                      <h2 className="text-sm font-bold text-amber-800">Revisão pendente — encontro de {new Date(encontroPendente.data).toLocaleDateString('pt-BR')}</h2>
                      <p className="text-xs text-amber-700 font-medium mt-0.5">Avalie as tarefas do encontro anterior antes de registrar um novo.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setModalAberto(true)}
                    className="shrink-0 bg-intento-yellow hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg shadow-sm transition-all text-xs"
                  >
                    + Novo Diário
                  </button>
                </div>

                <div className="border-t border-amber-200 p-5 space-y-3">
                  {encontroPendente.acoes.map((acao, idx) => {
                    if (!acao || String(acao).trim() === '') return null;
                    return (
                      <div key={idx} className="bg-white p-4 rounded-xl border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
                        <span className="font-semibold text-slate-700 flex-1 text-sm">{idx + 1}. {acao}</span>
                        <select
                          className="p-2.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-400 bg-slate-50 font-semibold text-slate-600 text-sm md:min-w-[220px]"
                          value={formAvaliacao[idx]}
                          onChange={(e) => { const novo = [...formAvaliacao]; novo[idx] = e.target.value; setFormAvaliacao(novo); }}
                        >
                          <option value="">Selecione o resultado...</option>
                          <option value="Não realizado">Não realizado</option>
                          <option value="Realizado Parcialmente">Realizado Parcialmente</option>
                          <option value="Realizado">Realizado</option>
                        </select>
                      </div>
                    );
                  })}
                  <button onClick={enviarAvaliacao}
                    className="w-full mt-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-lg shadow-sm transition-all text-sm">
                    Salvar Revisão
                  </button>
                </div>
              </div>
            )}

            {/* BOTÃO NOVO DIÁRIO — visível sempre */}
            {!avaliacaoPendente && (
              <div className="flex justify-between items-center bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div>
                  <h2 className="text-sm font-bold text-intento-blue">Diário de Bordo</h2>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">Último encontro avaliado.</p>
                </div>
                <button onClick={() => setModalAberto(true)}
                  className="bg-intento-yellow hover:bg-yellow-500 text-white font-bold py-2.5 px-6 rounded-lg shadow-sm transition-all text-sm">
                  + Novo Diário
                </button>
              </div>
            )}

            {/* O ACORDÃO (SANFONA) DO HISTÓRICO - AGORA COM TUDO! */}
            <div className="pt-4">
              <h3 className="text-base font-semibold text-intento-blue mb-5">Histórico Completo de Encontros</h3>
              
              {historicoDiarios.length === 0 ? (
                <div className="p-8 border-2 border-dashed rounded-xl text-center text-slate-400 font-bold">Nenhum encontro registrado.</div>
              ) : (
                <div className="space-y-4">
                  {historicoDiarios.map((enc, i) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all">
                      {/* CABEÇALHO DA SANFONA */}
                      <button
                        onClick={() => setExpandidoId(expandidoId === i ? null : i)}
                        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                      >
                        {/* Data */}
                        <span className="shrink-0 bg-intento-blue text-white px-3 py-1.5 rounded-lg text-xs font-semibold min-w-[100px] text-center">
                          {new Date(enc.data).toLocaleDateString('pt-BR')}
                        </span>

                        {/* Meta + badges */}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-700 text-sm truncate leading-snug">
                            {enc.meta || 'Sem meta registrada'}
                          </p>
                          <div className="flex items-center flex-wrap gap-2 mt-1.5">
                            {/* Tipo de desafio */}
                            {enc.categoria && (() => {
                              const cat = {
                                'Codificação': 'bg-blue-50 text-blue-700 border-blue-100',
                                'Revisão':     'bg-emerald-50 text-emerald-700 border-emerald-100',
                                'Hábitos':     'bg-yellow-50 text-yellow-700 border-yellow-200',
                                'Prova':       'bg-red-50 text-red-700 border-red-100',
                              }[enc.categoria] || 'bg-slate-50 text-slate-600 border-slate-200';
                              return (
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cat}`}>
                                  {enc.categoria}
                                </span>
                              );
                            })()}
                            {/* Avaliação */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-slate-400 font-medium">Autoav.:</span>
                              <StarRating rating={parseInt(enc.autoavaliacao) || 0} readOnly={true} small={true} />
                            </div>
                          </div>
                        </div>

                        {/* Chevron */}
                        <svg className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${expandidoId === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                      </button>
                      
                      {/* CONTEÚDO EXPANDIDO (TODOS OS CAMPOS) */}
                      {expandidoId === i && (
                        <div className="p-6 border-t border-slate-100 bg-slate-50 space-y-6 animate-in fade-in">

                          {/* Topo: Categoria + ações */}
                          <div className="flex items-center justify-between gap-3">
                            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                              Desafio: {enc.categoria || 'Não Categorizado'}
                            </span>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/mentor/ig/diario?id=${params.id}&linha=${enc.linha}&nome=${encodeURIComponent(nomeAluno || '')}`}
                                className="text-xs font-semibold text-slate-500 hover:text-intento-blue flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-intento-blue bg-white transition"
                                title="Exportar este encontro"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                                Exportar
                              </Link>
                              <button
                                onClick={() => abrirEdicaoEncontro(enc)}
                                className="text-xs font-semibold text-slate-500 hover:text-intento-blue flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-intento-blue bg-white transition"
                                title="Editar este encontro"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                Editar
                              </button>
                            </div>
                          </div>

                          {/* Grid de Vitórias e Desafios */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-5 rounded-xl border border-slate-100">
                            <div><h4 className={labelClass}>Vitórias da Semana</h4><p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{enc.vitorias || '-'}</p></div>
                            <div><h4 className={labelClass}>Maiores Desafios</h4><p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{enc.desafios || '-'}</p></div>
                          </div>
                          
                          {/* Exploração Longa com Scroll */}
                          <div className="bg-white p-5 rounded-xl border border-slate-100">
                            <h4 className={labelClass}>Exploração e Ferramentas</h4>
                            <div className="max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                              <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">
                                {enc.exploracao || 'Nenhuma nota de exploração registrada.'}
                              </p>
                            </div>
                          </div>

                          {/* Plano de Ação */}
                          <div>
                            <h4 className={labelClass}>Plano de Ação e Execução</h4>
                            <ul className="space-y-3 mt-3">
                              {enc.acoes.map((acao, idx) => acao && String(acao).trim() !== "" ? (
                                <li key={idx} className="bg-white p-4 border border-slate-200 rounded-xl flex flex-col md:flex-row justify-between md:items-center gap-3 shadow-sm">
                                  <span className="text-sm font-bold text-slate-800 flex-1">{idx + 1}. {acao}</span>
                                  <span className={`text-[10px] font-medium px-3 py-1.5 rounded-md uppercase tracking-wide text-center ${
                                    enc.resultados[idx] === 'Realizado' ? 'bg-emerald-100 text-emerald-800' :
                                    enc.resultados[idx] === 'Realizado Parcialmente' ? 'bg-yellow-100 text-yellow-800' :
                                    enc.resultados[idx] === 'Não realizado' ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-500'
                                  }`}>
                                    {enc.resultados[idx] || 'Aguardando Revisão'}
                                  </span>
                                </li>
                              ) : null)}
                            </ul>
                          </div>

                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL: NOVO DIÁRIO (PERSISTENTE) */}
        {modalAberto && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-slate-50 w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              
              {/* Header do Modal */}
              <div className="bg-white px-8 py-5 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-base font-semibold text-intento-blue">Novo Encontro</h2>
                <button onClick={() => setModalAberto(false)} className="text-slate-400 hover:text-red-500 transition-colors">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              {/* Corpo do Modal com Scroll */}
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  
                  {/* COLUNA ESQUERDA: Análise e Exploração */}
                  <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <label className={labelClass}>Autoavaliação</label>
                      <div className="mt-2"><StarRating rating={formDiario.autoavaliacao} setRating={(val) => setFormDiario({...formDiario, autoavaliacao: val})} /></div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <div><label className={labelClass}>Vitórias da Semana</label><textarea className={inputClass} rows="2" placeholder="O que correu bem?" value={formDiario.vitorias} onChange={e => setFormDiario({...formDiario, vitorias: e.target.value})} /></div>
                      <div><label className={labelClass}>Maiores Desafios</label><textarea className={inputClass} rows="2" placeholder="Onde o aluno travou?" value={formDiario.desafios} onChange={e => setFormDiario({...formDiario, desafios: e.target.value})} /></div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <label className={labelClass}>Exploração</label>
                      <textarea className={inputClass} rows="8" placeholder="Espaço livre para notas, resumos, descobertas durante o encontro..." value={formDiario.exploracao} onChange={e => setFormDiario({...formDiario, exploracao: e.target.value})} />
                    </div>
                  </div>

                  {/* COLUNA DIREITA: Metas e Ações */}
                  <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <div>
                        <label className={labelClass}>Categoria do Desafio Atual</label>
                        <select className={inputClass + " bg-slate-50 font-bold text-intento-blue"} value={formDiario.categoriaDesafio} onChange={e => setFormDiario({...formDiario, categoriaDesafio: e.target.value})}>
                          {CATEGORIAS_DESAFIO.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Meta para o Próximo Encontro</label>
                        <input 
                          type="text" className={inputClass} 
                          placeholder={metaPassada ? `Ex: ${metaPassada}` : "Qual a grande meta da semana?"} 
                          value={formDiario.meta} 
                          onChange={e => setFormDiario({...formDiario, meta: e.target.value})} 
                        />
                      </div>
                    </div>

                    <div className="bg-intento-blue p-6 rounded-xl shadow-lg border-4 border-blue-900/20">
                      <label className="block text-xs font-medium text-blue-200 uppercase mb-4 tracking-wider">O Plano de Ação</label>
                      <div className="space-y-3">
                        {formDiario.planosAcao.map((p, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="w-9 h-9 shrink-0 bg-blue-900 rounded-lg flex items-center justify-center font-semibold text-white text-sm">{i+1}</div>
                            <input type="text" placeholder={`Descreva o ${i+1}º passo prático...`} className={inputClass + " bg-white/10 border-blue-800 text-white placeholder-blue-300 focus:ring-yellow-400"} value={p} onChange={e => { const novo = [...formDiario.planosAcao]; novo[i] = e.target.value; setFormDiario({...formDiario, planosAcao: novo}); }}/>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Footer do Modal */}
              <div className="bg-white p-6 border-t border-slate-200 flex justify-end gap-4">
                <button onClick={() => setModalAberto(false)} className="px-6 py-2.5 font-medium text-slate-400 hover:text-slate-700 transition-colors text-sm">
                  Minimizar
                </button>
                <button onClick={salvarNovoEncontro} disabled={salvandoEncontro} className="bg-intento-yellow hover:bg-yellow-500 text-white font-semibold px-8 py-2.5 rounded-lg shadow-sm transition-all text-sm disabled:opacity-60">
                  {salvandoEncontro ? 'Salvando...' : 'Salvar Encontro'}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* MODAL: EDITAR ENCONTRO */}
        {encontroEdit && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-slate-50 w-full max-w-6xl max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

              <div className="bg-white px-8 py-5 border-b border-slate-200 flex justify-between items-center">
                <h2 className="text-base font-semibold text-intento-blue">Editar Encontro — {encontroEdit.data}</h2>
                <button onClick={() => setEncontroEdit(null)} className="text-slate-400 hover:text-red-500 transition-colors">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                  <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <label className={labelClass}>Data do Encontro</label>
                      <input type="text" className={inputClass} value={encontroEdit.data} onChange={e => setEncontroEdit({...encontroEdit, data: e.target.value})} />
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <label className={labelClass}>Autoavaliação</label>
                      <div className="mt-2"><StarRating rating={encontroEdit.autoavaliacao} setRating={(val) => setEncontroEdit({...encontroEdit, autoavaliacao: val})} /></div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <div><label className={labelClass}>Vitórias da Semana</label><textarea className={inputClass} rows="2" value={encontroEdit.vitorias} onChange={e => setEncontroEdit({...encontroEdit, vitorias: e.target.value})} /></div>
                      <div><label className={labelClass}>Maiores Desafios</label><textarea className={inputClass} rows="2" value={encontroEdit.desafios} onChange={e => setEncontroEdit({...encontroEdit, desafios: e.target.value})} /></div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <label className={labelClass}>Exploração</label>
                      <textarea className={inputClass} rows="6" value={encontroEdit.exploracao} onChange={e => setEncontroEdit({...encontroEdit, exploracao: e.target.value})} />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <div>
                        <label className={labelClass}>Categoria do Desafio</label>
                        <select className={inputClass + " bg-slate-50 font-bold text-intento-blue"} value={encontroEdit.categoria} onChange={e => setEncontroEdit({...encontroEdit, categoria: e.target.value})}>
                          <option>Codificação</option><option>Revisão</option><option>Hábitos</option><option>Prova</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Meta para o Próximo Encontro</label>
                        <input type="text" className={inputClass} value={encontroEdit.meta} onChange={e => setEncontroEdit({...encontroEdit, meta: e.target.value})} />
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <label className={labelClass}>Plano de Ação e Resultados</label>
                      <div className="space-y-3 mt-2">
                        {[0,1,2,3,4].map(idx => (
                          <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center">
                            <input
                              type="text"
                              placeholder={`Ação ${idx + 1}`}
                              className={inputClass + " md:col-span-3"}
                              value={encontroEdit.acoes[idx]}
                              onChange={e => {
                                const novas = [...encontroEdit.acoes];
                                novas[idx] = e.target.value;
                                setEncontroEdit({...encontroEdit, acoes: novas});
                              }}
                            />
                            <select
                              className={inputClass + " md:col-span-2 bg-slate-50"}
                              value={encontroEdit.resultados[idx]}
                              onChange={e => {
                                const novos = [...encontroEdit.resultados];
                                novos[idx] = e.target.value;
                                setEncontroEdit({...encontroEdit, resultados: novos});
                              }}
                            >
                              <option value="">— Sem avaliação —</option>
                              <option>Realizado</option>
                              <option>Realizado Parcialmente</option>
                              <option>Não realizado</option>
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              <div className="bg-white p-6 border-t border-slate-200 flex justify-end gap-4">
                <button onClick={() => setEncontroEdit(null)} className="px-6 py-2.5 font-medium text-slate-400 hover:text-slate-700 transition-colors text-sm">
                  Cancelar
                </button>
                <button onClick={salvarEdicaoEncontro} disabled={salvandoEdicao} className="bg-intento-blue hover:bg-blue-900 text-white font-semibold px-8 py-2.5 rounded-lg shadow-sm transition-all text-sm disabled:opacity-60">
                  {salvandoEdicao ? 'Salvando...' : 'Salvar Edição'}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ... ABAS SEMANA E REGISTROS AQUI (MANTIDAS INTACTAS) ... */}

        {abaInterna === 'semana' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in duration-500">

            {/* ── Painel lateral ── */}
            <div className="space-y-4 lg:sticky lg:top-8 self-start">

              {/* Paleta de categorias — sempre visível */}
              <div className={cardClass}>
                <p className={labelClass}>Categoria ativa</p>
                <div className="grid grid-cols-1 gap-2 mt-1">
                  {Object.entries(CATEGORIAS).map(([cat, cfg]) => (
                    <button key={cat} onClick={() => setConfigSemana(prev => ({ ...prev, categoria: cat }))}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all border-2 ${
                        configSemana.categoria === cat
                          ? `${cfg.btn} border-transparent shadow-md scale-[1.02]`
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}>
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Detalhe / descrição da atividade */}
                <div className="mt-4">
                  <label className={labelClass}>Detalhe <span className="text-slate-300 normal-case font-normal">(opcional)</span></label>
                  <input type="text" placeholder="Ex: Funções, Redação, Pomodoro..."
                    className={inputClass + ' text-sm mt-1'}
                    value={configSemana.detalhe}
                    onChange={e => setConfigSemana(prev => ({ ...prev, detalhe: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && selecaoAtual.length > 0) aplicarCarimbo(); }}
                  />
                </div>

                {/* Botões de ação */}
                {selecaoAtual.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-intento-blue">{selecaoAtual.length} célula{selecaoAtual.length !== 1 ? 's' : ''} selecionada{selecaoAtual.length !== 1 ? 's' : ''}</p>
                    <button onClick={aplicarCarimbo}
                      className="w-full bg-intento-blue text-white font-bold py-2.5 rounded-lg hover:bg-blue-900 transition-all text-sm">
                      Aplicar ({selecaoAtual.length}h)
                    </button>
                    <button onClick={limparHorarios}
                      className="w-full border border-red-300 text-red-500 font-semibold py-2 rounded-lg hover:bg-red-50 transition-all text-sm">
                      Limpar seleção
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-slate-400 font-medium text-center py-2 bg-slate-50 rounded-lg">
                    Arraste na grade para selecionar →
                  </p>
                )}
              </div>

              {/* Resumo de horas */}
              {Object.keys(resumoHoras).length > 0 && (
                <div className={cardClass}>
                  <p className={labelClass}>Distribuição da semana</p>
                  <div className="space-y-2 mt-2">
                    {Object.entries(CATEGORIAS).map(([cat, cfg]) => {
                      const horas = resumoHoras[cat] || 0;
                      if (!horas) return null;
                      const total = Object.values(resumoHoras).reduce((a, b) => a + b, 0);
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs font-medium mb-1">
                            <span className="flex items-center gap-1.5">
                              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                              <span className="text-slate-600">{cat}</span>
                            </span>
                            <span className="text-slate-500 font-bold">{horas}h</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${cfg.dot}`}
                              style={{ width: `${(horas / total) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-xs text-slate-400 font-medium text-right pt-1">
                      Total: {Object.values(resumoHoras).reduce((a, b) => a + b, 0)}h
                    </p>
                  </div>
                </div>
              )}

              {/* Ações globais */}
              <div className="space-y-2">
                <button onClick={salvarSemana} disabled={salvandoRotina}
                  className="w-full bg-intento-yellow text-white font-semibold py-2.5 rounded-lg shadow-sm hover:bg-yellow-500 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-70">
                  {salvandoRotina && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>}
                  {salvandoRotina ? 'Sincronizando...' : 'Salvar Rotina'}
                </button>
                <div className="flex gap-2">
                  <button onClick={desfazer} disabled={gradeHistorico.length === 0}
                    title="Desfazer (Ctrl+Z)"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700 rounded-lg text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
                    Desfazer
                  </button>
                  <button onClick={carregarTemplate}
                    title="Carregar semana padrão de exemplo"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-slate-200 text-slate-500 hover:border-intento-blue hover:text-intento-blue rounded-lg text-xs font-semibold transition-all">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5h16M4 10h10M4 15h16M4 20h10"/></svg>
                    Template
                  </button>
                </div>
              </div>
            </div>

            {/* ── Grade semanal ── */}
            <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm select-none">
              <table className="w-full text-xs border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-3 w-14 text-slate-400 font-medium border-r text-center">Hora</th>
                    {DIAS.map(dia => (
                      <th key={dia} className="p-2 font-semibold text-intento-blue border-r last:border-0 text-center">
                        <span className="hidden sm:inline">{dia.split('-')[0]}</span>
                        <span className="sm:hidden">{dia.slice(0, 3)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HORARIOS.map(hora => (
                    <tr key={hora} className="border-b border-slate-100 last:border-0">
                      <td className="p-2 text-center text-[10px] font-bold text-slate-400 border-r bg-slate-50 whitespace-nowrap">{hora}</td>
                      {DIAS.map(dia => {
                        const id = `${dia}_${hora}`;
                        const isSelected = selecaoAtual.includes(id);
                        const item = grade[id];
                        return (
                          <td key={id}
                            onMouseDown={() => iniciarSelecao(id)}
                            onMouseEnter={() => passarMouse(id)}
                            className={`border-r last:border-0 cursor-crosshair transition-all duration-75 h-10 p-0.5 ${
                              isSelected ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : 'hover:bg-slate-50'
                            }`}
                          >
                            {item && (
                              <div className={`h-full w-full px-1.5 rounded-md font-semibold flex flex-col justify-center leading-tight border ${CATEGORIAS[item.categoria]?.cor || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                <span className="text-[9px] font-bold uppercase tracking-wide opacity-70 leading-none">{item.categoria.slice(0, 3)}</span>
                                {item.label.replace(/\[.*?\]\s*-?\s*/, '').trim() && (
                                  <span className="text-[9px] mt-0.5 leading-tight truncate">{item.label.replace(/\[.*?\]\s*-?\s*/, '').trim()}</span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* ABA ONBOARDING */}
        {/* ================================================================== */}
        {abaInterna === 'onboarding' && (
          <div className="space-y-5 animate-in fade-in duration-500">
            {carregandoOnboarding && <LoadingInline mensagem="Carregando dados de onboarding..." />}
            {!carregandoOnboarding && erroOnboarding && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-5 text-sm text-red-600 font-medium">
                Erro ao carregar: <span className="font-normal">{erroOnboarding}</span>
              </div>
            )}
            {!carregandoOnboarding && !erroOnboarding && !dadosOnboarding && (
              <div className="text-center py-12 text-slate-400 text-sm">Nenhum dado de onboarding encontrado.</div>
            )}
            {!carregandoOnboarding && dadosOnboarding && (() => {
              const ob = dadosOnboarding;
              const campo = (label, valor) => valor ? (
                <div key={label}>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-intento-blue">{String(valor)}</p>
                </div>
              ) : null;

              const escala = (label, valor) => {
                const n = parseInt(valor) || 0;
                return (
                  <div key={label} className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-600 flex-1">{label}</p>
                    <div className="flex gap-1 shrink-0">
                      {[1,2,3,4,5].map(i => (
                        <div key={i} className={`w-4 h-4 rounded-full ${i <= n ? 'bg-intento-blue' : 'bg-slate-200'}`} />
                      ))}
                    </div>
                  </div>
                );
              };

              const media = (valores) => {
                const nums = valores.map(v => parseInt(v) || 0).filter(v => v > 0);
                if (!nums.length) return null;
                return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1).replace('.', ',');
              };

              const badgeMedia = (valor) => {
                if (!valor) return null;
                const n = parseFloat(valor.replace(',', '.'));
                const cor = n >= 4 ? 'bg-emerald-100 text-emerald-700' : n >= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600';
                return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cor}`}>{valor}</span>;
              };

              const mediaCodificacao = media([ob.Leitura_Previa, ob.Estrutura_Mental, ob.Interacao_Aula, ob.Atencao_Conceitos, ob.Escreve_Perguntas, ob.Escreve_Minimo, ob.Poucas_Palavras, ob.Setas_Figuras, ob.Logica_Propria, ob.Revisa_Anotacoes, ob.Procura_Material, ob.Ferramentas_Memorizacao, ob.Passa_Varias_Vezes]);
              const mediaRevisao = media([ob.Cronograma_Revisoes, ob.Revisao_Espacada, ob.Padrao_Revisao, ob.Revisao_Ativa, ob.Diferentes_Metodos, ob.Cria_Flashcards, ob.Procura_Fraquezas]);
              const mediaVida = media([ob.Durmo_8_Horas, ob.Horario_Regular, ob.Sono_Reparador, ob.Exercicio_Fisico, ob.Treino_Atencao, ob.Estuda_Lugares_Diferentes, ob.Objetivos_Claros, ob.Gestao_Atencao, ob.Pausas_Descanso, ob.Pausas_Sem_Telas]);

              return (
                <>
                  {/* Dados Pessoais */}
                  <div className={cardClass}>
                    <h2 className="text-base font-semibold text-intento-blue mb-4 border-b pb-3">Dados Pessoais</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
                      {campo('Nome Completo', ob.Nome_Completo)}
                      {campo('Data de Nascimento', ob.Data_Nascimento)}
                      {campo('Telefone', ob.Telefone)}
                      {campo('E-mail', ob.Email)}
                      {campo('Responsável Financeiro', ob.Responsavel_Financeiro)}
                      {campo('Cidade', ob.Cidade)}
                      {campo('Estado', ob.Estado)}
                      {campo('Data de Registro', ob.Data_Registro)}
                    </div>
                  </div>

                  {/* Perfil Acadêmico */}
                  <div className={cardClass}>
                    <h2 className="text-base font-semibold text-intento-blue mb-4 border-b pb-3">Perfil Acadêmico</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4 mb-5">
                      {campo('Escolaridade', ob.Escolaridade)}
                      {campo('Origem do Ensino Médio', ob.Origem_Ensino_Medio)}
                      {campo('Cota', ob.Cota)}
                      {campo('Fez ENEM Antes', ob.Fez_ENEM_Antes)}
                      {campo('Provas de Interesse', ob.Provas_Interesse)}
                      {campo('Curso de Interesse', ob.Curso_Interesse)}
                      {campo('Plataforma Online', ob.Plataforma_Online)}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                      {campo('Histórico de Estudos', ob.Historico_Estudos)}
                      {campo('3 Maiores Obstáculos', ob.Tres_Maiores_Obstaculos)}
                      {campo('Expectativas com a Mentoria', ob.Expectativas_Mentoria)}
                    </div>
                  </div>

                  {/* Notas Anteriores */}
                  <div className={cardClass}>
                    <h2 className="text-base font-semibold text-intento-blue mb-4 border-b pb-3">Notas Anteriores (ENEM)</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      {[
                        ['Linguagens', ob.Nota_Linguagens],
                        ['Humanas', ob.Nota_Humanas],
                        ['Natureza', ob.Nota_Natureza],
                        ['Matemática', ob.Nota_Matematica],
                        ['Redação', ob.Nota_Redacao],
                      ].map(([label, val]) => (
                        <div key={label} className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                          <p className="text-2xl font-bold text-intento-blue">{val || '—'}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hábitos */}
                  <div className={cardClass}>
                    <h2 className="text-base font-semibold text-intento-blue mb-5 border-b pb-3">Hábitos de Estudo</h2>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                      {/* Codificação */}
                      <div>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                          <p className="text-xs font-bold text-intento-blue uppercase tracking-wider">Codificação</p>
                          {badgeMedia(mediaCodificacao)}
                        </div>
                        <div className="space-y-3">
                          {escala('Leitura prévia do material', ob.Leitura_Previa)}
                          {escala('Estrutura mental antes da aula', ob.Estrutura_Mental)}
                          {escala('Interação durante a aula', ob.Interacao_Aula)}
                          {escala('Atenção a conceitos-chave', ob.Atencao_Conceitos)}
                          {escala('Escreve perguntas durante a aula', ob.Escreve_Perguntas)}
                          {escala('Escreve o mínimo possível', ob.Escreve_Minimo)}
                          {escala('Usa poucas palavras nas anotações', ob.Poucas_Palavras)}
                          {escala('Setas e figuras nas anotações', ob.Setas_Figuras)}
                          {escala('Anota com lógica própria', ob.Logica_Propria)}
                          {escala('Revisa anotações após a aula', ob.Revisa_Anotacoes)}
                          {escala('Busca sanar dúvidas após a aula', ob.Procura_Material)}
                          {escala('Usa ferramentas de memorização', ob.Ferramentas_Memorizacao)}
                          {escala('Passa várias vezes no conteúdo', ob.Passa_Varias_Vezes)}
                        </div>
                      </div>

                      {/* Revisão */}
                      <div>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                          <p className="text-xs font-bold text-intento-blue uppercase tracking-wider">Revisão</p>
                          {badgeMedia(mediaRevisao)}
                        </div>
                        <div className="space-y-3">
                          {escala('Tem cronograma de revisões', ob.Cronograma_Revisoes)}
                          {escala('Usa revisão espaçada', ob.Revisao_Espacada)}
                          {escala('Segue padrão D1/D7/D15', ob.Padrao_Revisao)}
                          {escala('Revisão ativa (lembrar de cabeça)', ob.Revisao_Ativa)}
                          {escala('Usa diferentes métodos de revisão', ob.Diferentes_Metodos)}
                          {escala('Cria próprios flashcards', ob.Cria_Flashcards)}
                          {escala('Busca ativamente suas fraquezas', ob.Procura_Fraquezas)}
                        </div>
                      </div>

                      {/* Hábitos de Vida */}
                      <div>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                          <p className="text-xs font-bold text-intento-blue uppercase tracking-wider">Hábitos de Vida</p>
                          {badgeMedia(mediaVida)}
                        </div>
                        <div className="space-y-3">
                          {escala('Dorme 8 horas', ob.Durmo_8_Horas)}
                          {escala('Horário regular de sono', ob.Horario_Regular)}
                          {escala('Sono reparador', ob.Sono_Reparador)}
                          {escala('Pratica exercício físico', ob.Exercicio_Fisico)}
                          {escala('Treino de atenção', ob.Treino_Atencao)}
                          {escala('Estuda em lugares diferentes', ob.Estuda_Lugares_Diferentes)}
                          {escala('Objetivos claros ao estudar', ob.Objetivos_Claros)}
                          {escala('Gestão da atenção', ob.Gestao_Atencao)}
                          {escala('Faz pausas de descanso', ob.Pausas_Descanso)}
                          {escala('Pausas sem telas', ob.Pausas_Sem_Telas)}
                        </div>
                      </div>

                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {abaInterna === 'registros' && (
          <HistoricoAnalitico
            registros={historicoRegistros}
            cardClass={cardClass}
            idPlanilha={params.id}
            onUpdate={(idx, novaRow) => setHistoricoRegistros(prev => prev.map((r, i) => i === idx ? novaRow : r))}
          />
        )}
      </div>

      {/* Estilo embutido para scrollbar bonita dentro do Modal e do Histórico */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
      `}} />
    </div>
  );
}