// =====================================================================
// INTEGRAÇÃO APP (BigQuery) — conector read-only
// =====================================================================
// Lê dados de uso do Aplicativo (projeto BigQuery intento-edu) pra
// alimentar o registro semanal do mentor. Autentica via Service Account
// (JWT RS256 → OAuth token), sem depender de acesso pessoal de ninguém.
//
// SETUP MANUAL (1×, no editor — Project Settings → Script Properties):
//   BQ_SA_KEY = <conteúdo integral do JSON da service account>
//   (SA: intento-platform-bq-reader@intento-edu.iam.gserviceaccount.com,
//    roles read-only: BigQuery Data Viewer em app+analise, Job User no projeto)
//
// A lógica de cálculo dos 18 campos replica o app Flutter — ver
// gas/sql/registro_semanal_app.sql pro detalhe e histórico de validação.
//
// Domínio: escolar (Filippe).

var BQ_PROJECT_ID = 'intento-edu';
var BQ_SCOPE = 'https://www.googleapis.com/auth/bigquery.readonly';


// =====================================================================
// AUTENTICAÇÃO — Service Account → access token (JWT bearer flow)
// =====================================================================
function _bqGetAccessToken() {
  var raw = PropertiesService.getScriptProperties().getProperty('BQ_SA_KEY');
  if (!raw) throw new Error('BQ_SA_KEY ausente em Script Properties');

  var sa;
  try {
    sa = JSON.parse(raw);
  } catch (e) {
    throw new Error('BQ_SA_KEY não é JSON válido: ' + e.message);
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('BQ_SA_KEY incompleto (faltam client_email/private_key)');
  }

  var now = Math.floor(Date.now() / 1000);
  var b64url = function (bytesOrStr) {
    return Utilities.base64EncodeWebSafe(bytesOrStr).replace(/=+$/, '');
  };

  var header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claims = b64url(JSON.stringify({
    iss:   sa.client_email,
    scope: BQ_SCOPE,
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }));
  var signatureInput = header + '.' + claims;
  var signature = Utilities.computeRsaSha256Signature(signatureInput, sa.private_key);
  var jwt = signatureInput + '.' + b64url(signature);

  var resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });

  var body;
  try {
    body = JSON.parse(resp.getContentText());
  } catch (e) {
    throw new Error('Resposta OAuth não-JSON: ' + resp.getContentText());
  }
  if (!body.access_token) {
    throw new Error('Falha ao obter access token BQ: ' + resp.getContentText());
  }
  return body.access_token;
}


// =====================================================================
// QUERY — roda SQL no BigQuery, devolve linhas como array de objetos
// =====================================================================
// parameters: array no formato da BigQuery REST API (queryParameters).
function _bqQuery(sql, parameters) {
  var token = _bqGetAccessToken();
  var payload = {
    query: sql,
    useLegacySql: false,
    timeoutMs: 60000,
  };
  if (parameters && parameters.length) {
    payload.parameterMode = 'NAMED';
    payload.queryParameters = parameters;
  }

  var resp = UrlFetchApp.fetch(
    'https://bigquery.googleapis.com/bigquery/v2/projects/' + BQ_PROJECT_ID + '/queries',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }
  );

  var body;
  try {
    body = JSON.parse(resp.getContentText());
  } catch (e) {
    throw new Error('Resposta BQ não-JSON: ' + resp.getContentText());
  }
  if (body.error) throw new Error('BQ erro: ' + JSON.stringify(body.error));
  if (!body.jobComplete) throw new Error('BQ job não completou em 60s');

  var fields = (body.schema && body.schema.fields) || [];
  var rows = body.rows || [];
  return rows.map(function (r) {
    var obj = {};
    for (var i = 0; i < fields.length; i++) {
      obj[fields[i].name] = r.f[i].v;
    }
    return obj;
  });
}


// =====================================================================
// _lerRegistrosApp — 1 linha por aluno com os 18 campos do registro
// =====================================================================
// semanaInicio: 'YYYY-MM-DD' do domingo (início) — casa com atividadesSemanais.
// semanaFim:    'YYYY-MM-DD' do sábado  (fim)    — limite da foto de domínio.
// emailsAlvo:   array de emails pra filtrar; vazio/ausente = todos os alunos.
// Retorna: { email: { dom_BIO, ..., prog_TOTAL, horas, estresse, ... } }.
function _lerRegistrosApp(semanaInicio, semanaFim, emailsAlvo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(semanaInicio))) {
    throw new Error('semanaInicio inválida (esperado YYYY-MM-DD): ' + semanaInicio);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(semanaFim))) {
    throw new Error('semanaFim inválida (esperado YYYY-MM-DD): ' + semanaFim);
  }
  var alvos = Array.isArray(emailsAlvo) ? emailsAlvo : [];

  var parameters = [
    {
      name: 'semana_inicio',
      parameterType: { type: 'DATE' },
      parameterValue: { value: semanaInicio },
    },
    {
      name: 'semana_fim',
      parameterType: { type: 'DATE' },
      parameterValue: { value: semanaFim },
    },
    {
      name: 'alvos',
      parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
      parameterValue: { arrayValues: alvos.map(function (e) { return { value: e }; }) },
    },
  ];

  var linhas = _bqQuery(_SQL_REGISTRO_APP, parameters);
  var porEmail = {};
  linhas.forEach(function (l) { porEmail[l.email] = l; });
  return porEmail;
}


