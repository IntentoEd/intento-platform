// =====================================================================
// INTEGRAÇÃO COM O INTENTO BASE — gas/integracaoBase.gs (NOVO ARQUIVO)
// =====================================================================
// Ações chamadas SÓ pelo Next da plataforma (app/api/integracao/base/route.js),
// que valida o header x-integracao-token do Base e repassa com o GAS_API_TOKEN.
// Nunca entram na allowlist do /api/mentor (o browser não chama).
//
// Convenções deste repo usadas aqui: emailNorm, txt, num, responderJSON,
// registrarErro, LockService, ABA.*, COL_MESTRE.*, COL_REG.*, COL_REG_TOTAL,
// ORIGEM_REG, STATUS_APP, _garantirColunaOrigem, _semanaInicioTs,
// _semanaStrParaISOs, _mesPorExtenso, _atualizarCacheUltimoRegistro,
// lerMentoresAtivos, ID_PLANILHA_MODELO, ID_PASTA_TRIAGEM, _retryDrive.
//
// No doPost (gas/Code.gs), adicionar:
//   if (acao === "upsertRegistroSemanal")  return handleUpsertRegistroSemanal(dados);
//   if (acao === "provisionarAlunoBase")   return handleProvisionarAlunoBase(dados);
//   if (acao === "buscarMentoriaAluno")    return handleBuscarMentoriaAluno(dados);
//   if (acao === "salvarChecksPlanoBase")  return handleSalvarChecksPlanoBase(dados);
//
// Em STATUS_APP (gas/Code.gs), adicionar: BASE: 'Base'
//   → o cronGerarRegistrosApp já PULA qualquer status diferente de 'Usa'/vazio,
//     então alunos 'Base' não são lidos do BigQuery; e a Jornada
//     (lib/selos.js:jornadaVisivel) só esconde 'Não se adaptou'/'Nunca vai usar',
//     então segue visível. Nada mais muda no fluxo atual.

// Aluno ATIVO (sem DT_SAIDA) por e-mail na BD_Alunos → { linha (1-based), email, nome, idPlanilha, mentor, plano, statusApp } | null
function _acharAlunoAtivoPorEmail(emailBruto) {
  var email = emailNorm(emailBruto);
  if (!email) return null;
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA.MESTRE);
  if (!aba) throw new Error("Aba mestre '" + ABA.MESTRE + "' não encontrada.");
  var m = aba.getDataRange().getValues();
  for (var i = m.length - 1; i >= 1; i--) {
    if (emailNorm(m[i][COL_MESTRE.EMAIL]) !== email) continue;
    if (m[i][COL_MESTRE.DT_SAIDA]) continue;
    return {
      linha: i + 1,
      email: email,
      nome: txt(m[i][COL_MESTRE.NOME]),
      idPlanilha: txt(m[i][COL_MESTRE.ID_PLANILHA]),
      mentor: emailNorm(m[i][COL_MESTRE.MENTOR_RESPONSAVEL]),
      plano: txt(m[i][COL_MESTRE.PLANO]),
      statusApp: txt(m[i][COL_MESTRE.STATUS_APP]),
      tipoAluno: txt(m[i][COL_MESTRE.TIPO_ALUNO]) || 'ENEM'
    };
  }
  return null;
}

