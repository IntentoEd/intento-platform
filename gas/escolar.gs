// =====================================================================
// ESCOLAR — Provas (Ciclo de Provas: EM escolar + ENEM vestibular)
// =====================================================================
// Domínio: Filippe (mentoria/escolar). Tudo de BD_Avaliacoes (provas
// escolares e vestibulares — aluno EM pode ter os dois sabores; aluno ENEM
// só vestibular) + enriquecimento da listaAlunosMentor com próxima prova.
//
// Escrita aberta ao PRÓPRIO aluno com travas:
//   - cadastro: sem nota e sem substituiId (nota entra no fluxo de resultado);
//   - editar/deletar: só prova SEM nota lançada (nota lançada = só mentor/líder);
//   - o aluno só alcança provas dele mesmo (email do token vs aluno.email).
//
// Constantes globais (COL_AV, TIPOS_AVAL, TIPOS_AVAL_ENEM, MATERIAS_EM)
// permanecem em Code.gs por design.


// =====================================================================
// HELPERS DE AVALIAÇÃO
// =====================================================================

// Localiza avaliação por id. Retorna { linha, row, idAluno } ou linha=-1.
function _acharAvaliacaoPorId(idAv) {
  var ssMestre = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ssMestre.getSheetByName(ABA.AVALIACOES);
  if (!aba) throw new Error('BD_Avaliacoes não encontrada — rode migrarBDAvaliacoesFacSimile()');
  var matriz = aba.getDataRange().getValues();
  for (var i = 1; i < matriz.length; i++) {
    if (txt(matriz[i][COL_AV.ID]) === idAv) {
      return { linha: i + 1, row: matriz[i], idAluno: txt(matriz[i][COL_AV.ID_ALUNO]), aba: aba };
    }
  }
  return { linha: -1 };
}

// Tipos válidos por aluno. O sabor é da PROVA (derivado do tipo — os dois
// vocabulários são disjuntos): aluno EM aceita os dois sabores na mesma lista
// (prova escolar + vestibular, caso do 3º ano); aluno ENEM só vestibular.
function _tiposAvalPara(tipoAluno) {
  return tipoAluno === 'EM' ? TIPOS_AVAL.concat(TIPOS_AVAL_ENEM) : TIPOS_AVAL_ENEM;
}

// Prova escolar (tipo em TIPOS_AVAL) aceita nota 0-10; fase de vestibular não.
function _ehTipoEscolar(tipo) {
  return TIPOS_AVAL.indexOf(tipo) !== -1;
}

// Valida uma avaliação a cadastrar. Retorna { ok, erro?, normalizada? }
// tipoAluno decide o conjunto de tipos válidos; nota só existe em prova escolar.
function _validarAvaliacao(av, idx, tipoAluno) {
  var prefix = 'avaliação #' + (idx + 1) + ': ';
  var dataStr = txt(av && av.data);
  if (!dataStr) return { ok: false, erro: prefix + 'data obrigatória' };
  var dataObj = new Date(dataStr);
  if (isNaN(dataObj.getTime())) return { ok: false, erro: prefix + 'data inválida' };

  var materia = txt(av.materia);
  if (!materia) return { ok: false, erro: prefix + 'matéria obrigatória' };

  var tiposValidos = _tiposAvalPara(tipoAluno);
  var tipo = txt(av.tipo);
  if (tiposValidos.indexOf(tipo) === -1) {
    return { ok: false, erro: prefix + 'tipo inválido (esperado: ' + tiposValidos.join(', ') + ')' };
  }

  var nota = '';
  if (av.nota !== undefined && av.nota !== null && av.nota !== '') {
    if (!_ehTipoEscolar(tipo)) return { ok: false, erro: prefix + 'nota 0-10 não se aplica a vestibular' };
    var n = Number(av.nota);
    if (isNaN(n) || n < 0 || n > 10) return { ok: false, erro: prefix + 'nota deve ser número entre 0 e 10' };
    nota = n;
  }

  return {
    ok: true,
    normalizada: {
      data: dataObj,
      materia: materia,
      tipo: tipo,
      observacao: txt(av.observacao),
      nota: nota,
      substituiId: txt(av.substituiId)
    }
  };
}