// =====================================================================
// SMOKE — roda 1× no editor pra validar o conector
// =====================================================================
function smokeIntegracaoApp() {
  Logger.log('===== SMOKE Integração App =====');

  var token = _bqGetAccessToken();
  Logger.log('✓ access token obtido (' + token.length + ' chars)');

  // semana 17/05 a 23/05/2026 (domingo 17 = início; sábado 23 = fim)
  var registros = _lerRegistrosApp('2026-05-17', '2026-05-23', [
    'gabriel.limamoreira@gmail.com',
    'silvaclaudialuisa@gmail.com',
  ]);
  var emails = Object.keys(registros);
  Logger.log('✓ _lerRegistrosApp retornou ' + emails.length + ' aluno(s)');

  emails.forEach(function (em) {
    var r = registros[em];
    Logger.log('  ' + em +
      ' | horas=' + r.horas +
      ' | domTotal=' + r.dom_TOTAL + ' progTotal=' + r.prog_TOTAL +
      ' | domBIO=' + r.dom_BIO + ' progBIO=' + r.prog_BIO +
      ' | estresse=' + r.estresse + ' sono=' + r.sono);
  });

  // Esperado (validado mai/2026 contra o app):
  //   gabriel  → domTotal≈0.89   claudia → domTotal≈0.85
  // (progTotal mudou jun/2026 p/ "% folhas concluídas ponderado" — baselines
  //  antigos 0.75/0.41 não valem mais; re-validar contra o app.)
  Logger.log('===== FIM SMOKE =====');
}


