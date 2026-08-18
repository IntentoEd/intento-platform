'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { auth } from '@/lib/firebase';
import Boletim from '@/components/Boletim';
import ConfirmDialog from '@/components/ConfirmDialog';

// O gateway sobrescreve `email` com o do token Firebase pra ações autenticadas,
// então enviar email='' aqui é seguro — o backend usa o usuário real.
function emailRequester() {
  return auth.currentUser?.email || '';
}

const MATERIAS_EM = [
  'Português', 'Matemática', 'Inglês', 'Espanhol',
  'História', 'Geografia', 'Biologia', 'Química',
  'Física', 'Sociologia', 'Filosofia', 'Arte',
  'Educação Física', 'Outra',
];
const TIPOS_EM = [
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'recuperacao', label: 'Recuperação' },
];

// Prova de vestibular: a "matéria" é o vestibular e o "tipo" é a fase.
const VESTIBULARES = ['ENEM', 'SSA (UPE)', 'FUVEST', 'UNICAMP', 'UNESP', 'UERJ', 'Outra'];
const TIPOS_ENEM = [
  { value: 'unica', label: 'Fase única' },
  { value: 'fase1', label: '1ª fase' },
  { value: 'fase2', label: '2ª fase' },
  { value: 'dia1', label: 'Dia 1' },
  { value: 'dia2', label: 'Dia 2' },
];

