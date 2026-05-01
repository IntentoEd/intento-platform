'use client';

import { apiFetch } from '@/lib/api';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { LoadingScreen } from '@/components/Loading';
import ModalNovoLead from '@/components/ModalNovoLead';
import ModalLead from '@/components/ModalLead';

const EMAILS_LIDER = ['filippe@metodointento.com.br', 'rafael@metodointento.com.br'];

const CORES_FASE = {
  Lead: 'bg-slate-200 text-slate-700',
  'Contactado WPP': 'bg-blue-100 text-blue-700',
  'Ativo WPP': 'bg-blue-200 text-blue-800',
  'Reuniao agendada': 'bg-indigo-100 text-indigo-700',
  'Reuniao realizada': 'bg-indigo-200 text-indigo-800',
  'Aguardando decisao': 'bg-amber-100 text-amber-700',
  Convertido: 'bg-emerald-100 text-emerald-700',
  'Taxa matricula paga': 'bg-emerald-200 text-emerald-800',
  'Contrato assinado': 'bg-emerald-300 text-emerald-900',
  '1a mensalidade paga': 'bg-emerald-400 text-emerald-900',
  'Em mentoria': 'bg-teal-200 text-teal-800',
  Churn: 'bg-red-100 text-red-700',
};

export default function Vendas() {
  const router = useRouter();
  const [email, setEmail] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [leads, setLeads] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [fases, setFases] = useState([]);
  const [ehLider, setEhLider] = useState(false);
  const [filtroVendedor, setFiltroVendedor] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');
  const [busca, setBusca] = useState('');
  const [modalNovo, setModalNovo] = useState(false);
  const [leadAberto, setLeadAberto] = useState(null);

  const carregar = useCallback(async (emailUsar) => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'listarLeads', email: emailUsar }),
      });
      const data = await r.json();
      if (data.status === 'sucesso') {
        setLeads(data.leads || []);
        setVendedores(data.vendedores || []);
        setFases(data.fases || []);
        setEhLider(!!data.ehLider);
      } else {
        setErro(data.mensagem || 'Erro ao carregar leads');
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      const e =
        user?.email?.toLowerCase() ||
        (typeof window !== 'undefined' ? sessionStorage.getItem('emailLogado') : null);
      if (!e) {
        router.push('/');
        return;
      }
      setEmail(e);
      await carregar(e);
    });
    return () => unsub();
  }, [router, carregar]);

  const leadsFiltrados = useMemo(() => {
    return leads.filter((l) => {
      if (filtroVendedor === 'sem-vendedor' && l.vendedor) return false;
      if (filtroVendedor && filtroVendedor !== 'sem-vendedor' && l.vendedor !== filtroVendedor)
        return false;
      if (filtroOrigem && l.origem !== filtroOrigem) return false;
      if (busca) {
        const q = busca.toLowerCase();
        const matchNome = l.nome?.toLowerCase().includes(q);
        const matchTel = l.telefone?.includes(q);
        const matchEmail = l.email?.toLowerCase().includes(q);
        if (!matchNome && !matchTel && !matchEmail) return false;
      }
      return true;
    });
  }, [leads, filtroVendedor, filtroOrigem, busca]);

  const porFase = useMemo(() => {
    const acc = {};
    fases.forEach((f) => (acc[f] = []));
    leadsFiltrados.forEach((l) => {
      const f = l.fase || 'Lead';
      if (!acc[f]) acc[f] = [];
      acc[f].push(l);
    });
    return acc;
  }, [leadsFiltrados, fases]);

  const origensUnicas = useMemo(() => {
    return [...new Set(leads.map((l) => l.origem).filter(Boolean))].sort();
  }, [leads]);

  if (!email || carregando) return <LoadingScreen mensagem="Carregando leads..." />;

  const voltar = () => {
    if (ehLider) router.push('/selecionar-modo');
    else router.push('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 safe-area-top">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={voltar}
              className="text-slate-500 hover:text-slate-700 shrink-0"
              aria-label="Voltar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="text-lg font-bold text-intento-blue truncate">Pipeline de Vendas</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">
              {ehLider ? 'Líder' : 'Vendedor'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => router.push('/vendedor/disponibilidade')}
              className="bg-white border border-slate-200 text-slate-600 hover:text-intento-blue hover:border-intento-blue px-3 py-2 rounded-lg text-sm font-semibold transition flex items-center gap-1.5"
              title="Configurar minha disponibilidade pra reuniões"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
              <span className="hidden sm:inline">Minha agenda</span>
            </button>
            <button
              onClick={() => setModalNovo(true)}
              className="bg-intento-blue text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-intento-blue/90 flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/>
              </svg>
              <span className="hidden sm:inline">Novo lead</span>
            </button>
          </div>
        </div>

        <div className="px-4 pb-3 flex flex-wrap gap-2 items-center">
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou email..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-slate-300 rounded-md"
          />
          {ehLider && (
            <select
              value={filtroVendedor}
              onChange={(e) => setFiltroVendedor(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
            >
              <option value="">Todos os vendedores</option>
              <option value="sem-vendedor">Sem vendedor</option>
              {vendedores.map((v) => (
                <option key={v.email} value={v.email}>
                  {v.nome}
                </option>
              ))}
            </select>
          )}
          {origensUnicas.length > 0 && (
            <select
              value={filtroOrigem}
              onChange={(e) => setFiltroOrigem(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-md bg-white"
            >
              <option value="">Todas as origens</option>
              {origensUnicas.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-slate-500 ml-auto">
            {leadsFiltrados.length} de {leads.length} leads
          </span>
        </div>
      </div>

      {erro ? (
        <div className="p-6 text-center text-red-600 bg-red-50 m-4 rounded-md">{erro}</div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-3 min-w-max pb-4">
            {fases.map((fase) => (
              <div key={fase} className="w-72 bg-slate-100 rounded-lg flex flex-col">
                <div className="px-3 py-2 border-b border-slate-200 rounded-t-lg flex items-center justify-between">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded ${
                      CORES_FASE[fase] || 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {fase}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full">
                    {porFase[fase]?.length || 0}
                  </span>
                </div>
                <div className="p-2 flex flex-col gap-2 min-h-[200px] max-h-[calc(100vh-220px)] overflow-y-auto">
                  {(porFase[fase] || []).map((lead) => (
                    <button
                      key={lead.idLead}
                      onClick={() => setLeadAberto(lead)}
                      className="bg-white rounded-md p-3 text-left shadow-sm hover:shadow-md transition-shadow border border-slate-200"
                    >
                      <div className="font-semibold text-intento-blue text-sm mb-1 truncate">
                        {lead.nome}
                      </div>
                      <div className="text-xs text-slate-500 mb-1">{lead.telefone}</div>
                      {(lead.cidade || lead.estado) && (
                        <div className="text-xs text-slate-400 mb-1 truncate">
                          {lead.cidade}
                          {lead.cidade && lead.estado ? ', ' : ''}
                          {lead.estado}
                        </div>
                      )}
                      {lead.proximaAcao && (
                        <div className="mt-2 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded border-l-2 border-amber-400 truncate">
                          {lead.proximaAcao}
                        </div>
                      )}
                      {lead.vendedor && (
                        <div className="mt-2 text-xs text-slate-400 truncate">
                          → {lead.vendedor.split('@')[0]}
                        </div>
                      )}
                      {!lead.vendedor && ehLider && (
                        <div className="mt-2 text-xs text-red-500 italic">Sem vendedor</div>
                      )}
                    </button>
                  ))}
                  {(porFase[fase]?.length || 0) === 0 && (
                    <div className="text-xs text-slate-400 italic text-center py-6">Vazio</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalNovo && (
        <ModalNovoLead
          email={email}
          ehLider={ehLider}
          vendedoresDisponiveis={vendedores}
          onClose={() => setModalNovo(false)}
          onCriado={() => {
            setModalNovo(false);
            carregar(email);
          }}
        />
      )}
      {leadAberto && (
        <ModalLead
          lead={leadAberto}
          email={email}
          ehLider={ehLider}
          fases={fases}
          vendedoresDisponiveis={vendedores}
          onClose={() => setLeadAberto(null)}
          onAtualizado={() => {
            setLeadAberto(null);
            carregar(email);
          }}
        />
      )}
    </div>
  );
}
