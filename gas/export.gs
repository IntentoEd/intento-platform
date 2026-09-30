// =====================================================================
// EXPORT DATASET ANONIMIZADO — fotografia de ENTRADA por aluno
// =====================================================================
// Gera 1 linha por aluno pra alimentar a calculadora de diagnóstico, que
// compara a rotina de um VISITANTE (ainda não-aluno) com o PONTO DE PARTIDA
// de quem já passou pelo programa. Por isso os campos de rotina/desempenho
// são a fotografia das PRIMEIRAS semanas (BD_Registro) e do diagnóstico de
// ENTRADA (BD_Diagnostico) — NUNCA o estado atual do aluno.
//
// Anonimização NA ORIGEM: nenhum nome/email/telefone/CPF sai da planilha.
// O campo `id` é um hash SHA-256 truncado do email (opaco, estável).
//
// COMO RODAR (editor GAS, arquivo export.gs):
//   1. Rode gerarExportDataset(). Cada execução processa um lote e para antes
//      dos 6 min do Apps Script, salvando um cursor em Script Properties.
//      Rode de novo até o log dizer "EXPORT CONCLUÍDO" — aí ele grava o CSV e
//      o relatório .md no seu Drive e loga as URLs (View > Logs).
//   2. Pra recomeçar do zero: rode resetExportDataset() antes.
//
// POR QUE EM LOTE: handleDashboardLider evita de propósito abrir as planilhas
// dos ~150 alunos uma a uma (usa a aba Cache_Alunos). Aqui PRECISAMOS abrir
// cada planilha (o histórico semanal e o diagnóstico vivem nelas), então o
// openById em massa estoura os 6 min num run só — daí o batching.
//
// CAMPOS SEM FONTE NA BASE — saem SEMPRE vazios (confirmado com Filippe
// 11/09/2026; ele complementa esses dados fora daqui):
//   meses_preparacao_previa, tinha_cronograma, frequencia_simulado,
//   fazia_revisao, horas_sono, acertos_apos_6m_total, instituicao, curso,
//   acertos_diag_linguagens, acertos_diag_humanas.
//   (O diagnóstico de entrada só testa Natureza + Matemática; o onboarding
//    não tem cronograma/revisão/sono como categoria; não há campo de
//    instituição/curso de aprovação. Ver relatório.)
//
// Domínio: escolar/analytics (Filippe).

var EXPORT_PROP_CURSOR  = 'EXPORT_DATASET_CURSOR';
var EXPORT_STAGING_ABA  = 'BD_Export_Tmp';
var EXPORT_TEMPO_MAX_MS = 4.5 * 60 * 1000; // para antes dos 6 min do GAS
var EXPORT_LOTE_LINHAS  = 4;               // semanas da fotografia de entrada

// Cabeçalho EXATO pedido — a ordem das colunas aqui é contratual.
var EXPORT_CABECALHO = [
  'id', 'data_inicio', 'meses_acompanhamento', 'objetivo', 'etapa',
  'meses_preparacao_previa', 'horas_semanais_efetivas', 'tinha_cronograma',
  'frequencia_simulado', 'fazia_revisao', 'horas_sono', 'acertos_diag_total',
  'acertos_diag_linguagens', 'acertos_diag_humanas', 'acertos_diag_natureza',
  'acertos_diag_matematica', 'nota_redacao_entrada', 'acertos_apos_6m_total',
  'aprovado', 'instituicao', 'curso', 'meses_ate_aprovacao'
];


