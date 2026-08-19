// =====================================================================
// MARCOS DE CICLO — BD_Marcos (Fases e Ciclos: freeze trimestral)
// =====================================================================
// Domínio: Filippe (mentoria). Plano: docs/GAMIFICACAO_MARCOS.md.
//
// O marco congela o retrato do aluno no fechamento de cada ciclo (C1..C4):
// carimbos por dimensão + perfil + nível-alvo de simulado + reflexões do
// aluno + destaques computados no client. Grava VALORES, nunca fórmulas —
// recomputar com regra nova reescreveria a história.
//
// A aba é criada on-demand (planilhas legadas não a têm) e o upsert é
// idempotente por (ano, ciclo) — regravar o mesmo marco atualiza a linha,
// nunca duplica. Quem chama: handleSalvarNovoEncontro (dados.marco opcional,
// mesmo lock ⇒ diário + marco atômicos) e handleBuscarDadosAluno (leitura).

const COL_MARCO = {
  ANO: 0, CICLO: 1, DATA: 2,
  COMPORTAMENTO: 3, COBERTURA: 4, DOMINIO: 5, SIMULADO: 6, PERFIL: 7,
  NIVEL_ALVO: 8,
  REFLEXAO_VITORIA: 9, REFLEXAO_APRENDIZADO: 10, REFLEXAO_MUDANCA: 11,
  DESTAQUES_JSON: 12, ORIGEM: 13
};
const MARCO_HEADERS = [
  'ano', 'ciclo', 'data_fechamento',
  'comportamento', 'cobertura', 'dominio', 'simulado', 'perfil',
  'nivel_alvo',
  'reflexao_vitoria', 'reflexao_aprendizado', 'reflexao_mudanca',
  'destaques_json', 'origem'
];
const CICLOS_VALIDOS = ['C1', 'C2', 'C3', 'C4'];

function _abaMarcos(ssAluno, criarSeFaltar) {
  var aba = ssAluno.getSheetByName(ABA.MARCOS);
  if (!aba && criarSeFaltar) {
    aba = ssAluno.insertSheet(ABA.MARCOS);
    aba.appendRow(MARCO_HEADERS);
  }
  return aba || null;
}

// Marcos como objetos pro payload do buscarDadosAluno. [] se a aba não existe —
// a PRESENÇA do campo `marcos` no payload é o gate que acorda o front (janela
// de deploy GAS→Vercel segura).
function _lerMarcos(ssAluno) {
  var aba = _abaMarcos(ssAluno, false);
  if (!aba || aba.getLastRow() < 2) return [];
  var matriz = aba.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < matriz.length; i++) {
    var r = matriz[i];
    if (!txt(r[COL_MARCO.CICLO])) continue;
    var destaques = null;
    try { destaques = r[COL_MARCO.DESTAQUES_JSON] ? JSON.parse(String(r[COL_MARCO.DESTAQUES_JSON])) : null; } catch (e) { destaques = null; }
    out.push({
      ano: parseInt(r[COL_MARCO.ANO], 10) || null,
      ciclo: txt(r[COL_MARCO.CICLO]),
      data: r[COL_MARCO.DATA] instanceof Date
        ? Utilities.formatDate(r[COL_MARCO.DATA], 'GMT-3', 'dd/MM/yyyy')
        : txt(r[COL_MARCO.DATA]),
      comportamento: txt(r[COL_MARCO.COMPORTAMENTO]) || null,
      cobertura: txt(r[COL_MARCO.COBERTURA]) || null,
      dominio: txt(r[COL_MARCO.DOMINIO]) || null,
      simulado: txt(r[COL_MARCO.SIMULADO]) || null,
      perfil: txt(r[COL_MARCO.PERFIL]) || null,
      nivelAlvo: parseInt(r[COL_MARCO.NIVEL_ALVO], 10) || null,
      reflexaoVitoria: txt(r[COL_MARCO.REFLEXAO_VITORIA]),
      reflexaoAprendizado: txt(r[COL_MARCO.REFLEXAO_APRENDIZADO]),
      reflexaoMudanca: txt(r[COL_MARCO.REFLEXAO_MUDANCA]),
      destaques: destaques,
      origem: txt(r[COL_MARCO.ORIGEM]) || 'fechamento'
    });
  }
  return out;
}

