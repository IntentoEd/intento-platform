/**
 * Smoke test manual — rodar no editor GAS (Run → smokeTest)
 * após cada `clasp push`. Valida apenas LEITURAS — writes são
 * testadas manualmente na UI pra não sujar dados.
 */

const SMOKE_EMAIL_LIDER = 'filippe@metodointento.com.br';
const SMOKE_EMAIL_NAO_AUTH = 'teste.nao.autorizado@example.com';

function smokeTest() {
  Logger.log('===== SMOKE TEST =====');
  var ok = 0, ko = 0, sk = 0;

  function check(nome, fn) {
    try {
      var r = fn();
      if (r === true) { Logger.log('✓ ' + nome); ok++; return; }
      if (typeof r === 'string' && r.indexOf('SKIP') >= 0) {
        Logger.log('⏭ ' + nome + ' — ' + r);
        sk++; return;
      }
      Logger.log('✗ ' + nome + ' — ' + r); ko++;
    } catch (e) {
      Logger.log('✗ ' + nome + ' — EXCEPTION: ' + e.message);
      ko++;
    }
  }

  // 1) handleLoginGlobal com email do líder
  check('handleLoginGlobal(filippe) retorna rota', function() {
    var data = JSON.parse(handleLoginGlobal({ email: SMOKE_EMAIL_LIDER }).getContent());
    if (!data.rota) return 'rota ausente: ' + JSON.stringify(data);
    Logger.log('  → rota=' + data.rota + ' perfil=' + data.perfil);
    return true;
  });

  // 2) handleListaAlunosMentor retorna array
  check('handleListaAlunosMentor retorna { alunos: [...] }', function() {
    var data = JSON.parse(handleListaAlunosMentor({ email: SMOKE_EMAIL_LIDER }).getContent());
    if (!Array.isArray(data.alunos)) return 'alunos não é array: ' + JSON.stringify(data);
    Logger.log('  → ' + data.alunos.length + ' alunos');
    return true;
  });

  // 3) handleDashboardLider autoriza líder — modo rápido (skipAgregado)
  check('handleDashboardLider autoriza filippe (rápido)', function() {
    if (typeof handleDashboardLider !== 'function') return 'ainda não implementado — SKIP';
    var data = JSON.parse(handleDashboardLider({ email: SMOKE_EMAIL_LIDER, skipAgregado: true }).getContent());
    if (data.status !== 'sucesso') return JSON.stringify(data);
    if (!Array.isArray(data.alunos)) return 'estrutura incorreta';
    Logger.log('  → ' + data.alunos.length + ' alunos · semana=' + data.semanaAtual);
    return true;
  });

  // 4) handleDashboardLider nega email não autorizado
  check('handleDashboardLider nega email não autorizado', function() {
    if (typeof handleDashboardLider !== 'function') return 'pré Tarefa 5 — SKIP';
    var data = JSON.parse(handleDashboardLider({ email: SMOKE_EMAIL_NAO_AUTH }).getContent());
    if (data.status !== 'erro' && data.codigo !== 403) return 'esperado erro: ' + JSON.stringify(data);
    return true;
  });

  // 5) doPost rejeita ação desconhecida
  check('doPost rejeita ação desconhecida', function() {
    var raw = doPost({ postData: { contents: JSON.stringify({ acao: 'acao_inexistente_xyz' }) } });
    var data = JSON.parse(raw.getContent());
    if (data.status !== 'erro') return 'esperado erro: ' + JSON.stringify(data);
    return true;
  });

  // 6) BD_Mentores tem ao menos o líder cadastrado como Ativo
  check('BD_Mentores tem ao menos 1 mentor ativo (filippe)', function() {
    var map = lerMentoresAtivos();
    if (Object.keys(map).length === 0) return 'aba BD_Mentores vazia ou inexistente';
    if (!map[SMOKE_EMAIL_LIDER]) return 'filippe não cadastrado em BD_Mentores como Ativo';
    Logger.log('  → ' + Object.keys(map).length + ' mentores ativos · filippe.nome=' + map[SMOKE_EMAIL_LIDER].nome);
    return true;
  });

  Logger.log('===== ' + ok + ' OK · ' + sk + ' SKIP · ' + ko + ' FALHAS =====');
}

/**
 * Diagnóstico manual: testa atualizarCacheMestre isoladamente com o
 * primeiro aluno do filippe. Rode no editor → Run → testCacheMestre
 * e cole os logs aqui. NÃO PREENCHE DADOS REAIS — usa 'TESTE_DIAGNOSTICO'.
 */