// =====================================================================
// ENTRY POINT — rode no editor quantas vezes precisar
// =====================================================================
function gerarExportDataset() {
  var inicio = Date.now();
  var props  = PropertiesService.getScriptProperties();
  var cursor = parseInt(props.getProperty(EXPORT_PROP_CURSOR) || '0', 10);

  var ssMestre  = SpreadsheetApp.getActiveSpreadsheet();
  var abaMestre = ssMestre.getSheetByName(ABA.MESTRE);
  if (!abaMestre) throw new Error('Aba mestre não encontrada: ' + ABA.MESTRE);

  var matriz = abaMestre.getDataRange().getValues();
  var total  = matriz.length - 1; // exclui header
  var staging = _exportGarantirStaging_(ssMestre, cursor);

  var processados = 0, ignorados = 0;
  var buffer = [];
  var i;
  for (i = cursor + 1; i < matriz.length; i++) {
    if (Date.now() - inicio > EXPORT_TEMPO_MAX_MS) break;
    var rec = _exportLinhaAluno_(matriz[i]);
    if (rec === null) { ignorados++; continue; }
    buffer.push(rec);
    processados++;
  }

  if (buffer.length) {
    staging.getRange(staging.getLastRow() + 1, 1, buffer.length, EXPORT_CABECALHO.length)
           .setValues(buffer);
  }

  var novoCursor = i - 1; // nº de linhas do mestre já consideradas
  var done = (i >= matriz.length);

  if (done) {
    props.deleteProperty(EXPORT_PROP_CURSOR);
    var urls = _exportGravarArquivos_(ssMestre, total);
    Logger.log('EXPORT CONCLUÍDO — ' + (staging.getLastRow() - 1) + ' alunos exportados de '
      + total + ' no mestre.\n  CSV:       ' + urls.csv + '\n  Relatório: ' + urls.relatorio);
  } else {
    props.setProperty(EXPORT_PROP_CURSOR, String(novoCursor));
    Logger.log('EXPORT parcial — cursor ' + novoCursor + '/' + total
      + ' (' + processados + ' gravados, ' + ignorados + ' ignorados neste lote). '
      + 'Rode gerarExportDataset() de novo pra continuar.');
  }
}

function resetExportDataset() {
  PropertiesService.getScriptProperties().deleteProperty(EXPORT_PROP_CURSOR);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var st = ss.getSheetByName(EXPORT_STAGING_ABA);
  if (st) ss.deleteSheet(st);
  Logger.log('Export resetado (cursor + staging limpos).');
}


