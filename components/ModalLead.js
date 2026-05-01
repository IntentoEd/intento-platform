'use client';

import { apiFetch } from '@/lib/api';
import { whatsappLink } from '@/lib/whatsapp';

import { useState } from 'react';

const FASES_FINAIS = ['Convertido', 'Taxa matricula paga', 'Contrato assinado', '1a mensalidade paga'];

export default function ModalLead({
  lead,
  email,
  ehLider,
  fases,
  vendedoresDisponiveis = [],
  onClose,
  onAtualizado,
}) {
  const [modo, setModo] = useState('ver');
  const [form, setForm] = useState({ ...lead });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmConverter, setConfirmConverter] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function moverFase(novaFase) {
    if (novaFase === lead.fase) return;
    setSalvando(true);
    setErro('');
    try {
      const r = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'moverLeadFase',
          idLead: lead.idLead,
          novaFase,
          porEmail: email,
        }),
      });
      const data = await r.json();
      if (data.status === 'sucesso') onAtualizado();
      else setErro(data.mensagem || 'Erro ao mover fase');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEdicao() {
    setSalvando(true);
    setErro('');
    try {
      const r = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'editarLead',
          idLead: lead.idLead,
          porEmail: email,
          ...form,
        }),
      });
      const data = await r.json();
      if (data.status === 'sucesso') onAtualizado();
      else setErro(data.mensagem || 'Erro ao editar lead');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function converter() {
    setSalvando(true);
    setErro('');
    try {
      const r = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'converterLeadEmAluno',
          idLead: lead.idLead,
          porEmail: email,
        }),
      });
      const data = await r.json();
      if (data.status === 'sucesso') onAtualizado();
      else setErro(data.mensagem || 'Erro ao converter');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  const podeConverter = FASES_FINAIS.includes(lead.fase) && !lead.idAlunoGerado;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-intento-blue truncate">{lead.nome}</h2>
            <div className="text-xs text-slate-500 truncate flex items-center gap-1.5">
              <span>{lead.telefone}</span>
              {whatsappLink(lead.telefone) && (
                <a
                  href={whatsappLink(lead.telefone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Abrir conversa no WhatsApp"
                  className="text-emerald-600 hover:text-emerald-700 inline-flex items-center"
                  aria-label="WhatsApp"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413"/>
                  </svg>
                </a>
              )}
              {lead.email ? <span> · {lead.email}</span> : null}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-600">Fase:</span>
            <select
              value={lead.fase}
              onChange={(e) => moverFase(e.target.value)}
              disabled={salvando}
              className="px-3 py-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md"
            >
              {fases.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {lead.idAlunoGerado && (
              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-semibold">
                ✓ Convertido em aluno
              </span>
            )}
          </div>

          {modo === 'ver' ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Cidade" v={lead.cidade} />
              <Info label="Estado" v={lead.estado} />
              <Info label="Tipo" v={lead.tipoPerfil === 'pai' ? 'Pai/responsável' : 'O próprio'} />
              {lead.tipoPerfil === 'pai' && <Info label="Aluno" v={lead.nomeRelacionado} />}
              <Info label="Curso" v={lead.cursoInteresse} />
              <Info label="Vestibulares" v={lead.vestibulares} />
              <Info label="Origem" v={lead.origem} />
              <Info label="Indicado por" v={lead.indicadoPor} />
              <Info label="Orçamento" v={lead.orcamento} />
              <Info label="Tempo preparando" v={lead.tempoPreparando} />
              <Info label="Vendedor" v={lead.vendedor || '—'} />
              <Info label="Plano" v={lead.plano} />
              <Info label="Próxima ação" v={lead.proximaAcao} />
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Nome" v={form.nome} onChange={(v) => set('nome', v)} />
              <Field label="Telefone" v={form.telefone} onChange={(v) => set('telefone', v)} />
              <Field label="Email" v={form.email} onChange={(v) => set('email', v)} />
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
                label="Vestibulares"
                v={form.vestibulares}
                onChange={(v) => set('vestibulares', v)}
              />
              <Field label="Origem" v={form.origem} onChange={(v) => set('origem', v)} />
              <Field
                label="Indicado por"
                v={form.indicadoPor}
                onChange={(v) => set('indicadoPor', v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Orçamento" v={form.orcamento} onChange={(v) => set('orcamento', v)} />
                <Field
                  label="Tempo preparando"
                  v={form.tempoPreparando}
                  onChange={(v) => set('tempoPreparando', v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Próxima ação"
                  v={form.proximaAcao}
                  onChange={(v) => set('proximaAcao', v)}
                />
                <Field
                  label="Data próxima ação"
                  type="date"
                  v={form.dataProximaAcao}
                  onChange={(v) => set('dataProximaAcao', v)}
                />
              </div>
              {ehLider && (
                <div>
                  <label className="text-xs font-semibold text-slate-600">Vendedor</label>
                  <select
                    value={form.vendedor || ''}
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
                <label className="text-xs font-semibold text-slate-600">Plano</label>
                <select
                  value={form.plano || ''}
                  onChange={(e) => set('plano', e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-md bg-white"
                >
                  <option value="">— Sem plano definido —</option>
                  <option value="Padrão">Padrão (quinzenal por 3m, depois mensal)</option>
                  <option value="Mensal">Mensal (1 encontro/mês)</option>
                  <option value="Quinzenal">Quinzenal (2 encontros/mês)</option>
                  <option value="Semanal">Semanal (4 encontros/mês)</option>
                  <option value="Custom">Custom (sem cálculo automático)</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Anotações</label>
            {modo === 'ver' ? (
              <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-md whitespace-pre-wrap min-h-[60px]">
                {lead.anotacoes || (
                  <span className="text-slate-400 italic">Sem anotações</span>
                )}
              </div>
            ) : (
              <textarea
                value={form.anotacoes || ''}
                onChange={(e) => set('anotacoes', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md"
              />
            )}
          </div>

          {erro && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{erro}</div>
          )}

          {confirmConverter && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="text-sm text-amber-800 font-semibold mb-2">
                Converter em aluno?
              </div>
              <div className="text-xs text-amber-700 mb-3">
                Cria uma nova planilha de aluno e move este lead pra fase &quot;Em mentoria&quot;.
                Não pode ser desfeito.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmConverter(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  onClick={converter}
                  disabled={salvando}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50"
                >
                  {salvando ? 'Convertendo...' : 'Sim, converter'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 flex gap-2 justify-between flex-wrap">
          <div className="flex gap-2">
            {modo === 'ver' ? (
              <button
                onClick={() => setModo('editar')}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200"
              >
                Editar
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setModo('ver');
                    setForm({ ...lead });
                    setErro('');
                  }}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarEdicao}
                  disabled={salvando}
                  className="px-4 py-2 text-sm font-semibold bg-intento-blue text-white rounded-md hover:bg-intento-blue/90 disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </>
            )}
          </div>
          {podeConverter && modo === 'ver' && !confirmConverter && (
            <button
              onClick={() => setConfirmConverter(true)}
              className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
            >
              Converter em aluno
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, v }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm text-slate-800 break-words">{v || '—'}</div>
    </div>
  );
}

function Field({ label, v, onChange, type = 'text' }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <input
        type={type}
        value={v || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2 text-sm border border-slate-300 rounded-md"
      />
    </div>
  );
}