// =====================================================================
// SQL — query master. Replica a lógica do app Flutter.
// Mantida em sincronia com gas/sql/registro_semanal_app.sql.
// Parâmetros:
//   @semana_inicio (DATE) — domingo; casa com atividadesSemanais.dataExecucao
//   @semana_fim    (DATE) — sábado; limite da foto de domínio/progresso
//   @alvos (ARRAY<STRING>, vazio = todos)
// =====================================================================
var _SQL_REGISTRO_APP = [
  'WITH RECURSIVE',
  // alunos: filtra por @alvos, ou todos se @alvos vier vazio
  'alunos AS (',
  '  SELECT uid, email FROM `intento-edu.app.usuario`',
  '  WHERE ARRAY_LENGTH(@alvos) = 0 OR email IN UNNEST(@alvos)',
  '),',
  // hier — árvore completa de topicoPrep por recursão. Cada nó carrega:
  //   raizId = disciplina (nó com paiId NULL); n1Id = tópico nível 1
  //   (1º descendente da raiz, via COALESCE no passo recursivo). Robusto a
  //   árvores de profundidade arbitrária (o app deveria ter 2 níveis, mas
  //   alguns alunos têm 3 — a lógica nivel=1 antiga quebrava nesses casos).
  // ramo_fin = finalizada do nó + qualquer ancestral (propaga pra baixo:
  // marcar um pai conclui toda a subárvore dele).
  'hier AS (',
  '  SELECT topicoId, topicoId AS raizId, CAST(NULL AS STRING) AS n1Id, usuarioId,',
  '    finalizada AS ramo_fin',
  '  FROM `intento-edu.app.topicoPrep`',
  '  WHERE usuarioId IN (SELECT uid FROM alunos) AND paiId IS NULL',
  '  UNION ALL',
  '  SELECT t.topicoId, h.raizId, COALESCE(h.n1Id, t.topicoId), t.usuarioId,',
  '    h.ramo_fin OR t.finalizada',
  '  FROM `intento-edu.app.topicoPrep` t',
  '  JOIN hier h ON t.paiId = h.topicoId AND t.usuarioId = h.usuarioId',
  '),',
  // raiz_materia — mapeia cada disciplina-raiz para BIO/QUI/FIS/MAT pelo
  // NOME normalizado (LIKE com `_` como wildcard de acento). Imune a IDs
  // canônicos divergentes entre alunos (ex: Gabriel tem IDs próprios).
  'raiz_materia AS (',
  '  SELECT topicoId AS raizId, usuarioId,',
  '    CASE',
  '      WHEN LOWER(nome) LIKE \'%biolog%\'  THEN \'BIO\'',
  '      WHEN LOWER(nome) LIKE \'%qu_mic%\'  THEN \'QUI\'',
  '      WHEN LOWER(nome) LIKE \'%f_sic%\'   THEN \'FIS\'',
  '      WHEN LOWER(nome) LIKE \'%matem_t%\' THEN \'MAT\'',
  '      ELSE NULL',
  '    END AS materia',
  '  FROM `intento-edu.app.topicoPrep`',
  '  WHERE usuarioId IN (SELECT uid FROM alunos) AND paiId IS NULL',
  '),',
  // tem_filho — conjunto de nós que são pai de alguém (logo, NÃO são folha).
  'tem_filho AS (',
  '  SELECT DISTINCT paiId AS topicoId, usuarioId FROM `intento-edu.app.topicoPrep`',
  '  WHERE usuarioId IN (SELECT uid FROM alunos) AND paiId IS NOT NULL',
  '),',
  // última atividade por (aluno, nó) até semana_fim + contagem de finished
  'ativ AS (',
  '  SELECT REGEXP_EXTRACT(__key__.path, r\'"u",\\s*"([^"]+)"\') AS usuarioId, subjectId AS topicoId,',
  '    ARRAY_AGG(STRUCT(rightAnswers, wrongAnswers) ORDER BY TIMESTAMP_SECONDS(date) DESC LIMIT 1)[OFFSET(0)] AS u,',
  '    COUNTIF(finished) AS n_finished',
  '  FROM `intento-edu.app.atividade`',
  '  WHERE REGEXP_EXTRACT(__key__.path, r\'"u",\\s*"([^"]+)"\') IN (SELECT uid FROM alunos)',
  '    AND DATE(TIMESTAMP_SECONDS(date)) <= @semana_fim',
  '  GROUP BY usuarioId, topicoId',
  '),',
  // nos — só nós DENTRO de uma disciplina (n1Id IS NOT NULL exclui a raiz).
  // eh_folha = sem filhos. right/total da última atividade da folha.
  'nos AS (',
  '  SELECT h.topicoId, h.raizId, h.n1Id, h.usuarioId, h.ramo_fin,',
  '    (tf.topicoId IS NULL) AS eh_folha,',
  '    COALESCE(a.u.rightAnswers, 0) AS right_a,',
  '    COALESCE(a.u.rightAnswers, 0) + COALESCE(a.u.wrongAnswers, 0) AS total_a,',
  '    COALESCE(a.n_finished, 0) AS n_finished',
  '  FROM hier h',
  '  LEFT JOIN tem_filho tf ON tf.topicoId = h.topicoId AND tf.usuarioId = h.usuarioId',
  '  LEFT JOIN ativ a ON a.topicoId = h.topicoId AND a.usuarioId = h.usuarioId',
  '  WHERE h.n1Id IS NOT NULL',
  '),',
  // dominio — por disciplina: SUM(right)/SUM(total) de todos os nós.
  'dominio AS (',
  '  SELECT usuarioId, raizId, SUM(right_a) AS right_d, SUM(total_a) AS total_d',
  '  FROM nos GROUP BY usuarioId, raizId',
  '),',
  // n1_prog — progresso por TÓPICO nível-1: fração de subtópicos (folhas)
  // concluídos dentro do tópico. Folha concluída = ramo_fin OU ≥1 atividade.
  'n1_prog AS (',
  '  SELECT usuarioId, raizId, n1Id,',
  '    SAFE_DIVIDE(',
  '      COUNTIF(eh_folha AND (ramo_fin OR n_finished >= 1)),',
  '      COUNTIF(eh_folha)',
  '    ) AS prog_n1',
  '  FROM nos GROUP BY usuarioId, raizId, n1Id',
  '),',
  // prog_disc — progresso da disciplina = MÉDIA entre os tópicos nível-1 (cada
  // tópico pesa 1/N, independente de quantos subtópicos tem). Evita superestimar
  // quando só os tópicos em estudo têm subtópicos listados.
  'prog_disc AS (',
  '  SELECT usuarioId, raizId, AVG(prog_n1) AS prog',
  '  FROM n1_prog GROUP BY usuarioId, raizId',
  '),',
  // metrica — agrega disciplinas pela MATÉRIA canônica (BIO/QUI/FIS/MAT).
  // Soma domínios; progresso = média simples das disciplinas da matéria.
  'metrica AS (',
  '  SELECT d.usuarioId, rm.materia,',
  '    SUM(d.right_d) AS right_d, SUM(d.total_d) AS total_d,',
  '    AVG(pd.prog) AS prog',
  '  FROM dominio d',
  '  JOIN raiz_materia rm ON rm.raizId = d.raizId AND rm.usuarioId = d.usuarioId',
  '  LEFT JOIN prog_disc pd ON pd.usuarioId = d.usuarioId AND pd.raizId = d.raizId',
  '  WHERE rm.materia IS NOT NULL',
  '  GROUP BY d.usuarioId, rm.materia',
  '),',
  // HORAS — direto do raw (app.atividade.duration em segundos). A tabela
  // tratada analise.atividadesSemanais.minutos diverge da realidade do app
  // (em alguns alunos infla, em outros falta), confirmado em mai/2026
  // contra valores que mentores observaram no app. SUM(duration)/3600 bate
  // exato com o que o aluno vê.
  'semana_horas AS (',
  '  SELECT',
  '    REGEXP_EXTRACT(__key__.path, r\'"u",\\s*"([^"]+)"\') AS usuarioId,',
  '    ROUND(SUM(duration) / 3600.0, 1) AS horas',
  '  FROM `intento-edu.app.atividade`',
  '  WHERE DATE(TIMESTAMP_SECONDS(date)) BETWEEN @semana_inicio AND @semana_fim',
  '  GROUP BY usuarioId',
  '),',
  // CHECK-IN — direto do raw (app.checkin). A tabela analise.atividadesSemanais
  // replica o check-in por linha de disciplina, gerando médias enviesadas (e
  // pra alunos com disciplinas faltando na tabela, perde check-ins inteiros).
  // Validado mai/2026: Gabriel motivação 0.50 (raw) vs 0.76 (analise) — Δ=0.26.
  // Os valores são doubles {0.0..1.0}; ao marcar um EXTREMO (0.0/1.0) o número
  // trafega como inteiro e o Firestore grava no leaf `.integer`, não `.float`.
  // Ler só `.float` zerava/enviesava o check-in (dias em 0 ou 1 sumiam).
  // COALESCE com `.integer` recupera esses dias.
  'semana_checkin AS (',
  '  SELECT REGEXP_EXTRACT(__key__.path, r\'"u",\\s*"([^"]+)"\') AS usuarioId,',
  '    ROUND(AVG(COALESCE(stress.float,     CAST(stress.integer     AS FLOAT64))), 2) AS estresse,',
  '    ROUND(AVG(COALESCE(anxiety.float,    CAST(anxiety.integer    AS FLOAT64))), 2) AS ansiedade,',
  '    ROUND(AVG(COALESCE(motivation.float, CAST(motivation.integer AS FLOAT64))), 2) AS motivacao,',
  '    ROUND(AVG(COALESCE(rest.float,       CAST(rest.integer       AS FLOAT64))), 2) AS sono',
  '  FROM `intento-edu.app.checkin`',
  '  WHERE DATE(createdAt) BETWEEN @semana_inicio AND @semana_fim',
  '  GROUP BY usuarioId',
  '),',
  // Revisões Atrasadas — replica activity_service.dueReviews do app Flutter.
  // Pra cada (aluno, tópico): dueRev = MAX(r em topico.reviews) onde r < hoje.
  // Atrasado = existe dueRev E sem atividade depois dele.
  'rev_due AS (',
  '  SELECT',
  '    REGEXP_EXTRACT(__key__.path, r\'"u",\\s*"([^"]+)"\') AS usuarioId,',
  '    REGEXP_EXTRACT(__key__.path, r\'"s",\\s*"([^"]+)"\') AS topicoId,',
  '    MAX(r) AS due_rev',
  '  FROM `intento-edu.app.topico`, UNNEST(reviews) r',
  '  WHERE ARRAY_LENGTH(reviews) > 0',
  '    AND r < UNIX_SECONDS(TIMESTAMP(DATE_ADD(@semana_fim, INTERVAL 1 DAY)))',
  '  GROUP BY usuarioId, topicoId',
  '),',
  'rev_ult_ativ AS (',
  '  SELECT',
  '    REGEXP_EXTRACT(__key__.path, r\'"u",\\s*"([^"]+)"\') AS usuarioId,',
  '    subjectId AS topicoId,',
  '    MAX(date) AS last_activity_ts',
  '  FROM `intento-edu.app.atividade`',
  '  WHERE DATE(TIMESTAMP_SECONDS(date)) <= @semana_fim',
  '  GROUP BY usuarioId, topicoId',
  '),',
  'rev_atrasadas AS (',
  '  SELECT d.usuarioId, COUNT(*) AS revisoes_atrasadas',
  '  FROM rev_due d',
  '  LEFT JOIN rev_ult_ativ a USING (usuarioId, topicoId)',
  '  WHERE a.last_activity_ts IS NULL OR a.last_activity_ts <= d.due_rev',
  '  GROUP BY d.usuarioId',
  ')',
  'SELECT a.email,',
  '  ROUND(MAX(IF(m.materia=\'BIO\', SAFE_DIVIDE(m.right_d,m.total_d), NULL)), 2) AS dom_BIO,',
  '  ROUND(MAX(IF(m.materia=\'QUI\', SAFE_DIVIDE(m.right_d,m.total_d), NULL)), 2) AS dom_QUI,',
  '  ROUND(MAX(IF(m.materia=\'FIS\', SAFE_DIVIDE(m.right_d,m.total_d), NULL)), 2) AS dom_FIS,',
  '  ROUND(MAX(IF(m.materia=\'MAT\', SAFE_DIVIDE(m.right_d,m.total_d), NULL)), 2) AS dom_MAT,',
  '  ROUND(SAFE_DIVIDE(SUM(m.right_d), SUM(m.total_d)), 2) AS dom_TOTAL,',
  '  ROUND(MAX(IF(m.materia=\'BIO\', m.prog, NULL)), 2) AS prog_BIO,',
  '  ROUND(MAX(IF(m.materia=\'QUI\', m.prog, NULL)), 2) AS prog_QUI,',
  '  ROUND(MAX(IF(m.materia=\'FIS\', m.prog, NULL)), 2) AS prog_FIS,',
  '  ROUND(MAX(IF(m.materia=\'MAT\', m.prog, NULL)), 2) AS prog_MAT,',
  '  ROUND(AVG(m.prog), 2) AS prog_TOTAL,',
  '  COALESCE(sh.horas, 0) AS horas,',
  '  sc.estresse, sc.ansiedade, sc.motivacao, sc.sono,',
  '  COALESCE(ra.revisoes_atrasadas, 0) AS revisoes_atrasadas',
  'FROM alunos a',
  'LEFT JOIN metrica m ON m.usuarioId = a.uid',
  'LEFT JOIN semana_horas sh ON sh.usuarioId = a.uid',
  'LEFT JOIN semana_checkin sc ON sc.usuarioId = a.uid',
  'LEFT JOIN rev_atrasadas ra ON ra.usuarioId = a.uid',
  'GROUP BY a.email, sh.horas, sc.estresse, sc.ansiedade, sc.motivacao, sc.sono, ra.revisoes_atrasadas',
  'ORDER BY a.email',
].join('\n');