// =====================================================================
// UMA LINHA DO DATASET — null = pular aluno (sem planilha / onboarding incompleto)
// =====================================================================
function _exportLinhaAluno_(row) {
  var idPlanilha = txt(row[COL_MESTRE.ID_PLANILHA]);
  if (!idPlanilha) return null;
  // Só alunos que de fato entraram no programa (diagnóstico feito). Quem está
  // "Aguardando Diagnóstico" ainda não tem fotografia de entrada.
  if (txt(row[COL_MESTRE.STATUS_ONBOARDING]) !== 'Onboarding Completo') return null;

  var email = emailNorm(row[COL_MESTRE.EMAIL]);

  // ---- Campos do mestre (sempre disponíveis) ----
  var dataInicio = _comoData_(row[COL_MESTRE.TIMESTAMP]);
  var dtSaida    = _comoData_(row[COL_MESTRE.DT_SAIDA]);
  var motivo     = txt(row[COL_MESTRE.MOTIVO_SAIDA]);

  var aprovado;
  if (!dtSaida)                      aprovado = 'em_andamento';
  else if (motivo === 'Aprovação')   aprovado = 'sim';
  else if (motivo === 'Pós-ENEM')    aprovado = 'nao';
  else                               aprovado = ''; // saída por outro motivo: desfecho desconhecido

  var mesesAcomp = _mesesEntre_(dataInicio, dtSaida || new Date());
  var mesesAteAprov = (aprovado === 'sim') ? _mesesEntre_(dataInicio, dtSaida) : '';

  // ---- Campos da planilha do aluno ----
  var objetivo = '', etapa = '', notaRedacao = '';
  var diagNat = '', diagMat = '', diagTotal = '';
  var horasSemanais = '';

  var ssAluno = null;
  try {
    ssAluno = SpreadsheetApp.openById(idPlanilha);
  } catch (e) {
    Logger.log('export: não abriu planilha ' + idPlanilha + ' (' + e.message
      + ') — linha sai só com dados do mestre.');
  }

  if (ssAluno) {
    // Onboarding (1 linha, row 2): objetivo, etapa, nota de redação de entrada.
    try {
      var abaOnb = ssAluno.getSheetByName(ABA.ONBOARDING);
      if (abaOnb && abaOnb.getLastRow() >= 2) {
        var o = abaOnb.getRange(2, 1, 1, abaOnb.getLastColumn()).getValues()[0];
        objetivo    = txt(_cel_(o, COL_BD_ONB.CURSO_INTERESSE));
        etapa       = _etapaDeEscolaridade_(txt(_cel_(o, COL_BD_ONB.ESCOLARIDADE)));
        var nr = _cel_(o, COL_BD_ONB.NOTA_REDACAO);
        notaRedacao = (txt(nr) === '') ? '' : num(nr);
      }
    } catch (e) { Logger.log('export onboarding ' + idPlanilha + ': ' + e.message); }

    // Diagnóstico de ENTRADA (1ª linha de dados): [Data, Bio, Qui, Fis, Mat].
    // Só Natureza (Bio+Qui+Fis) e Matemática — LG/CH não são testados.
    try {
      var abaDiag = ssAluno.getSheetByName(ABA.DIAGNOSTICO);
      if (abaDiag && abaDiag.getLastRow() >= 2 && abaDiag.getLastColumn() >= 5) {
        var d = abaDiag.getRange(2, 1, 1, 5).getValues()[0];
        var nat = num(d[1]) + num(d[2]) + num(d[3]);
        var mat = num(d[4]);
        diagNat   = nat;
        diagMat   = mat;
        diagTotal = nat + mat; // "total" = só CN+MAT (ver relatório)
      }
    } catch (e) { Logger.log('export diag ' + idPlanilha + ': ' + e.message); }

    // Horas semanais efetivas = média das até-4 PRIMEIRAS semanas (BD_Registro).
    // HORAS = tempo registrado pelo app (não autodeclarado). Lê só a coluna HORAS
    // pra ser imune a planilhas legadas com menos colunas.
    try {
      var abaReg = ssAluno.getSheetByName(ABA.REGISTROS);
      if (abaReg && abaReg.getLastRow() >= 2) {
        var n = Math.min(EXPORT_LOTE_LINHAS, abaReg.getLastRow() - 1);
        var col = abaReg.getRange(2, COL_REG.HORAS + 1, n, 1).getValues();
        var soma = 0, cnt = 0;
        for (var h = 0; h < col.length; h++) {
          if (txt(col[h][0]) !== '') { soma += num(col[h][0]); cnt++; }
        }
        if (cnt > 0) horasSemanais = Math.round((soma / cnt) * 10) / 10;
      }
    } catch (e) { Logger.log('export registro ' + idPlanilha + ': ' + e.message); }
  }

  // Monta na ORDEM do cabeçalho. Campos sem fonte = '' (não inventar).
  return [
    _hashId_(email),          // id
    _fmtData_(dataInicio),    // data_inicio
    mesesAcomp,               // meses_acompanhamento
    objetivo,                 // objetivo (CURSO_INTERESSE)
    etapa,                    // etapa
    '',                       // meses_preparacao_previa  (sem fonte)
    horasSemanais,            // horas_semanais_efetivas
    '',                       // tinha_cronograma         (sem fonte)
    '',                       // frequencia_simulado      (sem fonte)
    '',                       // fazia_revisao            (sem fonte)
    '',                       // horas_sono               (sem fonte)
    diagTotal,                // acertos_diag_total (CN+MAT só)
    '',                       // acertos_diag_linguagens  (não testado)
    '',                       // acertos_diag_humanas     (não testado)
    diagNat,                  // acertos_diag_natureza
    diagMat,                  // acertos_diag_matematica
    notaRedacao,              // nota_redacao_entrada (autodeclarada)
    '',                       // acertos_apos_6m_total    (sem fonte)
    aprovado,                 // aprovado
    '',                       // instituicao              (sem fonte)
    '',                       // curso                    (sem fonte)
    mesesAteAprov             // meses_ate_aprovacao
  ];
}


// =====================================================================
// HELPERS
// =====================================================================
function _exportGarantirStaging_(ss, cursor) {
  var st = ss.getSheetByName(EXPORT_STAGING_ABA);
  if (!st) st = ss.insertSheet(EXPORT_STAGING_ABA);
  if (cursor === 0) {
    st.clear();
    st.getRange(1, 1, 1, EXPORT_CABECALHO.length).setValues([EXPORT_CABECALHO]);
  } else if (st.getLastRow() === 0) {
    // Resume sem staging (foi apagada) — recria header. Recomende reset se notar.
    st.getRange(1, 1, 1, EXPORT_CABECALHO.length).setValues([EXPORT_CABECALHO]);
  }
  return st;
}

// '1º/2º/3º ano do EM', 'EM completo', 'outra graduação' → enum de etapa.
// Qualquer valor fora disso (inclui 1º ano, que não tem equivalente no enum)
// sai vazio — não forçamos encaixe.
function _etapaDeEscolaridade_(s) {
  if (!s) return '';
  var t = s.toLowerCase();
  if (/2\s*[ºo]?\s*ano/.test(t)) return '2ano';
  if (/3\s*[ºo]?\s*ano/.test(t)) return '3ano';
  if (t.indexOf('completo') >= 0) return 'cursinho';
  if (t.indexOf('gradua')  >= 0) return 'formado';
  return '';
}