// =====================================================================
// ENRIQUECIMENTO CROSS-DOMAIN
// =====================================================================

// Anexa { proximaProva: { data, materia, dias } | null } a cada aluno da lista
// (EM: prova escolar; ENEM: vestibular). Lê BD_Avaliacoes 1x e cruza in-memory.
// Chamado por handleListaAlunosMentor (em Code.gs) via namespace global.
function _enriquecerComProximaProva(alunos) {
  var ids = alunos.map(function(a) { return a.id; });
  if (ids.length === 0) return;

  var ssMestre = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ssMestre.getSheetByName(ABA.AVALIACOES);
  if (!aba) return;
  var lastRow = aba.getLastRow();
  if (lastRow < 2) return;

  var matriz = aba.getRange(2, 1, lastRow - 1, 9).getValues();
  var hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  var proxima = {}; // idAluno -> { data: Date, materia: string }
  for (var i = 0; i < matriz.length; i++) {
    var idA = txt(matriz[i][COL_AV.ID_ALUNO]);
    if (ids.indexOf(idA) === -1) continue;
    var d = matriz[i][COL_AV.DATA] instanceof Date ? matriz[i][COL_AV.DATA] : new Date(matriz[i][COL_AV.DATA]);
    if (isNaN(d.getTime())) continue;
    // Truncar à meia-noite local: as datas são gravadas ao meio-dia (front),
    // e comparar timestamp cheio contra `hoje` truncado + Math.ceil fazia a
    // prova de HOJE contar como dias=1 ("amanhã") na lista /mentor.
    d = new Date(d); d.setHours(0, 0, 0, 0);
    if (d < hoje) continue;
    if (!proxima[idA] || d < proxima[idA].data) {
      proxima[idA] = { data: d, materia: txt(matriz[i][COL_AV.MATERIA]) };
    }
  }

  alunos.forEach(function(a) {
    var p = proxima[a.id];
    if (p) {
      // Math.round (não ceil): com ambos à meia-noite a diferença é múltiplo
      // de 24h, exceto em virada de horário de verão (23h/25h).
      var dias = Math.round((p.data - hoje) / (1000 * 60 * 60 * 24));
      a.proximaProva = { data: p.data.toISOString(), materia: p.materia, dias: dias };
    }
  });
}


// =====================================================================
// HANDLERS DE AVALIAÇÃO
// =====================================================================