// =====================================================================
// CRON — gera o registro semanal automático a partir do app
// =====================================================================
// Roda Domingo 22h (antes do cronLembreteMentor de Seg 9h). Pra cada
// aluno ativo cujo status_app permite, cria a linha em BD_Registro com
// os 18 campos vindos do app. Meta Semanal e Revisões Atrasadas ficam
// vazios — são preenchidos manualmente pelo mentor (Diário de Bordo).
//
// Idempotente: se já existe linha pra semana, pula (não sobrescreve).
// dryRun=true loga o que faria sem gravar nada.

var _MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// "DD/MM/YYYY a DD/MM/YYYY" → { inicio, fim } em ISO "YYYY-MM-DD".
// inicio = domingo (início da semana) — bate com atividadesSemanais.dataExecucao.
// fim    = sábado (fim da semana)     — limite da "foto" de domínio/progresso.
function _semanaStrParaISOs(semanaStr) {
  var partes = String(semanaStr).split(' a ');
  if (partes.length !== 2) throw new Error('semanaStr inválida: ' + semanaStr);
  var dom = partes[0].trim().split('/'); // [DD, MM, YYYY]
  var sab = partes[1].trim().split('/');
  if (dom.length !== 3 || sab.length !== 3) throw new Error('data inválida em semanaStr: ' + semanaStr);
  return {
    inicio: dom[2] + '-' + dom[1] + '-' + dom[0],
    fim:    sab[2] + '-' + sab[1] + '-' + sab[0],
  };
}