// Se a prova é escolar ou de vestibular, quem decide é a PROVA, não o aluno:
// aluno EM pode misturar as duas na mesma lista (3º ano). Os vocabulários de
// tipo são disjuntos, então o tipo identifica cada linha.
const TIPOS_TODOS = [...TIPOS_EM, ...TIPOS_ENEM];
const TIPOS_VESTIBULAR = new Set(TIPOS_ENEM.map(t => t.value));
const ehProvaVestibular = (p) => TIPOS_VESTIBULAR.has(p.tipo);
// Sentinela do "Outro vestibular" no select combinado do aluno EM — 'Outra'
// segue sendo a matéria escolar livre.
const OUTRO_VEST = '__outro_vest__';
const VESTIBULARES_BASE = VESTIBULARES.filter(v => v !== 'Outra');

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function inicioDoDia(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()}/${MESES[d.getMonth()]}`;
}

function diasAte(iso) {
  if (!iso) return null;
  const alvo = inicioDoDia(new Date(iso));
  const hoje = inicioDoDia(new Date());
  return Math.round((alvo - hoje) / (1000 * 60 * 60 * 24));
}

function countdownLabel(dias) {
  if (dias === null) return '';
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  if (dias > 1) return `em ${dias} dias`;
  if (dias === -1) return 'ontem';
  return `${Math.abs(dias)} dias atrás`;
}

function corBordaPorDias(dias) {
  if (dias === null || dias < 0) return 'border-l-slate-200';
  if (dias <= 3) return 'border-l-red-500';
  if (dias <= 7) return 'border-l-amber-500';
  return 'border-l-slate-200';
}

function isoParaInput(iso) {
  // converte ISO string -> "YYYY-MM-DD" pro <input type="date">
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function inputParaIso(input) {
  // "YYYY-MM-DD" -> ISO no fuso local (meio-dia pra evitar bugs de timezone)
  if (!input) return '';
  const [y, m, d] = input.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}

const linhaVazia = () => ({
  data: '',
  materiaSelect: '',
  materiaTexto: '',
  tipo: '',
  observacao: '',
  substituiId: '',
});

// Componente CONTROLADO: quem carrega listarAvaliacoesAluno é a página
// (/mentor/[id]), que também deriva o stat "Próxima prova" e o contador da
// aba — um fetch só. Todo write chama onRecarregar().
export default function AbaProvas({ idAluno, alunoNome, escola, tipoAluno = 'EM', provas, onRecarregar, erro }) {
  const ehEM = tipoAluno === 'EM';
  const tipoLabel = (tipo) => (TIPOS_TODOS.find(t => t.value === tipo) || { label: tipo }).label;
  const rotuloEntidade = ehEM ? 'Matéria' : 'Vestibular';

  // Diz se a SELEÇÃO no select de matéria é de vestibular (antes da prova existir).
  const selecaoVest = (sel) => !ehEM || sel === OUTRO_VEST || VESTIBULARES_BASE.includes(sel);
  const ehSelecaoOutra = (sel) => sel === 'Outra' || sel === OUTRO_VEST;
  const tiposPara = (sel) => (selecaoVest(sel) ? TIPOS_ENEM : TIPOS_EM);
  const placeholderOutra = (sel) => (selecaoVest(sel) ? 'Nome do vestibular' : 'Nome da matéria');
  // Ao trocar a matéria, o tipo escolhido só sobrevive se ainda for válido no
  // vocabulário da nova seleção (escolar vs vestibular); senão zera (quem
  // chama decide o default).
  const tipoAoTrocarMateria = (tipoAtual, selNova) =>
    tiposPara(selNova).some(t => t.value === tipoAtual) ? tipoAtual : '';
  // Chip do card: no EM a lista é mista, o 🎯 distingue vestibular à vista.
  const chipTipo = (p) => (ehEM && ehProvaVestibular(p) ? '🎯 ' : '') + tipoLabel(p.tipo);

  // Options do select de matéria: EM ganha o grupo Vestibular; ENEM fica igual.
  const opcoesMateria = () => (ehEM ? (
    <>
      <optgroup label="Escola">
        {MATERIAS_EM.map(m => <option key={m} value={m}>{m === 'Outra' ? 'Outra matéria' : m}</option>)}
      </optgroup>
      <optgroup label="Vestibular">
        {VESTIBULARES_BASE.map(v => <option key={v} value={v}>{v}</option>)}
        <option value={OUTRO_VEST}>Outro vestibular</option>
      </optgroup>
    </>
  ) : (
    VESTIBULARES.map(m => <option key={m} value={m}>{m}</option>)
  ));

  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [boletimAberto, setBoletimAberto] = useState(false);

  // Quick-add (1 prova, inline no topo — a data persiste entre adições)
  const [qa, setQa] = useState({ data: '', materiaSelect: '', materiaTexto: '', tipo: ehEM ? 'mensal' : 'unica', observacao: '' });
  const [salvandoQa, setSalvandoQa] = useState(false);
  const [erroQa, setErroQa] = useState('');

  // Modal cadastro em lote (multi-prova)
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [linhas, setLinhas] = useState([linhaVazia()]);
  const [salvandoBatch, setSalvandoBatch] = useState(false);
  const [erroBatch, setErroBatch] = useState('');

  // Modal edição (1 prova). editModoResultado: aberto pelo CTA da fila de
  // prova de vestibular — o salvar fecha o ciclo (resultadoRegistrado:true).
  const [provaEditando, setProvaEditando] = useState(null);
  const [editModoResultado, setEditModoResultado] = useState(false);
  const [editData, setEditData] = useState('');
  const [editMateriaSel, setEditMateriaSel] = useState('');
  const [editMateriaTxt, setEditMateriaTxt] = useState('');
  const [editTipo, setEditTipo] = useState('');
  const [editObs, setEditObs] = useState('');
  const [editNota, setEditNota] = useState('');
  const [editSubstituiId, setEditSubstituiId] = useState('');
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  const [provaParaDeletar, setProvaParaDeletar] = useState(null);
  const [deletando, setDeletando] = useState(false);
  const [fechandoId, setFechandoId] = useState(null); // "sem nota divulgada"/"não compareceu" em andamento

  const meuEmail = (auth.currentUser?.email || '').toLowerCase();

  const { aRegistrar, proximas, historico } = useMemo(() => {
    if (!provas) return { aRegistrar: [], proximas: [], historico: [] };
    const hoje = inicioDoDia(new Date());
    const substituidas = new Set(provas.map(p => p.substituiId).filter(Boolean));
    const aRegistrar = [];
    const proximas = [];
    const historico = [];
    provas.forEach(p => {
      const d = inicioDoDia(new Date(p.data));
      if (d >= hoje) { proximas.push(p); return; }
      // Pendente: passou, sem resultado registrado, não substituída por
      // recuperação. A fila NÃO expira — pendência de mentor é responsabilidade.
      const pendente = !p.resultadoEm && (p.nota === null || p.nota === undefined) && !substituidas.has(p.id);
      if (pendente) aRegistrar.push(p); else historico.push(p);
    });
    aRegistrar.sort((a, b) => new Date(b.data) - new Date(a.data));
    proximas.sort((a, b) => new Date(a.data) - new Date(b.data));
    historico.sort((a, b) => new Date(b.data) - new Date(a.data));
    return { aRegistrar, proximas, historico };
  }, [provas]);

  // Pra recuperação (só prova escolar): provas da mesma matéria (exceto a própria).
  const opcoesParaSubstituir = (materia, exceptId) => {
    if (!materia || !provas) return [];
    return provas
      .filter(p => p.materia === materia && p.id !== exceptId && !ehProvaVestibular(p))
      .sort((a, b) => new Date(b.data) - new Date(a.data));
  };

  const chipAutoria = (p) => {
    const autor = (p.criadoPor || '').toLowerCase();
    if (!autor || autor === meuEmail) return null;
    return (
      <span className="text-[10px] font-medium text-slate-400 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
        por {autor.split('@')[0]}
      </span>
    );
  };

  // ====== Quick-add ======
  const salvarQuickAdd = async () => {
    if (salvandoQa) return;
    const materia = ehSelecaoOutra(qa.materiaSelect) ? qa.materiaTexto.trim() : qa.materiaSelect;
    if (!qa.data) { setErroQa('Data é obrigatória.'); return; }
    if (!materia) { setErroQa(`${rotuloEntidade} é obrigatório(a).`); return; }
    if (!qa.tipo) { setErroQa(selecaoVest(qa.materiaSelect) ? 'Fase é obrigatória.' : 'Tipo é obrigatório.'); return; }
    setSalvandoQa(true);
    setErroQa('');
    try {
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'cadastrarAvaliacoes',
          email: emailRequester(),
          idAluno,
          avaliacoes: [{ data: inputParaIso(qa.data), materia, tipo: qa.tipo, observacao: qa.observacao }],
        }),
      });
      const data = await res.json();
      if (data.status !== 'sucesso') { setErroQa(data.mensagem || 'Erro ao salvar.'); return; }
      // Mantém data e tipo: semana de provas entra em sequência sem re-selecionar.
      // Mas o select de matéria volta pro estado inicial — tipo de vestibular
      // não pode vazar pra próxima prova escolar (e vice-versa), então revalida.
      setQa(prev => ({
        ...prev,
        materiaSelect: '',
        materiaTexto: '',
        observacao: '',
        tipo: tipoAoTrocarMateria(prev.tipo, '') || (selecaoVest('') ? 'unica' : 'mensal'),
      }));
      await onRecarregar?.();
    } catch (e) {
      setErroQa('Erro de conexão.');
    } finally {
      setSalvandoQa(false);
    }
  };

  // ====== Fila: fechar sem nota / não compareceu ======
  const fecharSemNota = async (p) => {
    if (fechandoId) return;
    setFechandoId(p.id);
    try {
      const body = { acao: 'atualizarAvaliacao', email: emailRequester(), idAvaliacao: p.id, resultadoRegistrado: true };
      if (ehProvaVestibular(p)) body.observacao = p.observacao ? `${p.observacao} — não compareceu` : 'Não compareceu';
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status !== 'sucesso') { alert('Erro: ' + (data.mensagem || 'falha ao registrar')); return; }
      await onRecarregar?.();
    } catch (e) {
      alert('Erro de conexão.');
    } finally {
      setFechandoId(null);
    }
  };

  // ====== Cadastro em lote ======
  const abrirCadastro = () => {
    setLinhas([linhaVazia()]);
    setErroBatch('');
    setCadastroAberto(true);
  };

  const adicionarLinha = () => setLinhas(prev => [...prev, linhaVazia()]);
  const removerLinha = (idx) => setLinhas(prev => prev.filter((_, i) => i !== idx));
  const atualizarLinha = (idx, campo, valor) => {
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l));
  };
  // Troca de matéria pode alternar a linha entre escolar e vestibular — tipo inválido no novo vocabulário zera.
  const atualizarLinhaMateria = (idx, sel) => {
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, materiaSelect: sel, tipo: tipoAoTrocarMateria(l.tipo, sel) } : l));
  };

  const validarLinhas = () => {
    if (!Array.isArray(linhas) || linhas.length === 0) return 'Adicione pelo menos uma prova.';
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (!l.data) return `Linha ${i + 1}: data é obrigatória.`;
      const materia = ehSelecaoOutra(l.materiaSelect) ? l.materiaTexto.trim() : l.materiaSelect;
      if (!materia) return `Linha ${i + 1}: ${rotuloEntidade.toLowerCase()} é obrigatório(a).`;
      if (!l.tipo) return `Linha ${i + 1}: ${selecaoVest(l.materiaSelect) ? 'fase' : 'tipo'} é obrigatório(a).`;
    }
    return null;
  };

  const salvarBatch = async () => {
    if (salvandoBatch) return;
    const erroValidacao = validarLinhas();
    if (erroValidacao) { setErroBatch(erroValidacao); return; }

    setSalvandoBatch(true);
    setErroBatch('');
    try {
      const avaliacoes = linhas.map(l => ({
        data: inputParaIso(l.data),
        materia: ehSelecaoOutra(l.materiaSelect) ? l.materiaTexto.trim() : l.materiaSelect,
        tipo: l.tipo,
        observacao: l.observacao,
        substituiId: l.tipo === 'recuperacao' ? l.substituiId : '',
      }));
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'cadastrarAvaliacoes', email: emailRequester(), idAluno, avaliacoes }),
      });
      if (!res.ok) { setErroBatch('Erro de servidor (' + res.status + ').'); return; }
      const data = await res.json();
      if (data.status !== 'sucesso') {
        setErroBatch(data.mensagem || 'Erro ao salvar.');
        return;
      }
      setCadastroAberto(false);
      await onRecarregar?.();
    } catch (e) {
      setErroBatch('Erro de conexão.');
    } finally {
      setSalvandoBatch(false);
    }
  };

  // ====== Edição (1 prova) ======
  const abrirEdicao = (prova, modoResultado = false) => {
    setProvaEditando(prova);
    setEditModoResultado(modoResultado);
    setEditData(isoParaInput(prova.data));
    const vest = ehProvaVestibular(prova);
    const conhecidas = ehEM ? (vest ? VESTIBULARES_BASE : MATERIAS_EM) : VESTIBULARES;
    const materiaConhecida = conhecidas.includes(prova.materia);
    setEditMateriaSel(materiaConhecida ? prova.materia : (ehEM && vest ? OUTRO_VEST : 'Outra'));
    setEditMateriaTxt(materiaConhecida ? '' : prova.materia);
    setEditTipo(prova.tipo);
    setEditObs(prova.observacao || '');
    setEditNota(prova.nota === null || prova.nota === undefined ? '' : String(prova.nota));
    setEditSubstituiId(prova.substituiId || '');
  };

  const salvarEdit = async () => {
    if (salvandoEdit || !provaEditando) return;
    if (!editData) { alert('Data é obrigatória.'); return; }
    const materia = ehSelecaoOutra(editMateriaSel) ? editMateriaTxt.trim() : editMateriaSel;
    const vestSel = selecaoVest(editMateriaSel);
    if (!materia) { alert(`${rotuloEntidade} é obrigatório(a).`); return; }
    if (!editTipo) { alert(vestSel ? 'Fase é obrigatória.' : 'Tipo é obrigatório.'); return; }
    if (!vestSel && editNota !== '' && (isNaN(Number(editNota)) || Number(editNota) < 0 || Number(editNota) > 10)) {
      alert('Nota deve ser número entre 0 e 10.');
      return;
    }

    setSalvandoEdit(true);
    try {
      const body = {
        acao: 'atualizarAvaliacao',
        email: emailRequester(),
        idAvaliacao: provaEditando.id,
        data: inputParaIso(editData),
        materia,
        tipo: editTipo,
        observacao: editObs,
      };
      if (!vestSel) {
        // Number garante coerção; null = nota ainda não lançada (vs 0 = zero real).
        body.nota = editNota === '' ? null : Number(editNota);
        body.substituiId = editTipo === 'recuperacao' ? editSubstituiId : '';
      }
      // Fluxo "registrar como foi" de prova de vestibular: salvar fecha o ciclo.
      if (editModoResultado && vestSel) body.resultadoRegistrado = true;
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { alert('Erro de servidor (' + res.status + ').'); return; }
      const data = await res.json();
      if (data.status !== 'sucesso') { alert('Erro: ' + (data.mensagem || 'falha ao salvar')); return; }
      setProvaEditando(null);
      await onRecarregar?.();
    } catch (e) {
      alert('Erro de conexão.');
    } finally {
      setSalvandoEdit(false);
    }
  };

  const confirmarDelete = async () => {
    if (!provaParaDeletar) return;
    setDeletando(true);
    try {
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'deletarAvaliacao', email: emailRequester(), idAvaliacao: provaParaDeletar.id }),
      });
      if (!res.ok) { alert('Erro de servidor (' + res.status + ').'); return; }
      const data = await res.json();
      if (data.status !== 'sucesso') { alert('Erro: ' + (data.mensagem || 'falha ao deletar')); return; }
      setProvaParaDeletar(null);
      await onRecarregar?.();
    } catch (e) {
      alert('Erro de conexão.');
    } finally {
      setDeletando(false);
    }
  };

  const botoesItem = (p) => (
    <div className="flex items-center gap-1 shrink-0">
      <button onClick={() => abrirEdicao(p)} className="text-[11px] font-semibold text-slate-400 hover:text-intento-blue px-2 py-1 transition" title="Editar">✎</button>
      <button onClick={() => setProvaParaDeletar(p)} className="text-[11px] font-semibold text-slate-400 hover:text-red-500 px-2 py-1 transition" title="Deletar">🗑</button>
    </div>
  );

  // ====== Render ======
  if (erro) {
    return (
      <div className="text-sm text-red-600 font-medium py-8 text-center">
        {erro}
        <button onClick={() => onRecarregar?.()} className="block mx-auto mt-3 text-xs text-intento-blue hover:underline">Tentar novamente</button>
      </div>
    );
  }
  if (provas === null || provas === undefined) {
    return <div className="text-sm text-slate-400 font-medium py-8 text-center">Carregando provas…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-intento-blue">Provas</h2>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            {proximas.length} próxima{proximas.length !== 1 ? 's' : ''}
            {aRegistrar.length > 0 && <span className="text-amber-700 font-bold"> · {aRegistrar.length} a registrar</span>}
            {' '}· {historico.length} realizada{historico.length !== 1 ? 's' : ''}
            {ehEM && escola && <span className="ml-2">· {escola}</span>}
          </p>
        </div>
        <button
          onClick={abrirCadastro}
          className="text-sm font-semibold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 px-4 py-2 rounded-lg transition shrink-0 shadow-sm"
        >
          + Cadastrar em lote
        </button>
      </div>

      {/* Quick-add inline */}
      <div className="border border-dashed border-slate-300 rounded-xl p-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Adicionar rápido</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={qa.data}
            onChange={e => setQa(prev => ({ ...prev, data: e.target.value }))}
            className="text-xs font-medium text-intento-blue px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white"
          />
          <select
            value={qa.materiaSelect}
            onChange={e => {
              const sel = e.target.value;
              setQa(prev => ({
                ...prev,
                materiaSelect: sel,
                // Sem tipo válido na nova seleção, cai no default dela.
                tipo: tipoAoTrocarMateria(prev.tipo, sel) || (selecaoVest(sel) ? 'unica' : 'mensal'),
              }));
            }}
            className="text-xs font-medium text-intento-blue px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white"
          >
            <option value="">{rotuloEntidade}…</option>
            {opcoesMateria()}
          </select>
          <select
            value={qa.tipo}
            onChange={e => setQa(prev => ({ ...prev, tipo: e.target.value }))}
            className="text-xs font-medium text-intento-blue px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white"
          >
            {tiposPara(qa.materiaSelect).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input
            type="text"
            value={qa.observacao}
            onChange={e => setQa(prev => ({ ...prev, observacao: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') salvarQuickAdd(); }}
            placeholder="observação…"
            className="flex-1 min-w-[120px] text-xs font-medium text-slate-600 px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white placeholder:text-slate-400"
          />
          <button
            onClick={salvarQuickAdd}
            disabled={salvandoQa}
            className="text-xs font-semibold bg-intento-blue hover:bg-blue-900 text-white px-4 py-2 rounded-lg transition disabled:opacity-40"
          >
            {salvandoQa ? 'Salvando…' : 'Adicionar'}
          </button>
        </div>
        {ehSelecaoOutra(qa.materiaSelect) && (
          <input
            type="text"
            value={qa.materiaTexto}
            onChange={e => setQa(prev => ({ ...prev, materiaTexto: e.target.value }))}
            placeholder={placeholderOutra(qa.materiaSelect)}
            className="mt-2 w-full sm:w-64 text-xs font-medium text-intento-blue px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white"
          />
        )}
        <p className="text-[10px] text-slate-400 mt-1.5">salva e mantém a data — cadastre a semana de provas em sequência</p>
        {erroQa && <p className="text-xs text-red-600 font-medium mt-1">{erroQa}</p>}
      </div>

      {/* A registrar — promovida pra primeira dobra; a fila não expira */}
      {aRegistrar.length > 0 && (
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            A registrar ({aRegistrar.length})
            <span className="ml-2 normal-case tracking-normal font-medium text-amber-700">— da prova pra cá, ninguém contou como foi</span>
          </h3>
          <div className="space-y-2">
            {aRegistrar.map(p => (
              <div key={p.id} className="bg-amber-50/60 border border-amber-200 border-l-4 border-l-amber-500 rounded-lg p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">{chipTipo(p)}</span>
                    <span className="text-sm font-semibold text-slate-800">{p.materia}</span>
                    {chipAutoria(p)}
                  </div>
                  <p className="text-xs text-slate-500 font-medium">{formatarData(p.data)} · {countdownLabel(diasAte(p.data))}</p>
                  {p.observacao && <p className="text-[11px] text-slate-500 mt-1 italic">{p.observacao}</p>}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <button
                      onClick={() => abrirEdicao(p, true)}
                      className="text-[11px] font-bold text-intento-blue bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-intento-blue transition"
                    >
                      {ehProvaVestibular(p) ? '+ registrar "Como foi?"' : '+ adicionar nota e "Como foi?"'}
                    </button>
                    <button
                      onClick={() => fecharSemNota(p)}
                      disabled={fechandoId === p.id}
                      className="text-[11px] font-medium text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition disabled:opacity-40"
                    >
                      {fechandoId === p.id ? 'Registrando…' : ehProvaVestibular(p) ? 'não compareceu' : 'sem nota divulgada'}
                    </button>
                  </div>
                </div>
                {botoesItem(p)}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Próximas */}
      <section>
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Próximas</h3>
        {proximas.length === 0 ? (
          <p className="text-sm text-slate-400 italic py-4 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
            Nenhuma prova futura. Use o &quot;Adicionar rápido&quot; acima — ou peça as datas no próximo encontro.
          </p>
        ) : (
          <div className="space-y-2">
            {proximas.map(p => {
              const dias = diasAte(p.data);
              return (
                <div key={p.id} className={`bg-white border border-slate-200 border-l-4 ${corBordaPorDias(dias)} rounded-lg p-3 flex items-start justify-between gap-3 hover:bg-slate-50 transition`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{chipTipo(p)}</span>
                      <span className="text-sm font-semibold text-slate-800">{p.materia}</span>
                      {chipAutoria(p)}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {formatarData(p.data)} · <span className={dias <= 3 ? 'text-red-600 font-bold' : dias <= 7 ? 'text-amber-700 font-bold' : 'text-slate-500'}>{countdownLabel(dias)}</span>
                    </p>
                    {p.observacao && <p className="text-[11px] text-slate-400 mt-1 italic truncate">{p.observacao}</p>}
                  </div>
                  {botoesItem(p)}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Histórico (com resultado registrado ou substituídas) */}
      <section>
        <button
          onClick={() => setHistoricoAberto(v => !v)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 hover:text-intento-blue transition"
        >
          <span>Histórico {historico.length > 0 && `(${historico.length})`}</span>
          <svg className={`w-3.5 h-3.5 transition-transform ${historicoAberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
        {historicoAberto && (
          historico.length === 0 ? (
            <p className="text-sm text-slate-400 italic py-4 text-center">Sem provas com resultado ainda.</p>
          ) : (
            <div className="space-y-2">
              {historico.map(p => (
                <div key={p.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">{chipTipo(p)}</span>
                      <span className="text-sm font-semibold text-slate-700">{p.materia}</span>
                      {p.nota !== null && p.nota !== undefined ? (
                        <span className="text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">Nota {p.nota}</span>
                      ) : p.resultadoEm ? (
                        <span className="text-[11px] font-bold bg-slate-200 text-slate-600 border border-slate-300 px-2 py-0.5 rounded-full">{ehProvaVestibular(p) ? 'registrada' : 'sem nota'}</span>
                      ) : null}
                      {chipAutoria(p)}
                    </div>
                    <p className="text-xs text-slate-500 font-medium">{formatarData(p.data)} · {countdownLabel(diasAte(p.data))}</p>
                    {p.observacao && <p className="text-[11px] text-slate-500 mt-1 italic">{p.observacao}</p>}
                  </div>
                  {botoesItem(p)}
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {/* Boletim — só faz sentido pra aluno EM (notas escolares) */}
      {ehEM && (
        <section>
          <button
            onClick={() => setBoletimAberto(v => !v)}
            className="w-full flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 hover:text-intento-blue transition"
          >
            <span>Boletim</span>
            <svg className={`w-3.5 h-3.5 transition-transform ${boletimAberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {boletimAberto && <Boletim provas={provas || []} />}
        </section>
      )}

      {/* Modal cadastro em lote */}
      {cadastroAberto && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4"
             onClick={(e) => { if (e.target === e.currentTarget) setCadastroAberto(false); }}>
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            <div className="px-6 py-5 border-b border-slate-100 shrink-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cadastrar em lote</p>
              <h2 className="text-base font-semibold text-intento-blue mt-0.5">{alunoNome}</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Adicione uma ou mais provas. Salvar é atômico — se uma falhar, nenhuma entra.</p>
            </div>

            <div className="p-6 space-y-3 overflow-y-auto flex-1">
              {linhas.map((l, idx) => {
                const ehOutra = ehSelecaoOutra(l.materiaSelect);
                return (
                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prova {idx + 1}</span>
                      {linhas.length > 1 && (
                        <button onClick={() => removerLinha(idx)} className="text-xs text-slate-400 hover:text-red-500" title="Remover">🗑</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="date"
                        value={l.data}
                        onChange={e => atualizarLinha(idx, 'data', e.target.value)}
                        className="text-xs font-medium text-intento-blue px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white"
                      />
                      <select
                        value={l.materiaSelect}
                        onChange={e => atualizarLinhaMateria(idx, e.target.value)}
                        className="text-xs font-medium text-intento-blue px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white"
                      >
                        <option value="">{rotuloEntidade}…</option>
                        {opcoesMateria()}
                      </select>
                      <select
                        value={l.tipo}
                        onChange={e => atualizarLinha(idx, 'tipo', e.target.value)}
                        className="text-xs font-medium text-intento-blue px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white"
                      >
                        <option value="">{selecaoVest(l.materiaSelect) ? 'Fase…' : 'Tipo…'}</option>
                        {tiposPara(l.materiaSelect).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    {ehOutra && (
                      <input
                        type="text"
                        value={l.materiaTexto}
                        onChange={e => atualizarLinha(idx, 'materiaTexto', e.target.value)}
                        placeholder={placeholderOutra(l.materiaSelect)}
                        className="w-full text-xs font-medium text-intento-blue px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white"
                      />
                    )}
                    {ehEM && l.tipo === 'recuperacao' && (() => {
                      const materiaAtual = ehOutra ? l.materiaTexto.trim() : l.materiaSelect;
                      const opcoes = opcoesParaSubstituir(materiaAtual);
                      return (
                        <div>
                          <select
                            value={l.substituiId}
                            onChange={e => atualizarLinha(idx, 'substituiId', e.target.value)}
                            disabled={!materiaAtual || opcoes.length === 0}
                            className="w-full text-xs font-medium text-intento-blue px-2 py-2 border border-amber-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-amber-50 disabled:opacity-60"
                          >
                            <option value="">— Substitui qual prova? (opcional) —</option>
                            {opcoes.map(p => (
                              <option key={p.id} value={p.id}>
                                {formatarData(p.data)} · {tipoLabel(p.tipo)}
                                {p.nota !== null && p.nota !== undefined ? ` · nota ${p.nota}` : ''}
                              </option>
                            ))}
                          </select>
                          {!materiaAtual && (
                            <p className="text-[10px] text-amber-700 font-medium mt-1">Selecione a matéria primeiro pra escolher qual prova substituir.</p>
                          )}
                          {materiaAtual && opcoes.length === 0 && (
                            <p className="text-[10px] text-slate-500 font-medium mt-1">Nenhuma prova de {materiaAtual} cadastrada — pode salvar mesmo assim (vira prova normal).</p>
                          )}
                        </div>
                      );
                    })()}
                    <input
                      type="text"
                      value={l.observacao}
                      onChange={e => atualizarLinha(idx, 'observacao', e.target.value)}
                      placeholder="Observação (opcional, ex: capítulos 5–8)"
                      className="w-full text-xs font-medium text-slate-600 px-2 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white placeholder:text-slate-400"
                    />
                  </div>
                );
              })}

              <button
                onClick={adicionarLinha}
                className="w-full py-2 text-xs font-semibold text-intento-blue border-2 border-dashed border-slate-300 hover:border-intento-blue rounded-lg transition"
              >
                + Adicionar outra prova
              </button>

              {erroBatch && <p className="text-xs text-red-600 font-medium">{erroBatch}</p>}
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setCadastroAberto(false)}
                className="text-sm font-semibold text-slate-500 hover:text-intento-blue px-4 py-2 transition"
              >
                Cancelar
              </button>
              <button
                onClick={salvarBatch}
                disabled={salvandoBatch}
                className="text-sm font-semibold bg-intento-blue hover:bg-blue-900 text-white px-5 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {salvandoBatch ? 'Salvando…' : `Salvar ${linhas.length} prova${linhas.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal edição */}
      {provaEditando && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-intento-blue/40 backdrop-blur-sm p-4"
             onClick={(e) => { if (e.target === e.currentTarget) setProvaEditando(null); }}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {editModoResultado ? 'Registrar resultado' : 'Editar prova'}
              </p>
              <h2 className="text-base font-semibold text-intento-blue mt-0.5">{alunoNome}</h2>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Data</label>
                <input type="date" value={editData} onChange={e => setEditData(e.target.value)}
                       className="w-full text-sm font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue"/>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{rotuloEntidade}</label>
                <select value={editMateriaSel}
                        onChange={e => {
                          const sel = e.target.value;
                          setEditMateriaSel(sel);
                          setEditTipo(tipoAoTrocarMateria(editTipo, sel));
                        }}
                        className="w-full text-sm font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue">
                  <option value="">— escolha —</option>
                  {opcoesMateria()}
                </select>
                {ehSelecaoOutra(editMateriaSel) && (
                  <input type="text" value={editMateriaTxt} onChange={e => setEditMateriaTxt(e.target.value)}
                         placeholder={placeholderOutra(editMateriaSel)}
                         className="w-full mt-2 text-sm font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400"/>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{selecaoVest(editMateriaSel) ? 'Fase' : 'Tipo'}</label>
                <select value={editTipo} onChange={e => setEditTipo(e.target.value)}
                        className="w-full text-sm font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue">
                  <option value="">— escolha —</option>
                  {tiposPara(editMateriaSel).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {ehEM && editTipo === 'recuperacao' && (() => {
                const materiaAtual = editMateriaSel === 'Outra' ? editMateriaTxt.trim() : editMateriaSel;
                const opcoes = opcoesParaSubstituir(materiaAtual, provaEditando.id);
                return (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Substitui qual prova?</label>
                    <select value={editSubstituiId} onChange={e => setEditSubstituiId(e.target.value)}
                            disabled={!materiaAtual || opcoes.length === 0}
                            className="w-full text-sm font-medium text-intento-blue px-3 py-2 border border-amber-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-amber-50 disabled:opacity-60">
                      <option value="">— Não substitui (vira prova normal na média) —</option>
                      {opcoes.map(p => (
                        <option key={p.id} value={p.id}>
                          {formatarData(p.data)} · {tipoLabel(p.tipo)}
                          {p.nota !== null && p.nota !== undefined ? ` · nota ${p.nota}` : ''}
                        </option>
                      ))}
                    </select>
                    {!materiaAtual && (
                      <p className="text-[10px] text-amber-700 font-medium mt-1">Selecione a matéria primeiro pra escolher qual prova substituir.</p>
                    )}
                    {materiaAtual && opcoes.length === 0 && (
                      <p className="text-[10px] text-slate-500 font-medium mt-1">Nenhuma prova de {materiaAtual} cadastrada — pode salvar mesmo assim.</p>
                    )}
                  </div>
                );
              })()}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Observação / Como foi?</label>
                <textarea value={editObs} onChange={e => setEditObs(e.target.value)}
                          rows={2} placeholder="Antes da prova: capítulos cobrados. Depois: comentário sobre desempenho."
                          className="w-full text-sm font-medium text-slate-700 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400 resize-none"/>
              </div>
              {!selecaoVest(editMateriaSel) && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nota (0–10, opcional)</label>
                  <input type="number" min="0" max="10" step="0.1" value={editNota}
                         onChange={e => setEditNota(e.target.value)}
                         placeholder="ex: 7.5"
                         className="w-full text-sm font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400"/>
                </div>
              )}
              {editModoResultado && selecaoVest(editMateriaSel) && (
                <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  Salvar registra o resultado — a prova sai da fila &quot;A registrar&quot;.
                </p>
              )}
            </div>
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setProvaEditando(null)}
                      className="text-sm font-semibold text-slate-500 hover:text-intento-blue px-4 py-2 transition">Cancelar</button>
              <button onClick={salvarEdit} disabled={salvandoEdit}
                      data-loading={salvandoEdit}
                      className="text-sm font-semibold bg-intento-blue hover:bg-blue-900 text-white px-5 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed data-[loading=true]:cursor-wait inline-flex items-center gap-2">
                {salvandoEdit && <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {salvandoEdit ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        aberto={!!provaParaDeletar}
        titulo="Deletar prova?"
        descricao={provaParaDeletar
          ? `Prova de ${provaParaDeletar.materia} de ${formatarData(provaParaDeletar.data)} será removida${ehEM && !ehProvaVestibular(provaParaDeletar) ? ' do boletim' : ''}. Não dá pra desfazer.`
          : ''}
        textoConfirmar="Deletar"
        tom="danger"
        carregando={deletando}
        onConfirmar={confirmarDelete}
        onCancelar={() => setProvaParaDeletar(null)}
      />
    </div>
  );
}