function testCacheMestre() {
  Logger.log('===== TEST CACHE MESTRE =====');
  var data = JSON.parse(handleListaAlunosMentor({ email: SMOKE_EMAIL_LIDER }).getContent());
  if (!Array.isArray(data.alunos) || data.alunos.length === 0) {
    Logger.log('FAIL: sem alunos do filippe'); return;
  }
  var alunoTeste = data.alunos[0];
  Logger.log('aluno alvo: ' + alunoTeste.nome + ' · id=' + alunoTeste.id);

  atualizarCacheMestre(alunoTeste.id, {
    ULTIMA_DATA_REGISTRO:   'TESTE_DIAGNOSTICO',
    ULTIMA_SEMANA_REGISTRO: 'TESTE_DIAGNOSTICO'
  });
  Logger.log('===== FIM — verifique a aba Cache_Alunos · linha do ' + alunoTeste.nome + ' =====');
}

/**
 * Smoke test COMPLETO — inclui agregação real do dashboardLider (caro: ~80s
 * com 39 alunos). Use este antes de releases ou quando suspeitar de
 * regressão de performance.
 */
function smokeTestCompleto() {
  smokeTest();
  Logger.log('===== SMOKE COMPLETO (com agregado pesado) =====');
  var t0 = new Date().getTime();
  try {
    var data = JSON.parse(handleDashboardLider({ email: SMOKE_EMAIL_LIDER }).getContent());
    var dt = ((new Date().getTime() - t0) / 1000).toFixed(1);
    if (data.status === 'sucesso' && data.agregado) {
      Logger.log('✓ dashboardLider completo (' + dt + 's) · ' + data.alunos.length + ' alunos');
    } else {
      Logger.log('✗ dashboardLider completo: ' + JSON.stringify(data).slice(0, 200));
    }
  } catch (e) {
    Logger.log('✗ dashboardLider completo EXCEPTION: ' + e.message);
  }
}

/**
 * Util de migração — roda 1× pra renomear abas legacy nas planilhas
 * individuais (lowercase → TitleCase). Idempotente: pode rodar 2×.
 * Não mexe nas constantes ABA do código — produção continua funcionando
 * com os nomes antigos até o próximo push.
 */
function renomearAbasAlunos() {
  Logger.log('===== RENAME ABAS DAS PLANILHAS INDIVIDUAIS =====');
  var renomes = {
    'BD_onboarding':  'BD_Onboarding',
    'BD_diagnostico': 'BD_Diagnostico',
    'BD_semana':      'BD_Semana',
    'BD_caderno':     'BD_Caderno'
  };

  var abaMestre = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA.MESTRE);
  if (!abaMestre) { Logger.log('FAIL: aba mestre não encontrada'); return; }
  var matriz = abaMestre.getDataRange().getValues();
  var totalAlunos = 0, totalRenomes = 0, totalErros = 0;

  for (var i = 1; i < matriz.length; i++) {
    var idPlanilha = txt(matriz[i][COL_MESTRE.ID_PLANILHA]);
    if (!idPlanilha) continue;
    var nomeAluno = txt(matriz[i][COL_MESTRE.NOME]) || '<sem nome>';
    totalAlunos++;

    try {
      var ss = SpreadsheetApp.openById(idPlanilha);
      var renomesDesteAluno = 0;
      Object.keys(renomes).forEach(function(antigo) {
        var aba = ss.getSheetByName(antigo);
        if (aba) { aba.setName(renomes[antigo]); renomesDesteAluno++; totalRenomes++; }
      });
      if (renomesDesteAluno > 0) Logger.log('✓ ' + nomeAluno + ' (' + renomesDesteAluno + ' abas)');
    } catch (e) {
      Logger.log('✗ ' + nomeAluno + ' — ' + e.message);
      totalErros++;
    }
  }

  Logger.log('===== TOTAL: ' + totalAlunos + ' alunos · ' + totalRenomes + ' abas renomeadas · ' + totalErros + ' erros =====');
}

/**
 * Diagnóstico manual: testa atualizarCacheMestre pra coluna ULTIMO_ENCONTRO (BK).
 * Rode no editor → Run → testCacheEncontro.
 */
function testCacheEncontro() {
  Logger.log('===== TEST CACHE ENCONTRO =====');
  var data = JSON.parse(handleListaAlunosMentor({ email: SMOKE_EMAIL_LIDER }).getContent());
  if (!Array.isArray(data.alunos) || data.alunos.length === 0) {
    Logger.log('FAIL: sem alunos do filippe'); return;
  }
  var alunoTeste = data.alunos[0];
  Logger.log('aluno alvo: ' + alunoTeste.nome + ' · id=' + alunoTeste.id);

  atualizarCacheMestre(alunoTeste.id, {
    ULTIMO_ENCONTRO: 'TESTE_ENCONTRO'
  });
  Logger.log('===== FIM — verifique a aba Cache_Alunos · ultimo_encontro do ' + alunoTeste.nome + ' =====');
}