function _mesPorExtenso(isoDate) {
  var mm = parseInt(String(isoDate).split('-')[1], 10);
  return _MESES_PT[mm - 1] || '';
}

// Soma slots da Semana Padrão do aluno cuja categoria conta como hora de
// estudo (Codificação + Revisão + Simulado). Cada slot = 1 hora.
// Categoria é extraída do formato '[Categoria] descrição' em cada célula.
// Retorna 0 se a aba não existe ou der erro (não-bloqueante).
var _CATEGORIAS_META_HORAS = ['Codificação', 'Revisão', 'Simulado'];

function _calcularMetaHorasDaSemanaPadrao(idPlanilha) {
  try {
    var aba = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.SEMANA);
    if (!aba) return 0;
    var matriz = aba.getRange(2, 2, 16, 7).getValues(); // 16 horários × 7 dias
    var horas = 0;
    for (var l = 0; l < matriz.length; l++) {
      for (var c = 0; c < matriz[l].length; c++) {
        var celula = String(matriz[l][c] || '').trim();
        if (!celula) continue;
        var m = celula.match(/\[(.*?)\]/);
        var categoria = m ? m[1].trim() : '';
        if (_CATEGORIAS_META_HORAS.indexOf(categoria) !== -1) horas++;
      }
    }
    return horas;
  } catch (e) {
    Logger.log('_calcularMetaHorasDaSemanaPadrao falhou pra ' + idPlanilha + ': ' + e.message);
    return 0;
  }
}

// Garante que a aba BD_Registro tem a coluna origem_registro (col 21).
// Defensivo: chamado antes de toda escrita, então o código não depende
// da migração one-shot ter rodado nem da ordem de deploy.
function _garantirColunaOrigem(abaDB) {
  if (abaDB.getMaxColumns() < COL_REG_TOTAL) {
    abaDB.insertColumnsAfter(abaDB.getMaxColumns(), COL_REG_TOTAL - abaDB.getMaxColumns());
  }
  if (!txt(abaDB.getRange(1, COL_REG.ORIGEM + 1).getValue())) {
    abaDB.getRange(1, COL_REG.ORIGEM + 1).setValue('origem_registro');
  }
}

