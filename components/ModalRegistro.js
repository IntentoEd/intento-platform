'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const inputClass = "w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue transition-all font-medium text-intento-blue text-sm";
const labelClass = "block text-xs font-semibold text-slate-400 uppercase mb-2 tracking-wider";

export default function ModalRegistro({ alunos, alunoPreSelecionado, onClose, onRegistroSalvo }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [statusMsg, setStatusMsg] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvoComSucesso, setSalvoComSucesso] = useState(false);
  const [buscandoMeta, setBuscandoMeta] = useState(false);
  const [registroExistente, setRegistroExistente] = useState(false);
  const [dataRegistroExistente, setDataRegistroExistente] = useState('');
  const [verificandoRegistro, setVerificandoRegistro] = useState(false);
  const [apagandoRegistro, setApagandoRegistro] = useState(false);

  const [form, setForm] = useState({
    idAluno: alunoPreSelecionado?.id || '',
    semana: '', mes: '', dataRegistro: '', metaSemanal: '',
    estresse: '', ansiedade: '', motivacao: '', sono: '',
    horasEstudadas: '', revisoesAtrasadas: '', dominioTotal: '', progressoTotal: '',
    dominioBio: '', progressoBio: '', dominioQui: '', progressoQui: '',
    dominioFis: '', progressoFis: '', dominioMat: '', progressoMat: '',
  });

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    const hoje = new Date();
    const domingo = new Date(hoje);
    domingo.setDate(hoje.getDate() - hoje.getDay() - 7);
    const sabado = new Date(domingo);
    sabado.setDate(domingo.getDate() + 6);
    const formatar = (d) => d.toLocaleDateString('pt-BR');
    const nomeMes = sabado.toLocaleString('pt-BR', { month: 'long' });
    setForm(prev => ({
      ...prev,
      dataRegistro: formatar(hoje),
      semana: `${formatar(domingo)} a ${formatar(sabado)}`,
      mes: nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1),
    }));
  }, []);

  const calcularTotais = (prev, campo, valor) => {
    const updated = { ...prev, [campo]: valor };
    const campos = ['dominioBio', 'dominioQui', 'dominioFis', 'dominioMat'];
    const camposProg = ['progressoBio', 'progressoQui', 'progressoFis', 'progressoMat'];
    // 0 = "sem informação", não nota real — exclui do cálculo da média
    const vals = campos.map(c => parseFloat(updated[c])).filter(n => !isNaN(n) && n > 0);
    const valsProg = camposProg.map(c => parseFloat(updated[c])).filter(n => !isNaN(n) && n > 0);
    updated.dominioTotal = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '';
    updated.progressoTotal = valsProg.length > 0 ? (valsProg.reduce((a, b) => a + b, 0) / valsProg.length).toFixed(2) : '';
    return updated;
  };

  const handleChange = (campo, valor) => {
    const isDisciplina = ['dominioBio','dominioQui','dominioFis','dominioMat','progressoBio','progressoQui','progressoFis','progressoMat'].includes(campo);
    if (isDisciplina) {
      setForm(prev => calcularTotais(prev, campo, valor));
    } else {
      setForm(prev => ({ ...prev, [campo]: valor }));
    }
  };

  const salvarRegistro = async () => {
    if (salvando) return;
    setSalvando(true);
    setStatusMsg('Salvando...');
    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'salvarRegistroGlobal', ...form }),
      });
      const data = await res.json();
      if (data.status === 'sucesso') {
        setStatusMsg('');
        setSalvoComSucesso(true);
        onRegistroSalvo?.(form.idAluno, form.semana);
      } else if (data.codigo === 'duplicado') {
        setRegistroExistente(true);
        setStatusMsg('Já existe registro para essa semana');
      } else {
        setStatusMsg('Erro: ' + data.mensagem);
      }
    } catch {
      setStatusMsg('Erro de conexão.');
    } finally {
      setSalvando(false);
    }
  };

  useEffect(() => {
    if (!form.idAluno || !form.semana) {
      setRegistroExistente(false);
      setDataRegistroExistente('');
      return;
    }
    let cancelado = false;
    setVerificandoRegistro(true);
    fetch('/api/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'verificarRegistroSemana', idAluno: form.idAluno, semana: form.semana }),
    })
      .then(r => r.json())
      .then(d => {
        if (cancelado) return;
        if (d.status === 'sucesso') {
          setRegistroExistente(!!d.existe);
          setDataRegistroExistente(d.dataRegistro || '');
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelado) setVerificandoRegistro(false); });
    return () => { cancelado = true; };
  }, [form.idAluno, form.semana]);

  const apagarRegistroExistente = async () => {
    if (!confirm('Apagar o registro existente desta semana? Essa ação não pode ser desfeita.')) return;
    setApagandoRegistro(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'deletarRegistro', idAluno: form.idAluno, semana: form.semana }),
      });
      const data = await res.json();
      if (data.status === 'sucesso') {
        setRegistroExistente(false);
        setDataRegistroExistente('');
      } else {
        setStatusMsg('Erro: ' + (data.mensagem || 'falha ao apagar'));
      }
    } catch {
      setStatusMsg('Erro de conexão.');
    } finally {
      setApagandoRegistro(false);
    }
  };

  const usarMetaAnterior = async () => {
    if (!form.idAluno) {
      setStatusMsg('Selecione o aluno primeiro');
      return;
    }
    setBuscandoMeta(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'buscarMetaAnterior', idAluno: form.idAluno }),
      });
      const data = await res.json();
      if (data.status === 'sucesso' && data.metaSemanal) {
        handleChange('metaSemanal', String(data.metaSemanal));
      } else if (data.status === 'sucesso') {
        setStatusMsg('Sem registro anterior pra esse aluno');
      } else {
        setStatusMsg('Erro: ' + (data.mensagem || 'falha ao buscar'));
      }
    } catch {
      setStatusMsg('Erro de conexão.');
    } finally {
      setBuscandoMeta(false);
    }
  };

  const irParaPNG = () => {
    if (!alunoSelecionado) return;
    router.push(`/mentor/ig/painel?id=${form.idAluno}&nome=${encodeURIComponent(alunoSelecionado.nome)}`);
  };

  const alunoSelecionado = alunos.find(a => String(a.id) === String(form.idAluno));

  const camposObrigatorios = {
    idAluno: 'Mentorando',
    metaSemanal: 'Meta semanal',
    horasEstudadas: 'Horas estudadas',
    revisoesAtrasadas: 'Revisões atrasadas',
    dominioBio: 'Domínio Bio',
    progressoBio: 'Progresso Bio',
    dominioQui: 'Domínio Qui',
    progressoQui: 'Progresso Qui',
    dominioFis: 'Domínio Fis',
    progressoFis: 'Progresso Fis',
    dominioMat: 'Domínio Mat',
    progressoMat: 'Progresso Mat',
  };
  const camposFaltando = Object.entries(camposObrigatorios)
    .filter(([campo]) => form[campo] === '' || form[campo] == null)
    .map(([, label]) => label);
  const formCompleto = camposFaltando.length === 0;

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl flex flex-col">

        {/* HEADER */}
        <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-sm font-bold text-intento-blue">Registro Analítico Semanal</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Passo {step} de 3</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Indicador de steps */}
            <div className="flex gap-1.5">
              {[1, 2, 3].map(s => (
                <div key={s} className={`h-1.5 rounded-full transition-all ${step >= s ? 'bg-intento-blue w-6' : 'bg-slate-200 w-3'}`} />
              ))}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-red-500 p-1 transition-colors" aria-label="Fechar">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Aluno selecionado — banner */}
        {alunoSelecionado && (
          <div className="px-5 pt-4">
            <div className="bg-intento-blue/5 border border-intento-blue/15 rounded-lg px-4 py-2.5 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-intento-blue flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-black">{alunoSelecionado.nome?.charAt(0)}</span>
              </div>
              <div>
                <p className="text-xs font-bold text-intento-blue">{alunoSelecionado.nome}</p>
                <p className="text-[10px] text-slate-400 font-medium">{alunoSelecionado.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* BANNER — registro já existente nessa semana */}
        {!salvoComSucesso && registroExistente && (
          <div className="px-5 pt-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-2.99l-6.93-12a2 2 0 00-3.48 0l-6.93 12A2 2 0 005.07 19z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-900">Já existe um registro para essa semana</p>
                  <p className="text-xs text-amber-700 mt-1 font-medium">
                    {alunoSelecionado?.nome || 'Esse aluno'} já tem registro
                    {dataRegistroExistente ? ` salvo em ${dataRegistroExistente}` : ''} para a semana {form.semana}.
                  </p>
                  <button
                    type="button"
                    onClick={apagarRegistroExistente}
                    disabled={apagandoRegistro}
                    className="mt-2 text-xs font-bold text-red-600 hover:text-red-700 underline underline-offset-2 disabled:opacity-50"
                  >
                    {apagandoRegistro ? 'Apagando...' : 'Apagar registro existente'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CORPO */}
        <div className="p-5 flex-1 space-y-4">

          {/* TELA DE SUCESSO */}
          {salvoComSucesso && (
            <div className="py-8 text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <svg className="w-9 h-9 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-intento-blue">Registro sincronizado</h3>
                <p className="text-sm text-slate-500 font-medium mt-1">{alunoSelecionado?.nome} · {form.semana}</p>
              </div>
              <p className="text-xs text-slate-500 font-medium">Quer gerar o PNG do painel pra mandar pro aluno?</p>
              <div className="flex gap-2 justify-center pt-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Fechar
                </button>
                <button
                  onClick={irParaPNG}
                  className="px-5 py-2.5 text-sm font-bold bg-intento-blue text-white rounded-lg hover:bg-blue-900 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Gerar PNG do painel
                </button>
              </div>
            </div>
          )}

          {/* PASSO 1 */}
          {!salvoComSucesso && step === 1 && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Mentorando</label>
                <select className={inputClass} value={form.idAluno} onChange={e => handleChange('idAluno', e.target.value)}>
                  <option value="">— Selecione —</option>
                  {alunos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Data do Fechamento</label>
                  <p className="font-semibold text-intento-blue text-sm">{form.dataRegistro}</p>
                </div>
                <div>
                  <label className={labelClass}>Semana de Referência</label>
                  <p className="font-semibold text-intento-blue text-sm">{form.semana}</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className={labelClass + ' mb-0'}>Meta de Horas da Semana Anterior</label>
                  <button
                    type="button"
                    onClick={usarMetaAnterior}
                    disabled={buscandoMeta || !form.idAluno}
                    className="text-[10px] font-bold text-intento-blue hover:text-blue-900 underline underline-offset-2 disabled:opacity-30 disabled:no-underline"
                  >
                    {buscandoMeta ? 'Buscando...' : 'Usar a mesma da semana anterior'}
                  </button>
                </div>
                <input type="number" min="0" step="0.5" className={inputClass} placeholder="Ex: 30"
                  value={form.metaSemanal} onChange={e => handleChange('metaSemanal', e.target.value)} />
              </div>
            </div>
          )}

          {/* PASSO 2 */}
          {!salvoComSucesso && step === 2 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Indicadores emocionais — escala de 1 a 6</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['sono',       'Qualidade do Sono'],
                  ['motivacao',  'Nível de Motivação'],
                  ['ansiedade',  'Nível de Ansiedade'],
                  ['estresse',   'Nível de Estresse'],
                ].map(([campo, label]) => (
                  <div key={campo}>
                    <label className={labelClass}>{label}</label>
                    <input type="number" min="1" max="6" className={inputClass}
                      value={form[campo]} onChange={e => handleChange(campo, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASSO 3 */}
          {!salvoComSucesso && step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['horasEstudadas',    'Horas Estudadas'],
                  ['revisoesAtrasadas', 'Revisões Atrasadas'],
                ].map(([campo, label]) => (
                  <div key={campo}>
                    <label className={labelClass}>{label}</label>
                    <input type="number" className={inputClass}
                      value={form[campo]} onChange={e => handleChange(campo, e.target.value)} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['dominioTotal',   'Domínio Total (%)'],
                  ['progressoTotal', 'Progresso Total (%)'],
                ].map(([campo, label]) => (
                  <div key={campo}>
                    <label className={labelClass}>{label}</label>
                    <div className={inputClass + ' bg-slate-50 text-slate-400 cursor-not-allowed flex items-center gap-2'}>
                      <svg className="w-3.5 h-3.5 shrink-0 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span className={form[campo] ? 'text-intento-blue font-bold' : 'text-slate-300'}>
                        {form[campo] || '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Por disciplina</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Bio',  'dominioBio',  'progressoBio',  'Biologia',   'bg-emerald-50 border-emerald-100'],
                    ['Qui',  'dominioQui',  'progressoQui',  'Química',    'bg-blue-50 border-blue-100'],
                    ['Fis',  'dominioFis',  'progressoFis',  'Física',     'bg-orange-50 border-orange-100'],
                    ['Mat',  'dominioMat',  'progressoMat',  'Matemática', 'bg-purple-50 border-purple-100'],
                  ].map(([, dKey, pKey, nome, cor]) => (
                    <div key={nome} className={`p-3 rounded-lg border ${cor} space-y-2`}>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{nome}</p>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className={labelClass + ' text-[9px]'}>Dom.</label>
                          <input type="number" inputMode="decimal" min="0" step="0.01" className={inputClass + ' text-xs p-2'}
                            value={form[dKey]} onChange={e => handleChange(dKey, e.target.value)} />
                        </div>
                        <div className="flex-1">
                          <label className={labelClass + ' text-[9px]'}>Prog.</label>
                          <input type="number" inputMode="decimal" min="0" step="0.01" className={inputClass + ' text-xs p-2'}
                            value={form[pKey]} onChange={e => handleChange(pKey, e.target.value)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        {!salvoComSucesso && (
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center rounded-b-xl">
          {step > 1
            ? <button onClick={() => setStep(step - 1)} className="text-sm font-semibold text-slate-400 hover:text-intento-blue transition">← Voltar</button>
            : <div />
          }
          <div className="flex items-center gap-4">
            {statusMsg && (
              <span className={`text-xs font-semibold ${statusMsg.includes('Erro') ? 'text-red-500' : 'text-emerald-600'}`}>
                {statusMsg}
              </span>
            )}
            {step === 3 && !formCompleto && !statusMsg && (
              <span className="text-xs font-semibold text-red-500 max-w-[260px] text-right leading-tight">
                Preencha: {camposFaltando.join(', ')}
              </span>
            )}
            {step < 3
              ? <button
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && !form.idAluno}
                  className="bg-intento-blue text-white px-6 py-2.5 rounded-lg font-bold text-sm disabled:opacity-40 hover:bg-blue-900 transition"
                >
                  Avançar →
                </button>
              : <button
                  onClick={salvarRegistro}
                  disabled={salvando || !formCompleto || registroExistente || verificandoRegistro}
                  className="bg-intento-yellow hover:bg-yellow-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {salvando ? 'Sincronizando...' : 'Sincronizar Registro'}
                </button>
            }
          </div>
        </div>
        )}

      </div>
    </div>
  );
}