// =====================================================================
// BACKFILL RETROATIVO — C1/C2 de 2026 (one-shot, rodar no editor)
// =====================================================================
// Decisão de 18/08/2026: os ciclos que fecharam antes da feature existir
// entram na Linha do Ano como marcos origem='retroativo', computados do
// histórico persistido. RETRATO PARCIAL e honesto:
//   - Cobertura/Domínio: carimbo pelo snapshot do FIM do ciclo (último valor
//     não-vazio por matéria dentro do trimestre) — ESPELHO REDUZIDO das
//     faixas de lib/carimbos.js (30/70 e 70/80 + Mestre exige nenhuma matéria
//     <70). Não evoluir este espelho: é one-shot, remover após o uso.
//   - Comportamento/Simulado/Perfil: VAZIOS (dias_estudo/dias_planejados só
//     existem desde ~ago/2026 — não havia dado de Comportamento em C1/C2).
//   - Destaques: horas, cobertura/domínio início→fim, simulados concluídos,
//     metas batidas (veredito no diário SEGUINTE), questões (se a coluna do
//     PR B já tiver sido backfilled — rodar backfillColunaQuestoes ANTES).
// Escopo: mentoria/ENEM com app (mesma regra do fluxo ao vivo). Guarda de
// vivência: ≥1 registro OU ≥1 diário dentro do trimestre. NUNCA sobrescreve
// marco existente (fechamento real tem precedência sobre retroativo).
// COMO USAR (editor GAS, arquivo marcos.gs):
//   1. backfillMarcosRetroativos(true)  — dry run, só loga
//   2. backfillMarcosRetroativos()      — grava
var _CICLOS_RETRO = [
  { ano: 2026, ciclo: 'C1', nome: 'Fundação',       ini: new Date(2026, 0, 1), fim: new Date(2026, 2, 31, 23, 59, 59) },
  { ano: 2026, ciclo: 'C2', nome: 'Aprofundamento', ini: new Date(2026, 3, 1), fim: new Date(2026, 5, 30, 23, 59, 59) },
];

function _retroDataCell(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v || '').trim();
  if (!s) return null;
  var br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(+br[3], +br[2] - 1, +br[1]);
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// % de célula do BD_Registro via getValues: número 0-1 (percent-format) → ×100;
// >1 já é percentual; ≤0/vazio → null (espelho do normPct do front).
function _retroPct(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = parseFloat(String(v).replace(',', '.').replace('%', ''));
  if (isNaN(n) || n <= 0) return null;
  if (String(v).indexOf('%') !== -1) return n;
  return n <= 1 ? n * 100 : n;
}

function _retroFaixa(v, limVet, limMes) {
  if (v == null) return '';
  return v < limVet ? 'aprendiz' : v < limMes ? 'veterano' : 'mestre';
}

