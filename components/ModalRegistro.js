'use client';

import { useState, useEffect } from 'react';

const inputClass = "w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue transition-all font-medium text-intento-blue text-sm";
const labelClass = "block text-xs font-semibold text-slate-400 uppercase mb-2 tracking-wider";

export default function ModalRegistro({ alunos, alunoPreSelecionado, onClose, onRegistroSalvo }) {
  const [step, setStep] = useState(1);
  const [statusMsg, setStatusMsg] = useState('');
  const [salvando, setSalvando] = useState(false);

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
    const vals = campos.map(c => parseFloat(updated[c])).filter(n => !isNaN(n));
    const valsProg = camposProg.map(c => parseFloat(updated[c])).filter(n => !isNaN(n));
    if (vals.length > 0) updated.dominioTotal = (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
    if (valsProg.length > 0) updated.progressoTotal = (valsProg.reduce((a, b) => a + b, 0) / valsProg.length).toFixed(2);
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
        setStatusMsg('Salvo com sucesso!');
        onRegistroSalvo?.(form.idAluno, form.semana);
        setTimeout(() => onClose(), 1200);
      } else {
        setStatusMsg('Erro: ' + data.mensagem);
      }
    } catch {
      setStatusMsg('Erro de conexão.');
    } finally {
      setSalvando(false);
    }
  };

  const alunoSelecionado = alunos.find(a => String(a.id) === String(form.idAluno));

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

        {/* CORPO */}
        <div className="p-5 flex-1 space-y-4">

          {/* PASSO 1 */}
          {step === 1 && (
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
                <label className={labelClass}>Meta de Horas da Semana Anterior</label>
                <input type="number" min="0" step="0.5" className={inputClass} placeholder="Ex: 30"
                  value={form.metaSemanal} onChange={e => handleChange('metaSemanal', e.target.value)} />
              </div>
            </div>
          )}

          {/* PASSO 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Indicadores emocionais — escala de 1 a 5</p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['estresse',   'Nível de Estresse'],
                  ['ansiedade',  'Nível de Ansiedade'],
                  ['motivacao',  'Nível de Motivação'],
                  ['sono',       'Qualidade do Sono'],
                ].map(([campo, label]) => (
                  <div key={campo}>
                    <label className={labelClass}>{label}</label>
                    <input type="number" min="1" max="5" className={inputClass}
                      value={form[campo]} onChange={e => handleChange(campo, e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASSO 3 */}
          {step === 3 && (
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
                  disabled={salvando}
                  className="bg-intento-yellow hover:bg-yellow-500 text-white px-6 py-2.5 rounded-lg font-bold text-sm transition-all disabled:opacity-60"
                >
                  {salvando ? 'Sincronizando...' : 'Sincronizar Registro'}
                </button>
            }
          </div>
        </div>

      </div>
    </div>
  );
}
