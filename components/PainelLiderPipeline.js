'use client';

import { apiFetch } from '@/lib/api';

import { useEffect, useMemo, useState } from 'react';
import { Bar } from '@/components/Charts';

const cardClass = 'bg-white rounded-xl border border-slate-200 p-5 shadow-sm';

const CORES_FUNNEL = {
  Lead: '#94a3b8',
  'Contactado WPP': '#60a5fa',
  'Ativo WPP': '#3b82f6',
  'Reuniao agendada': '#6366f1',
  'Reuniao realizada': '#8b5cf6',
  'Aguardando decisao': '#f59e0b',
  Convertido: '#10b981',
  'Taxa matricula paga': '#059669',
  'Contrato assinado': '#047857',
  '1a mensalidade paga': '#065f46',
  'Em mentoria': '#0d9488',
  Churn: '#ef4444',
};

export default function PainelLiderPipeline({ email }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [leads, setLeads] = useState([]);
  const [vendedoresList, setVendedoresList] = useState([]);
  const [fases, setFases] = useState([]);
  const [atribuindo, setAtribuindo] = useState({});

  const carregar = async () => {
    if (!email) return;
    setCarregando(true);
    setErro('');
    try {
      const [dashRes, leadsRes] = await Promise.all([
        apiFetch('/api/mentor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'dashboardCrm', email }),
        }).then((r) => r.json()),
        apiFetch('/api/mentor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'listarLeads', email }),
        }).then((r) => r.json()),
      ]);
      if (dashRes.status === 'sucesso') setDashboard(dashRes);
      else setErro(dashRes.mensagem || 'Erro no dashboard CRM');
      if (leadsRes.status === 'sucesso') {
        setLeads(leadsRes.leads || []);
        setVendedoresList(leadsRes.vendedores || []);
        setFases(leadsRes.fases || []);
      }
    } catch (e) {
      setErro(e.message || 'Erro de conexão');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email]);

  const semVendedor = useMemo(() => leads.filter((l) => !l.vendedor && l.fase !== 'Churn'), [leads]);

  const totalLeads = dashboard?.total || 0;
  const porFase = dashboard?.porFase || {};
  const porVendedor = dashboard?.porVendedor || {};
  const porOrigem = dashboard?.porOrigem || {};

  const emMentoria = porFase['Em mentoria'] || 0;
  const churn = porFase['Churn'] || 0;

  const funnel = useMemo(() => {
    if (!fases.length) return [];
    return fases.map((fase, i) => {
      const count = porFase[fase] || 0;
      const anterior = i > 0 ? porFase[fases[i - 1]] || 0 : null;
      const conversao = anterior && anterior > 0 ? Math.round((count / anterior) * 100) : null;
      return { fase, count, conversao };
    });
  }, [fases, porFase]);

  const maxFunnel = Math.max(1, ...funnel.map((f) => f.count));

  const vendedoresOrdenados = useMemo(() => {
    return Object.entries(porVendedor)
      .map(([email, count]) => {
        const nome =
          email === 'sem-vendedor'
            ? 'Sem vendedor'
            : vendedoresList.find((v) => v.email === email)?.nome || email.split('@')[0];
        return { email, nome, count };
      })
      .sort((a, b) => b.count - a.count);
  }, [porVendedor, vendedoresList]);

  const origensOrdenadas = useMemo(() => {
    return Object.entries(porOrigem)
      .map(([nome, count]) => ({ nome, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [porOrigem]);

  async function atribuirVendedor(idLead, novoVendedor) {
    setAtribuindo((s) => ({ ...s, [idLead]: true }));
    try {
      const r = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'editarLead',
          idLead,
          vendedor: novoVendedor,
          porEmail: email,
        }),
      });
      const data = await r.json();
      if (data.status === 'sucesso') {
        await carregar();
      } else {
        alert('Erro: ' + (data.mensagem || 'falha ao atribuir'));
      }
    } catch (e) {
      alert('Erro de conexão.');
    } finally {
      setAtribuindo((s) => ({ ...s, [idLead]: false }));
    }
  }

  if (carregando)
    return (
      <div className="py-12 text-center text-sm text-slate-500 font-medium">
        Carregando pipeline...
      </div>
    );

  if (erro)
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-red-600 font-medium mb-3">Erro: {erro}</p>
        <button
          onClick={carregar}
          className="text-sm font-semibold text-intento-blue hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: 'rgba(150,150,150,0.1)' } },
      x: { grid: { display: false } },
    },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={cardClass + ' text-center'}>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Total de leads
          </p>
          <p className="text-3xl font-bold text-intento-blue">{totalLeads}</p>
        </div>
        <div className={cardClass + ' text-center'}>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Em mentoria
          </p>
          <p className="text-3xl font-bold text-emerald-600">{emMentoria}</p>
          <p className="text-[10px] font-medium text-slate-400 mt-1">
            {totalLeads > 0 ? Math.round((emMentoria / totalLeads) * 100) : 0}% conversão
          </p>
        </div>
        <div className={cardClass + ' text-center'}>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Sem vendedor
          </p>
          <p
            className={`text-3xl font-bold ${
              semVendedor.length > 0 ? 'text-amber-600' : 'text-slate-400'
            }`}
          >
            {semVendedor.length}
          </p>
        </div>
        <div className={cardClass + ' text-center'}>
          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">
            Churn
          </p>
          <p className="text-3xl font-bold text-red-500">{churn}</p>
        </div>
      </div>

      {semVendedor.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <svg
              className="w-5 h-5 text-amber-500 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
              />
            </svg>
            <h2 className="text-sm font-bold text-amber-800">Leads sem vendedor</h2>
            <span className="bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {semVendedor.length}
            </span>
          </div>
          <p className="text-xs text-amber-700/80 font-medium mb-4">
            Atribua um vendedor para que ele entre em contato.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {semVendedor.slice(0, 12).map((lead) => (
              <div
                key={lead.idLead}
                className="bg-white border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-700 truncate">{lead.nome}</p>
                  <p className="text-[11px] text-slate-400 font-medium truncate">
                    {lead.telefone}
                    {lead.origem ? ` · ${lead.origem}` : ''}
                  </p>
                </div>
                <select
                  disabled={atribuindo[lead.idLead]}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) atribuirVendedor(lead.idLead, e.target.value);
                  }}
                  className="text-xs font-semibold bg-intento-blue text-white px-2 py-1.5 rounded-lg cursor-pointer disabled:opacity-50 shrink-0 max-w-[120px]"
                >
                  <option value="">
                    {atribuindo[lead.idLead] ? 'Atribuindo...' : 'Atribuir →'}
                  </option>
                  {vendedoresList.map((v) => (
                    <option key={v.email} value={v.email}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {semVendedor.length > 12 && (
            <p className="text-[11px] text-amber-700 font-medium mt-3 text-center">
              + {semVendedor.length - 12} outros leads sem vendedor (ver em /vendas)
            </p>
          )}
        </div>
      )}

      <div className={cardClass}>
        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
          Funil de conversão
        </h3>
        <p className="text-[10px] font-medium text-slate-400 mb-4">
          quantidade por fase · % conversão da fase anterior
        </p>
        <div className="space-y-2">
          {funnel.map((f) => (
            <div key={f.fase} className="flex items-center gap-3">
              <div className="w-44 text-xs font-semibold text-slate-700 truncate shrink-0">
                {f.fase}
              </div>
              <div className="flex-1 bg-slate-100 rounded-md overflow-hidden h-7 relative">
                <div
                  className="h-full transition-all flex items-center justify-end pr-2"
                  style={{
                    width: `${(f.count / maxFunnel) * 100}%`,
                    background: CORES_FUNNEL[f.fase] || '#94a3b8',
                  }}
                >
                  {f.count > 0 && (
                    <span className="text-xs font-bold text-white">{f.count}</span>
                  )}
                </div>
              </div>
              <div className="w-20 text-right shrink-0">
                {f.conversao !== null ? (
                  <span
                    className={`text-xs font-semibold ${
                      f.conversao >= 50
                        ? 'text-emerald-600'
                        : f.conversao >= 25
                        ? 'text-amber-600'
                        : 'text-red-500'
                    }`}
                  >
                    {f.conversao}%
                  </span>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={cardClass}>
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
            Leads por vendedor
          </h3>
          <p className="text-[10px] font-medium text-slate-400 mb-4">
            distribuição atual da base
          </p>
          {vendedoresOrdenados.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">Sem dados</p>
          ) : (
            <div className="h-56">
              <Bar
                data={{
                  labels: vendedoresOrdenados.map((v) => v.nome),
                  datasets: [
                    {
                      data: vendedoresOrdenados.map((v) => v.count),
                      backgroundColor: vendedoresOrdenados.map((v) =>
                        v.email === 'sem-vendedor' ? '#f59e0b' : '#3b82f6'
                      ),
                      borderRadius: 4,
                    },
                  ],
                }}
                options={chartOptions}
              />
            </div>
          )}
        </div>

        <div className={cardClass}>
          <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">
            Leads por origem
          </h3>
          <p className="text-[10px] font-medium text-slate-400 mb-4">top 8 origens</p>
          {origensOrdenadas.length === 0 ? (
            <p className="text-xs text-slate-400 italic text-center py-6">Sem dados</p>
          ) : (
            <div className="h-56">
              <Bar
                data={{
                  labels: origensOrdenadas.map((o) => o.nome),
                  datasets: [
                    {
                      data: origensOrdenadas.map((o) => o.count),
                      backgroundColor: '#10b981',
                      borderRadius: 4,
                    },
                  ],
                }}
                options={chartOptions}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