// Retrato de um ciclo a partir das matrizes cruas. null = aluno não viveu o ciclo.
function _retratoRetroativo(registros, diarios, sims, c) {
  var dentroTs = function (ts) { return ts != null && ts >= c.ini.getTime() && ts <= c.fim.getTime(); };
  var regs = [];
  for (var j = 1; j < registros.length; j++) {
    if (dentroTs(_semanaInicioTs(registros[j][COL_REG.SEMANA]))) regs.push(registros[j]);
  }
  var diasNoCiclo = [];
  for (var k = 1; k < diarios.length; k++) {
    var dt = _retroDataCell(diarios[k][COL_ENC.DATA]);
    if (dt && dentroTs(dt.getTime())) diasNoCiclo.push(k);
  }
  if (!regs.length && !diasNoCiclo.length) return null;

  var horas = 0, questoes = null;
  var serieCob = [], serieDom = [];
  var snapDom = {}, snapProg = {};
  var colsDom = { BIO: COL_REG.DOM_BIO, QUI: COL_REG.DOM_QUI, FIS: COL_REG.DOM_FIS, MAT: COL_REG.DOM_MAT };
  var colsProg = { BIO: COL_REG.PROG_BIO, QUI: COL_REG.PROG_QUI, FIS: COL_REG.PROG_FIS, MAT: COL_REG.PROG_MAT };
  regs.forEach(function (r) {
    var h = parseFloat(String(r[COL_REG.HORAS]).replace(',', '.'));
    if (!isNaN(h)) horas += h;
    var q = parseFloat(String(r[COL_REG.QUESTOES] === undefined ? '' : r[COL_REG.QUESTOES]));
    if (!isNaN(q)) questoes = (questoes || 0) + q;
    var cob = _retroPct(r[COL_REG.PROGRESSO_TOTAL]);
    if (cob != null) serieCob.push(cob);
    var dom = _retroPct(r[COL_REG.DOMINIO_TOTAL]);
    if (dom != null) serieDom.push(dom);
    Object.keys(colsDom).forEach(function (m) {
      var vd = _retroPct(r[colsDom[m]]);
      if (vd != null) snapDom[m] = vd; // carry-forward: último não-vazio do ciclo
      var vp = _retroPct(r[colsProg[m]]);
      if (vp != null) snapProg[m] = vp;
    });
  });

  var media = function (obj) {
    var vals = Object.keys(obj).map(function (m) { return obj[m]; });
    if (!vals.length) return null;
    return vals.reduce(function (s, n) { return s + n; }, 0) / vals.length;
  };
  var domMed = media(snapDom), cobMed = media(snapProg);
  var dominio = _retroFaixa(domMed, 70, 80);
  if (dominio === 'mestre') {
    var temFraca = Object.keys(snapDom).some(function (m) { return snapDom[m] < 70; });
    if (temFraca) dominio = 'veterano'; // Mestre exige nenhuma matéria <70
  }
  var cobertura = _retroFaixa(cobMed, 30, 70);

  // Metas batidas: o veredito das metas do diário i mora no statusMetasAnteriores
  // do diário SEGUINTE (linhas do BD_Diario em ordem cronológica de append).
  var metasBatidas = 0, metasTotal = 0;
  diasNoCiclo.forEach(function (k) {
    if (k + 1 >= diarios.length) return; // último diário: veredito ainda não existe
    String(diarios[k + 1][COL_ENC.STATUS_METAS_ANTERIORES] || '').split('\n').forEach(function (s) {
      s = s.trim();
      if (!s) return;
      metasTotal++;
      if (s === 'Batida') metasBatidas++;
    });
  });

  var nSims = 0;
  for (var s2 = 1; s2 < sims.length; s2++) {
    if (txt(sims[s2][COL_SIM.STATUS]) !== 'Concluída') continue;
    var ds = _retroDataCell(sims[s2][COL_SIM.DATA]);
    if (ds && dentroTs(ds.getTime())) nSims++;
  }

  return {
    marco: {
      ano: c.ano, ciclo: c.ciclo,
      data: Utilities.formatDate(c.fim, 'GMT-3', 'dd/MM/yyyy'),
      comportamento: '', simulado: '', perfil: '',
      cobertura: cobertura, dominio: dominio,
      nivelAlvo: 85,
      reflexaoVitoria: '', reflexaoAprendizado: '', reflexaoMudanca: '',
      destaques: {
        horas: Math.round(horas),
        cobIni: serieCob.length ? Math.round(serieCob[0]) : null,
        cobFim: serieCob.length ? Math.round(serieCob[serieCob.length - 1]) : null,
        domIni: serieDom.length ? Math.round(serieDom[0]) : null,
        domFim: serieDom.length ? Math.round(serieDom[serieDom.length - 1]) : null,
        simulados: nSims,
        metasBatidas: metasBatidas, metasTotal: metasTotal,
        questoes: questoes != null ? Math.round(questoes) : null,
      },
      origem: 'retroativo',
    },
    resumo: 'cob=' + (cobertura || '—') + ' dom=' + (dominio || '—') + ' horas=' + Math.round(horas) +
            ' sims=' + nSims + ' metas=' + metasBatidas + '/' + metasTotal,
  };
}

// Wrapper pro editor (o dropdown "Executar" não passa argumentos): dry run
// do backfill de marcos — só loga, não grava nada.
function dryRunBackfillMarcosRetroativos() {
  backfillMarcosRetroativos(true);
}