// Cria ou atualiza a linha da semana (dom→sáb) no BD_Registro do aluno com o
// que o Base mandou. Regras:
// · dedupe pela data de início (como o cron), nunca pela string;
// · linha do MENTOR ('manual' ou 'revisado') é preservada — o Base não
//   sobrescreve o que um humano decidiu; devolve { resultado: 'preservado' };
// · linha 'auto' (ou nova) recebe os valores com ORIGEM 'auto', na mesma
//   escala do cron (check-in 0-1, domínio/cobertura em frações).
// dados: { email, semana: 'DD/MM/YYYY a DD/MM/YYYY', valores: { META, HORAS,
//   DOMINIO_TOTAL, PROGRESSO_TOTAL, REVISOES, ESTRESSE, ANSIEDADE, MOTIVACAO,
//   SONO, DOM_BIO, PROG_BIO, DOM_QUI, PROG_QUI, DOM_FIS, PROG_FIS, DOM_MAT,
//   PROG_MAT, DIAS_ESTUDO, DIAS_PLANEJADOS, QUESTOES } }
function handleUpsertRegistroSemanal(dados) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var aluno = _acharAlunoAtivoPorEmail(dados.email);
    if (!aluno) return responderJSON({ status: 'erro', codigo: 'nao_encontrado', mensagem: 'Aluno não encontrado na plataforma.' });
    if (!aluno.idPlanilha) return responderJSON({ status: 'erro', codigo: 'sem_planilha', mensagem: 'Aluno sem planilha.' });

    var semanaStr = txt(dados.semana);
    var alvoTs = _semanaInicioTs(semanaStr);
    if (alvoTs === null) return responderJSON({ status: 'erro', mensagem: 'semana inválida (esperado DD/MM/YYYY a DD/MM/YYYY).' });
    var v = dados.valores && typeof dados.valores === 'object' ? dados.valores : null;
    if (!v) return responderJSON({ status: 'erro', mensagem: 'valores obrigatório.' });

    var aba = SpreadsheetApp.openById(aluno.idPlanilha).getSheetByName(ABA.REGISTROS);
    if (!aba) return responderJSON({ status: 'erro', mensagem: "'" + ABA.REGISTROS + "' não encontrada." });
    _garantirColunaOrigem(aba);

    var semana = _semanaStrParaISOs(semanaStr);
    var mesExt = _mesPorExtenso(semana.fim);
    var dataRegistro = Utilities.formatDate(new Date(), 'GMT-3', 'dd/MM/yyyy');
    var c = function (chave) { return (v[chave] === undefined || v[chave] === null) ? '' : v[chave]; };

    var matrix = aba.getDataRange().getValues();
    var linhaExistente = -1;
    for (var i = 1; i < matrix.length; i++) {
      if (_semanaInicioTs(matrix[i][COL_REG.SEMANA]) === alvoTs) { linhaExistente = i; break; }
    }

    if (linhaExistente !== -1) {
      var origemAtual = txt(matrix[linhaExistente][COL_REG.ORIGEM]);
      if (origemAtual === ORIGEM_REG.REVISADO || origemAtual === ORIGEM_REG.MANUAL) {
        return responderJSON({ status: 'sucesso', resultado: 'preservado', origem: origemAtual });
      }
    }

    var nova = [];
    for (var k = 0; k < COL_REG_TOTAL; k++) nova[k] = linhaExistente !== -1 ? matrix[linhaExistente][k] : '';
    if (linhaExistente === -1) {
      nova[COL_REG.SEMANA] = semanaStr;
      nova[COL_REG.MES] = mesExt;
      nova[COL_REG.DATA] = dataRegistro;
    }
    nova[COL_REG.META] = c('META');
    nova[COL_REG.HORAS] = c('HORAS');
    nova[COL_REG.DOMINIO_TOTAL] = c('DOMINIO_TOTAL');
    nova[COL_REG.PROGRESSO_TOTAL] = c('PROGRESSO_TOTAL');
    nova[COL_REG.REVISOES] = c('REVISOES');
    nova[COL_REG.ESTRESSE] = c('ESTRESSE');
    nova[COL_REG.ANSIEDADE] = c('ANSIEDADE');
    nova[COL_REG.MOTIVACAO] = c('MOTIVACAO');
    nova[COL_REG.SONO] = c('SONO');
    nova[COL_REG.DOM_BIO] = c('DOM_BIO');   nova[COL_REG.PROG_BIO] = c('PROG_BIO');
    nova[COL_REG.DOM_QUI] = c('DOM_QUI');   nova[COL_REG.PROG_QUI] = c('PROG_QUI');
    nova[COL_REG.DOM_FIS] = c('DOM_FIS');   nova[COL_REG.PROG_FIS] = c('PROG_FIS');
    nova[COL_REG.DOM_MAT] = c('DOM_MAT');   nova[COL_REG.PROG_MAT] = c('PROG_MAT');
    nova[COL_REG.ORIGEM] = ORIGEM_REG.AUTO;
    nova[COL_REG.DIAS_ESTUDO] = c('DIAS_ESTUDO');
    nova[COL_REG.DIAS_PLANEJADOS] = c('DIAS_PLANEJADOS');
    nova[COL_REG.QUESTOES] = c('QUESTOES');

    if (linhaExistente !== -1) {
      aba.getRange(linhaExistente + 1, 1, 1, nova.length).setValues([nova]);
    } else {
      // append na 1ª linha vazia da coluna A (como o cron)
      var colA = aba.getRange(1, 1, aba.getMaxRows(), 1).getValues();
      var ultima = 0;
      for (var j = colA.length - 1; j >= 0; j--) {
        if (String(colA[j][0]).trim() !== '') { ultima = j + 1; break; }
      }
      aba.getRange(ultima + 1, 1, 1, nova.length).setValues([nova]);
    }
    _atualizarCacheUltimoRegistro(aluno.idPlanilha, aba);
    return responderJSON({ status: 'sucesso', resultado: linhaExistente !== -1 ? 'atualizado' : 'criado' });
  } catch (e) {
    try { registrarErro(e, 'handleUpsertRegistroSemanal ' + JSON.stringify({ email: dados && dados.email, semana: dados && dados.semana })); } catch (_) {}
    return responderJSON({ status: 'erro', mensagem: e.message });
  } finally { lock.releaseLock(); }
}