// Normaliza "DD/MM/YYYY a DD/MM/YYYY" → timestamp da data de início.
// Usado pra dedupe robusto: compara semanas pela data, não pela string
// literal (imune a zero à esquerda, espaço extra, etc).
function _semanaInicioTs(semanaStr) {
  var ini = String(semanaStr || '').split(' a ')[0].trim();
  var p = ini.split('/');
  if (p.length !== 3) return null;
  var d = new Date(+p[2], +p[1] - 1, +p[0]);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// IMPORTANTE: triggers time-based do Apps Script passam um event object como
// 1º argumento — qualquer truthy seria interpretado como dry run. Por isso
// só consideramos dry run quando o chamador passa `true` LITERAL (smoke).
// semanaStrOverride (opcional): 'DD/MM/YYYY a DD/MM/YYYY' pra regenerar uma
// semana específica (recomposição). Ausente = semana anterior (uso do trigger).
function cronGerarRegistrosApp(dryRun, semanaStrOverride) {
  var ehDryRun = dryRun === true;
  Logger.log('===== cronGerarRegistrosApp ' + (ehDryRun ? '(DRY RUN)' : '') + ' =====');

  var semanaStr = (typeof semanaStrOverride === 'string' && semanaStrOverride)
    ? semanaStrOverride
    : computarSemanaAnterior_();
  var semana = _semanaStrParaISOs(semanaStr); // { inicio (domingo), fim (sábado) }
  var mesExt = _mesPorExtenso(semana.fim);
  var dataRegistro = Utilities.formatDate(new Date(), 'GMT-3', 'dd/MM/yyyy');
  Logger.log('semana=' + semanaStr + ' · inicio=' + semana.inicio + ' · fim=' + semana.fim);

  var ssMestre = SpreadsheetApp.getActiveSpreadsheet();
  var abaMestre = ssMestre.getSheetByName(ABA.MESTRE);
  if (!abaMestre) { Logger.log('aba MESTRE não encontrada'); return; }
  var matriz = abaMestre.getDataRange().getValues();

  // alunos ativos elegíveis (status_app = 'Usa' ou não definido)
  var ativos = [];
  var puladosStatus = 0;
  for (var i = 1; i < matriz.length; i++) {
    if (txt(matriz[i][COL_MESTRE.STATUS_ONBOARDING]) !== 'Onboarding Completo') continue;
    var statusApp = txt(matriz[i][COL_MESTRE.STATUS_APP]);
    if (statusApp && statusApp !== STATUS_APP.USA) { puladosStatus++; continue; }
    var email = emailNorm(matriz[i][COL_MESTRE.EMAIL]);
    var idPlanilha = txt(matriz[i][COL_MESTRE.ID_PLANILHA]);
    if (!email || !idPlanilha) continue;
    ativos.push({ email: email, idPlanilha: idPlanilha });
  }
  Logger.log(ativos.length + ' alunos elegíveis · ' + puladosStatus + ' pulados por status_app');
  if (!ativos.length) { Logger.log('nada a fazer'); return; }

  // 1 query pra todos os elegíveis
  var registros;
  try {
    registros = _lerRegistrosApp(semana.inicio, semana.fim, ativos.map(function (a) { return a.email; }));
  } catch (e) {
    Logger.log('FALHA _lerRegistrosApp: ' + e.message);
    registrarErro(e, 'cronGerarRegistrosApp/_lerRegistrosApp semana=' + semanaStr);
    return;
  }

  var criados = 0, jaExistiam = 0, semDado = 0, erros = 0;
  ativos.forEach(function (aluno) {
    try {
      var r = registros[aluno.email];
      if (!r) { semDado++; return; }

      var abaDB = SpreadsheetApp.openById(aluno.idPlanilha).getSheetByName(ABA.REGISTROS);
      if (!abaDB) {
        erros++;
        registrarErro(new Error('aba ' + ABA.REGISTROS + ' ausente'), 'cronGerarRegistrosApp aluno=' + aluno.email);
        return;
      }

      // dedupe robusto — compara pela data de início, não pela string
      // literal. Protege contra duplicar registros já feitos à mão
      // (o 1º run cai numa semana que os mentores já preencheram).
      var alvoTs = _semanaInicioTs(semanaStr);
      var existing = abaDB.getDataRange().getValues();
      var jaTem = false;
      for (var j = 1; j < existing.length; j++) {
        if (alvoTs !== null && _semanaInicioTs(existing[j][COL_REG.SEMANA]) === alvoTs) {
          jaTem = true;
          break;
        }
      }
      if (jaTem) { jaExistiam++; return; }

      // META = soma dos slots Cod+Rev+Sim da Semana Padrão (sugerida; mentor
      // pode ajustar editando o registro). 0 se aba não existe.
      // REVISOES = replica activity_service.dueReviews do app (snapshot).
      var metaHoras = _calcularMetaHorasDaSemanaPadrao(aluno.idPlanilha);
      var novaLinha = [
        semanaStr, mesExt, dataRegistro,
        metaHoras || '',              // META — calculada da Semana Padrão
        num(r.horas),
        num(r.dom_TOTAL), num(r.prog_TOTAL),
        num(r.revisoes_atrasadas),    // REVISOES — snapshot do app (atrasadas pendentes)
        num(r.estresse), num(r.ansiedade), num(r.motivacao), num(r.sono),
        num(r.dom_BIO), num(r.prog_BIO),
        num(r.dom_QUI), num(r.prog_QUI),
        num(r.dom_FIS), num(r.prog_FIS),
        num(r.dom_MAT), num(r.prog_MAT),
        ORIGEM_REG.AUTO,
      ];

      if (ehDryRun) {
        Logger.log('  [dry] ' + aluno.email + ' → horas=' + novaLinha[COL_REG.HORAS] +
                   ' domTot=' + novaLinha[COL_REG.DOMINIO_TOTAL] +
                   ' progTot=' + novaLinha[COL_REG.PROGRESSO_TOTAL]);
        criados++;
        return;
      }

      // append na 1ª linha vazia da coluna A
      _garantirColunaOrigem(abaDB);
      var colA = abaDB.getRange(1, 1, abaDB.getMaxRows(), 1).getValues();
      var ultima = 0;
      for (var k = colA.length - 1; k >= 0; k--) {
        if (String(colA[k][0]).trim() !== '') { ultima = k + 1; break; }
      }
      abaDB.getRange(ultima + 1, 1, 1, novaLinha.length).setValues([novaLinha]);
      _atualizarCacheUltimoRegistro(aluno.idPlanilha, abaDB);
      criados++;
    } catch (e) {
      erros++;
      Logger.log('  erro ' + aluno.email + ': ' + e.message);
      try { registrarErro(e, 'cronGerarRegistrosApp aluno=' + aluno.email); } catch (_) {}
    }
  });

  Logger.log('cronGerarRegistrosApp: ' + criados + ' criados · ' + jaExistiam +
             ' já existiam · ' + semDado + ' sem dado no app · ' + erros + ' erros');
}

// Instala o trigger time-based (Domingo 22h). Rodar 1× no editor. Idempotente.
function instalarTriggerRegistrosApp() {
  var existentes = ScriptApp.getProjectTriggers();
  existentes.forEach(function (t) {
    if (t.getHandlerFunction() === 'cronGerarRegistrosApp') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cronGerarRegistrosApp').timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(22).create();
  Logger.log('Trigger cronGerarRegistrosApp instalado — Domingo 22h');
}


// =====================================================================
// MIGRAÇÕES ONE-SHOT — rodar 1× no editor
// =====================================================================

// Adiciona a coluna `origem_registro` (COL_REG.ORIGEM) em BD_Registro de
// todas as planilhas individuais + modelo. Linhas pré-existentes são
// marcadas como 'manual' (foram preenchidas à mão antes da integração).
function migrarColunaOrigemRegistro() {
  Logger.log('===== migrarColunaOrigemRegistro =====');
  var matriz = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA.MESTRE).getDataRange().getValues();

  var ids = {};
  ids[ID_PLANILHA_MODELO] = true;
  for (var i = 1; i < matriz.length; i++) {
    var id = txt(matriz[i][COL_MESTRE.ID_PLANILHA]);
    if (id) ids[id] = true;
  }

  var migrados = 0, jaTinha = 0, semAba = 0, erros = 0;
  Object.keys(ids).forEach(function (id) {
    try {
      var aba = SpreadsheetApp.openById(id).getSheetByName(ABA.REGISTROS);
      if (!aba) { semAba++; return; }
      if (txt(aba.getRange(1, COL_REG.ORIGEM + 1).getValue())) { jaTinha++; return; }

      aba.getRange(1, COL_REG.ORIGEM + 1).setValue('origem_registro');
      var last = aba.getLastRow();
      if (last >= 2) {
        var valores = [];
        for (var r = 0; r < last - 1; r++) valores.push([ORIGEM_REG.MANUAL]);
        aba.getRange(2, COL_REG.ORIGEM + 1, last - 1, 1).setValues(valores);
      }
      migrados++;
    } catch (e) {
      erros++;
      Logger.log('  erro id=' + id + ': ' + e.message);
    }
  });
  Logger.log('migrarColunaOrigemRegistro: ' + migrados + ' migrados · ' + jaTinha +
             ' já tinham · ' + semAba + ' sem aba · ' + erros + ' erros');
}

// Adiciona a coluna `ultima_exportacao` (COL_CACHE.ULTIMA_EXPORTACAO) na
// aba Cache_Alunos. Defensivo: o `atualizarCacheMestre` já cria a coluna
// implicitamente ao escrever; essa migração só popula o header.
function migrarColunaUltimaExportacao() {
  Logger.log('===== migrarColunaUltimaExportacao =====');
  var abaCache = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA.CACHE);
  if (!abaCache) { Logger.log('aba ' + ABA.CACHE + ' não encontrada'); return; }
  if (txt(abaCache.getRange(1, COL_CACHE.ULTIMA_EXPORTACAO + 1).getValue())) {
    Logger.log('coluna ultima_exportacao já existe');
    return;
  }
  abaCache.getRange(1, COL_CACHE.ULTIMA_EXPORTACAO + 1).setValue('ultima_exportacao');
  Logger.log('coluna ultima_exportacao criada (col ' + (COL_CACHE.ULTIMA_EXPORTACAO + 1) + ')');
}

// Adiciona a coluna `status_app` (COL_MESTRE.STATUS_APP) na aba MESTRE.
function migrarColunaStatusApp() {
  Logger.log('===== migrarColunaStatusApp =====');
  var abaMestre = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA.MESTRE);
  if (txt(abaMestre.getRange(1, COL_MESTRE.STATUS_APP + 1).getValue())) {
    Logger.log('coluna status_app já existe');
    return;
  }
  abaMestre.getRange(1, COL_MESTRE.STATUS_APP + 1).setValue('status_app');
  Logger.log('coluna status_app criada (col ' + (COL_MESTRE.STATUS_APP + 1) + ')');
}