// Cadastra 1+ avaliações em batch transacional.
// Input: { email, idAluno, avaliacoes: [{data, materia, tipo, observacao?, nota?}, ...] }
// Auth: líder, mentor responsável ou o PRÓPRIO aluno.
// Trava do aluno: cadastro sem nota e sem substituiId (conceitos do mentor).
function handleCadastrarAvaliacoes(dados) {
  try {
    var emailRequester = emailNorm(dados.email);
    // Guard duro: sem email, '' === '' passaria como "mentor" de aluno sem mentor.
    if (!emailRequester) return responderJSON({ status: 'erro', codigo: 403, mensagem: 'requester sem email' });
    var idAluno = txt(dados.idAluno);
    var lista = Array.isArray(dados.avaliacoes) ? dados.avaliacoes : [];
    if (!idAluno) return responderJSON({ status: 'erro', mensagem: 'idAluno obrigatório' });
    if (lista.length === 0) return responderJSON({ status: 'erro', mensagem: 'avaliacoes vazia' });

    var aluno = _acharAlunoPorId(idAluno);
    if (aluno.linha === -1) return responderJSON({ status: 'erro', mensagem: 'aluno não encontrado' });

    var ehProprioAluno = !!emailRequester && emailRequester === aluno.email;
    if (!_ehLider(emailRequester) && emailRequester !== aluno.mentor && !ehProprioAluno) {
      return responderJSON({ status: 'erro', codigo: 403, mensagem: 'apenas líder, mentor responsável ou o próprio aluno' });
    }

    // Valida TODAS antes de gravar (transacional)
    var normalizadas = [];
    for (var i = 0; i < lista.length; i++) {
      if (ehProprioAluno) {
        var temNota = lista[i] && lista[i].nota !== undefined && lista[i].nota !== null && lista[i].nota !== '';
        if (temNota) return responderJSON({ status: 'erro', mensagem: 'avaliação #' + (i + 1) + ': aluno cadastra sem nota — ela entra depois, no resultado', indice: i });
        if (txt(lista[i] && lista[i].substituiId)) return responderJSON({ status: 'erro', mensagem: 'avaliação #' + (i + 1) + ': vínculo de recuperação é feito pelo mentor', indice: i });
      }
      var v = _validarAvaliacao(lista[i], i, aluno.tipoAluno);
      if (!v.ok) return responderJSON({ status: 'erro', mensagem: v.erro, indice: i });
      normalizadas.push(v.normalizada);
    }

    var ssMestre = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ssMestre.getSheetByName(ABA.AVALIACOES);
    if (!aba) throw new Error('BD_Avaliacoes não encontrada — rode migrarBDAvaliacoesFacSimile()');

    var agora = new Date();
    var idsCriados = [];
    var rows = normalizadas.map(function(n) {
      var id = 'av_' + agora.getTime() + '_' + Math.floor(Math.random() * 100000);
      idsCriados.push(id);
      var row = new Array(11).fill('');
      row[COL_AV.ID]            = id;
      row[COL_AV.ID_ALUNO]      = idAluno;
      row[COL_AV.DATA]          = n.data;
      row[COL_AV.MATERIA]       = n.materia;
      row[COL_AV.TIPO]          = n.tipo;
      row[COL_AV.OBSERVACAO]    = n.observacao;
      row[COL_AV.NOTA]          = n.nota;
      row[COL_AV.CRIADO_POR]    = emailRequester;
      row[COL_AV.CRIADO_EM]     = agora;
      row[COL_AV.SUBSTITUI_ID]  = n.substituiId;
      // Cadastro que já vem com nota (mentor importando prova passada) nasce com
      // resultado registrado — senão cairia na fila "A registrar" já resolvida.
      row[COL_AV.RESULTADO_EM]  = n.nota !== '' ? agora : '';
      return row;
    });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var startRow = aba.getLastRow() + 1;
      aba.getRange(startRow, 1, rows.length, 11).setValues(rows);
    } finally {
      // flush antes de soltar o lock: setValues é bufferizado e só commitaria
      // no fim da execução — depois do release, abrindo janela pra outra
      // request ler/mutar a planilha sem ver esta escrita.
      SpreadsheetApp.flush();
      lock.releaseLock();
    }

    return responderJSON({ status: 'sucesso', idsCriados: idsCriados, total: rows.length });
  } catch (e) {
    Logger.log('handleCadastrarAvaliacoes EXCEPTION: ' + e.message);
    return responderJSON({ status: 'erro', mensagem: e.message });
  }
}

