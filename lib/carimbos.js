// ─────────────────────────────────────────────────────────────────────────────
// Motor de diagnóstico Fases e Ciclos (Método Intento) — FONTE ÚNICA DE VERDADE
// das faixas, janelas e regras de carimbo (Aprendiz/Veterano/Mestre).
// Consumido pelo /lider (?diagnostico=1) e pelo /mentor — qualquer divergência
// de carimbo entre as duas telas é bug grave de linguagem: altere AQUI, nunca
// duplique faixas em página.
//
//   Domínio   = acerto por matéria (metricas.materias.dom*) — faixas <70/70-80/>80
//   Cobertura = progresso VALIDADO pelo mentor (metricas.materias.prog*) — 0-30/30-70/70-100
//   Domínio e Cobertura são ESTOQUES (o valor semanal já vem acumulado do app):
//   carimba o SNAPSHOT — último valor não-vazio por matéria no horizonte de
//   8 semanas (carry-forward: semana sem dado não apaga carimbo). Média de
//   janela aqui só adicionaria atraso (decisão de 31/07/2026; bate com a
//   Visão Geral do /mentor).
//   Comportamento = PADRÃO, não estoque: pior(Presença, Aproveitamento) sobre
//                   janela móvel de 4 semanas mensuráveis (ver bloco abaixo)
//   Simulado  = Fase 2 (aba de simulados da planilha do aluno)
//   Perfil agregado = elo mais fraco entre as dimensões já computáveis — leitura
//                     CONTÍNUA; o retrato oficial congela no Marco de Ciclo
//                     (BD_Marcos, fechamento trimestral — ver marcoCicloPendente
//                     abaixo e docs/GAMIFICACAO_MARCOS.md)
// ─────────────────────────────────────────────────────────────────────────────

export const CARIMBOS = ['aprendiz', 'veterano', 'mestre'];
// Revisões atrasadas no app acima disso = alerta clínico (backlog de revisão
// fora de controle — decisão de 17/08/2026).
export const REVISOES_ATRASADAS_ALERTA = 10;
export const ORD_CAR = { aprendiz: 0, veterano: 1, mestre: 2 };
export const DIM_LABEL = { comportamento: 'Comportamento', cobertura: 'Cobertura', dominio: 'Domínio', simulado: 'Simulado' };

export const DISC_DIAG = ['Bio', 'Qui', 'Fis', 'Mat'];
export function mediasPorDisc(materias, base) { // base: 'dom' | 'prog'
  const cap = base.charAt(0).toUpperCase() + base.slice(1);
  const out = [];
  DISC_DIAG.forEach(d => {
    const soma = materias?.[base + d], cont = materias?.['c' + cap + d];
    if (cont > 0) out.push(soma / cont);
  });
  return out;
}
export const mediaArr = (arr) => arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : null;

export function carimboPorFaixa(v, limVet, limMes) {
  if (v == null) return null;
  if (v < limVet) return 'aprendiz';
  if (v < limMes) return 'veterano';
  return 'mestre';
}

// Ciclos do manual (ancorado no ENEM) + leitura clínica e piso de Cobertura
// abaixo do qual o aluno está "fora da trajetória" daquele Ciclo (aluno integral típico).
export const CICLOS_INFO = [
  { id: 'C1', nome: 'Fundação', leitura: 'Instalação de rotina e método — Cobertura baixa é normal.', cobMin: 0 },
  { id: 'C2', nome: 'Aprofundamento', leitura: 'Operação plena — Cobertura deve passar de ~20%.', cobMin: 20 },
  { id: 'C3', nome: 'Lapidação', leitura: 'Pico + simulados — Cobertura <50% vira alerta.', cobMin: 50 },
  { id: 'C4', nome: 'Refinamento', leitura: 'Preservação e prova — Cobertura <80% vira alerta.', cobMin: 80 },
];
export function cicloIdx() { const m = new Date().getMonth(); return m <= 2 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3; }

// ── Marcos de Ciclo (BD_Marcos — fechamento trimestral) ──────────────────────
export const NIVEL_ALVO_SIMULADO_PADRAO = 85; // % de acerto — padrão do método

// Trimestre de uma data: { idx 0..3 (C1..C4), ano }.
export function cicloDeData(d) {
  const m = d.getMonth();
  return { idx: m <= 2 ? 0 : m <= 5 ? 1 : m <= 8 ? 2 : 3, ano: d.getFullYear() };
}