// Cria o aluno do Base na plataforma (linha na BD_Alunos + planilha do
// modelo), SEM e-mail de onboarding. Idempotente: e-mail já ativo → devolve
// o que existe. status_app = 'Base' (fora do cron do BigQuery).
// dados: { email, nome, tipoAluno? }
function handleProvisionarAlunoBase(dados) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var email = emailNorm(dados.email);
    var nome = txt(dados.nome);
    if (!email || !nome) return responderJSON({ status: 'erro', mensagem: 'email e nome obrigatórios.' });
    var existente = _acharAlunoAtivoPorEmail(email);
    if (existente) return responderJSON({ status: 'sucesso', resultado: 'existente', idPlanilha: existente.idPlanilha, temMentor: !!existente.mentor });

    var pasta = DriveApp.getFolderById(ID_PASTA_TRIAGEM);
    var modelo = DriveApp.getFileById(ID_PLANILHA_MODELO);
    var novo = _retryDrive(function () { return modelo.makeCopy('Mentoria - ' + nome, pasta); });
    var idPlanilha = novo.getId();

    var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA.MESTRE);
    var linha = [];
    var total = aba.getLastColumn();
    for (var k = 0; k < total; k++) linha[k] = '';
    linha[COL_MESTRE.TIMESTAMP] = new Date();
    linha[COL_MESTRE.NOME] = nome;
    linha[COL_MESTRE.EMAIL] = email;
    linha[COL_MESTRE.ID_PLANILHA] = idPlanilha;
    linha[COL_MESTRE.STATUS_ONBOARDING] = 'Onboarding Completo';
    linha[COL_MESTRE.TIPO_ALUNO] = txt(dados.tipoAluno) || 'ENEM';
    linha[COL_MESTRE.STATUS_APP] = (typeof STATUS_APP !== 'undefined' && STATUS_APP.BASE) || 'Base';
    linha[COL_MESTRE.PLATAFORMA_ONLINE] = 'Intento Base';
    aba.appendRow(linha);
    return responderJSON({ status: 'sucesso', resultado: 'criado', idPlanilha: idPlanilha, temMentor: false });
  } catch (e) {
    try { registrarErro(e, 'handleProvisionarAlunoBase ' + (dados && dados.email)); } catch (_) {}
    return responderJSON({ status: 'erro', mensagem: e.message });
  } finally { lock.releaseLock(); }
}