// Lista avaliações de um aluno. Auth: líder, mentor responsável, ou o próprio aluno.
// Retorna ordenado por data ASC.
function handleListarAvaliacoesAluno(dados) {
  try {
    var emailRequester = emailNorm(dados.email);
    if (!emailRequester) return responderJSON({ status: 'erro', codigo: 403, mensagem: 'requester sem email' });
    var idAluno = txt(dados.idAluno);
    if (!idAluno) return responderJSON({ status: 'erro', mensagem: 'idAluno obrigatório' });

    var aluno = _acharAlunoPorId(idAluno);
    if (aluno.linha === -1) return responderJSON({ status: 'erro', mensagem: 'aluno não encontrado' });

    var autorizado = _ehLider(emailRequester) || emailRequester === aluno.mentor || emailRequester === aluno.email;
    if (!autorizado) return responderJSON({ status: 'erro', codigo: 403, mensagem: 'não autorizado' });

    var ssMestre = SpreadsheetApp.getActiveSpreadsheet();
    var aba = ssMestre.getSheetByName(ABA.AVALIACOES);
    if (!aba) {
      // Aba ainda não foi criada — devolve lista vazia em vez de erro.
      return responderJSON({ status: 'sucesso', avaliacoes: [] });
    }
    var lastRow = aba.getLastRow();
    if (lastRow < 2) return responderJSON({ status: 'sucesso', avaliacoes: [] });

    // lê 11 cols ou menos se a aba ainda não foi migrada com resultado_em
    var nCols = Math.min(11, aba.getLastColumn());
    var matriz = aba.getRange(2, 1, lastRow - 1, nCols).getValues();
    var lista = [];
    for (var i = 0; i < matriz.length; i++) {
      var r = matriz[i];
      if (txt(r[COL_AV.ID_ALUNO]) !== idAluno) continue;
      var dataObj = r[COL_AV.DATA] instanceof Date ? r[COL_AV.DATA] : new Date(r[COL_AV.DATA]);
      var resEm = nCols > COL_AV.RESULTADO_EM ? r[COL_AV.RESULTADO_EM] : '';
      var resEmObj = resEm instanceof Date ? resEm : (resEm ? new Date(resEm) : null);
      lista.push({
        id: txt(r[COL_AV.ID]),
        idAluno: idAluno,
        data: isNaN(dataObj.getTime()) ? '' : dataObj.toISOString(),
        materia: txt(r[COL_AV.MATERIA]),
        tipo: txt(r[COL_AV.TIPO]),
        observacao: txt(r[COL_AV.OBSERVACAO]),
        nota: r[COL_AV.NOTA] === '' || r[COL_AV.NOTA] === null ? null : Number(r[COL_AV.NOTA]),
        substituiId: nCols > COL_AV.SUBSTITUI_ID ? txt(r[COL_AV.SUBSTITUI_ID]) : '',
        criadoPor: emailNorm(r[COL_AV.CRIADO_POR]),
        resultadoEm: resEmObj && !isNaN(resEmObj.getTime()) ? resEmObj.toISOString() : null
      });
    }
    lista.sort(function(a, b) {
      return (a.data || '').localeCompare(b.data || '');
    });
    return responderJSON({ status: 'sucesso', avaliacoes: lista });
  } catch (e) {
    Logger.log('handleListarAvaliacoesAluno EXCEPTION: ' + e.message);
    return responderJSON({ status: 'erro', mensagem: e.message });
  }
}

