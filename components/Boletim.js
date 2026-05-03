'use client';

import { useMemo, useState } from 'react';
import { Line } from '@/components/Charts';

const TIPO_LABEL = {
  bimestral: 'Bimestral',
  mensal: 'Mensal',
  semanal: 'Semanal',
  recuperacao: 'Recuperação',
};

// Brasil padrão escolar: bimestres por mês (1-indexed)
const BIMESTRES = {
  '1': { nome: '1º bimestre', meses: [2, 3, 4] },     // Fev-Abr
  '2': { nome: '2º bimestre', meses: [5, 6, 7] },     // Mai-Jul
  '3': { nome: '3º bimestre', meses: [8, 9, 10] },    // Ago-Out
  '4': { nome: '4º bimestre', meses: [11, 12] },      // Nov-Dez
};

// Cores estáveis por matéria (hash determinístico)
const PALETA = ['#3b82f6', '#10b981', '#f97316', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899', '#14b8a6', '#f43f5e', '#84cc16', '#6366f1', '#0ea5e9'];
function corDaMateria(materia) {
  let h = 0;
  for (let i = 0; i < materia.length; i++) h = (h * 31 + materia.charCodeAt(i)) >>> 0;
  return PALETA[h % PALETA.length];
}

function media(arr) {
  if (arr.length === 0) return null;
  return arr.reduce((s, n) => s + n, 0) / arr.length;
}

function fmtNota(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(1).replace('.', ',');
}

export default function Boletim({ provas }) {
  const [periodo, setPeriodo] = useState('ano'); // 'ano' | '1' | '2' | '3' | '4'
  const [materiasOcultas, setMateriasOcultas] = useState(new Set());

  // 1) Set de IDs substituídos (recuperação substitui original)
  const substituidos = useMemo(() => {
    const s = new Set();
    provas.forEach(p => { if (p.substituiId) s.add(p.substituiId); });
    return s;
  }, [provas]);

  // 2) Provas efetivas do ano atual + filtro de bimestre
  const provasFiltradas = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    return provas.filter(p => {
      if (substituidos.has(p.id)) return false;
      const d = new Date(p.data);
      if (isNaN(d.getTime())) return false;
      if (d.getFullYear() !== anoAtual) return false;
      if (periodo !== 'ano') {
        const mes = d.getMonth() + 1;
        if (!BIMESTRES[periodo].meses.includes(mes)) return false;
      }
      return true;
    });
  }, [provas, substituidos, periodo]);

  // 3) Agregação por matéria
  const porMateria = useMemo(() => {
    const map = {};
    provasFiltradas.forEach(p => {
      if (!map[p.materia]) map[p.materia] = { materia: p.materia, total: 0, comNota: [], ultimaNota: null, ultimaData: null };
      map[p.materia].total++;
      if (p.nota !== null && p.nota !== undefined) {
        map[p.materia].comNota.push({ nota: p.nota, data: new Date(p.data) });
      }
    });
    return Object.values(map).map(m => {
      m.comNota.sort((a, b) => a.data - b.data);
      const notas = m.comNota.map(x => x.nota);
      const med = media(notas);
      // Tendência: últimas 3 vs 3 anteriores
      let tend = null;
      if (notas.length >= 4) {
        const split = Math.floor(notas.length / 2);
        const inicio = media(notas.slice(0, split));
        const fim = media(notas.slice(split));
        if (inicio !== null && fim !== null) {
          const diff = fim - inicio;
          tend = diff > 0.3 ? 'up' : diff < -0.3 ? 'down' : 'flat';
        }
      }
      const last = m.comNota[m.comNota.length - 1] || null;
      return {
        materia: m.materia,
        total: m.total,
        comNotaCount: notas.length,
        media: med,
        ultimaNota: last ? last.nota : null,
        ultimaData: last ? last.data : null,
        tendencia: tend,
      };
    }).sort((a, b) => a.materia.localeCompare(b.materia));
  }, [provasFiltradas]);

  // 4) KPIs gerais
  const kpis = useMemo(() => {
    const todasComNota = provasFiltradas.filter(p => p.nota !== null && p.nota !== undefined);
    const med = media(todasComNota.map(p => p.nota));
    const ultima = todasComNota
      .map(p => ({ nota: p.nota, data: new Date(p.data) }))
      .sort((a, b) => b.data - a.data)[0] || null;
    return {
      mediaGeral: med,
      total: provasFiltradas.length,
      comNotaCount: todasComNota.length,
      materiasCount: porMateria.length,
      ultimaProva: ultima,
    };
  }, [provasFiltradas, porMateria]);

  // 5) Dataset do gráfico — uma série por matéria, x=data, y=nota
  const chart = useMemo(() => {
    const seriesPorMateria = {};
    provasFiltradas.forEach(p => {
      if (p.nota === null || p.nota === undefined) return;
      if (!seriesPorMateria[p.materia]) seriesPorMateria[p.materia] = [];
      seriesPorMateria[p.materia].push({ x: new Date(p.data).getTime(), y: p.nota });
    });
    Object.values(seriesPorMateria).forEach(arr => arr.sort((a, b) => a.x - b.x));

    // Conjunto de todas as datas pra eixo X
    const datas = [...new Set(provasFiltradas
      .filter(p => p.nota !== null && p.nota !== undefined)
      .map(p => new Date(p.data).getTime()))]
      .sort((a, b) => a - b);

    const labels = datas.map(t => {
      const d = new Date(t);
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const datasets = Object.entries(seriesPorMateria)
      .filter(([m]) => !materiasOcultas.has(m))
      .map(([m, pontos]) => {
        // Mapeia cada data do eixo X. Se matéria tem nota nessa data, usa; senão null.
        const data = datas.map(t => {
          const ponto = pontos.find(p => p.x === t);
          return ponto ? ponto.y : null;
        });
        return {
          label: m,
          data,
          borderColor: corDaMateria(m),
          backgroundColor: corDaMateria(m),
          tension: 0.3,
          spanGaps: true,
          pointRadius: 4,
          pointHoverRadius: 6,
        };
      });

    return { labels, datasets, hasData: datasets.length > 0 && labels.length > 0 };
  }, [provasFiltradas, materiasOcultas]);

  if (provas.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic py-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
        Sem provas cadastradas ainda — Boletim aparece quando houver dados.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Filtro de período */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Período:</label>
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="text-xs font-semibold text-intento-blue bg-white border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-intento-blue cursor-pointer"
          >
            <option value="ano">Ano todo (atual)</option>
            <option value="1">1º bimestre (Fev-Abr)</option>
            <option value="2">2º bimestre (Mai-Jul)</option>
            <option value="3">3º bimestre (Ago-Out)</option>
            <option value="4">4º bimestre (Nov-Dez)</option>
          </select>
        </div>
        <p className="text-[11px] text-slate-400 font-medium">
          {provasFiltradas.length} prova{provasFiltradas.length !== 1 ? 's' : ''} no período
        </p>
      </div>

      {provasFiltradas.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-6 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
          Nenhuma prova nesse período.
        </p>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Média geral" valor={kpis.mediaGeral !== null ? fmtNota(kpis.mediaGeral) : '—'} cor={kpis.mediaGeral !== null && kpis.mediaGeral < 6 ? 'text-red-600' : 'text-intento-blue'} />
            <KPI label="Provas no período" valor={kpis.total} />
            <KPI label="Com nota" valor={`${kpis.comNotaCount}/${kpis.total}`} sub={kpis.total > 0 ? `${Math.round(100 * kpis.comNotaCount / kpis.total)}%` : ''} />
            <KPI label="Matérias" valor={kpis.materiasCount} />
          </div>

          {/* Tabela por matéria */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Por matéria</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="px-4 py-2">Matéria</th>
                    <th className="px-3 py-2 text-center">Provas</th>
                    <th className="px-3 py-2 text-center">Com nota</th>
                    <th className="px-3 py-2 text-center">Média</th>
                    <th className="px-3 py-2 text-center">Última</th>
                    <th className="px-3 py-2 text-center">Tendência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {porMateria.map(m => (
                    <tr key={m.materia} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-2.5 font-semibold text-slate-700">
                        <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ backgroundColor: corDaMateria(m.materia) }}/>
                        {m.materia}
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600 font-medium">{m.total}</td>
                      <td className="px-3 py-2.5 text-center text-slate-600 font-medium">{m.comNotaCount}</td>
                      <td className={`px-3 py-2.5 text-center font-bold ${m.media === null ? 'text-slate-400' : m.media < 6 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {fmtNota(m.media)}
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600 font-medium">{fmtNota(m.ultimaNota)}</td>
                      <td className="px-3 py-2.5 text-center">
                        {m.tendencia === 'up' && <span className="text-emerald-600 font-bold">↗</span>}
                        {m.tendencia === 'down' && <span className="text-red-600 font-bold">↘</span>}
                        {m.tendencia === 'flat' && <span className="text-slate-400 font-bold">→</span>}
                        {m.tendencia === null && <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico de evolução */}
          {chart.hasData && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Evolução das notas</h4>
                <div className="flex flex-wrap gap-1.5">
                  {porMateria.map(m => {
                    const oculta = materiasOcultas.has(m.materia);
                    return (
                      <button
                        key={m.materia}
                        onClick={() => setMateriasOcultas(prev => {
                          const next = new Set(prev);
                          if (next.has(m.materia)) next.delete(m.materia); else next.add(m.materia);
                          return next;
                        })}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full border transition ${oculta ? 'bg-slate-100 text-slate-400 border-slate-200' : 'text-white border-transparent'}`}
                        style={oculta ? {} : { backgroundColor: corDaMateria(m.materia) }}
                      >
                        {m.materia}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="h-64">
                <Line
                  data={chart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { min: 0, max: 10, grid: { color: 'rgba(150,150,150,0.1)' } },
                      x: { grid: { display: false } },
                    },
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KPI({ label, valor, sub, cor }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 text-center">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-2xl font-bold ${cor || 'text-intento-blue'}`}>{valor}</p>
      {sub && <p className="text-[10px] text-slate-400 font-medium">{sub}</p>}
    </div>
  );
}