// O que o mentor definiu pro aluno, pro Base mostrar: mentor, plano, meta,
// grade da semana padrão (16×7) e o diário de bordo SEM notas privadas.
// dados: { email }
function handleBuscarMentoriaAluno(dados) {
  try {
    var aluno = _acharAlunoAtivoPorEmail(dados.email);
    if (!aluno) return responderJSON({ status: 'erro', codigo: 'nao_encontrado', mensagem: 'Aluno não encontrado na plataforma.' });
    var resposta = { status: 'sucesso', modo: aluno.mentor ? 'mentoria' : 'solo', mentor: null, plano: aluno.plano || null, metaHorasSemanal: null, semana: null, diarios: [] };
    if (aluno.mentor) {
      var nomeMentor = null;
      try { var ativos = lerMentoresAtivos(); if (ativos[aluno.mentor]) nomeMentor = ativos[aluno.mentor].nome || null; } catch (_) {}
      resposta.mentor = { email: aluno.mentor, nome: nomeMentor };
    }
    if (!aluno.idPlanilha) return responderJSON(resposta);
    var ss = SpreadsheetApp.openById(aluno.idPlanilha);

    var abaSem = ss.getSheetByName(ABA.SEMANA);
    if (abaSem) {
      resposta.semana = abaSem.getRange('B2:H17').getValues();
      var meta = abaSem.getRange('B19').getValue();
      resposta.metaHorasSemanal = (meta === '' || meta === null) ? null : meta;
    }

    var abaDiario = ss.getSheetByName(ABA.ENCONTROS);
    if (abaDiario) {
      var m = abaDiario.getDataRange().getValues();
      for (var i = m.length - 1; i >= 1; i--) {
        var r = m[i];
        if (!r[COL_ENC.DATA]) continue;
        var checks = [false, false, false, false, false], checksEm = null;
        try {
          var cj = txt(r[COL_ENC.CHECKS]);
          if (cj) { var obj = JSON.parse(cj); if (obj && Array.isArray(obj.c)) checks = obj.c.map(function (x) { return x === true; }); checksEm = obj && obj.em ? obj.em : null; }
        } catch (_) {}
        resposta.diarios.push({
          data: normalizarData(r[COL_ENC.DATA]),
          autoavaliacao: num(r[COL_ENC.AUTOAVALIACAO], null),
          vitorias: txt(r[COL_ENC.VITORIAS]),
          desafios: txt(r[COL_ENC.DESAFIOS]),
          categoria: txt(r[COL_ENC.CATEGORIA]),
          meta: txt(r[COL_ENC.META]),
          exploracao: txt(r[COL_ENC.EXPLORACAO]),
          acoes: [txt(r[COL_ENC.ACAO_1]), txt(r[COL_ENC.ACAO_2]), txt(r[COL_ENC.ACAO_3]), txt(r[COL_ENC.ACAO_4]), txt(r[COL_ENC.ACAO_5])],
          resultados: [txt(r[COL_ENC.RESULTADO_1]), txt(r[COL_ENC.RESULTADO_2]), txt(r[COL_ENC.RESULTADO_3]), txt(r[COL_ENC.RESULTADO_4]), txt(r[COL_ENC.RESULTADO_5])],
          statusMetasAnteriores: txt(r[COL_ENC.STATUS_METAS_ANTERIORES]),
          checksAluno: checks,
          checksAlunoEm: checksEm
          // NOTAS_PRIVADAS: nunca.
        });
        if (resposta.diarios.length >= 12) break;
      }
    }
    return responderJSON(resposta);
  } catch (e) {
    try { registrarErro(e, 'handleBuscarMentoriaAluno ' + (dados && dados.email)); } catch (_) {}
    return responderJSON({ status: 'erro', mensagem: e.message });
  }
}

