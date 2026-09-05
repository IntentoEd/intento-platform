'use client';

// Retrato do Ciclo — cartão exportável (.png) de UM marco do BD_Marcos.
// O marco congelado no Fechamento de Ciclo vira a peça que o mentor manda no
// WhatsApp, no mesmo ritual do acompanhamento semanal (ig/painel). Tudo vem
// congelado da linha do BD_Marcos: carimbos, destaques e as 3 reflexões do
// aluno — NUNCA recomputa (a história não muda).
//
// Rota: /mentor/ig/retrato?id=<idPlanilha>&ano=<ano>&ciclo=<C1..C4>&nome=<nome>
// (mesmo padrão do ig/diario: query params + refetch via buscarDadosAluno).

import { apiFetch } from '@/lib/api';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMentor } from '@/lib/MentorContext';
import { LoadingInline } from '@/components/Loading';
import { salvarPngDoCanvas } from '../exportarPng';
import { corDe, CARIMBO_LABEL } from '@/lib/carimboCores';
import { CICLOS_INFO } from '@/lib/carimbos';
import { computarSelos } from '@/lib/selos';
import { SeloSvg } from '@/components/SeloMetal';

// Tokens de tipografia — mesma escala do ig/painel (textos secundários em
// slate-500 #64748b: WCAG AA no branco; slate-400 reprovava).
const T = {
  label:   { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', margin: 0 },
  caption: { fontSize: 9,  fontWeight: 600, color: '#64748b' },
};

const TRIMESTRE_LABEL = [
  '1º trimestre — janeiro a março',
  '2º trimestre — abril a junho',
  '3º trimestre — julho a setembro',
  '4º trimestre — outubro a dezembro',
];

// Nó da Linha do Ano no card: ✓ verde (marco existente) ou contorno (futuro).
// Estilo inline e sem flex gap — restrições do html2canvas (padrão ig/painel).
function NoLinha({ ok }) {
  return ok ? (
    <div style={{ width: 16, height: 16, borderRadius: 9999, flexShrink: 0, marginTop: 10, marginRight: 8, background: '#10b981', border: '2px solid #fff', boxShadow: '0 1px 2px rgba(6,2,66,0.2)', color: '#fff', fontSize: 8, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
  ) : (
    <div style={{ width: 16, height: 16, borderRadius: 9999, flexShrink: 0, marginTop: 10, marginRight: 8, background: '#fff', border: '2px solid #e2e8f0' }} />
  );
}

function ExportarRetrato() {
  const searchParams = useSearchParams();
  const idPlanilha = searchParams.get('id') || '';
  const anoParam = parseInt(searchParams.get('ano') || '0', 10);
  const cicloParam = searchParams.get('ciclo') || '';
  // searchParams.get já devolve decodificado — decodar de novo lança URIError
  // em nome com '%' literal. Fallback: resolve pelo id na lista do Context
  // (dossiê aberto sem ?nome= propagaria vazio pro header do PNG).
  const nomeParam = searchParams.get('nome') || '';

  const cardRef = useRef(null);
  const { emailMentor, alunos } = useMentor();
  const nomeAluno = nomeParam || alunos.find(a => String(a.id) === String(idPlanilha))?.nome || '';
  const [marco, setMarco] = useState(null);
  const [marcos, setMarcos] = useState([]); // lista completa: Linha do Ano + tier do selo
  const [carregando, setCarregando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState('');

  // Carrega o marco específico (padrão ig/diario: refetch e find por chave)
  useEffect(() => {
    if (!emailMentor) return;
    if (!idPlanilha || !anoParam || !['C1', 'C2', 'C3', 'C4'].includes(cicloParam)) {
      setErro('Marco inválido.');
      setCarregando(false);
      return;
    }
    setCarregando(true);
    apiFetch('/api/mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'buscarDadosAluno', idPlanilhaAluno: idPlanilha }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.status !== 'sucesso') { setErro(d.mensagem || 'Erro ao carregar.'); return; }
        const lista = Array.isArray(d.marcos) ? d.marcos : [];
        const m = lista.find(x => Number(x?.ano) === anoParam && String(x?.ciclo) === cicloParam);
        if (!m) { setErro('Marco não encontrado.'); return; }
        setMarcos(lista);
        setMarco(m);
      })
      .catch(() => setErro('Erro de conexão.'))
      .finally(() => setCarregando(false));
  }, [emailMentor, idPlanilha, anoParam, cicloParam]);

  // Tier do selo "Marco de Ciclo" — o calc desse selo usa SÓ marcos
  // (lib/selos.js), então os demais insumos vazios não interferem.
  // Decisão 04/09/2026: NO RETRATO o selo conta também marcos retroativos
  // (é a assinatura visual do cartão; sem isso, 100% dos retratos até o
  // 1º fechamento real sairiam sem selo). A Jornada segue ignorando
  // retroativos — divergência temporária e intencional até 01/10.
  const seloMarco = useMemo(() => {
    if (!marcos.length) return null;
    const marcosComoVividos = marcos.map(m => ({ ...m, origem: 'fechamento' }));
    const { todos } = computarSelos({ registros: [], diarios: [], simulados: [], caderno: [], marcos: marcosComoVividos });
    const s = todos.find(x => x.id === 'marco_de_ciclo');
    return s && s.tierIdx >= 0 ? s : null;
  }, [marcos]);

  const exportar = async () => {
    if (!cardRef.current || !marco) return;
    setExportando(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      // Espera a fonte (Ubuntu) carregar — sem isso o html2canvas captura com
      // fonte fallback, com métricas diferentes, e os textos saem desalinhados.
      if (document.fonts?.ready) { try { await document.fonts.ready; } catch (_) {} }
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const slug = (nomeAluno || 'aluno').replace(/\s+/g, '-').toLowerCase();
      await salvarPngDoCanvas(canvas, `intento-${slug}-retrato-${marco.ciclo}-${marco.ano}.png`);
      // Sem registrarExportacao aqui: o sinal "acompanhamento enviado" é do
      // ritual SEMANAL (ig/painel e ig/diario) — o retrato é ritual de ciclo.
    } finally {
      setExportando(false);
    }
  };

  // Derivados do marco (tudo congelado)
  const info = marco ? CICLOS_INFO.find(c => c.id === marco.ciclo) : null;
  const idxCiclo = marco ? CICLOS_INFO.findIndex(c => c.id === marco.ciclo) : -1;
  const retroativo = marco?.origem === 'retroativo';
  const d = marco?.destaques || {};
  const stats = marco ? [
    d.horas != null ? { label: 'Horas no ciclo', valor: `${d.horas}h` } : null,
    (d.cobIni != null || d.cobFim != null) ? { label: 'Cobertura', valor: `${d.cobIni ?? '—'}%`, seta: `→ ${d.cobFim ?? '—'}%` } : null,
    (d.domIni != null || d.domFim != null) ? { label: 'Domínio', valor: `${d.domIni ?? '—'}%`, seta: `→ ${d.domFim ?? '—'}%` } : null,
    d.simulados != null ? { label: 'Simulados', valor: String(d.simulados) } : null,
    d.metasTotal ? { label: 'Metas batidas', valor: `${d.metasBatidas ?? 0}/${d.metasTotal}` } : null,
    d.questoes != null ? { label: 'Questões', valor: Number(d.questoes).toLocaleString('pt-BR') } : null,
  ].filter(Boolean) : [];
  const proxCicloLabel = idxCiclo >= 0 && idxCiclo < 3 ? `O que muda no ${CICLOS_INFO[idxCiclo + 1].id}` : 'O que muda daqui pra frente';
  const reflexoes = marco ? [
    ['Maior vitória do ciclo', marco.reflexaoVitoria],
    ['Maior aprendizado', marco.reflexaoAprendizado],
    [proxCicloLabel, marco.reflexaoMudanca],
  ].filter(([, v]) => String(v || '').trim()) : [];
  const chips = marco ? [['comportamento', 'Com'], ['cobertura', 'Cob'], ['dominio', 'Dom'], ['simulado', 'Sim']].map(([key, curto]) => {
    const nivel = marco[key];
    const c = corDe(nivel);
    return { key, texto: `${curto} · ${CARIMBO_LABEL[nivel] || '—'}`, bg: c.bg, cor: c.texto };
  }) : [];
  const marcoDoCiclo = (cicloId) => marcos.some(m => Number(m?.ano) === anoParam && String(m?.ciclo) === cicloId);

  return (
    <div className="min-h-screen bg-slate-100 font-sans">

      {/* ── Barra de controle ──────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/mentor/${idPlanilha}?nome=${encodeURIComponent(nomeAluno)}`} className="text-sm text-slate-500 hover:text-[#060242] font-medium transition">← Voltar</Link>
          <h1 className="text-base font-semibold text-[#060242]">Exportar Retrato do Ciclo</h1>
        </div>
        <button
          onClick={exportar}
          disabled={!marco || exportando}
          className="bg-[#060242] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-900 transition disabled:opacity-40"
        >
          {exportando ? 'Gerando...' : 'Exportar PNG'}
        </button>
      </div>

      {carregando && <LoadingInline mensagem="Carregando marco..." className="h-64" />}
      {erro && <div className="text-center text-red-500 font-medium text-sm mt-12">{erro}</div>}

      {marco && !carregando && (
        <div className="py-10 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-full shadow-sm">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span className="text-xs font-semibold text-slate-500">Preview · exportado em <b className="text-slate-700">1360 × proporcional px</b> (2×)</span>
          </div>

          {/* ── Card exportável ──────────────────────────────────────── */}
          <div
            ref={cardRef}
            style={{
              width: 680,
              background: '#ffffff',
              borderRadius: 16,
              overflow: 'hidden',
              fontFamily: 'inherit', // herda a Ubuntu do app (padrão ig/painel)
              boxShadow: '0 4px 24px rgba(6,2,66,0.10)',
            }}
          >
            {/* Header */}
            <div style={{ background: '#060242', padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ width: 4, height: 20, background: '#D4B726', borderRadius: 2, marginRight: 8 }}></div>
                  <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 16, letterSpacing: '0.04em' }}>INTENTO</span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500, marginTop: 2 }}>
                  Retrato do Ciclo{marco.data ? ` · fechado em ${marco.data}` : ''}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#ffffff', fontWeight: 700, fontSize: 15 }}>{nomeAluno}</p>
                <p style={{ color: '#D4B726', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>Mentorado</p>
              </div>
            </div>

            {/* Corpo */}
            <div style={{ padding: '24px 28px' }}>

              {/* Hero do ciclo + selo Marco de Ciclo (tier real do aluno) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <p style={T.label}>🏁 Marco de Ciclo · {marco.ano}</p>
                  <h3 style={{ fontSize: 24, fontWeight: 800, color: '#060242', margin: '2px 0 0' }}>
                    {marco.ciclo}{info ? ` · ${info.nome}` : ''}{' '}
                    <span style={{ display: 'inline-flex', width: 15, height: 15, borderRadius: 9999, background: '#10b981', border: '2px solid #fff', boxShadow: '0 1px 2px rgba(6,2,66,0.2)', color: '#fff', fontSize: 9, fontWeight: 900, alignItems: 'center', justifyContent: 'center', verticalAlign: '1px' }}>✓</span>
                    {retroativo && (
                      <span style={{ fontSize: 9, fontWeight: 700, background: '#e2e8f0', color: '#64748b', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.08em', marginLeft: 8, verticalAlign: '4px' }} title="Retrato computado do histórico — o ciclo fechou antes da feature existir">retroativo</span>
                    )}
                  </h3>
                  {idxCiclo >= 0 && (
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', margin: '4px 0 0' }}>{TRIMESTRE_LABEL[idxCiclo]}</p>
                  )}
                </div>
                {seloMarco && (
                  <SeloSvg tierRomano={seloMarco.tierRomano} tierMetal={seloMarco.tierMetal} comDefs width={84} height={84}
                    ariaLabel={`Selo Marco de Ciclo, nível ${seloMarco.tierRomano}`} />
                )}
              </div>

              {/* Linha do Ano — segmentos preenchidos até o ciclo do retrato */}
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', marginRight: 8 }}>Linha do Ano</span>
                {CICLOS_INFO.map((c, i) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                      <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: i === idxCiclo ? '#060242' : '#64748b', margin: '0 0 2px', whiteSpace: 'nowrap' }}>{c.id} · {c.nome}</p>
                      <div style={{ height: 6, borderRadius: 9999, background: '#f1f5f9', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 9999, background: 'rgba(6,2,66,0.8)', width: i <= idxCiclo ? '100%' : '0%' }} />
                      </div>
                    </div>
                    {/* Retrato é congelado no tempo: nós ✓ só até o ciclo do
                        retrato — re-exportar o C2 em novembro não mostra o C3. */}
                    <NoLinha ok={i <= idxCiclo && marcoDoCiclo(c.id)} />
                  </div>
                ))}
                <span style={{ fontSize: 8, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>ENEM</span>
              </div>

              {/* Carimbos congelados */}
              <p style={{ ...T.label, marginBottom: 8 }}>Carimbos do ciclo</p>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: 22 }}>
                {chips.map(ch => (
                  <span key={ch.key} style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '4px 10px', background: ch.bg, color: ch.cor, marginRight: 8 }}>{ch.texto}</span>
                ))}
                <span style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 12, marginLeft: 4, display: 'flex', alignItems: 'center' }}>
                  <span style={{ ...T.label, marginRight: 6 }}>Perfil</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 10px', borderRadius: 9999, background: corDe(marco.perfil).bg, color: corDe(marco.perfil).texto }}>{CARIMBO_LABEL[marco.perfil] || '—'}</span>
                </span>
                {marco.nivelAlvo != null && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#64748b', marginLeft: 'auto' }} title="Nível-alvo de simulado combinado pro ciclo seguinte">alvo simulado · {marco.nivelAlvo}%</span>
                )}
              </div>

              {/* Destaques congelados (grid 3x2 — cada stat só se existir) */}
              {stats.length > 0 && (
                <>
                  <p style={{ ...T.label, marginBottom: 8 }}>Destaques congelados</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
                    {stats.map(s => (
                      <div key={s.label} style={{ background: '#fff', border: '1px solid #e8ecf2', borderRadius: 12, boxShadow: '0 1px 2px rgba(6,2,66,0.05)', padding: '12px 14px' }}>
                        <span style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', display: 'block' }}>{s.label}</span>
                        <span style={{ fontSize: 17, fontWeight: 800, color: '#060242', fontVariantNumeric: 'tabular-nums' }}>
                          {s.valor}{s.seta ? <span style={{ fontSize: 11, fontWeight: 700, color: '#0F6E56', marginLeft: 4 }}>{s.seta}</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Reflexões do aluno — só no fechamento real (backfill não tem) */}
              {!retroativo && reflexoes.length > 0 && (
                <div style={{ background: '#fbfaf5', border: '1px solid #f0e9d2', borderRadius: 14, padding: 16 }}>
                  {reflexoes.map(([label, v], i) => (
                    <div key={label} style={{ marginBottom: i === reflexoes.length - 1 ? 0 : 12 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9a7b1f', margin: '0 0 2px' }}>{label}</p>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', margin: 0, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>“{String(v).trim()}”</p>
                    </div>
                  ))}
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
      <ExportarRetrato />
    </Suspense>
  );
}