function backfillMarcosRetroativos(dryRun) {
  var ehDryRun = dryRun === true;
  Logger.log('===== backfillMarcosRetroativos ' + (ehDryRun ? '(DRY RUN)' : '') + ' =====');
  var matriz = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA.MESTRE).getDataRange().getValues();
  var criados = 0, jaTinha = 0, foraEscopo = 0, semVivencia = 0, erros = 0;

  for (var i = 1; i < matriz.length; i++) {
    var idPlanilha = txt(matriz[i][COL_MESTRE.ID_PLANILHA]);
    var email = emailNorm(matriz[i][COL_MESTRE.EMAIL]) || ('linha ' + (i + 1));
    if (!idPlanilha) continue;
    var tipo = txt(matriz[i][COL_MESTRE.TIPO_ALUNO]) || 'ENEM';
    var statusApp = txt(matriz[i][COL_MESTRE.STATUS_APP]);
    if (tipo !== 'ENEM' || statusApp === STATUS_APP.NAO_ADAPTOU || statusApp === STATUS_APP.NUNCA_USARA) {
      foraEscopo++;
      continue;
    }
    try {
      var ss = SpreadsheetApp.openById(idPlanilha);
      var existentes = _lerMarcos(ss);
      var abaReg = ss.getSheetByName(ABA.REGISTROS);
      var abaDia = ss.getSheetByName(ABA.ENCONTROS);
      var abaSim = ss.getSheetByName(ABA.SIMULADOS);
      var registros = abaReg ? abaReg.getDataRange().getValues() : [[]];
      var diarios = abaDia ? abaDia.getDataRange().getValues() : [[]];
      var sims = abaSim ? abaSim.getDataRange().getValues() : [[]];

      _CICLOS_RETRO.forEach(function (c) {
        var existe = existentes.some(function (m) { return Number(m.ano) === c.ano && m.ciclo === c.ciclo; });
        if (existe) { jaTinha++; return; } // fechamento real nunca é sobrescrito
        var retrato = _retratoRetroativo(registros, diarios, sims, c);
        if (!retrato) { semVivencia++; return; }
        if (!ehDryRun) _upsertMarco(ss, retrato.marco);
        criados++;
        Logger.log('  ' + (ehDryRun ? '[dry] ' : '') + email + ' · ' + c.ciclo + ': ' + retrato.resumo);
      });
    } catch (e) {
      erros++;
      Logger.log('  erro ' + email + ': ' + e.message);
    }
  }
  Logger.log('backfillMarcosRetroativos: ' + criados + ' marcos ' + (ehDryRun ? 'a criar' : 'criados') +
             ' · ' + jaTinha + ' já existiam · ' + foraEscopo + ' alunos fora do escopo · ' +
             semVivencia + ' ciclos sem vivência · ' + erros + ' erros');
}

// Upsert idempotente por (ano, ciclo). Retorna true se gravou.
function _upsertMarco(ssAluno, marco) {
  if (!marco || typeof marco !== 'object') return false;
  var ano = parseInt(marco.ano, 10);
  var cicloId = txt(marco.ciclo);
  if (!ano || CICLOS_VALIDOS.indexOf(cicloId) === -1) return false;

  var aba = _abaMarcos(ssAluno, true);
  var linhaExistente = -1;
  if (aba.getLastRow() >= 2) {
    var matriz = aba.getDataRange().getValues();
    for (var i = 1; i < matriz.length; i++) {
      if (parseInt(matriz[i][COL_MARCO.ANO], 10) === ano && txt(matriz[i][COL_MARCO.CICLO]) === cicloId) {
        linhaExistente = i + 1;
        break;
      }
    }
  }

  var destaquesJson = '';
  try { destaquesJson = marco.destaques ? JSON.stringify(marco.destaques) : ''; } catch (e) { destaquesJson = ''; }

  var nivelAlvo = parseInt(marco.nivelAlvo, 10);
  var linha = [
    ano, cicloId,
    txt(marco.data) || Utilities.formatDate(new Date(), 'GMT-3', 'dd/MM/yyyy'),
    txt(marco.comportamento), txt(marco.cobertura), txt(marco.dominio), txt(marco.simulado),
    txt(marco.perfil),
    (nivelAlvo >= 1 && nivelAlvo <= 100) ? nivelAlvo : 85,
    txt(marco.reflexaoVitoria), txt(marco.reflexaoAprendizado), txt(marco.reflexaoMudanca),
    destaquesJson,
    txt(marco.origem) || 'fechamento'
  ];
  if (linhaExistente > 0) aba.getRange(linhaExistente, 1, 1, linha.length).setValues([linha]);
  else aba.appendRow(linha);
  return true;
}
