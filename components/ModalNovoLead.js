'use client';

import { useState } from 'react';

export default function ModalNovoLead({ email, vendedoresDisponiveis = [], ehLider, onClose, onCriado }) {
  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    email: '',
    tipoPerfil: 'self',
    nomeRelacionado: '',
    cidade: '',
    estado: '',
    cursoInteresse: '',
    vestibulares: '',
    origem: '',
    indicadoPor: '',
    orcamento: '',
    tempoPreparando: '',
    anotacoes: '',
    proximaAcao: '',
    vendedor: ehLider ? '' : email,
    plano: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function salvar() {
    if (!form.nome.trim() || !form.telefone.trim()) {
      setErro('Nome e telefone são obrigatórios');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const r = await fetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'criarLead', porEmail: email, ...form }),
      });
      const data = await r.json();
      if (data.status === 'sucesso') onCriado(data.idLead);
      else setErro(data.mensagem || 'Erro ao criar lead');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-intento-blue">Novo lead</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <Field label="Nome *" v={form.nome} onChange={(v) => set('nome', v)} />
          <Field label="Telefone *" v={form.telefone} onChange={(v) => set('telefone', v)} />
          <Field label="Email" type="email" v={form.email} onChange={(v) => set('email', v)} />

          <div>
            <label className="text-xs font-semibold text-slate-600">Quem é o lead?</label>
            <select
              value={form.tipoPerfil}
              onChange={(e) => set('tipoPerfil', e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              <option value="self">O próprio aluno</option>
              <option value="pai">Pai/responsável</option>
            </select>
          </div>
          {form.tipoPerfil === 'pai' && (
            <Field
              label="Nome do aluno"
              v={form.nomeRelacionado}
              onChange={(v) => set('nomeRelacionado', v)}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade" v={form.cidade} onChange={(v) => set('cidade', v)} />
            <Field label="Estado" v={form.estado} onChange={(v) => set('estado', v)} />
          </div>
          <Field
            label="Curso de interesse"
            v={form.cursoInteresse}
            onChange={(v) => set('cursoInteresse', v)}
          />
          <Field
            label="Vestibulares (separe por vírgula)"
            v={form.vestibulares}
            onChange={(v) => set('vestibulares', v)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Origem"
              v={form.origem}
              onChange={(v) => set('origem', v)}
              placeholder="Instagram, indicação..."
            />
            <Field
              label="Indicado por"
              v={form.indicadoPor}
              onChange={(v) => set('indicadoPor', v)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Orçamento" v={form.orcamento} onChange={(v) => set('orcamento', v)} />
            <Field
              label="Tempo preparando"
              v={form.tempoPreparando}
              onChange={(v) => set('tempoPreparando', v)}
            />
          </div>

          {ehLider && vendedoresDisponiveis.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Atribuir a vendedor</label>
              <select
                value={form.vendedor}
                onChange={(e) => set('vendedor', e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
              >
                <option value="">— Sem vendedor —</option>
                {vendedoresDisponiveis.map((v) => (
                  <option key={v.email} value={v.email}>
                    {v.nome} ({v.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600">Plano (opcional, define depois se ainda não fechou)</label>
            <select
              value={form.plano}
              onChange={(e) => set('plano', e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
            >
              <option value="">— A definir —</option>
              <option value="Padrão">Padrão (quinzenal por 3m, depois mensal)</option>
              <option value="Mensal">Mensal (1/mês)</option>
              <option value="Quinzenal">Quinzenal (2/mês)</option>
              <option value="Semanal">Semanal (4/mês)</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600">Anotações</label>
            <textarea
              value={form.anotacoes}
              onChange={(e) => set('anotacoes', e.target.value)}
              rows={3}
              className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-md"
            />
          </div>

          {erro && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{erro}</div>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-md"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-4 py-2 text-sm font-semibold bg-intento-blue text-white rounded-md hover:bg-intento-blue/90 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Criar lead'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, v, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <input
        type={type}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-md"
      />
    </div>
  );
}