// Atualiza campos de uma avaliação. Auth: líder, mentor responsável ou o
// PRÓPRIO aluno (este só em prova SEM nota lançada, e sem tocar substituiId).
// resultado_em é setado APENAS por ação explícita: nota não-vazia chegando,
// ou flag resultadoRegistrado:true ("sem nota divulgada" / relato do aluno).
// resultadoRegistrado:false limpa (desfazer). Editar observacao NÃO fecha ciclo.
// Lock obrigatório: deleteRow concorrente shifta índices; sem lock, update pode
// gravar na linha errada se outra request deletou nesse meio-tempo.
function handleAtualizarAvaliacao(dados) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var emailRequester = emailNorm(dados.email);
    if (!emailRequester) return responderJSON({ status: 'erro', codigo: 403, mensagem: 'requester sem email' });
    var idAv = txt(dados.idAvaliacao);
    if (!idAv) return responderJSON({ status: 'erro', mensagem: 'idAvaliacao obrigatório' });

    var av = _acharAvaliacaoPorId(idAv);
    if (av.linha === -1) return responderJSON({ status: 'erro', mensagem: 'essa prova já foi removida' });

    var aluno = _acharAlunoPorId(av.idAluno);
    if (aluno.linha === -1) return responderJSON({ status: 'erro', mensagem: 'aluno da avaliação não encontrado' });

    var ehProprioAluno = emailRequester === aluno.email;
    var ehMentorOuLider = _ehLider(emailRequester) || emailRequester === aluno.mentor;
    if (!ehMentorOuLider && !ehProprioAluno) {
      return responderJSON({ status: 'erro', codigo: 403, mensagem: 'apenas líder, mentor responsável ou o próprio aluno' });
    }

    var notaAtual = av.row[COL_AV.NOTA];
    var temNotaLancada = notaAtual !== '' && notaAtual !== null && notaAtual !== undefined;
    if (ehProprioAluno && !ehMentorOuLider) {
      if (temNotaLancada) {
        return responderJSON({ status: 'erro', codigo: 403, mensagem: 'prova com nota lançada só pode ser alterada pelo mentor' });
      }
      if (Object.prototype.hasOwnProperty.call(dados, 'substituiId')) {
        return responderJSON({ status: 'erro', codigo: 403, mensagem: 'vínculo de recuperação é feito pelo mentor' });
      }
    }

    var atualizacoes = [];
    // Sabor da prova pós-update: se o tipo está sendo trocado nesta chamada,
    // o guard de nota abaixo tem que valer pro tipo NOVO, não pro gravado.
    var tipoEfetivo = txt(av.row[COL_AV.TIPO]);
    if (Object.prototype.hasOwnProperty.call(dados, 'data')) {
      var d = new Date(txt(dados.data));
      if (isNaN(d.getTime())) return responderJSON({ status: 'erro', mensagem: 'data inválida' });
      atualizacoes.push({ col: COL_AV.DATA + 1, valor: d });
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'materia')) {
      var m = txt(dados.materia);
      if (!m) return responderJSON({ status: 'erro', mensagem: 'matéria não pode ser vazia' });
      atualizacoes.push({ col: COL_AV.MATERIA + 1, valor: m });
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'tipo')) {
      var t = txt(dados.tipo);
      // Tipo repetido passa sem validar: se o aluno trocou de sabor (EM→ENEM)
      // depois da prova existir, travar aqui deixaria a linha legada ineditável.
      if (t !== txt(av.row[COL_AV.TIPO]) && _tiposAvalPara(aluno.tipoAluno).indexOf(t) === -1) {
        return responderJSON({ status: 'erro', mensagem: 'tipo inválido' });
      }
      atualizacoes.push({ col: COL_AV.TIPO + 1, valor: t });
      tipoEfetivo = t;
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'observacao')) {
      atualizacoes.push({ col: COL_AV.OBSERVACAO + 1, valor: txt(dados.observacao) });
    }
    var notaChegando = false;
    var notaLimpando = false;
    if (Object.prototype.hasOwnProperty.call(dados, 'nota')) {
      if (dados.nota === '' || dados.nota === null || dados.nota === undefined) {
        atualizacoes.push({ col: COL_AV.NOTA + 1, valor: '' });
        // Só conta como "limpar" se havia nota — o modal do mentor manda
        // nota:null sempre, e isso não pode desfazer um relato registrado.
        notaLimpando = temNotaLancada;
      } else {
        if (!_ehTipoEscolar(tipoEfetivo)) return responderJSON({ status: 'erro', mensagem: 'nota 0-10 não se aplica a vestibular' });
        var n = Number(dados.nota);
        if (isNaN(n) || n < 0 || n > 10) return responderJSON({ status: 'erro', mensagem: 'nota deve ser número entre 0 e 10' });
        atualizacoes.push({ col: COL_AV.NOTA + 1, valor: n });
        notaChegando = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(dados, 'substituiId')) {
      atualizacoes.push({ col: COL_AV.SUBSTITUI_ID + 1, valor: txt(dados.substituiId) });
    }

    var resultadoEmAtual = av.row.length > COL_AV.RESULTADO_EM ? av.row[COL_AV.RESULTADO_EM] : '';
    var temResultado = resultadoEmAtual !== '' && resultadoEmAtual !== null && resultadoEmAtual !== undefined;
    if (dados.resultadoRegistrado === false || (notaLimpando && dados.resultadoRegistrado !== true)) {
      // Apagar a nota devolve a prova pra fila "A registrar" — simétrico à estampagem.
      atualizacoes.push({ col: COL_AV.RESULTADO_EM + 1, valor: '' });
    } else if ((notaChegando || dados.resultadoRegistrado === true) && !temResultado) {
      atualizacoes.push({ col: COL_AV.RESULTADO_EM + 1, valor: new Date() });
    }

    if (atualizacoes.length === 0) return responderJSON({ status: 'erro', mensagem: 'nenhum campo pra atualizar' });

    for (var k = 0; k < atualizacoes.length; k++) {
      av.aba.getRange(av.linha, atualizacoes[k].col).setValue(atualizacoes[k].valor);
    }
    return responderJSON({ status: 'sucesso', idAvaliacao: idAv });
  } catch (e) {
    Logger.log('handleAtualizarAvaliacao EXCEPTION: ' + e.message);
    return responderJSON({ status: 'erro', mensagem: e.message });
  } finally {
    // flush antes de soltar o lock — escrita bufferizada tem que commitar
    // enquanto ainda somos os donos do lock (no-op se nada foi escrito).
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

// Deleta uma avaliação. Auth: líder, mentor responsável ou o PRÓPRIO aluno
// (este só em prova SEM nota lançada — o que entrou no boletim é do mentor).
// Lock obrigatório: deletes concorrentes shiftariam índices e poderiam apagar a linha errada.
function handleDeletarAvaliacao(dados) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var emailRequester = emailNorm(dados.email);
    if (!emailRequester) return responderJSON({ status: 'erro', codigo: 403, mensagem: 'requester sem email' });
    var idAv = txt(dados.idAvaliacao);
    if (!idAv) return responderJSON({ status: 'erro', mensagem: 'idAvaliacao obrigatório' });

    var av = _acharAvaliacaoPorId(idAv);
    if (av.linha === -1) return responderJSON({ status: 'erro', mensagem: 'essa prova já foi removida' });

    var aluno = _acharAlunoPorId(av.idAluno);
    if (aluno.linha === -1) return responderJSON({ status: 'erro', mensagem: 'aluno da avaliação não encontrado' });

    var ehProprioAluno = emailRequester === aluno.email;
    var ehMentorOuLider = _ehLider(emailRequester) || emailRequester === aluno.mentor;
    if (!ehMentorOuLider && !ehProprioAluno) {
      return responderJSON({ status: 'erro', codigo: 403, mensagem: 'apenas líder, mentor responsável ou o próprio aluno' });
    }
    if (ehProprioAluno && !ehMentorOuLider) {
      var notaAtual = av.row[COL_AV.NOTA];
      if (notaAtual !== '' && notaAtual !== null && notaAtual !== undefined) {
        return responderJSON({ status: 'erro', codigo: 403, mensagem: 'prova com nota lançada só pode ser removida pelo mentor' });
      }
    }

    av.aba.deleteRow(av.linha);
    return responderJSON({ status: 'sucesso', idAvaliacao: idAv });
  } catch (e) {
    Logger.log('handleDeletarAvaliacao EXCEPTION: ' + e.message);
    return responderJSON({ status: 'erro', mensagem: e.message });
  } finally {
    // flush antes de soltar o lock — deleteRow bufferizado commita ainda
    // sob o lock, senão outra request pode ler índices desatualizados.
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}


