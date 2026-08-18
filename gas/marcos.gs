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
