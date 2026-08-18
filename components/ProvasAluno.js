'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { auth } from '@/lib/firebase';
import ConfirmDialog from '@/components/ConfirmDialog';

// O gateway sobrescreve `email` com o do token Firebase pra ações autenticadas,
// então enviar email='' aqui é seguro — o backend usa o usuário real.
function emailRequester() {
  return auth.currentUser?.email || '';
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Prova escolar: matéria + tipo. Select fechado — "Outra" fica com o mentor,
// protegendo o agrupamento do Boletim.
const MATERIAS_EM = [
  'Português', 'Matemática', 'Inglês', 'Espanhol',
  'História', 'Geografia', 'Biologia', 'Química',
  'Física', 'Sociologia', 'Filosofia', 'Arte', 'Educação Física',
];
const TIPOS_EM = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'recuperacao', label: 'Recuperação' },
];

// Prova de vestibular: vestibular + fase. Lista curada + "Outro" (texto livre).
const VESTIBULARES = ['ENEM', 'SSA (UPE)', 'FUVEST', 'UNICAMP', 'UNESP', 'UERJ'];
const TIPOS_ENEM = [
  { value: 'unica', label: 'Fase única' },
  { value: 'fase1', label: '1ª fase' },
  { value: 'fase2', label: '2ª fase' },
  { value: 'dia1', label: 'Dia 1' },
  { value: 'dia2', label: 'Dia 2' },
];

// Se a prova é escolar ou de vestibular, quem decide é a PROVA, não o aluno:
// aluno EM (3º ano) também planeja vestibular, então a lista dele mistura as
// duas. Os vocabulários de tipo são disjuntos — o tipo identifica cada prova.
const TIPOS_TODOS = [...TIPOS_EM, ...TIPOS_ENEM];
const TIPOS_VESTIBULAR = new Set(TIPOS_ENEM.map(t => t.value));
const ehProvaVestibular = (p) => TIPOS_VESTIBULAR.has(p.tipo);

function inicioDoDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function formatarData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()}/${MESES[d.getMonth()]}`;
}
function diasAte(iso) {
  if (!iso) return null;
  return Math.round((inicioDoDia(new Date(iso)) - inicioDoDia(new Date())) / (1000 * 60 * 60 * 24));
}
function countdown(dias) {
  if (dias === 0) return 'HOJE';
  if (dias === 1) return 'AMANHÃ';
  return `em ${dias} dias`;
}
function corPorDias(dias) {
  if (dias <= 3) return { box: 'bg-red-50 border-red-200 border-l-red-500', txt: 'text-red-600', borda: 'border-l-red-500' };
  if (dias <= 7) return { box: 'bg-amber-50 border-amber-200 border-l-amber-500', txt: 'text-amber-700', borda: 'border-l-amber-500' };
  return { box: 'bg-slate-50 border-slate-200 border-l-slate-300', txt: 'text-slate-500', borda: 'border-l-slate-200' };
}
function inputParaIso(input) {
  // "YYYY-MM-DD" -> ISO no fuso local (meio-dia pra evitar bugs de timezone)
  if (!input) return '';
  const [y, m, d] = input.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
}
function dataParaInput(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Fita de datas do quick-add: próximos 14 dias.
function proximasDatas() {
  const out = [];
  const base = inicioDoDia(new Date());
  for (let i = 1; i <= 14; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    out.push(d);
  }
  return out;
}

const LS_ULTIMO_TIPO = 'provas_ultimo_tipo';

export default function ProvasAluno({ idAluno, tipoAluno = 'EM' }) {
  const ehEM = tipoAluno === 'EM';
  const tipoLabel = (t) => (TIPOS_TODOS.find(x => x.value === t) || { label: t }).label;

  // Pro aluno EM, o chip escolhido no quick-add decide se a prova é escolar ou
  // de vestibular ('__outro__' só existe no grupo vestibular).
  const selecaoVest = (sel) => !ehEM || VESTIBULARES.includes(sel) || sel === '__outro__';
  const tiposPara = (sel) => (selecaoVest(sel) ? TIPOS_ENEM : TIPOS_EM);
  // Na lista mista do EM, o 🎯 marca as provas de vestibular.
  const chipTipo = (p) => (ehEM && ehProvaVestibular(p) ? '🎯 ' : '') + tipoLabel(p.tipo);

  const [provas, setProvas] = useState(null);
  const [erro, setErro] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  // Quick-add (bottom-sheet)
  const [sheetAberto, setSheetAberto] = useState(false);
  const [qaMateria, setQaMateria] = useState('');
  const [qaMateriaTxt, setQaMateriaTxt] = useState(''); // só ENEM "Outro"
  const [qaData, setQaData] = useState('');            // "YYYY-MM-DD"
  const [qaOutraData, setQaOutraData] = useState(false);
  const [qaTipo, setQaTipo] = useState('');
  const [qaObs, setQaObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erroSheet, setErroSheet] = useState('');

  // "Como foi?" (bottom-sheet de resultado)
  const [resultadoProva, setResultadoProva] = useState(null);
  const [resRelato, setResRelato] = useState('');
  const [resNota, setResNota] = useState('');
  const [salvandoRes, setSalvandoRes] = useState(false);

  // Ações por item
  const [itemAberto, setItemAberto] = useState(null);   // id com ações expandidas
  const [mudandoData, setMudandoData] = useState(null); // { id, valor }
  const [provaParaRemover, setProvaParaRemover] = useState(null);
  const [removendo, setRemovendo] = useState(false);

  const mostrarToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  };

  const carregar = async () => {
    try {
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'listarAvaliacoesAluno', email: emailRequester(), idAluno }),
      });
      const data = await res.json();
      if (data.status !== 'sucesso') { setErro(data.mensagem || 'Erro ao carregar.'); return; }
      setErro('');
      setProvas(data.avaliacoes || []);
    } catch (e) {
      setErro('Erro de conexão.');
    }
  };

  useEffect(() => { carregar(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [idAluno]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const { proximas, aguardando } = useMemo(() => {
    if (!provas) return { proximas: [], aguardando: [] };
    const hoje = inicioDoDia(new Date());
    const proximas = [];
    const aguardando = [];
    const substituidas = new Set(provas.map(p => p.substituiId).filter(Boolean));
    provas.forEach(p => {
      const d = inicioDoDia(new Date(p.data));
      if (isNaN(d.getTime())) return;
      if (d >= hoje) { proximas.push(p); return; }
      // Pendente de resultado: passou, ninguém registrou, não foi substituída
      // por recuperação. Aparece pro aluno por 14 dias — depois é assunto do mentor.
      const dias = Math.round((hoje - d) / (1000 * 60 * 60 * 24));
      if (!p.resultadoEm && p.nota === null && !substituidas.has(p.id) && dias <= 14) {
        aguardando.push(p);
      }
    });
    proximas.sort((a, b) => new Date(a.data) - new Date(b.data));
    aguardando.sort((a, b) => new Date(b.data) - new Date(a.data));
    return { proximas, aguardando };
  }, [provas]);

  // Chips de matéria: as mais usadas pelo próprio aluno primeiro.
  const materiasOrdenadas = useMemo(() => {
    const base = ehEM ? MATERIAS_EM : VESTIBULARES;
    if (!provas || provas.length === 0) return base;
    const freq = {};
    provas.forEach(p => { freq[p.materia] = (freq[p.materia] || 0) + 1; });
    return [...base].sort((a, b) => (freq[b] || 0) - (freq[a] || 0));
  }, [provas, ehEM]);
  const [chipsExpandidos, setChipsExpandidos] = useState(false);
  const chipsVisiveis = chipsExpandidos ? materiasOrdenadas : materiasOrdenadas.slice(0, 6);

  const abrirSheet = () => {
    setQaMateria('');
    setQaMateriaTxt('');
    setQaData('');
    setQaOutraData(false);
    setQaObs('');
    setErroSheet('');
    const tiposIniciais = tiposPara('');
    const ultimoTipo = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_ULTIMO_TIPO + '_' + tipoAluno) : '';
    setQaTipo(tiposIniciais.some(t => t.value === ultimoTipo) ? ultimoTipo : tiposIniciais[0].value);
    setChipsExpandidos(false);
    setSheetAberto(true);
  };

  // Escolher chip pode alternar entre escolar e vestibular — tipo que não existe
  // no novo vocabulário cai no default dele (mensal pra escola, fase única pra
  // vestibular).
  const escolherMateria = (m) => {
    setQaMateria(m);
    setQaTipo(prev => (tiposPara(m).some(t => t.value === prev) ? prev : tiposPara(m)[0].value));
  };

  const salvarQuickAdd = async () => {
    if (salvando) return;
    const materia = qaMateria === '__outro__' ? qaMateriaTxt.trim() : qaMateria;
    if (!materia) { setErroSheet(ehEM ? 'Escolha a matéria.' : 'Escolha o vestibular.'); return; }
    if (!qaData) { setErroSheet('Escolha a data.'); return; }
    setSalvando(true);
    setErroSheet('');
    try {
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'cadastrarAvaliacoes',
          email: emailRequester(),
          idAluno,
          avaliacoes: [{ data: inputParaIso(qaData), materia, tipo: qaTipo, observacao: qaObs.trim() }],
        }),
      });
      const data = await res.json();
      if (data.status !== 'sucesso') { setErroSheet(data.mensagem || 'Erro ao salvar.'); return; }
      try { localStorage.setItem(LS_ULTIMO_TIPO + '_' + tipoAluno, qaTipo); } catch (_) {}
      setSheetAberto(false);
      mostrarToast(`✓ ${materia} adicionada`);
      await carregar();
    } catch (e) {
      setErroSheet('Erro de conexão.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirResultado = (prova) => {
    setResultadoProva(prova);
    setResRelato(prova.observacao || '');
    setResNota('');
  };

  const salvarResultado = async (semNota) => {
    if (salvandoRes || !resultadoProva) return;
    const provaEscolar = !ehProvaVestibular(resultadoProva);
    if (provaEscolar && !semNota && resNota !== '' && (isNaN(Number(resNota)) || Number(resNota) < 0 || Number(resNota) > 10)) {
      mostrarToast('Nota deve ser entre 0 e 10.');
      return;
    }
    setSalvandoRes(true);
    try {
      const body = {
        acao: 'atualizarAvaliacao',
        email: emailRequester(),
        idAvaliacao: resultadoProva.id,
        observacao: resRelato.trim(),
        resultadoRegistrado: true,
      };
      if (provaEscolar && !semNota && resNota !== '') body.nota = Number(resNota);
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status !== 'sucesso') { mostrarToast(data.mensagem || 'Erro ao salvar.'); return; }
      setResultadoProva(null);
      mostrarToast('✓ Registrado — seu mentor vai ver');
      await carregar();
    } catch (e) {
      mostrarToast('Erro de conexão.');
    } finally {
      setSalvandoRes(false);
    }
  };

  const salvarNovaData = async () => {
    if (!mudandoData?.valor) return;
    const alvo = mudandoData;
    setMudandoData(null);
    setItemAberto(null);
    try {
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'atualizarAvaliacao', email: emailRequester(), idAvaliacao: alvo.id, data: inputParaIso(alvo.valor) }),
      });
      const data = await res.json();
      if (data.status !== 'sucesso') { mostrarToast(data.mensagem || 'Erro ao mudar a data.'); return; }
      mostrarToast('✓ Data atualizada');
      await carregar();
    } catch (e) {
      mostrarToast('Erro de conexão.');
    }
  };

  const confirmarRemocao = async () => {
    if (!provaParaRemover) return;
    setRemovendo(true);
    try {
      const res = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'deletarAvaliacao', email: emailRequester(), idAvaliacao: provaParaRemover.id }),
      });
      const data = await res.json();
      if (data.status !== 'sucesso') { mostrarToast(data.mensagem || 'Erro ao remover.'); return; }
      setProvaParaRemover(null);
      setItemAberto(null);
      mostrarToast('Prova removida');
      await carregar();
    } catch (e) {
      mostrarToast('Erro de conexão.');
    } finally {
      setRemovendo(false);
    }
  };

  const emailAluno = (auth.currentUser?.email || '').toLowerCase();
  const criadaPorMim = (p) => (p.criadoPor || '').toLowerCase() === emailAluno;

  const titulo = ehEM ? '📅 Próximas provas' : '🎯 Reta de provas';
  const heroi = proximas[0];
  const demais = proximas.slice(1, 5);
  const banner = aguardando[0];

  if (provas === null && !erro) return null; // silencioso enquanto carrega

  return (
    <div className="space-y-4">
      {/* Banner de cobrança D+1: a prova passou, conta como foi */}
      {banner && (
        <div className="bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-800">
            {!ehProvaVestibular(banner)
              ? `Como foi a prova de ${banner.materia}${diasAte(banner.data) === -1 ? ' de ontem' : ` de ${formatarData(banner.data)}`}?`
              : `Como foi ${banner.materia} (${tipoLabel(banner.tipo)})${diasAte(banner.data) === -1 ? ' ontem' : ` em ${formatarData(banner.data)}`}?`}
          </p>
          <button
            onClick={() => abrirResultado(banner)}
            className="mt-2.5 text-sm font-bold bg-intento-yellow hover:brightness-95 text-intento-blue px-4 py-2 rounded-lg transition"
          >
            Registrar como foi
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-sm font-bold text-intento-blue">{titulo}</h2>
          <button
            onClick={abrirSheet}
            className="text-xs font-semibold bg-intento-blue hover:bg-blue-900 text-white px-3 py-1.5 rounded-lg transition"
          >
            + Prova
          </button>
        </div>

        {erro && (
          <p className="px-5 pb-4 text-xs text-red-600 font-medium">
            {erro}{' '}
            <button onClick={carregar} className="text-intento-blue hover:underline font-semibold">tentar de novo</button>
          </p>
        )}

        {!erro && proximas.length === 0 && (
          <div className="px-5 pb-5 text-center">
            <p className="text-sm text-slate-500">
              {ehEM ? 'Nenhuma prova no radar. Ficou sabendo de uma?' : 'Nenhum vestibular no radar ainda.'}
            </p>
            <button
              onClick={abrirSheet}
              className="mt-3 text-sm font-bold bg-intento-yellow hover:brightness-95 text-intento-blue px-4 py-2 rounded-lg transition"
            >
              + Adicionar prova
            </button>
          </div>
        )}

        {/* Mini-hero: a próxima prova em destaque */}
        {heroi && (() => {
          const dias = diasAte(heroi.data);
          const cor = corPorDias(dias);
          return (
            <div className="px-3 pb-1">
              <div className={`border border-l-4 ${cor.box} rounded-xl p-3.5`}>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Próxima prova</p>
                <div className="flex items-center justify-between gap-3 mt-1">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-900 truncate">{heroi.materia}</p>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                      {chipTipo(heroi)} · {formatarData(heroi.data)}
                      {heroi.observacao ? ` · ${heroi.observacao}` : ''}
                      {criadaPorMim(heroi) ? ' · você' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <p className={`text-base font-bold ${cor.txt} whitespace-nowrap`}>{countdown(dias)}</p>
                    {heroi.nota === null && (
                      <button onClick={() => setItemAberto(itemAberto === heroi.id ? null : heroi.id)}
                              className="text-slate-400 hover:text-intento-blue px-1.5 py-1 font-bold" title="Opções">⋯</button>
                    )}
                  </div>
                </div>
                {itemAberto === heroi.id && (
                  <AcoesItem prova={heroi} mudandoData={mudandoData} setMudandoData={setMudandoData}
                             salvarNovaData={salvarNovaData} onRemover={() => setProvaParaRemover(heroi)} />
                )}
              </div>
            </div>
          );
        })()}

        {/* Demais próximas, compactas */}
        {demais.length > 0 && (
          <div className="px-3 pb-2 pt-1 space-y-1.5">
            {demais.map(p => {
              const dias = diasAte(p.data);
              const cor = corPorDias(dias);
              return (
                <div key={p.id} className={`bg-white border border-slate-200 border-l-4 ${cor.borda} rounded-lg px-3 py-2`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{p.materia}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{chipTipo(p)}</span>
                      {criadaPorMim(p) && <span className="text-[10px] font-medium text-slate-400">você</span>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-xs font-bold ${cor.txt} whitespace-nowrap`}>{formatarData(p.data)} · {countdown(diasAte(p.data)).toLowerCase()}</span>
                      {p.nota === null && (
                        <button onClick={() => setItemAberto(itemAberto === p.id ? null : p.id)}
                                className="text-slate-400 hover:text-intento-blue px-1 font-bold" title="Opções">⋯</button>
                      )}
                    </div>
                  </div>
                  {itemAberto === p.id && (
                    <AcoesItem prova={p} mudandoData={mudandoData} setMudandoData={setMudandoData}
                               salvarNovaData={salvarNovaData} onRemover={() => setProvaParaRemover(p)} />
                  )}
                </div>
              );
            })}
            {proximas.length > 5 && (
              <p className="text-[11px] text-slate-400 text-center pt-1 italic">+{proximas.length - 5} prova{proximas.length - 5 !== 1 ? 's' : ''} a seguir</p>
            )}
          </div>
        )}

        {/* Aguardando resultado */}
        {aguardando.length > 0 && (
          <div className="border-t border-dashed border-slate-200 px-5 py-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Aguardando resultado</p>
            {aguardando.map(p => (
              <button key={p.id} onClick={() => abrirResultado(p)}
                      className="w-full text-left py-1 group">
                <span className="text-xs font-medium text-slate-600 group-hover:text-intento-blue transition">
                  {p.materia} · {formatarData(p.data)} — <span className="font-semibold text-intento-blue">registrar como foi</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom-sheet: adicionar prova */}
      {sheetAberto && (
        <div role="dialog" aria-modal="true"
             className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-intento-blue/40 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setSheetAberto(false); }}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-8 sm:pb-5 safe-area-bottom max-h-[85vh] overflow-y-auto">
            <div className="w-9 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />
            <h3 className="text-sm font-bold text-intento-blue mb-4">Adicionar prova</h3>

            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              {ehEM ? 'Qual matéria?' : 'Qual vestibular?'}
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {chipsVisiveis.map(m => (
                <button key={m} onClick={() => escolherMateria(m)}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${qaMateria === m ? 'bg-intento-blue text-white border-intento-blue font-bold' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                  {m}
                </button>
              ))}
              {!chipsExpandidos && materiasOrdenadas.length > 6 && (
                <button onClick={() => setChipsExpandidos(true)}
                        className="text-xs font-medium px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500">
                  todas ▾
                </button>
              )}
              {!ehEM && (
                <button onClick={() => escolherMateria('__outro__')}
                        className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${qaMateria === '__outro__' ? 'bg-intento-blue text-white border-intento-blue font-bold' : 'bg-white text-slate-600 border-slate-200'}`}>
                  Outro
                </button>
              )}
            </div>
            {/* Aluno EM (3º ano) também planeja vestibular — grupo próprio pra
                não misturar com as matérias da escola. */}
            {ehEM && (
              <>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">🎯 Ou um vestibular?</p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {VESTIBULARES.map(v => (
                    <button key={v} onClick={() => escolherMateria(v)}
                            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${qaMateria === v ? 'bg-intento-blue text-white border-intento-blue font-bold' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                      {v}
                    </button>
                  ))}
                  <button onClick={() => escolherMateria('__outro__')}
                          className={`text-xs font-medium px-3 py-1.5 rounded-full border transition ${qaMateria === '__outro__' ? 'bg-intento-blue text-white border-intento-blue font-bold' : 'bg-white text-slate-600 border-slate-200'}`}>
                    Outro
                  </button>
                </div>
              </>
            )}
            {qaMateria === '__outro__' && (
              <input type="text" value={qaMateriaTxt} onChange={e => setQaMateriaTxt(e.target.value)}
                     placeholder="Nome do vestibular"
                     className="w-full mb-4 text-sm font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400" />
            )}

            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Quando?</p>
            {!qaOutraData ? (
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
                {proximasDatas().map(d => {
                  const valor = dataParaInput(d);
                  const on = qaData === valor;
                  return (
                    <button key={valor} onClick={() => setQaData(valor)}
                            className={`shrink-0 w-12 rounded-xl border text-center py-1.5 transition ${on ? 'bg-intento-blue border-intento-blue' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                      <span className={`block text-[9px] font-bold uppercase ${on ? 'text-blue-200' : 'text-slate-400'}`}>{DIAS_SEMANA[d.getDay()]}</span>
                      <span className={`block text-sm font-bold ${on ? 'text-white' : 'text-slate-800'}`}>{d.getDate()}</span>
                    </button>
                  );
                })}
                <button onClick={() => { setQaOutraData(true); setQaData(''); }}
                        className="shrink-0 w-12 rounded-xl border border-slate-200 bg-slate-50 text-center py-1.5">
                  <span className="block text-[9px] font-bold uppercase text-slate-400">🗓</span>
                  <span className="block text-sm font-bold text-slate-500">…</span>
                </button>
              </div>
            ) : (
              <input type="date" value={qaData} onChange={e => setQaData(e.target.value)}
                     className="w-full mb-3 text-sm font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue" />
            )}

            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{selecaoVest(qaMateria) ? 'Fase' : 'Tipo'}</label>
                <select value={qaTipo} onChange={e => setQaTipo(e.target.value)}
                        className="w-full text-sm font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white">
                  {tiposPara(qaMateria).map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex-[2]">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Observação (opcional)</label>
                <input type="text" value={qaObs} onChange={e => setQaObs(e.target.value)}
                       placeholder={selecaoVest(qaMateria) ? 'ex: levar caneta preta' : 'ex: caps 5–8'}
                       className="w-full text-sm font-medium text-slate-600 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400" />
              </div>
            </div>

            {erroSheet && <p className="text-xs text-red-600 font-medium mb-3">{erroSheet}</p>}

            <button onClick={salvarQuickAdd} disabled={salvando}
                    className="w-full py-3 bg-intento-blue text-white font-semibold rounded-lg hover:bg-blue-900 transition-all disabled:opacity-50 text-sm">
              {salvando ? 'Salvando…' : 'Adicionar prova'}
            </button>
          </div>
        </div>
      )}

      {/* Bottom-sheet: registrar como foi */}
      {resultadoProva && (
        <div role="dialog" aria-modal="true"
             className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-intento-blue/40 backdrop-blur-sm"
             onClick={(e) => { if (e.target === e.currentTarget) setResultadoProva(null); }}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-8 sm:pb-5 safe-area-bottom">
            <div className="w-9 h-1 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {resultadoProva.materia} · {formatarData(resultadoProva.data)}
            </p>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-4 mb-1.5">Como foi?</label>
            <textarea value={resRelato} onChange={e => setResRelato(e.target.value)} rows={3}
                      placeholder="ex: achei difícil a parte de função…"
                      className="w-full text-sm font-medium text-slate-700 px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400 resize-none" />
            {!ehProvaVestibular(resultadoProva) && (
              <>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1.5">Nota (0–10, se já souber)</label>
                <input type="number" min="0" max="10" step="0.1" value={resNota} onChange={e => setResNota(e.target.value)}
                       placeholder="ex: 7.5"
                       className="w-full text-sm font-medium text-intento-blue px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue placeholder:text-slate-400" />
              </>
            )}
            <button onClick={() => salvarResultado(false)} disabled={salvandoRes}
                    className="w-full mt-4 py-3 bg-intento-blue text-white font-semibold rounded-lg hover:bg-blue-900 transition-all disabled:opacity-50 text-sm">
              {salvandoRes ? 'Salvando…' : 'Salvar'}
            </button>
            {!ehProvaVestibular(resultadoProva) && (
              <button onClick={() => salvarResultado(true)} disabled={salvandoRes}
                      className="w-full mt-2 py-2 text-xs font-medium text-slate-400 hover:text-intento-blue transition">
                ainda não sei a nota — salvar só o relato
              </button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        aberto={!!provaParaRemover}
        titulo="Remover prova?"
        descricao={provaParaRemover
          ? (criadaPorMim(provaParaRemover)
            ? `${provaParaRemover.materia} de ${formatarData(provaParaRemover.data)} sai do seu radar.`
            : `Essa prova foi adicionada pelo seu mentor. ${provaParaRemover.materia} de ${formatarData(provaParaRemover.data)} sai do radar de vocês dois.`)
          : ''}
        textoConfirmar="Remover"
        tom="danger"
        carregando={removendo}
        onConfirmar={confirmarRemocao}
        onCancelar={() => setProvaParaRemover(null)}
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] bg-intento-blue text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// Ações inline de um item futuro sem nota: mudar data / remover.
function AcoesItem({ prova, mudandoData, setMudandoData, salvarNovaData, onRemover }) {
  const editandoEsta = mudandoData?.id === prova.id;
  return (
    <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center gap-2 flex-wrap">
      {editandoEsta ? (
        <>
          <input type="date" value={mudandoData.valor}
                 onChange={e => setMudandoData({ id: prova.id, valor: e.target.value })}
                 className="text-xs font-medium text-intento-blue px-2 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue bg-white" />
          <button onClick={salvarNovaData} disabled={!mudandoData.valor}
                  className="text-xs font-semibold bg-intento-blue text-white px-3 py-1.5 rounded-lg disabled:opacity-40">OK</button>
          <button onClick={() => setMudandoData(null)} className="text-xs font-medium text-slate-400">cancelar</button>
        </>
      ) : (
        <>
          <button onClick={() => setMudandoData({ id: prova.id, valor: '' })}
                  className="text-xs font-semibold text-intento-blue bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition">
            Mudar data
          </button>
          <button onClick={onRemover}
                  className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 px-3 py-1.5 rounded-lg hover:bg-red-100 transition">
            Remover
          </button>
        </>
      )}
    </div>
  );
}
