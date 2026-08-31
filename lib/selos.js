// ─────────────────────────────────────────────────────────────────────────────
// Selos da Jornada (gamificação do aluno) — FONTE ÚNICA DE VERDADE do catálogo
// e das regras de desbloqueio. Ver docs/GAMIFICACAO_MARCOS.md §4.
//
// Filosofia (aprovada 18/08/2026):
//   - Replay determinístico: desbloqueio = primeira semana fechada em que o
//     predicado vira verdadeiro sobre o histórico persistido. SEM storage de
//     unlocks — recomputável a qualquer momento; visto/não-visto é localStorage.
//   - Monotonicidade: tier estampado é permanente (quebra zera contadores
//     correntes, nunca conquistas dadas).
//   - Semana sem dado/não-mensurável é NEUTRA: pausa sequência, nunca quebra
//     (mesma janelaMensuravel do motor de carimbos — uma só semântica).
//   - NUNCA notificar perda; Volta por Cima nunca aparece como "próxima".
//   - Máx. 2 "próximas estampas" no painel, priorizando constância.
//   - Check-in emocional NUNCA vira selo (sinal clínico).
//   - Palavra externa = "Selo"; carimbo/Aprendiz/Veterano/Mestre são do
//     diagnóstico (Fases e Ciclos), não deste catálogo.
//
// Limiares de Quilometragem CALIBRADOS 19/08/2026 com a distribuição real do
// backfill (P50 semanal=116; acumulado P25=383 P40=787 P50=1274 P75=4045
// P90=7998): 100 ≈ 1 semana mediana · 500 ≈ 1 mês · 2000 ≈ P60 · 6000 ≈ P85.
// ─────────────────────────────────────────────────────────────────────────────

import { COL_REG_FRONT, tsLabelSemana, parseDataPayload, cicloDeData, STATUS_FORA_DO_APP } from '@/lib/carimbos';

// ── Visibilidade da Jornada ──────────────────────────────────────────────────
// Só regra de ESCOPO (decisão nº 5: mentoria/ENEM que usa o app). O gate de
// lançamento (JORNADA_LIBERADA + allowlist) foi aposentado em 31/08/2026 após
// a chave geral do PR #92 — rollout concluído no Encontro Bússola.
// O parâmetro email fica na assinatura por compatibilidade com os call sites.
export function jornadaVisivel(email, tipoAluno, statusApp) {
  if (tipoAluno !== 'ENEM') return false;
  if (statusApp && STATUS_FORA_DO_APP.includes(statusApp)) return false; // '' = usa
  return true;
}

// ── Parsing tolerante (payload do aluno vem de getValues: números crus; o do
// mentor vem de getDisplayValues: strings com vírgula/%) ─────────────────────
const numDe = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseFloat(String(v).replace(',', '.').replace('%', ''));
  return isNaN(n) ? null : n;
};
const pctDe = (v) => {
  const n = numDe(v);
  if (n == null || n <= 0) return null;
  if (String(v).includes('%')) return n;
  return n <= 1 ? n * 100 : n;
};

// ── Modelo de semana: agrega linhas do BD_Registro por label (linha dupla:
// max nos volumes, valor mais recente nos estoques) e ordena cronológico ─────
export function modelarSemanas(registros) {
  const C = COL_REG_FRONT;
  const porTs = {};
  (registros || []).forEach(r => {
    const label = String(r?.[C.SEMANA] || '').trim();
    const ts = tsLabelSemana(label);
    if (!label || !ts) return;
    const w = porTs[ts] || (porTs[ts] = { ts, label, meta: null, horas: null, dias: null, diasPlan: null, questoes: null, revisoes: null, origem: '', domTotal: null, progTotal: null, domMat: {}, progMat: {} });
    const maxNum = (atual, v) => (v == null ? atual : Math.max(atual == null ? -Infinity : atual, v));
    w.meta = maxNum(w.meta, numDe(r[C.META]));
    w.horas = maxNum(w.horas, numDe(r[C.HORAS]));
    w.dias = maxNum(w.dias, numDe(r[C.DIAS_ESTUDO]));
    w.diasPlan = maxNum(w.diasPlan, numDe(r[C.DIAS_PLANEJADOS]));
    w.questoes = maxNum(w.questoes, numDe(r[C.QUESTOES]));
    const rev = numDe(r[C.REVISOES]);
    if (rev != null) w.revisoes = rev;
    const org = String(r[C.ORIGEM] || '').trim();
    if (org === 'auto' || org === 'revisado') w.origem = org;
    else if (!w.origem && org) w.origem = org;
    const dt = pctDe(r[C.DOMINIO_TOTAL]);
    if (dt != null) w.domTotal = dt;
    const pt = pctDe(r[C.PROGRESSO_TOTAL]);
    if (pt != null) w.progTotal = pt;
    [['BIO', C.DOM_BIO, C.PROG_BIO], ['QUI', C.DOM_QUI, C.PROG_QUI], ['FIS', C.DOM_FIS, C.PROG_FIS], ['MAT', C.DOM_MAT, C.PROG_MAT]].forEach(([m, cd, cp]) => {
      const vd = pctDe(r[cd]);
      if (vd != null) w.domMat[m] = vd;
      const vp = pctDe(r[cp]);
      if (vp != null) w.progMat[m] = vp;
    });
  });
  return Object.values(porTs)
    .sort((a, b) => a.ts - b.ts)
    .map(w => ({
      ...w,
      mensuravel: w.diasPlan != null && w.diasPlan >= 3 && (w.meta || 0) > 0,
      aprov: (w.meta || 0) > 0 && w.horas != null ? (w.horas / w.meta) * 100 : null,
    }));
}