// =====================================================================
// MIGRATION ONE-SHOT (idempotente)
// =====================================================================

// One-shot idempotente: cria aba BD_Avaliacoes com headers se não existir;
// adiciona headers faltantes (ex: substitui_id, resultado_em) em deploys
// posteriores; backfilla resultado_em = criado_em nas provas antigas que já
// têm nota (senão a fila "A registrar" do mentor estreia poluída de legado).
// Rodar manualmente no editor do Apps Script após cada deploy que mexa no schema.
function migrarBDAvaliacoesFacSimile() {
  var ssMestre = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ssMestre.getSheetByName(ABA.AVALIACOES);
  var headers = ['id', 'id_aluno', 'data', 'materia', 'tipo', 'observacao', 'nota', 'criado_por', 'criado_em', 'substitui_id', 'resultado_em'];

  if (!aba) {
    aba = ssMestre.insertSheet(ABA.AVALIACOES);
    aba.appendRow(headers);
    aba.setFrozenRows(1);
    Logger.log('Aba ' + ABA.AVALIACOES + ' criada com ' + headers.length + ' headers');
    return;
  }

  // Aba já existe — verifica e adiciona headers faltantes ao final
  var lastCol = aba.getLastColumn();
  if (lastCol === 0) {
    aba.appendRow(headers);
    aba.setFrozenRows(1);
    Logger.log('Aba ' + ABA.AVALIACOES + ' existia vazia; headers adicionados');
    return;
  }
  var headerAtual = aba.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(h) { return String(h || '').trim().toLowerCase(); });
  // Header faltante entra na POSIÇÃO CANÔNICA (índice em `headers` = índice em
  // COL_AV), não no fim: se uma escrita pré-migração já populou a coluna de
  // dados, getLastColumn() a inclui e um append cairia uma coluna à direita,
  // desalinhando header e dados pra sempre.
  var adicionados = 0;
  for (var k = 0; k < headers.length; k++) {
    if (headerAtual.indexOf(headers[k]) !== -1) continue;
    var celula = k < headerAtual.length ? headerAtual[k] : '';
    if (celula === '') {
      aba.getRange(1, k + 1).setValue(headers[k]);
      if (k < headerAtual.length) headerAtual[k] = headers[k]; else headerAtual.push(headers[k]);
      adicionados++;
    } else {
      Logger.log('AVISO: coluna ' + (k + 1) + ' deveria ser "' + headers[k] + '" mas contém "' + celula + '" — resolver manualmente antes de seguir');
    }
  }
  if (adicionados > 0) {
    Logger.log('Aba ' + ABA.AVALIACOES + ': ' + adicionados + ' header(s) adicionado(s) ao final');
  } else {
    Logger.log('Aba ' + ABA.AVALIACOES + ' já existe com headers corretos.');
  }

  // Gate posicional: o backfill (e todos os handlers) leem/escrevem por ÍNDICE.
  // Se qualquer header canônico não estiver na sua coluna (ex: alguém inseriu
  // uma coluna manual no meio), escrever posicionalmente corromperia coluna
  // alheia em silêncio — abortar e resolver a planilha antes.
  for (var g = 0; g < headers.length; g++) {
    if (headerAtual[g] !== headers[g]) {
      Logger.log('ABORTADO antes do backfill: coluna ' + (g + 1) + ' deveria ser "' + headers[g] + '" mas contém "' + (headerAtual[g] || '') + '". Corrija os headers e rode de novo.');
      return;
    }
  }

  // Backfill: prova com nota e sem resultado_em ganha resultado_em = criado_em
  // (fallback: data da prova). Idempotente — só toca linhas com a célula vazia.
  var lastRow = aba.getLastRow();
  if (lastRow < 2) { Logger.log('Sem linhas pra backfill.'); return; }
  var matriz = aba.getRange(2, 1, lastRow - 1, 11).getValues();
  var backfilled = 0;
  for (var i = 0; i < matriz.length; i++) {
    var nota = matriz[i][COL_AV.NOTA];
    var resEm = matriz[i][COL_AV.RESULTADO_EM];
    if (nota !== '' && nota !== null && (resEm === '' || resEm === null)) {
      var base = matriz[i][COL_AV.CRIADO_EM] || matriz[i][COL_AV.DATA];
      var baseObj = base instanceof Date ? base : new Date(base);
      if (isNaN(baseObj.getTime())) baseObj = new Date();
      aba.getRange(i + 2, COL_AV.RESULTADO_EM + 1).setValue(baseObj);
      backfilled++;
    }
  }
  Logger.log('Backfill resultado_em: ' + backfilled + ' linha(s) preenchida(s)');
}