// Checks do plano do último encontro, vindos do Base (o aluno marcou no app).
// Resolve a planilha e a linha ativa e reaproveita handleSalvarChecksPlano
// (que exige papel 'aluno' — o e-mail é o do próprio aluno).
// dados: { email, checks: [bool×5] }
function handleSalvarChecksPlanoBase(dados) {
  try {
    var aluno = _acharAlunoAtivoPorEmail(dados.email);
    if (!aluno || !aluno.idPlanilha) return responderJSON({ status: 'erro', codigo: 'nao_encontrado', mensagem: 'Aluno não encontrado na plataforma.' });
    var abaDiario = SpreadsheetApp.openById(aluno.idPlanilha).getSheetByName(ABA.ENCONTROS);
    if (!abaDiario) return responderJSON({ status: 'erro', mensagem: 'Sem diário de bordo.' });
    var m = abaDiario.getDataRange().getValues();
    var linhaAtiva = -1;
    for (var i = m.length - 1; i >= 1; i--) { if (m[i][COL_ENC.DATA]) { linhaAtiva = i + 1; break; } }
    if (linhaAtiva === -1) return responderJSON({ status: 'erro', mensagem: 'Nenhum encontro registrado.' });
    // handleSalvarChecksPlano espera os checks ALINHADOS às ações não-vazias;
    // o Base manda os 5 brutos → filtra pelas posições preenchidas.
    var row = m[linhaAtiva - 1];
    var brutas = [row[COL_ENC.ACAO_1], row[COL_ENC.ACAO_2], row[COL_ENC.ACAO_3], row[COL_ENC.ACAO_4], row[COL_ENC.ACAO_5]];
    var checks = Array.isArray(dados.checks) ? dados.checks : [];
    var filtrados = [];
    for (var p = 0; p < 5; p++) if (txt(brutas[p]) !== '') filtrados.push(checks[p] === true);
    return handleSalvarChecksPlano({ email: aluno.email, idPlanilha: aluno.idPlanilha, linha: linhaAtiva, checks: filtrados });
  } catch (e) {
    try { registrarErro(e, 'handleSalvarChecksPlanoBase ' + (dados && dados.email)); } catch (_) {}
    return responderJSON({ status: 'erro', mensagem: e.message });
  }
}

// Avisa o Base que o vínculo mudou (chamar ao fim de handleDesignarMentor com
// modo 'mentoria' e de handleInativarAluno / remoção de mentor com 'solo').
// Script Properties: BASE_URL (ex.: https://intento-base-drab.vercel.app) e
// INTEGRACAO_TOKEN (o mesmo que está nas envs do Base). Nunca lança: falha
// vira log; o Base reconcilia depois.
function _avisarBaseVinculo(email, modo, mentorEmail, mentorNome, plano, idPlanilha) {
  try {
    var props = PropertiesService.getScriptProperties();
    var base = props.getProperty('BASE_URL');
    var token = props.getProperty('INTEGRACAO_TOKEN');
    if (!base || !token) { Logger.log('_avisarBaseVinculo: BASE_URL/INTEGRACAO_TOKEN ausentes — pulando'); return; }
    var payload = { email: email, modo: modo, mentor_email: mentorEmail || null, mentor_nome: mentorNome || null, plano: plano || null, id_planilha: idPlanilha || null };
    var res = UrlFetchApp.fetch(base.replace(/\/$/, '') + '/api/integracao/vinculo', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-integracao-token': token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    Logger.log('_avisarBaseVinculo ' + email + ' → HTTP ' + res.getResponseCode());
  } catch (e) {
    Logger.log('_avisarBaseVinculo EXCEPTION: ' + e.message);
  }
}