// Período coberto por um ciclo (fronteiras 01/01, 01/04, 01/07, 01/10).
export function periodoDoCiclo(idx, ano) {
  return {
    inicio: new Date(ano, idx * 3, 1),
    fim: new Date(ano, idx * 3 + 3, 0, 23, 59, 59), // último dia do trimestre
  };
}

// Data vinda do payload GAS: Date serializada (ISO), "yyyy-MM-dd" ou "dd/MM/yyyy".
export function parseDataPayload(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1]);
  // Date-only ISO parseia LOCAL: new Date('2026-07-01') seria UTC-midnight e o
  // recuo de 3h (BRT) jogaria simulado de fronteira no trimestre errado.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Escopo do fluxo de marcos (decisão nº 5 do plano): só mentoria/ENEM com app.
// Fonte única — consumida pelo Modo Encontro e pelo CardCarimbosAluno.
export const STATUS_FORA_DO_APP = ['Não se adaptou', 'Nunca vai usar'];
// One-off de ativação: pendência só pra ciclos que TERMINAM a partir do fim do
// C3/2026 (primeiro fechamento ao vivo). Sem isso, o deploy dispararia
// "Fechamento C2 pendente" pra base inteira antes do backfill retroativo de
// C1/C2. Constante removível depois do backfill. NÃO trocar por janela móvel:
// a pendência deve persistir indefinidamente até o fechamento acontecer.
export const MARCO_ATIVO_A_PARTIR = new Date(2026, 8, 30);

// Fechamento de Ciclo pendente? Pendente ⇔ o ciclo FECHADO mais recente
// (trimestre anterior a `hoje`) não tem linha em BD_Marcos E o aluno viveu o
// ciclo (≥1 diário datado dentro dele — guarda de recém-matriculado) E o aluno
// está no escopo (ENEM + usa o app).
// `marcos` PRECISA ser array (payload do GAS novo): undefined = GAS antigo no
// ar ⇒ retorna null e a feature fica dormente (janela de deploy GAS→Vercel
// segura). Devolve SÓ o pendente mais recente — ciclos antigos sem marco
// entram pelo backfill retroativo, nunca empilham fechamentos no encontro.
export function marcoCicloPendente({ marcos, diarios, hoje = new Date(), tipoAluno, statusApp }) {
  if (!Array.isArray(marcos)) return null;
  if (tipoAluno !== 'ENEM') return null; // escopo: chamador passa o tipo real
  if (statusApp && STATUS_FORA_DO_APP.includes(statusApp)) return null; // '' = usa (convenção do Code.gs)
  const atual = cicloDeData(hoje);
  const idx = atual.idx === 0 ? 3 : atual.idx - 1;
  const ano = atual.idx === 0 ? atual.ano - 1 : atual.ano;
  const cicloId = CICLOS_INFO[idx].id;
  if (marcos.some(m => String(m?.ciclo) === cicloId && Number(m?.ano) === ano)) return null;
  const { inicio, fim } = periodoDoCiclo(idx, ano);
  if (fim < MARCO_ATIVO_A_PARTIR) return null;
  const viveu = (diarios || []).some(d => {
    const dt = parseDataPayload(d?.data);
    return dt && dt >= inicio && dt <= fim;
  });
  if (!viveu) return null;
  return { ciclo: CICLOS_INFO[idx], idx, ano };
}

// Semana mais recente do historico { 'DD/MM/YYYY a DD/MM/YYYY': { horas, meta, ... } }
export function ultimaSemanaHist(hist) {
  if (!hist) return null;
  const labels = Object.keys(hist).sort((x, y) => tsLabelSemana(x) - tsLabelSemana(y));
  const ult = labels[labels.length - 1];
  return ult ? hist[ult] : null;
}