function _hashId_(email) {
  if (!email) return '';
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var v = (bytes[i] < 0 ? bytes[i] + 256 : bytes[i]).toString(16);
    hex += (v.length === 1 ? '0' : '') + v;
  }
  return hex.substring(0, 12);
}

function _comoData_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && v > 0) {
    var d = new Date((v - 25569) * 86400 * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  var s = txt(v);
  if (!s) return null;
  var d2 = new Date(s);
  return isNaN(d2.getTime()) ? null : d2;
}

function _fmtData_(d) {
  return (d instanceof Date && !isNaN(d.getTime()))
    ? Utilities.formatDate(d, 'GMT-3', 'yyyy-MM-dd') : '';
}

// Meses de 30,44 dias, arredondado. Vazio se datas inválidas ou fim < início.
function _mesesEntre_(inicio, fim) {
  if (!(inicio instanceof Date) || isNaN(inicio.getTime())) return '';
  if (!(fim instanceof Date)    || isNaN(fim.getTime()))    return '';
  var ms = fim.getTime() - inicio.getTime();
  if (ms < 0) return '';
  return Math.round(ms / (1000 * 60 * 60 * 24 * 30.44));
}

function _cel_(arr, idx) {
  return (arr && arr.length > idx) ? arr[idx] : '';
}

function _csvCampo_(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}


// =====================================================================
// GRAVAÇÃO — CSV (UTF-8 c/ BOM) + relatório .md no Drive
// =====================================================================
function _exportGravarArquivos_(ssMestre, totalMestre) {
  var staging = ssMestre.getSheetByName(EXPORT_STAGING_ABA);
  var dados   = staging.getDataRange().getValues(); // [header, ...linhas]

  // ---- CSV ----
  var linhas = dados.map(function (row) { return row.map(_csvCampo_).join(','); });
  var csv = String.fromCharCode(0xFEFF) + linhas.join('\r\n') + '\r\n'; // BOM → UTF-8 no Excel
  var arqCsv = DriveApp.createFile(Utilities.newBlob(csv, 'text/csv', 'export-alunos.csv'));

  // ---- Relatório ----
  var md = _exportRelatorioMd_(dados, totalMestre);
  var arqMd = DriveApp.createFile(Utilities.newBlob(md, 'text/markdown', 'export-alunos-relatorio.md'));

  return { csv: arqCsv.getUrl(), relatorio: arqMd.getUrl() };
}

function _exportRelatorioMd_(dados, totalMestre) {
  var header = dados[0];
  var linhas = dados.slice(1);
  var N = linhas.length;

  // Distribuição de desfecho
  var idxAprov = header.indexOf('aprovado');
  var dist = { sim: 0, nao: 0, em_andamento: 0, vazio: 0 };
  // Cobertura por campo
  var cobertura = header.map(function () { return 0; });
  // Período (data_inicio)
  var idxData = header.indexOf('data_inicio');
  var minData = '', maxData = '';

  for (var r = 0; r < N; r++) {
    var row = linhas[r];
    for (var c = 0; c < header.length; c++) {
      if (txt(row[c]) !== '') cobertura[c]++;
    }
    var ap = txt(row[idxAprov]);
    if (ap === 'sim') dist.sim++;
    else if (ap === 'nao') dist.nao++;
    else if (ap === 'em_andamento') dist.em_andamento++;
    else dist.vazio++;

    var di = txt(row[idxData]);
    if (di) {
      if (!minData || di < minData) minData = di;
      if (!maxData || di > maxData) maxData = di;
    }
  }

  function pctN(x) { return N ? Math.round((x / N) * 100) : 0; }

  var L = [];
  L.push('# Export de alunos — relatório');
  L.push('');
  L.push('_Gerado por `gerarExportDataset()` (gas/export.gs). Fotografia de ENTRADA: '
    + 'rotina = média das até ' + EXPORT_LOTE_LINHAS + ' primeiras semanas de BD_Registro; '
    + 'desempenho = diagnóstico de entrada (BD_Diagnostico)._');
  L.push('');
  L.push('## 1. N total');
  L.push('- **' + N + '** alunos exportados (de ' + totalMestre
    + ' linhas no mestre; os demais não têm planilha ou não completaram o onboarding/diagnóstico).');
  L.push('');
  L.push('## 2. Distribuição de desfecho');
  L.push('| aprovado | N | % |');
  L.push('|---|---|---|');
  L.push('| sim | ' + dist.sim + ' | ' + pctN(dist.sim) + '% |');
  L.push('| nao | ' + dist.nao + ' | ' + pctN(dist.nao) + '% |');
  L.push('| em_andamento | ' + dist.em_andamento + ' | ' + pctN(dist.em_andamento) + '% |');
  L.push('| (vazio — saída por outro motivo) | ' + dist.vazio + ' | ' + pctN(dist.vazio) + '% |');
  L.push('');
  L.push('## 3. Cobertura por campo (% de linhas preenchidas)');
  L.push('| campo | preenchidos | % |');
  L.push('|---|---|---|');
  for (var c2 = 0; c2 < header.length; c2++) {
    L.push('| ' + header[c2] + ' | ' + cobertura[c2] + ' | ' + pctN(cobertura[c2]) + '% |');
  }
  L.push('');
  L.push('## 4. Período coberto');
  L.push('- data_inicio mais antiga: **' + (minData || '—') + '**');
  L.push('- data_inicio mais recente: **' + (maxData || '—') + '**');
  L.push('');
  L.push('## 5. Campos que NÃO existem na base (saem sempre vazios)');
  L.push('| campo pedido | situação | o que existe de mais próximo |');
  L.push('|---|---|---|');
  L.push('| meses_preparacao_previa | ausente | HISTORICO_ESTUDOS (texto livre, não meses) |');
  L.push('| tinha_cronograma | ausente | — (sem campo de cronograma no onboarding) |');
  L.push('| frequencia_simulado | ausente como categoria | cadência de BD_Sim_ENEM (derivar = estimar) |');
  L.push('| fazia_revisao | ausente como categoria | BD_Registro.REVISOES (contagem semanal, não categoria) |');
  L.push('| horas_sono | semântica diferente | check-in SONO = nível 0–1/0–5, não horas dormidas |');
  L.push('| acertos_diag_linguagens | ausente | diagnóstico não testa Linguagens |');
  L.push('| acertos_diag_humanas | ausente | diagnóstico não testa Humanas |');
  L.push('| acertos_apos_6m_total | ausente | reavaliação aos 6m não é ritual padrão; simulado ~mês 6 seria proxy |');
  L.push('| instituicao | ausente | — |');
  L.push('| curso | ausente | CURSO_INTERESSE é o desejo na entrada (já vai em `objetivo`), não onde passou |');
  L.push('');
  L.push('## 6. Ressalvas (campos menos confiáveis do que parecem)');
  L.push('- **horas_semanais_efetivas**: tempo REGISTRADO pelo app (BD_Registro.HORAS ÷ 3600), '
    + 'não autodeclarado. Mistura linhas de origem `auto` (cron do app) e `manual` (mentor digitou). '
    + 'Média das até ' + EXPORT_LOTE_LINHAS + ' primeiras semanas existentes.');
  L.push('- **acertos_diag_total**: cobre SÓ Natureza (Bio+Qui+Fis) + Matemática. O diagnóstico de '
    + 'entrada NÃO testa Linguagens nem Humanas — NÃO é comparável a um total de ENEM (5 áreas).');
  L.push('- **acertos_diag_natureza**: soma de Bio+Qui+Fis do diagnóstico de entrada.');
  L.push('- **nota_redacao_entrada**: AUTODECLARADA no onboarding (nota de um ENEM anterior), não medida.');
  L.push('- **etapa**: derivada de ESCOLARIDADE do onboarding. "1º ano do EM" e valores fora do enum '
    + 'saem vazios (não forçados).');
  L.push('- **aprovado**: derivado de MOTIVO_SAIDA — `Aprovação`→sim, `Pós-ENEM`→nao, sem saída→em_andamento. '
    + 'Saída por Financeiro/Insatisfação/Psicológico/etc. fica VAZIO (desfecho real desconhecido, não é "nao").');
  L.push('- **data_inicio**: timestamp de onboarding/matrícula (BD_Alunos), usado como proxy do início '
    + 'do acompanhamento.');
  L.push('- **meses_***: meses de 30,44 dias, arredondados.');
  L.push('');
  return L.join('\n');
}