// ── Infra de tiers: registra a semana em que cada tier foi atingido ──────────
function mkTracker(nTiers) {
  const quando = new Array(nTiers).fill(null);
  return {
    quando,
    bater(tierIdx, label) {
      for (let t = 0; t <= tierIdx && t < nTiers; t++) if (!quando[t]) quando[t] = label;
    },
    tierIdx() { return quando.filter(Boolean).length - 1; },
  };
}

const TIERS_ROMANOS = ['I', 'II', 'III', 'IV', 'V'];

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO — cada selo: metadados + calc(ctx) → { tierIdx, quando[], proximo }
// ctx = { semanas (modelarSemanas), diarios (diariosMetas: {data, statusMetasAnteriores,
//         resultados[]}, ordem cronológica), simulados (sim.lista), caderno (cards),
//         marcos, hoje }
// prioridade menor = aparece antes em "próximas" (constância primeiro — o elo
// fraco real da base é execução, não aprendizagem).
// ─────────────────────────────────────────────────────────────────────────────

export const SELOS = [
  {
    id: 'diario_de_bordo', nome: 'Diário de Bordo', categoria: 'Constância', prioridade: 1,
    descricao: 'Cada semana com estudo registrado é uma página do seu percurso. Pausas não apagam o que você já escreveu.',
    tiers: [
      { alvo: 1, label: 'Primeira página', criterio: '1 semana com estudo registrado' },
      { alvo: 4, label: 'Ritmo inicial', criterio: '4 semanas com estudo (não precisam ser seguidas)' },
      { alvo: 12, label: 'Semestre presente', criterio: '12 semanas com estudo' },
      { alvo: 30, label: 'Ano em movimento', criterio: '30 semanas com estudo' },
    ],
    calc({ semanas }) {
      const tk = mkTracker(4);
      let n = 0;
      semanas.forEach(w => {
        if ((w.horas || 0) <= 0) return;
        n++;
        this.tiers.forEach((t, i) => { if (n >= t.alvo) tk.bater(i, w.label); });
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: n, disponivel: true };
    },
    proximoTexto(t, de) { return `${de} de ${t.alvo} semanas com estudo`; },
  },
  {
    id: 'presenca', nome: 'Presença', categoria: 'Constância', prioridade: 1,
    descricao: 'Você compareceu aos dias que planejou — faltando no máximo um. Constância é comparecer, não ser perfeito.',
    tiers: [
      { alvo: 1, label: 'Semana de presença', criterio: '1 semana comparecendo aos dias planejados (máx. 1 falta)' },
      { alvo: 3, label: 'Padrão se formando', criterio: '3 semanas de presença em 4 seguidas' },
      { alvo: 8, label: 'Presença instalada', criterio: '8 semanas de presença, acumuladas' },
      { alvo: 20, label: 'Presença de ferro', criterio: '20 semanas de presença, acumuladas' },
    ],
    calc({ semanas }) {
      // Só semanas MENSURÁVEIS com telemetria do app (origem auto/revisado)
      const tk = mkTracker(4);
      let total = 0;
      const janela = []; // últimas 4 mensuráveis: true = presença válida
      let temMensuravel = false;
      semanas.forEach(w => {
        if (!w.mensuravel || (w.origem !== 'auto' && w.origem !== 'revisado') || w.dias == null) return;
        temMensuravel = true;
        const ok = w.dias >= w.diasPlan - 1;
        janela.push(ok);
        if (janela.length > 4) janela.shift();
        if (ok) {
          total++;
          if (total >= 1) tk.bater(0, w.label);
          if (total >= 8) tk.bater(2, w.label);
          if (total >= 20) tk.bater(3, w.label);
        }
        if (janela.length === 4 && janela.filter(Boolean).length >= 3) tk.bater(1, w.label);
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: total, disponivel: temMensuravel };
    },
    proximoTexto(t, de) { return t.alvo === 3 ? '3 presenças em 4 semanas seguidas' : `${de} de ${t.alvo} semanas de presença`; },
  },
  {
    id: 'cadencia', nome: 'Cadência', categoria: 'Constância', prioridade: 1,
    descricao: 'Semanas seguidas em campo. Sua cadência tem fôlegos: uma semana difícil não apaga o que você construiu.',
    tiers: [
      { alvo: 2, label: 'Dois compassos', criterio: '2 semanas seguidas em campo (3+ dias e 2h+)' },
      { alvo: 4, label: 'Um mês de cadência', criterio: '4 semanas seguidas' },
      { alvo: 6, label: 'Cadência firme', criterio: '6 semanas seguidas' },
      { alvo: 10, label: 'Cadência longa', criterio: '10 semanas seguidas' },
    ],
    calc({ semanas }) {
      // Pisos ABSOLUTOS (dias≥3 e horas≥2): imunes a meta editada. Semana
      // não-mensurável é neutra (pausa). Fôlegos: +1 a cada 3 que contam
      // (máx. 2 guardados); rompida consome 1; sem fôlego → zera o contador
      // corrente (tier estampado permanece).
      const tk = mkTracker(4);
      let streak = 0, folegos = 0, desdeFolego = 0, temMensuravel = false, streakAtual = 0;
      semanas.forEach(w => {
        if (!w.mensuravel || w.dias == null || w.horas == null) return;
        temMensuravel = true;
        const conta = w.dias >= 3 && w.horas >= 2;
        if (conta) {
          streak++;
          desdeFolego++;
          if (desdeFolego >= 3 && folegos < 2) { folegos++; desdeFolego = 0; }
          this.tiers.forEach((t, i) => { if (streak >= t.alvo) tk.bater(i, w.label); });
        } else if (folegos > 0) {
          folegos--; // fôlego absorve a rompida — a cadência segue
        } else {
          streak = 0;
          desdeFolego = 0;
        }
        streakAtual = streak;
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: streakAtual, disponivel: temMensuravel };
    },
    proximoTexto(t, de) { return `${de} de ${t.alvo} semanas seguidas`; },
  },
  {
    id: 'meta_batida', nome: 'Meta Batida', categoria: 'Execução', prioridade: 2,
    descricao: 'A meta de horas é um combinado entre você e seu mentor. Este selo marca as semanas em que o combinado saiu do papel.',
    tiers: [
      { label: 'Metade do caminho', criterio: '1 semana com 50%+ da meta (meta de 6h+)' },
      { label: 'Semana sólida', criterio: '1 semana com 70%+ da meta em 3+ dias' },
      { label: 'Semana cheia', criterio: '1 semana com 85%+ da meta' },
      { label: 'Padrão instalado', criterio: '70%+ da meta em 3 de 4 semanas seguidas' },
    ],
    calc({ semanas }) {
      const tk = mkTracker(4);
      const janela = [];
      let temMensuravel = false, overAnterior = false, ultimoAprov = null;
      semanas.forEach(w => {
        if (!w.mensuravel || w.aprov == null) return;
        // Meta simbólica (<6h) é NEUTRA pra família inteira — sem o guard,
        // bater(N) em escada estamparia tiers de baixo com meta minúscula.
        if ((w.meta || 0) < 6) return;
        temMensuravel = true;
        const aprov = Math.min(w.aprov, 105); // cap: overstudying não é troféu
        ultimoAprov = aprov;
        // Suspensão clínica: 2 semanas seguidas >105% bloqueiam desbloqueios
        // desta família NAQUELA semana (o alerta tem precedência sobre festa).
        const overAgora = w.aprov > 105;
        const suspenso = overAgora && overAnterior;
        overAnterior = overAgora;
        janela.push(aprov >= 70);
        if (janela.length > 4) janela.shift();
        if (suspenso) return;
        if (aprov >= 50) tk.bater(0, w.label); // meta ≥6h já garantida pelo guard da família
        if (aprov >= 70 && (w.dias || 0) >= 3) tk.bater(1, w.label);
        if (aprov >= 85) tk.bater(2, w.label);
        if (janela.length === 4 && janela.filter(Boolean).length >= 3) tk.bater(3, w.label);
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: ultimoAprov != null ? Math.round(ultimoAprov) : 0, disponivel: temMensuravel };
    },
    proximoTexto(t, de) { return `última semana: ${de}% da meta`; },
  },
  {
    id: 'volta_por_cima', nome: 'Volta por Cima', categoria: 'Resiliência', prioridade: 99,
    ocultarComoProxima: true, // anunciar antes = incentivo a zerar a semana
    descricao: 'Uma semana difícil não define sua trajetória. Este selo não é sobre nunca parar — é sobre sempre voltar.',
    tiers: [
      { label: 'De volta', criterio: 'voltou a estudar depois de uma semana parada' },
      { label: 'Volta com força', criterio: 'retorno com 50%+ da meta' },
      { label: 'Quem volta, vence', criterio: '3 retomadas no ano' },
    ],
    calc({ semanas }) {
      const tk = mkTracker(3);
      let retomadasAno = 0, anoCorrente = null, emQueda = false;
      for (let i = 1; i < semanas.length; i++) {
        const ant = semanas[i - 1], w = semanas[i];
        // Adjacência por dias arredondados (client-side: fuso do navegador
        // pode ter DST — igualdade estrita de ms quebraria).
        if (Math.round((w.ts - ant.ts) / 86400000) !== 7) { emQueda = false; continue; }
        // Semana anterior SEM dado é neutra (pausa, preservando emQueda) —
        // ausência de linha/telemetria não é "semana parada".
        if (ant.horas == null && ant.dias == null) continue;
        // Rompida = zerada REAL com dado presente (não aprov baixo: quem
        // estudou pouco não "parou" — o selo é sobre voltar do zero).
        const antRompida = ant.horas === 0 || ant.dias === 0;
        const retorno = (w.horas || 0) >= 2 && (w.dias || 0) >= 2;
        if (antRompida && retorno && !emQueda) {
          const ano = new Date(w.ts).getFullYear();
          if (ano !== anoCorrente) { anoCorrente = ano; retomadasAno = 0; }
          if (retomadasAno < 3) { // teto anti-farming
            retomadasAno++;
            tk.bater(0, w.label);
            if (w.aprov != null && w.aprov >= 50) tk.bater(1, w.label);
            if (retomadasAno >= 3) tk.bater(2, w.label);
          }
          emQueda = true; // máx. 1 retomada por ciclo de queda
        } else if (!antRompida) {
          emQueda = false;
        }
      }
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: retomadasAno, disponivel: true };
    },
    proximoTexto() { return ''; },
  },
  {
    id: 'terreno_ganho', nome: 'Terreno Ganho', categoria: 'Progresso', prioridade: 5,
    descricao: 'O edital é um território a cobrir. Este selo marca quanto dele você já validou com seu mentor — terreno ganho não se perde.',
    tiers: [
      { alvo: 25, label: 'Um quarto do mapa', criterio: '25% do edital validado' },
      { alvo: 50, label: 'Metade do mapa', criterio: '50% do edital validado' },
      { alvo: 75, label: 'Três quartos', criterio: '75% do edital validado' },
      { alvo: 90, label: 'Reta de chegada', criterio: '90% do edital validado' },
    ],
    calc({ semanas }) {
      // Só linhas REVISADAS (mentor validou) com valor fresco NA linha.
      // Histerese de entrada: 2 linhas ≥ limiar OU 1 linha ≥ limiar+3.
      const tk = mkTracker(4);
      const acima = [0, 0, 0, 0];
      let ultimo = null;
      semanas.forEach(w => {
        if (w.origem !== 'revisado' || w.progTotal == null) return;
        ultimo = Math.round(w.progTotal);
        this.tiers.forEach((t, i) => {
          if (w.progTotal >= t.alvo) acima[i]++; else acima[i] = 0;
          if (w.progTotal >= t.alvo + 3 || acima[i] >= 2) tk.bater(i, w.label);
        });
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: ultimo ?? 0, disponivel: true };
    },
    proximoTexto(t, de) { return `${de}% do edital validado (alvo ${t.alvo}%)`; },
  },
  {
    id: 'base_solida', nome: 'Base Sólida', categoria: 'Domínio', prioridade: 6,
    descricao: 'Da base sólida à aprovação: o que você estuda, você acerta — mesmo com conteúdo novo entrando no mapa.',
    tiers: [
      { label: 'Alicerce', criterio: '4 semanas com acerto geral de 70%+' },
      { label: 'Base que avança', criterio: 'acerto 75%+ com a cobertura andando (+5 p.p.)' },
      { label: 'Sem elo fraco', criterio: 'todas as matérias com 80%+ (nenhuma abaixo de 70%) e 30%+ do edital coberto' },
    ],
    calc({ semanas }) {
      const tk = mkTracker(3);
      let n70 = 0;
      const frescos = []; // {ts, prog}
      semanas.forEach(w => {
        if (w.origem !== 'auto' && w.origem !== 'revisado') return;
        if (w.domTotal != null && w.domTotal >= 70) {
          n70++;
          if (n70 >= 4) tk.bater(0, w.label);
        }
        if (w.progTotal != null) frescos.push({ ts: w.ts, prog: w.progTotal });
        if (w.domTotal != null && w.domTotal >= 75 && w.progTotal != null) {
          const base = frescos.find(f => w.ts - f.ts <= 8 * 7 * 86400000 && f.ts < w.ts);
          if (base && w.progTotal >= base.prog + 5) tk.bater(1, w.label);
        }
        const mats = Object.keys(w.domMat);
        if (mats.length === 4 && mats.every(m => w.domMat[m] >= 80) && (w.progTotal || 0) >= 30) tk.bater(2, w.label);
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: n70, disponivel: true };
    },
    proximoTexto(t, de) { return t.criterio; },
  },
  {
    id: 'ensaio_geral', nome: 'Ensaio Geral', categoria: 'Simulado', prioridade: 7,
    descricao: 'Simulado é o ensaio do dia que importa. Aqui conta fazer de ponta a ponta — o resultado é conversa sua com seu mentor.',
    tiers: [
      { label: 'Estreia', criterio: '1º simulado concluído de ponta a ponta' },
      { label: 'Segunda rodada', criterio: 'simulados em 2 meses diferentes' },
      { label: 'Ritual mensal', criterio: '3 meses seguidos com simulado' },
      { label: 'Ano de ensaios', criterio: '5 meses do ano com simulado' },
    ],
    calc({ simulados }) {
      const tk = mkTracker(4);
      const eventos = [];
      const conc = (simulados || [])
        .filter(s => String(s?.status || '') === 'Concluída')
        .map(s => ({ ...s, dt: parseDataPayload(s.data) }))
        .filter(s => s.dt)
        .sort((a, b) => a.dt - b.dt);
      // dia1 + dia2 em até 8 dias = 1 evento (um ENEM completo em 2 sessões)
      for (let i = 0; i < conc.length; i++) {
        const s = conc[i], prox = conc[i + 1];
        if (prox && ((s.escopo === 'dia1' && prox.escopo === 'dia2') || (s.escopo === 'dia2' && prox.escopo === 'dia1'))
            && (prox.dt - s.dt) <= 8 * 86400000) {
          eventos.push(prox);
          i++;
        } else {
          eventos.push(s);
        }
      }
      const mesesSet = new Set();
      const mesesSeq = [];
      eventos.forEach(e => {
        const rotulo = `${e.dt.getFullYear()}-${e.dt.getMonth()}`;
        const label = e.dt.toLocaleDateString('pt-BR');
        tk.bater(0, label);
        if (!mesesSet.has(rotulo)) {
          mesesSet.add(rotulo);
          mesesSeq.push({ ano: e.dt.getFullYear(), mes: e.dt.getMonth(), label });
        }
        if (mesesSet.size >= 2) tk.bater(1, label);
        // 3 meses CONSECUTIVOS
        for (let k = 2; k < mesesSeq.length; k++) {
          const a = mesesSeq[k - 2], b = mesesSeq[k - 1], c = mesesSeq[k];
          const idx = (m) => m.ano * 12 + m.mes;
          if (idx(c) - idx(b) === 1 && idx(b) - idx(a) === 1) tk.bater(2, c.label);
        }
        const noAno = mesesSeq.filter(m => m.ano === e.dt.getFullYear()).length;
        if (noAno >= 5) tk.bater(3, label);
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: mesesSet.size, disponivel: true };
    },
    proximoTexto(t, de) { return t.criterio; },
  },
  {
    id: 'caderno_vivo', nome: 'Caderno Vivo', categoria: 'Revisão', prioridade: 4,
    descricao: 'Seus erros viraram material de estudo — e você voltou neles na hora certa. Erro revisado no prazo é erro que não se repete na prova.',
    tiers: [
      { label: 'Primeiras sementes', criterio: '10 erros no caderno com a 1ª revisão feita' },
      { label: 'Caderno em dia', criterio: 'fechar uma semana sem revisão atrasada (com 10+ cards)' },
      { label: 'Erro lapidado', criterio: '5 erros levados ao estágio avançado de revisão' },
      { label: 'Rotina de revisão', criterio: '4 semanas seguidas com revisões em dia' },
    ],
    calc({ caderno, semanas }) {
      const tk = mkTracker(4);
      const cards = caderno || [];
      const parseHist = (c) => {
        try { const h = JSON.parse(String(c.historico || '[]')); return Array.isArray(h) ? h : []; } catch { return []; }
      };
      // Labels DETERMINÍSTICOS por replay (fix da revisão 19/08): estampar com
      // a data do card que completou o critério, nunca com "hoje" — carimbo
      // que muda a cada render viola o replay e mata o "nova da semana".
      const datasRev = (c) => parseHist(c).map(x => parseDataPayload(x?.data || x)).filter(Boolean).sort((a, b) => a - b);
      const comRevisao = cards
        .filter(c => String(c.pergunta || '').trim().length >= 15 && parseHist(c).length >= 1)
        .map(c => ({ c, dt: datasRev(c)[0] || null }))
        .sort((a, b) => (a.dt?.getTime() || 0) - (b.dt?.getTime() || 0));
      if (comRevisao.length >= 10) {
        const dt10 = comRevisao[9].dt; // 1ª revisão do 10º card qualificado
        tk.bater(0, dt10 ? dt10.toLocaleDateString('pt-BR') : '');
      }
      // Lapidado: estágio ≥4 (intervalo 60d+) com espaçamento real entre
      // revisões (≥2 dias — rajada de cliques não lapida nada).
      const lapidados = cards.filter(c => {
        if ((c.estagio || 0) < 4) return false;
        const h = datasRev(c);
        if (h.length < 2) return true; // histórico curto: estágio alto já implica espaçamento
        for (let i = 1; i < h.length; i++) if (h[i] - h[i - 1] < 2 * 86400000) return false;
        return true;
      }).map(c => ({ c, dt: datasRev(c).pop() || null }))
        .sort((a, b) => (a.dt?.getTime() || 0) - (b.dt?.getTime() || 0));
      if (lapidados.length >= 5) {
        const dt5 = lapidados[4].dt; // última revisão do 5º card lapidado
        tk.bater(2, dt5 ? dt5.toLocaleDateString('pt-BR') : '');
      }
      // Em dia / rotina: coluna REVISOES (atrasadas) do registro semanal
      let seq = 0;
      semanas.forEach(w => {
        if (w.revisoes == null || (w.origem !== 'auto' && w.origem !== 'revisado')) return;
        if (cards.length < 10) return; // sem massa de cards, "em dia" é vazio
        if (w.revisoes === 0) tk.bater(1, w.label);
        if (w.revisoes <= 3) {
          seq++;
          if (seq >= 4) tk.bater(3, w.label);
        } else seq = 0;
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: comRevisao.length, disponivel: cards.length >= 1 };
    },
    proximoTexto(t, de) { return t.criterio; },
  },
  {
    id: 'combinado_e_combinado', nome: 'Combinado é Combinado', categoria: 'Compromisso', prioridade: 3,
    descricao: 'O que você combinou com seu mentor no último encontro, você entregou. Palavra dada, palavra cumprida.',
    tiers: [
      { label: 'Primeira palavra', criterio: 'um encontro com meta batida (e nenhuma perdida)' },
      { label: 'Palavra firme', criterio: '2 encontros seguidos cumprindo o combinado' },
      { label: 'Palavra de ferro', criterio: '4 encontros seguidos (1 parcial no meio não quebra)' },
    ],
    calc({ diarios }) {
      // UM evento por encontro (fix da revisão 19/08): o veredito do encontro
      // i é gravado no encontro SEGUINTE — statusMetasAnteriores mora na
      // linha i+1 e os resultados das ações moram na PRÓPRIA linha i
      // (preenchidos retroativamente pelo mesmo save). Juntar os dois no
      // mesmo evento evita contar o mesmo encontro cumprido duas vezes.
      // O último encontro fica NEUTRO até existir a linha que o julgue.
      // Campo vazio (encontros pré-feature) é NEUTRO: pausa, não quebra.
      // LIMIAR PROVISÓRIO até baseline do S1 (docs/GAMIFICACAO_MARCOS.md §6).
      const tk = mkTracker(3);
      let seq = 0, parcialAbsorvido = false;
      const lista = diarios || [];
      for (let i = 0; i + 1 < lista.length; i++) {
        const status = String(lista[i + 1]?.statusMetasAnteriores || '').split('\n').map(s => s.trim()).filter(Boolean);
        const resultados = (lista[i]?.resultados || []).map(s => String(s || '').trim()).filter(Boolean);
        if (!status.length && !resultados.length) continue; // neutro
        const label = lista[i + 1]?.data ? String(lista[i + 1].data) : '';
        const batidas = status.filter(s => s === 'Batida').length;
        const naoBatidas = status.filter(s => s === 'Não batida').length;
        const realizados = resultados.filter(s => s === 'Realizado').length;
        const cumpriu = (batidas >= 1 && naoBatidas === 0) || realizados >= 3;
        const parcial = !cumpriu && (status.some(s => s === 'Parcial') || resultados.some(s => s === 'Realizado Parcialmente'));
        if (cumpriu) {
          seq++;
          if (seq >= 1) tk.bater(0, label);
          if (seq >= 2) tk.bater(1, label);
          if (seq >= 4) tk.bater(2, label);
          // NÃO re-armar a absorção a cada cumpriu: máx. 1 Parcial absorvido
          // por corrida (re-armar viraria "1 parcial entre CADA par").
        } else if (parcial && !parcialAbsorvido && seq > 0) {
          parcialAbsorvido = true; // absorção: 1 Parcial no meio não quebra
        } else {
          seq = 0;
          parcialAbsorvido = false;
        }
      }
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: seq, disponivel: (diarios || []).length > 0 };
    },
    proximoTexto(t, de) { return `${de} encontro(s) seguidos cumprindo`; },
  },
  {
    id: 'quilometragem', nome: 'Quilometragem', categoria: 'Volume', prioridade: 8,
    descricao: 'Questão a questão, você acumula quilometragem real de treino — e o contador nunca volta para trás.',
    tiers: [
      { alvo: 100, label: 'Primeiras cem', criterio: '100 questões acumuladas' },
      { alvo: 500, label: 'Quinhentas', criterio: '500 questões acumuladas' },
      { alvo: 2000, label: 'Duas mil', criterio: '2.000 questões acumuladas' },
      { alvo: 6000, label: 'Seis mil', criterio: '6.000 questões acumuladas' },
    ],
    calc({ semanas }) {
      const tk = mkTracker(4);
      let soma = 0, temDado = false;
      semanas.forEach(w => {
        if (w.questoes == null) return;
        temDado = true;
        soma += w.questoes;
        this.tiers.forEach((t, i) => { if (soma >= t.alvo) tk.bater(i, w.label); });
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: Math.round(soma), disponivel: temDado };
    },
    proximoTexto(t, de) { return `${de.toLocaleString('pt-BR')} de ${t.alvo.toLocaleString('pt-BR')} questões`; },
  },
  {
    id: 'marco_de_ciclo', nome: 'Marco de Ciclo', categoria: 'Ritual', prioridade: 9,
    descricao: 'A cada trimestre, a Reunião de Fechamento estampa o marco do ciclo: o registro de onde você chegou, congelado no tempo.',
    tiers: [
      { label: 'Primeiro marco', criterio: '1º fechamento de ciclo com seu mentor' },
      { label: 'Dois marcos', criterio: '2 fechamentos de ciclos seguidos' },
      { label: 'Ano emoldurado', criterio: 'os 4 marcos do ano' },
    ],
    calc({ marcos }) {
      // Premia o RITUAL — só marcos de fechamento real contam (retroativo é
      // retrato histórico, não reunião vivida).
      const tk = mkTracker(3);
      const fechs = (Array.isArray(marcos) ? marcos : [])
        .filter(m => m?.origem === 'fechamento' && m.ciclo)
        .map(m => ({ ...m, ord: Number(m.ano) * 4 + ['C1', 'C2', 'C3', 'C4'].indexOf(m.ciclo) }))
        .sort((a, b) => a.ord - b.ord);
      fechs.forEach((m, i) => {
        const label = m.data || `${m.ciclo}/${m.ano}`;
        tk.bater(0, label);
        if (i >= 1 && m.ord - fechs[i - 1].ord === 1) tk.bater(1, label);
        const noAno = fechs.filter(f => Number(f.ano) === Number(m.ano)).length;
        if (noAno >= 4) tk.bater(2, label);
      });
      return { tierIdx: tk.tierIdx(), quando: tk.quando, progressoDe: fechs.length, disponivel: Array.isArray(marcos) };
    },
    proximoTexto(t) { return 'acontece na Reunião de Fechamento com seu mentor'; },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// computarSelos(ctx) → { estampados, proximas, todos }
//   estampados: selos com tier ≥ I (mais recentes primeiro)
//   proximas: máx. 2 próximas estampas alcançáveis (prioriza constância;
//             nunca Volta por Cima; nunca selo indisponível)
// ─────────────────────────────────────────────────────────────────────────────
export function computarSelos({ registros, diarios, simulados, caderno, marcos }) {
  const semanas = modelarSemanas(registros);
  const ultimaSemanaLabel = semanas.length ? semanas[semanas.length - 1].label : null;
  // Hardening: o replay assume ordem cronológica — não confiar na ordem
  // física das linhas da planilha (aba pode ter sido ordenada à mão).
  const diariosOrd = [...(diarios || [])].sort(
    (a, b) => (parseDataPayload(a?.data)?.getTime() || 0) - (parseDataPayload(b?.data)?.getTime() || 0)
  );
  const ctx = { semanas, diarios: diariosOrd, simulados, caderno, marcos };

  // "Nova desta semana" por JANELA, não por igualdade de label: selos de
  // evento (simulado, encontro, caderno, marco) estampam com data dd/MM/yyyy,
  // não com o label da semana — a janela [domingo, domingo+7) cobre ambos.
  // tsLabelSemana parseia os dois formatos (split ' a ' é no-op em data pura).
  const tsUltima = ultimaSemanaLabel ? tsLabelSemana(ultimaSemanaLabel) : null;
  const dentroDaUltimaSemana = (label) => {
    if (!tsUltima || !label) return false;
    const ts = tsLabelSemana(label);
    return ts >= tsUltima && ts < tsUltima + 7 * 86400000;
  };

  const todos = SELOS.map(s => {
    const r = s.calc(ctx);
    const tierIdx = r.tierIdx;
    const tierInfo = tierIdx >= 0 ? s.tiers[tierIdx] : null;
    const proxTier = tierIdx + 1 < s.tiers.length ? s.tiers[tierIdx + 1] : null;
    return {
      id: s.id, nome: s.nome, categoria: s.categoria, descricao: s.descricao,
      prioridade: s.prioridade, ocultarComoProxima: !!s.ocultarComoProxima,
      tierIdx,
      tierRomano: tierIdx >= 0 ? TIERS_ROMANOS[tierIdx] : null,
      tierLabel: tierInfo?.label || null,
      tierCriterio: tierInfo?.criterio || null,
      quando: r.quando,
      semanaEstampa: tierIdx >= 0 ? r.quando[tierIdx] : null,
      novo: tierIdx >= 0 && dentroDaUltimaSemana(r.quando[tierIdx]),
      disponivel: r.disponivel,
      proximo: proxTier ? {
        tierRomano: TIERS_ROMANOS[tierIdx + 1],
        label: proxTier.label,
        criterio: proxTier.criterio,
        texto: s.proximoTexto(proxTier, r.progressoDe),
        frac: proxTier.alvo ? Math.max(0, Math.min(1, (r.progressoDe || 0) / proxTier.alvo)) : null,
      } : null,
    };
  });

  const estampados = todos
    .filter(s => s.tierIdx >= 0)
    .sort((a, b) => (b.novo ? 1 : 0) - (a.novo ? 1 : 0));

  const proximas = todos
    .filter(s => s.disponivel && !s.ocultarComoProxima && s.proximo)
    .sort((a, b) => a.prioridade - b.prioridade || (b.proximo.frac || 0) - (a.proximo.frac || 0))
    .slice(0, 2);

  return { estampados, proximas, todos, ultimaSemanaLabel };
}