// =====================================================================
// HANDLER — mentor define o status_app de um aluno (acordado em reunião)
// =====================================================================
// dados: { email, idAluno, statusApp }
// statusApp aceita '' (não definido), 'Usa', 'Não se adaptou', 'Nunca vai usar'.
function handleSalvarStatusApp(dados) {
  try {
    var idPlanilha = txt(dados.idAluno);
    if (!idPlanilha) return responderJSON({ status: 'erro', mensagem: 'idAluno obrigatório' });
    _exigirAcessoAluno(dados.email, idPlanilha);

    var novoStatus = txt(dados.statusApp);
    var validos = ['', STATUS_APP.USA, STATUS_APP.NAO_ADAPTOU, STATUS_APP.NUNCA_USARA];
    if (validos.indexOf(novoStatus) === -1) {
      return responderJSON({ status: 'erro', mensagem: 'statusApp inválido: ' + novoStatus });
    }

    var abaMestre = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA.MESTRE);
    var matriz = abaMestre.getDataRange().getValues();
    for (var i = 1; i < matriz.length; i++) {
      if (txt(matriz[i][COL_MESTRE.ID_PLANILHA]) === idPlanilha) {
        abaMestre.getRange(i + 1, COL_MESTRE.STATUS_APP + 1).setValue(novoStatus);
        return responderJSON({ status: 'sucesso', statusApp: novoStatus });
      }
    }
    return responderJSON({ status: 'erro', mensagem: 'aluno não encontrado na MESTRE' });
  } catch (e) {
    Logger.log('handleSalvarStatusApp EXCEPTION: ' + e.message);
    return responderJSON({ status: 'erro', mensagem: e.message });
  }
}


