'use client';

import { apiFetch } from '@/lib/api';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMentor } from '@/lib/MentorContext';
import { LoadingInline } from '@/components/Loading';

// Cor por disciplina (Bio verde, Qui roxo, Fis azul, Mat vermelho):
// main = título + barra; bg/border = fundo suave do mini card.
const CORES_MATERIA = {
  'Biologia':   { main: '#10b981', bg: '#ecfdf5', border: '#bbf7d0' },
  'Química':    { main: '#a855f7', bg: '#faf5ff', border: '#e9d5ff' },
  'Física':     { main: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  'Matemática': { main: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
};

// Estados da consistência (horas vs meta da semana). Símbolo do "quase" = ≈.
// Cores em nível 600 pra contraste do glifo (WCAG).
const CONS_ESTADO = {
  hit:  { bg: '#ecfdf5', border: '#a7f3d0', cor: '#059669', simbolo: '✓' },
  near: { bg: '#fffbeb', border: '#fde68a', cor: '#d97706', simbolo: '≈' },
  miss: { bg: '#fef2f2', border: '#fecaca', cor: '#dc2626', simbolo: '✗' },
};
// Converte valor (decimal 0–1, "73%" ou número) para inteiro 0–100.
function toPct100(val) {
  const n = parseFloat(String(val ?? '').replace('%', '').replace(',', '.'));
  if (isNaN(n)) return 0;
  return Math.round(n <= 1 ? n * 100 : n);
}
function toNum(val) {
  const n = parseFloat(String(val ?? '').replace('%', '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
const fmtH = (n) => (n % 1 === 0 ? String(n) : n.toFixed(1));

// Tokens de tipografia — uma escala única pra unificar todo o card.
// Cor dos textos secundários = slate-500 (#64748b ≈ 4.8:1 no branco → WCAG AA).
// slate-400 (#94a3b8) reprovava (~2.5:1).
const T = {
  label:   { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', margin: 0 },
  numLg:   { fontSize: 28, fontWeight: 800, color: '#060242', lineHeight: 1 },
  numMd:   { fontSize: 20, fontWeight: 800, color: '#060242', lineHeight: 1 },
  numSm:   { fontSize: 12, fontWeight: 700, color: '#060242', lineHeight: 1 },
  sub:     { fontSize: 13, fontWeight: 600, color: '#64748b' },
  caption: { fontSize: 9,  fontWeight: 600, color: '#64748b' },
  body:    { fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.4 },
};

// Variação vs. semana anterior — texto inline (seta + valor), SEM pílula,
// pra encostar na baseline do número. Seta = direção; cor = bom/ruim.
function Delta({ info, suffix }) {
  if (!info || info.diff == null || info.diff === 0) return null;
  const abs = Math.abs(info.diff);
  return (
    <span style={{ fontSize: 11, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', color: info.positivo ? '#047857' : '#b91c1c' }}>
      {info.diff > 0 ? '▲' : '▼'} {abs % 1 === 0 ? abs : abs.toFixed(1)}{suffix || ''}
    </span>
  );
}

// KPI principal (destaque) — card branco minimalista. Altura padronizada:
// rótulo reserva 2 linhas e a barra fica ancorada no rodapé.
function KpiCard({ label, valor, delta, suffix, bar, barCaption }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: 14, boxShadow: '0 1px 2px rgba(6,2,66,0.05)', padding: 16, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <p style={{ ...T.label, minHeight: 26, lineHeight: 1.3 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8, whiteSpace: 'nowrap' }}>
        <span style={T.numLg}>{valor}</span>
        <Delta info={delta} suffix={suffix} />
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 12 }}>
        <div style={{ height: 7, borderRadius: 9999, overflow: 'hidden', background: bar != null ? 'rgba(6,2,66,0.08)' : 'transparent' }}>
          {bar != null ? (
            <div style={{ width: `${Math.min(100, bar)}%`, height: '100%', background: bar >= 100 ? '#10b981' : '#060242', borderRadius: 9999 }} />
          ) : null}
        </div>
        {barCaption ? <p style={{ ...T.caption, marginTop: 6 }}>{barCaption}</p> : null}
      </div>
    </div>
  );
}

// Barra horizontal 0–100% (Desempenho / Estilo). Track translúcido (funciona
// em fundo branco ou tingido). Delta opcional, alinhado numa coluna à direita.
function Barra({ label, valor, cor, delta }) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ ...T.label, width: 66, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 7, background: 'rgba(6,2,66,0.08)', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: cor, borderRadius: 9999 }} />
      </div>
      <span style={{ ...T.numSm, width: 32, textAlign: 'right', flexShrink: 0 }}>{valor}%</span>
      {delta ? <span style={{ width: 36, textAlign: 'right', flexShrink: 0 }}><Delta info={delta} /></span> : null}
    </div>
  );
}

// ─── Utilitário: semana de referência ────────────────────────────────────────
function getSemanaRef() {
  const hoje = new Date();
  const domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - hoje.getDay() - 7);
  const sabado = new Date(domingo);
  sabado.setDate(domingo.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${fmt(domingo)} – ${fmt(sabado)}`;
}

// ─── Página principal ─────────────────────────────────────────────────────────
function ExportarAcompanhamento() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const cardRef = useRef(null);
  const { alunos, marcarAcompanhamentoExportado } = useMentor();

  const [alunoId, setAlunoId] = useState(searchParams.get('id') || '');
  const [nomeAluno, setNomeAluno] = useState(decodeURIComponent(searchParams.get('nome') || ''));
  const [emailAluno, setEmailAluno] = useState('');
  const [dadosPainel, setDadosPainel] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState('');

  // Quando a lista de alunos chega via Context, resolve o email se houver ?id= na URL
  useEffect(() => {
    if (!alunos.length) return;
    const idParam = searchParams.get('id');
    if (idParam && !emailAluno) {
      const aluno = alunos.find(a => String(a.id) === String(idParam));
      if (aluno) setEmailAluno(aluno.email);
    }
  }, [alunos, searchParams, emailAluno]);

  // Carrega dados do aluno quando o email estiver disponível
  useEffect(() => {
    if (!emailAluno) return;
    setCarregando(true);
    setErro('');
    apiFetch('/api/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'login', email: emailAluno }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.dadosPainel) setDadosPainel(d.dadosPainel);
        else setErro('Não foi possível carregar os dados deste aluno.');
      })
      .catch(() => setErro('Erro de conexão.'))
      .finally(() => setCarregando(false));
  }, [emailAluno]);

  const selecionarAluno = (id) => {
    const aluno = alunos.find(a => String(a.id) === String(id));
    if (!aluno) return;
    setAlunoId(id);
    setNomeAluno(aluno.nome);
    setEmailAluno(aluno.email);
  };

  const exportar = async () => {
    if (!cardRef.current) return;
    setExportando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `intento-${nomeAluno.replace(/\s+/g, '-')}-semana.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      // Registra que o mentor exportou — sinal de "acompanhamento enviado"
      // (não-bloqueante: erro aqui não atrapalha o download).
      if (alunoId) {
        marcarAcompanhamentoExportado(alunoId); // otimista: badge atualiza no /mentor sem F5
        apiFetch('/api/mentor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ acao: 'registrarExportacao', idAluno: alunoId }),
        }).catch((e) => console.warn('[painel] registrarExportacao falhou:', e?.message));
      }
    } finally {
      setExportando(false);
    }
  };

  // Deriva os dados
  const semanal = dadosPainel?.semanal || { isFirstWeek: true, geral: [], estilo: [], desempenho: [] };
  const mensal = dadosPainel?.mensal || {};
  // Estado da semana: 'hit' (≥ meta) · 'near' (> 80% da meta) · 'miss' (≤ 80% ou sem meta)
  const historicoConsistencia = (mensal.horas || []).map((h, i) => {
    const meta = parseFloat(mensal.meta?.[i] || 0);
    if (!(meta > 0)) return 'miss';
    const ratio = parseFloat(h || 0) / meta;
    if (ratio >= 1) return 'hit';
    if (ratio > 0.8) return 'near';
    return 'miss';
  });
  const semanaRef = getSemanaRef();

  // Meta de horas da semana (última registrada) + meta/plano do último diário
  const ultimoEncontro = dadosPainel?.ultimoEncontro || null;
  const metaHorasSemana = (mensal.meta && mensal.meta.length) ? mensal.meta[mensal.meta.length - 1] : null;
  const metasDiario = String(ultimoEncontro?.meta || '').split('\n').map(s => s.trim()).filter(Boolean);
  const acoesDiario = (ultimoEncontro?.acoes || []).map(a => String(a || '').trim()).filter(Boolean);

  // KPIs principais (4 do topo)
  const gFind = (frag) => (semanal.geral || []).find(c => String(c.name).toLowerCase().includes(frag));
  const gHoras = gFind('horas'), gDom = gFind('domínio'), gProg = gFind('progresso'), gRev = gFind('atrasad');
  const calcDelta = (card, escala, inverted) => {
    if (!card || semanal.isFirstWeek || card.prev === '' || card.prev == null) return null;
    const conv = escala === 'pct' ? toPct100 : toNum;
    const diff = conv(card.curr) - conv(card.prev);
    if (diff === 0) return { diff: 0 };
    return { diff, positivo: inverted ? diff < 0 : diff > 0 };
  };
  const metaHNum = (metaHorasSemana != null && metaHorasSemana !== '') ? toNum(metaHorasSemana) : null;
  const horasNum = gHoras ? toNum(gHoras.curr) : 0;
  const horasBar = (metaHNum && metaHNum > 0) ? Math.round((horasNum / metaHNum) * 100) : null;

  // Desempenho por matéria (barras) — ordem fixa do backend: Dom/Prog × Bio,Qui,Fis,Mat
  const desemp = semanal.desempenho || [];
  const materias = ['Biologia', 'Química', 'Física', 'Matemática'].map((nome, i) => ({
    nome,
    dom: toPct100(desemp[i * 2]?.curr),
    prog: toPct100(desemp[i * 2 + 1]?.curr),
    domDelta: calcDelta(desemp[i * 2], 'pct', false),
    progDelta: calcDelta(desemp[i * 2 + 1], 'pct', false),
  }));

  // Estilo de vida (barras) — maior = melhor em todas as dimensões
  const estiloBars = (semanal.estilo || []).map((c) => ({ nome: c.name, val: toPct100(c.curr) }));

  // Consistência — só as últimas 4 semanas (+ data de início de cada uma)
  const consistencia4 = historicoConsistencia.slice(-4);
  const labels4 = (mensal.labels || []).slice(-4);
  const curtaData = (lbl) => {
    const p = String(lbl || '').split(' a ')[0].trim().split('/');
    return p.length >= 2 ? `${p[0]}/${p[1]}` : '';
  };
  const semBatidas = consistencia4.filter((s) => s === 'hit').length;
  const semTotal = consistencia4.length;

  const secaoLabel = (texto) => (
    <p style={{ ...T.label, marginBottom: 10 }}>{texto}</p>
  );

  return (
    <div className="min-h-screen bg-slate-100 font-sans">

      {/* ── Barra de controle ──────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Link href="/mentor" className="text-sm text-slate-400 hover:text-[#060242] font-medium transition">← Voltar</Link>
          <h1 className="text-base font-semibold text-[#060242]">Exportar Acompanhamento Semanal</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={alunoId}
            onChange={e => selecionarAluno(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#060242] font-medium text-[#060242]"
          >
            <option value="">Selecionar aluno...</option>
            {alunos.map(a => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
          <button
            onClick={exportar}
            disabled={!dadosPainel || exportando}
            className="bg-[#060242] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-900 transition disabled:opacity-40"
          >
            {exportando ? 'Gerando...' : 'Baixar PNG'}
          </button>
        </div>
      </div>

      {/* ── Estado vazio / loading ─────────────────────────────────── */}
      {!alunoId && (
        <div className="flex items-center justify-center h-64 text-slate-400 font-medium text-sm">
          Selecione um aluno para visualizar o card.
        </div>
      )}
      {alunoId && carregando && <LoadingInline mensagem="Carregando dados do aluno..." className="h-64" />}
      {erro && <div className="text-center text-red-500 font-medium text-sm mt-12">{erro}</div>}

      {/* ── Card exportável ────────────────────────────────────────── */}
      {dadosPainel && !carregando && (
        <div className="py-10 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="text-xs font-semibold text-slate-500">Preview em escala reduzida · exportado em <b className="text-slate-700">1360 × proporcional px</b> (2×)</span>
          </div>
          <div
            ref={cardRef}
            style={{
              width: 680,
              background: '#ffffff',
              borderRadius: 16,
              overflow: 'hidden',
              fontFamily: 'inherit', // herda a Ubuntu do app (antes usava system font)
              boxShadow: '0 4px 24px rgba(6,2,66,0.10)',
            }}
          >
            {/* Header */}
            <div style={{ background: '#060242', padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 4, height: 20, background: '#D4B726', borderRadius: 2 }}></div>
                  <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 16, letterSpacing: '0.04em' }}>INTENTO</span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500, marginTop: 2 }}>
                  Acompanhamento Semanal · {semanaRef}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 15 }}>{nomeAluno}</p>
                <p style={{ color: '#D4B726', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Mentorado</p>
              </div>
            </div>

            {/* Corpo */}
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* 1. KPIs principais (destaque) */}
              {semanal.geral?.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  <KpiCard
                    label="Horas Estudadas"
                    valor={`${fmtH(horasNum)}h`}
                    delta={calcDelta(gHoras, 'num', false)} suffix="h"
                    bar={horasBar}
                    barCaption={metaHNum ? `meta ${fmtH(metaHNum)}h` : null}
                  />
                  <KpiCard label="Domínio Geral" valor={`${toPct100(gDom?.curr)}%`} delta={calcDelta(gDom, 'pct', false)} />
                  <KpiCard label="Progresso Geral" valor={`${toPct100(gProg?.curr)}%`} delta={calcDelta(gProg, 'pct', false)} />
                  <KpiCard label="Revisões Atrasadas" valor={`${toNum(gRev?.curr)}`} delta={calcDelta(gRev, 'num', true)} />
                </div>
              )}

              {/* 2. Consistência (últimas 4 semanas — caixas ✓/✗ com data) */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
                  <p style={T.label}>Bateu a meta de horas?</p>
                  {semTotal > 0 ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                      {semBatidas} de {semTotal} na meta
                    </span>
                  ) : null}
                </div>
                {semTotal > 0 ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {consistencia4.map((estado, i) => {
                      const e = CONS_ESTADO[estado] || CONS_ESTADO.miss;
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                          <div style={{
                            width: '100%', height: 40, borderRadius: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 20, fontWeight: 800,
                            background: e.bg, border: `1px solid ${e.border}`, color: e.cor,
                          }}>
                            {e.simbolo}
                          </div>
                          <span style={T.caption}>
                            {labels4[i] ? curtaData(labels4[i]) : `S${i + 1}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Sem semanas registradas ainda.</p>
                )}
              </div>

              {/* 3. FOCO — Meta + Plano de Ação (último diário) */}
              {(metasDiario.length > 0 || acoesDiario.length > 0) && (
                <div style={{ background: '#fbfaf5', border: '1px solid #f0e9d2', borderRadius: 14, padding: 16 }}>
                  <p style={{ ...T.label, color: '#9a7b1f', marginBottom: 12 }}>
                    Foco{ultimoEncontro?.data ? ` · último diário ${ultimoEncontro.data}` : ''}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                    {metasDiario.length > 0 && (
                      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '4px solid #D4B726', borderRadius: 12, padding: 14 }}>
                        <p style={{ ...T.label, marginBottom: 8 }}>
                          {metasDiario.length === 1 ? 'Meta' : 'Metas'}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {metasDiario.map((m, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                              {metasDiario.length > 1 && (
                                <span style={{ fontSize: 10, fontWeight: 700, background: '#fde68a', color: '#78350f', borderRadius: 4, padding: '2px 6px', minWidth: 18, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                              )}
                              <p style={{ ...T.body, margin: 0 }}>{m}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {acoesDiario.length > 0 && (
                      <div>
                        <p style={{ ...T.label, marginBottom: 8 }}>
                          Plano de Ação
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {acoesDiario.map((a, i) => (
                            <div key={i} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                              <span style={T.body}>{i + 1}. {a}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              )}

              {/* 4. Desempenho por matéria (secundário) — mini card tingido por disciplina */}
              {desemp.length > 0 && (
                <div>
                  {secaoLabel('Desempenho por matéria')}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {materias.map((m) => {
                      const c = CORES_MATERIA[m.nome] || { main: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' };
                      return (
                        <div key={m.nome} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: '0 1px 2px rgba(6,2,66,0.05)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: c.main }}>{m.nome}</span>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                            <span style={T.label}>Domínio</span>
                            <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span style={T.numMd}>{m.dom}%</span>
                              <Delta info={m.domDelta} />
                            </span>
                          </div>
                          <Barra label="Progresso" valor={m.prog} cor={c.main} delta={m.progDelta} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. Estilo de Vida (secundário — barras 0–100%, maior = melhor) */}
              {estiloBars.length > 0 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
                    <p style={T.label}>Estilo de Vida</p>
                    <span style={T.caption}>maior = melhor</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px' }}>
                    {estiloBars.map((e) => (
                      <Barra key={e.nome} label={e.nome} valor={e.val} cor="#34d399" />
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Rodapé */}
            <div style={{ background: '#f8fafc', borderTop: '1px solid #e2e8f0', padding: '14px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>metodointento.com.br</p>
              <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>@metodointento</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ExportarAcompanhamento />
    </Suspense>
  );
}