// Sinal clínico do check-in (4 semanas): sofrimento persistente ou motivação em
// queda → vermelho. Proxy parcial — sinais "detectados pelo mentor" não capturáveis.
// Semana ZERADA (est E mot = 0): o app grava 0 quando o aluno pula o check-in —
// é "sumiu do check-in", não motivação baixa (decisão do Filippe, 07/08/2026).
// Sai da conta de sofrimento e alerta com linguagem própria; null (registro
// manual sem check-in) segue neutro como antes.
export function sinalCheckin(a) {
  const hist = a.metricas?.checkin4w;
  if (!Array.isArray(hist) || hist.length === 0) return null; // pré-deploy → neutro
  const zerada = (w) => w.est === 0 && w.mot === 0;
  const zeradas = hist.filter(zerada).length;
  const validas = hist.filter(w => !zerada(w));
  const ruins = validas.filter(w => (w.est != null && w.est > 0 && w.est <= 40) || (w.mot != null && w.mot > 0 && w.mot <= 40)).length;
  if (ruins >= 2) return { nivel: 'vermelho', motivo: 'estresse/motivação ≤40 em 2+ semanas' };
  if (zeradas >= 2) return { nivel: 'vermelho', motivo: `sem check-in em ${zeradas} das últimas ${hist.length} semanas` };
  const mots = validas.map(w => w.mot).filter(v => v != null && v > 0);
  if (mots.length >= 2) {
    const pico = Math.max(...mots), ult = mots[mots.length - 1];
    if (pico >= 60 && ult <= pico * 0.6) return { nivel: 'vermelho', motivo: 'motivação despencou' };
  }
  if (ruins === 1) return { nivel: 'amarelo', motivo: 'estresse/motivação ≤40 em 1 semana' };
  if (zeradas === 1) return { nivel: 'amarelo', motivo: 'check-in não respondido em 1 semana' };
  return { nivel: 'verde' };
}

// ── Comportamento por semanas válidas (janela móvel de 4 semanas mensuráveis) ──
// Dia e semana isolados não movem carimbo; o que carimba é o padrão de semanas
// na janela (construto de robustez — decisão de método de 15-16/07/2026, que
// substitui o Manual v2 neste ponto).
//   Semana MENSURÁVEL: ≥3 dias planejados na Semana Padrão e meta > 0. Semana
//   reduzida planejada (viagem/recesso), grade vazia ou pré-deploy da coluna
//   `dias` fica fora — a janela estende para trás (horizonte máx. 8 semanas).
//   Sem 4 mensuráveis no horizonte → "em formação" (sem dado suficiente).
//   PRESENÇA: semana válida = no máx. 1 dia planejado sem registro (absoluto).
//   APROVEITAMENTO: % = horas/meta vigente NAQUELA semana; válida-V ≥70, válida-M ≥85.
//   ABSORÇÃO (máx. 1/janela): rompida imediatamente seguida de válida = disrupção
//   absorvida (miss com retorno não pune — só vale p/ promoção a Mestre). Rompida
//   na ponta recente NÃO absorve: o retorno ainda não aconteceu. Duas rompidas
//   consecutivas = padrão de abandono, contam integralmente.
//   OVERSTUDYING: 2 semanas consecutivas >105% → alerta clínico + trava Mestre.
export const HORIZONTE_SEMANAS = 8;
export const JANELA_COMPORTAMENTO = 4;
export const tsLabelSemana = (l) => { const p = String(l).split(' a ')[0].split('/'); return new Date(+p[2], +p[1] - 1, +p[0]).getTime() || 0; };

export function janelaMensuravel(hist) {
  if (!hist) return { semanas: null, mensuraveis: 0 };
  const labels = Object.keys(hist).sort((x, y) => tsLabelSemana(x) - tsLabelSemana(y)).slice(-HORIZONTE_SEMANAS);
  const mensuraveis = labels.map(l => hist[l]).filter(s => s && s.diasPlan != null && s.diasPlan >= 3 && s.meta > 0);
  return {
    semanas: mensuraveis.length >= JANELA_COMPORTAMENTO ? mensuraveis.slice(-JANELA_COMPORTAMENTO) : null,
    mensuraveis: mensuraveis.length,
  };
}

// validas: booleans da mais antiga → mais recente. Todas válidas → Mestre;
// 1 rompida absorvida (não é a mais recente ⇒ a próxima mensurável é válida)
// → Mestre; 1 rompida na ponta recente → Veterano; 2+ rompidas → Aprendiz.
export function carimboPorSemanasValidas(validas) {
  const v = validas.filter(Boolean).length;
  if (v === validas.length) return 'mestre';
  if (v === validas.length - 1) return validas[validas.length - 1] ? 'mestre' : 'veterano';
  return 'aprendiz';
}

export function carimboAproveitamento(pcts) {
  // Semana >105% é válida pro carimbo, mas 2 consecutivas ativam o alerta
  // clínico transversal e travam a promoção a Mestre (veto do cap. 6
  // reoperacionalizado como gatilho automático).
  const overstudying = pcts.some((p, i) => i > 0 && p > 105 && pcts[i - 1] > 105);
  const podeMestre = !overstudying && carimboPorSemanasValidas(pcts.map(p => p >= 85)) === 'mestre';
  const nivel = podeMestre ? 'mestre' : (pcts.filter(p => p >= 70).length >= 3 ? 'veterano' : 'aprendiz');
  return { nivel, overstudying };
}