// =====================================================================
// HANDLER — registra que o mentor exportou o .png de acompanhamento
// =====================================================================
// dados: { email, idAluno }
// Atualiza Cache_Alunos.ULTIMA_EXPORTACAO com a data ISO de hoje.
// É o sinal de "mentor fez o trabalho da semana" (baixou o PNG pra mandar
// pro aluno via áudio). Chamado por /mentor/ig/painel e /mentor/ig/diario
// quando o download é concluído com sucesso.
function handleRegistrarExportacao(dados) {
  try {
    var idPlanilha = txt(dados.idAluno);
    if (!idPlanilha) return responderJSON({ status: 'erro', mensagem: 'idAluno obrigatório' });
    _exigirAcessoAluno(dados.email, idPlanilha);

    var hojeISO = Utilities.formatDate(new Date(), 'GMT-3', 'yyyy-MM-dd');
    atualizarCacheMestre(idPlanilha, { ULTIMA_EXPORTACAO: hojeISO });
    return responderJSON({ status: 'sucesso', ultimaExportacao: hojeISO });
  } catch (e) {
    Logger.log('handleRegistrarExportacao EXCEPTION: ' + e.message);
    return responderJSON({ status: 'erro', mensagem: e.message });
  }
}


// =====================================================================
// ONE-SHOT — apaga linhas com origem='auto' de uma semana específica
// =====================================================================
// Pra usar quando o cron gravou dados errados e precisa re-rodar.
// NÃO toca linhas manual/revisado/legado (origem != 'auto') —
// o trabalho do mentor é preservado.
//
// Uso: passar a semana como argumento, OU usar recomporSemanasAuto() abaixo
// (apaga + regenera de uma vez). Depois rodar cronGerarRegistrosApp() pra
// preencher de novo, se chamar só esta.
// semanaAlvoOverride (opcional): 'DD/MM/YYYY a DD/MM/YYYY'.
function apagarLinhasAutoDaSemana(semanaAlvoOverride) {
  var SEMANA_ALVO = (typeof semanaAlvoOverride === 'string' && semanaAlvoOverride)
    ? semanaAlvoOverride
    : '10/05/2026 a 16/05/2026'; // default se rodar sem argumento
  Logger.log('===== apagarLinhasAutoDaSemana ' + SEMANA_ALVO + ' =====');

  var matriz = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA.MESTRE).getDataRange().getValues();
  var alvoTs = _semanaInicioTs(SEMANA_ALVO);
  var apagadas = 0, planilhasOK = 0, semLinha = 0, erros = 0;

  for (var i = 1; i < matriz.length; i++) {
    var idPlanilha = txt(matriz[i][COL_MESTRE.ID_PLANILHA]);
    if (!idPlanilha) continue;
    if (matriz[i][COL_MESTRE.DT_SAIDA]) continue;

    try {
      var abaDB = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.REGISTROS);
      if (!abaDB) continue;
      var dados = abaDB.getDataRange().getValues();
      var achou = false;
      for (var j = dados.length - 1; j >= 1; j--) {
        if (_semanaInicioTs(dados[j][COL_REG.SEMANA]) === alvoTs
            && txt(dados[j][COL_REG.ORIGEM]) === ORIGEM_REG.AUTO) {
          abaDB.deleteRow(j + 1);
          apagadas++;
          achou = true;
        }
      }
      if (achou) planilhasOK++; else semLinha++;
    } catch (e) {
      erros++;
      Logger.log('  erro id=' + idPlanilha + ': ' + e.message);
    }
  }
  Logger.log('apagarLinhasAutoDaSemana: ' + apagadas + ' linhas em ' + planilhasOK +
             ' planilhas · ' + semLinha + ' sem linha auto · ' + erros + ' erros');
}


// =====================================================================
// RECOMPOSIÇÃO — apaga + regenera as semanas auto com a lógica atual
// =====================================================================
// Use quando a fórmula muda (ex: fix check-in int/float + progresso por folha,
// jun/2026) e os registros já gravados precisam ser recalculados.
//
// COMO USAR: edite _SEMANAS_RECOMPOR com as semanas que quer recompor e rode
// recomporSemanasAuto() no editor. Pra cada semana: apaga as linhas origem=
// 'auto' (preserva manual/revisado) e regenera com a query atual.
//
// As 3 semanas auto desde o início da integração (15/05) estão listadas —
// remova as que não quiser tocar.
var _SEMANAS_RECOMPOR = [
  '10/05/2026 a 16/05/2026',
  '17/05/2026 a 23/05/2026',
  '24/05/2026 a 30/05/2026',
];

function recomporSemanasAuto() {
  Logger.log('===== recomporSemanasAuto: ' + _SEMANAS_RECOMPOR.length + ' semana(s) =====');
  _SEMANAS_RECOMPOR.forEach(function (semana) {
    Logger.log('--- recompondo ' + semana + ' ---');
    apagarLinhasAutoDaSemana(semana);
    cronGerarRegistrosApp(false, semana);
  });
  Logger.log('===== recomporSemanasAuto: FIM =====');
}


// =====================================================================
// SMOKE do cron — dry run, não grava nada
// =====================================================================
function smokeCronRegistrosApp() {
  cronGerarRegistrosApp(true);
}