// ── Adapter /mentor: linhas cruas do BD_Registro → shape do diagnóstico ──────
// O payload `registros` do buscarDadosAluno vem de getDisplayValues() (strings,
// decimal pode ser vírgula). Replica EXATAMENTE as janelas e normalizações da
// agregação do dashboardLider (gas/Code.gs): matérias = snapshot (último valor
// não-vazio por matéria nas últimas HORIZONTE_SEMANAS linhas), últimas 12 →
// histórico, normPct (≤1 → ×100, ≤0 → descartado), linha dupla na mesma
// semana → dias pelo maior valor. Divergência aqui = carimbo diferente
// entre /lider e /mentor.
export const COL_REG_FRONT = { // espelho de COL_REG em gas/Code.gs — manter em sincronia
  SEMANA: 0, META: 3, HORAS: 4,
  DOMINIO_TOTAL: 5, PROGRESSO_TOTAL: 6, REVISOES: 7,
  DOM_BIO: 12, PROG_BIO: 13, DOM_QUI: 14, PROG_QUI: 15,
  DOM_FIS: 16, PROG_FIS: 17, DOM_MAT: 18, PROG_MAT: 19,
  ORIGEM: 20, DIAS_ESTUDO: 21, DIAS_PLANEJADOS: 22, QUESTOES: 23,
};
const numBR = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
// Célula formatada como percentual chega do getDisplayValues com sufixo "%"
// ("1%" → 1): o número já É percentual — aplicar a heurística ≤1→×100 nele
// carimbava Mestre com 1% do edital (bug Maria Luiza, 31/07/2026).
const normPct = (v) => {
  const n = numBR(v);
  if (n == null || n <= 0) return null;
  if (String(v).includes('%')) return n;
  return n <= 1 ? n * 100 : n;
};

export function registrosParaMetricas(registros) {
  const C = COL_REG_FRONT;
  const filtrados = (registros || []).filter(r => String(r?.[C.SEMANA] || '').trim());
  const historico = {};
  filtrados.slice(-12).forEach(r => {
    const lbl = String(r[C.SEMANA]);
    if (!historico[lbl]) historico[lbl] = { horas: 0, meta: 0, count: 0, dias: null, diasPlan: null };
    historico[lbl].horas += numBR(r[C.HORAS]) || 0;
    historico[lbl].meta  += numBR(r[C.META]) || 0;
    historico[lbl].count++;
    const dias = numBR(r[C.DIAS_ESTUDO]);
    const diasPlan = numBR(r[C.DIAS_PLANEJADOS]);
    if (dias != null) historico[lbl].dias = Math.max(historico[lbl].dias || 0, dias);
    if (diasPlan != null) historico[lbl].diasPlan = Math.max(historico[lbl].diasPlan || 0, diasPlan);
  });
  const materias = {};
  const janela = filtrados.slice(-HORIZONTE_SEMANAS);
  const snap = (col, kSoma, kCount) => { // último valor não-vazio da matéria no horizonte
    for (let i = janela.length - 1; i >= 0; i--) {
      const n = normPct(janela[i][col]);
      if (n != null) { materias[kSoma] = n; materias[kCount] = 1; return; }
    }
  };
  snap(C.DOM_BIO, 'domBio', 'cDomBio'); snap(C.PROG_BIO, 'progBio', 'cProgBio');
  snap(C.DOM_QUI, 'domQui', 'cDomQui'); snap(C.PROG_QUI, 'progQui', 'cProgQui');
  snap(C.DOM_FIS, 'domFis', 'cDomFis'); snap(C.PROG_FIS, 'progFis', 'cProgFis');
  snap(C.DOM_MAT, 'domMat', 'cDomMat'); snap(C.PROG_MAT, 'progMat', 'cProgMat');
  // Revisões Atrasadas (snapshot do app, contagem): último valor não-vazio no
  // horizonte — carry-forward igual às matérias, mas 0 é válido (zera o alerta),
  // então não passa pelo normPct.
  let revisoesAtrasadas = null;
  for (let i = janela.length - 1; i >= 0; i--) {
    const n = numBR(janela[i][C.REVISOES]);
    if (n != null) { revisoesAtrasadas = n; break; }
  }
  return { materias, historico, revisoesAtrasadas };
}

// Diagnóstico completo de um aluno a partir do shape { metricas: { materias,
// historico, checkin4w } } — o payload do dashboardLider já vem assim; o
// /mentor monta via registrosParaMetricas(registros) acima.
export function diagnosticoDimensional(a) {
  const mx = a.metricas || {}, m = mx.materias || {};
  const domVals = mediasPorDisc(m, 'dom');
  const domMed = mediaArr(domVals);
  let dominio = carimboPorFaixa(domMed, 70, 80);
  if (dominio === 'mestre' && domVals.some(v => v < 70)) dominio = 'veterano'; // Mestre exige nenhuma matéria <70
  const cobMed = mediaArr(mediasPorDisc(m, 'prog')); // 100% = edital canônico → média = % do edital visto
  const cobertura = carimboPorFaixa(cobMed, 30, 70);
  const u = ultimaSemanaHist(mx.historico);
  const aprov = (u && u.meta > 0) ? Math.round((u.horas / u.meta) * 100) : null; // exibição: última semana
  const jan = janelaMensuravel(mx.historico);
  let comportamento = null, presenca = null, aproveitamento = null, overstudying = false;
  if (jan.semanas) {
    presenca = carimboPorSemanasValidas(jan.semanas.map(s => (s.dias || 0) >= s.diasPlan - 1));
    const ca = carimboAproveitamento(jan.semanas.map(s => (s.horas / s.meta) * 100));
    aproveitamento = ca.nivel;
    overstudying = ca.overstudying;
    comportamento = CARIMBOS[Math.min(ORD_CAR[presenca], ORD_CAR[aproveitamento])]; // elo interno
  }
  const compEmFormacao = !comportamento;
  // elo: dimensão menos avançada (prioridade Comportamento > Cobertura > Domínio em empate)
  const dimsOrd = [['comportamento', comportamento], ['cobertura', cobertura], ['dominio', dominio]].filter(([, n]) => n);
  const minO = dimsOrd.length ? Math.min(...dimsOrd.map(([, n]) => ORD_CAR[n])) : null;
  const eloDim = dimsOrd.find(([, n]) => ORD_CAR[n] === minO)?.[0] || null;
  const perfil = minO != null ? CARIMBOS[minO] : null;
  const chk = sinalCheckin(a);
  // Alerta clínico transversal = sofrimento no check-in (persistente ou motivação
  // em queda) OU overstudying sustentado (2 semanas consecutivas >105% da meta)
  // OU revisões atrasadas acumuladas no app acima do teto.
  const revAtrasadas = typeof mx.revisoesAtrasadas === 'number' ? mx.revisoesAtrasadas : null;
  const motivosAlerta = [];
  if (chk?.nivel === 'vermelho') motivosAlerta.push(chk.motivo);
  if (overstudying) motivosAlerta.push('overstudying (2+ sem acima de 105% da meta)');
  if (revAtrasadas != null && revAtrasadas > REVISOES_ATRASADAS_ALERTA) motivosAlerta.push(`${Math.round(revAtrasadas)} revisões atrasadas no app`);
  const alerta = motivosAlerta.length > 0;
  return {
    comportamento, presenca, aproveitamento, compEmFormacao,
    semanasMensuraveis: jan.mensuraveis,
    cobertura, dominio, simulado: null, perfil, eloDim, alerta, overstudying,
    alertaMotivo: motivosAlerta.join(' + ') || null,
    domMed, cobMed, aprov, revisoesAtrasadas: revAtrasadas,
  };
}

// Motivos estruturados de "precisa de ação" (chip Mentorados do /lider; faixa de
// prioridades do /mentor na Fase B — ver docs/REDESIGN_LIDER_CLINICO_E_MENTOR.md).
// [] = aluno no trilho. tipo 'clinico' é o único vermelho; os demais são trajetória.
export function motivosAcao(d, ciclo) {
  if (!d) return [];
  const motivos = [];
  if (d.alerta) motivos.push({ tipo: 'clinico', texto: d.alertaMotivo ? `alerta clínico · ${d.alertaMotivo}` : 'alerta clínico' });
  if (d.cobMed != null && d.cobMed < ciclo.cobMin) motivos.push({ tipo: 'cobertura', texto: `cobertura ${Math.round(d.cobMed)}% < piso ${ciclo.cobMin}% do ${ciclo.id}` });
  if (d.perfil === 'aprendiz') motivos.push({ tipo: 'perfil', texto: `perfil Aprendiz · elo: ${DIM_LABEL[d.eloDim] || '—'}` });
  return motivos;
}
