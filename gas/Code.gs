// =====================================================================
// INTENTO — BACKEND GOOGLE APPS SCRIPT (versão refatorada)
// =====================================================================

const ID_PLANILHA_MODELO = "1PXvzmMoM8g1JzN70HVvzaYT5ZMikrqd0bhxgkjPPFp8";
const ID_PASTA_TRIAGEM   = "1hx2RLHhHkY3nkPSr2tfWvgRZnduqG6u5";
const EMAIL_GESTOR       = "filippe@metodointento.com.br";
const URL_APP            = "https://mentoria.metodointento.com.br";

const ABA = {
  MESTRE:      "BD_Alunos",
  MENTORES:    "BD_Mentores",
  LOGS_ERRO:   "Logs_Erro",
  ONBOARDING:  "BD_Onboarding",
  DIAGNOSTICO: "BD_Diagnostico",
  REGISTROS:   "BD_Registro",
  ENCONTROS:   "BD_Diario",
  SEMANA:      "BD_Semana",
  SIMULADOS:   "BD_Sim_ENEM",
  CADERNO:     "BD_Caderno",
  TOPICOS:     "BD_Topicos"
};

const COL_MESTRE = {
  TIMESTAMP: 0, NOME: 1, DATA_NASCIMENTO: 2, TELEFONE: 3,
  RESPONSAVEL_FINANCEIRO: 4, EMAIL: 5, CIDADE: 6, ESTADO: 7,
  ESCOLARIDADE: 8, ORIGEM_ENSINO_MEDIO: 9, COTA: 10, FEZ_ENEM_ANTES: 11,
  PROVAS_INTERESSE: 12, CURSO_INTERESSE: 13, PLATAFORMA_ONLINE: 14,
  HISTORICO_ESTUDOS: 15, OBSTACULOS: 16, EXPECTATIVAS: 17,
  NOTA_LINGUAGENS: 18, NOTA_HUMANAS: 19, NOTA_NATUREZA: 20, NOTA_MATEMATICA: 21,
  ID_PLANILHA: 52,
  NOTA_REDACAO: 57, MENTOR_RESPONSAVEL: 58, STATUS_ONBOARDING: 59,
  ULTIMA_DATA_REGISTRO: 60, ULTIMA_SEMANA_REGISTRO: 61, ULTIMO_ENCONTRO: 62
};

const COL_REG = {
  SEMANA: 0, MES: 1, DATA: 2, META: 3, HORAS: 4,
  DOMINIO_TOTAL: 5, PROGRESSO_TOTAL: 6, REVISOES: 7,
  ESTRESSE: 8, ANSIEDADE: 9, MOTIVACAO: 10, SONO: 11,
  DOM_BIO: 12, PROG_BIO: 13, DOM_QUI: 14, PROG_QUI: 15,
  DOM_FIS: 16, PROG_FIS: 17, DOM_MAT: 18, PROG_MAT: 19
};

const COL_ENC = {
  DATA: 0, AUTOAVALIACAO: 1, VITORIAS: 2, DESAFIOS: 3, CATEGORIA: 4,
  META: 5, EXPLORACAO: 6,
  ACAO_1: 7, ACAO_2: 8, ACAO_3: 9, ACAO_4: 10, ACAO_5: 11,
  RESULTADO_1: 12, RESULTADO_2: 13, RESULTADO_3: 14, RESULTADO_4: 15, RESULTADO_5: 16
};

const COL_SIM = {
  ID: 0, STATUS: 1, DATA: 2, ESPECIFICACAO: 3,
  LG: 4, CH: 5, CN: 6, MAT: 7, REDACAO: 8, ERROS_JSON: 9,
  KOLB_EXP: 10, KOLB_REF: 11, KOLB_CON: 12, KOLB_ACAO: 13, KOLB_REDACAO: 14
};

const COL_CAD = {
  ID: 0, DISCIPLINA: 1, TOPICO: 2, DATA_ERRO: 3, PERGUNTA: 4,
  RESPOSTA: 5, ESTAGIO: 6, PROXIMA_REVISAO: 7, HISTORICO: 8
};

const COL_MENTOR = {
  EMAIL: 0, NOME: 1, STATUS: 2, DT_ENTRADA: 3
};

const COL_BD_ONB = {
  DATA_REGISTRO: 0, NOME: 1, DATA_NASCIMENTO: 2, TELEFONE: 3, EMAIL: 4,
  RESPONSAVEL_FINANCEIRO: 5, CIDADE: 6, ESTADO: 7, ESCOLARIDADE: 8,
  ORIGEM_ENSINO_MEDIO: 9, COTA: 10, FEZ_ENEM_ANTES: 11, PROVAS_INTERESSE: 12,
  CURSO_INTERESSE: 13, PLATAFORMA_ONLINE: 14, HISTORICO_ESTUDOS: 15,
  OBSTACULOS: 16, EXPECTATIVAS: 17, NOTA_LG: 18, NOTA_CH: 19, NOTA_CN: 20,
  NOTA_MAT: 21, NOTA_REDACAO: 22, TECNICA_INICIO: 23
};

const VALIDAR_TOKEN = false;


// =====================================================================
// HELPERS
// =====================================================================

function normalizarData(valor) {
  if (valor === null || valor === undefined || valor === "") return "";
  if (valor instanceof Date) return Utilities.formatDate(valor, "GMT-3", "dd/MM/yyyy");
  if (typeof valor === "number") {
    const d = new Date((valor - 25569) * 86400 * 1000);
    return Utilities.formatDate(d, "GMT-3", "dd/MM/yyyy");
  }
  const s = String(valor).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const partes = s.split("/");
    return partes[0].padStart(2, "0") + "/" + partes[1].padStart(2, "0") + "/" + partes[2];
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const partes = s.substring(0, 10).split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
  }
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, "GMT-3", "dd/MM/yyyy");
  } catch (e) {}
  return s;
}

function num(valor, padrao) {
  if (padrao === undefined) padrao = 0;
  if (valor === null || valor === undefined || valor === "") return padrao;
  var n = parseFloat(String(valor).replace(",", "."));
  return isNaN(n) ? padrao : n;
}

function txt(valor, padrao) {
  if (padrao === undefined) padrao = "";
  if (valor === null || valor === undefined) return padrao;
  return String(valor).trim();
}

function emailNorm(valor) {
  return txt(valor).toLowerCase();
}

function exigirIdPlanilha(dados, campo) {
  campo = campo || "idPlanilha";
  var id = dados[campo] || dados.idPlanilhaAluno || dados.idAluno;
  if (!id) throw new Error("ID da planilha ausente (campo esperado: " + campo + ").");
  return String(id).trim();
}

function pct(valor) {
  var n = num(valor);
  return (n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n)) + '%';
}


// =====================================================================
// PONTO DE ENTRADA
// =====================================================================

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);

    if (VALIDAR_TOKEN) {
      const tokenEsperado = PropertiesService.getScriptProperties().getProperty("API_TOKEN");
      if (!tokenEsperado || dados.token !== tokenEsperado)
        return responderJSON({ status: "erro", mensagem: "Não autorizado." }, 401);
    }

    const acao = dados.acao || dados.tipo || "onboarding";

    if (acao === "onboarding")              return handleOnboarding(dados);
    if (acao === "diagnostico")             return handleDiagnostico(dados);
    if (acao === "login")                   return handleLogin(dados);
    if (acao === "listaAlunosMentor")       return handleListaAlunosMentor(dados);
    if (acao === "salvarDiario")            return handleSalvarDiario(dados);
    if (acao === "salvarSemanaLote")        return handleSalvarSemanaLote(dados);
    if (acao === "salvarRegistroGlobal")    return handleSalvarRegistroGlobal(dados);
    if (acao === "buscarDadosAluno")        return handleBuscarDadosAluno(dados);
    if (acao === "loginGlobal")             return handleLoginGlobal(dados);
    if (acao === "avaliarEncontroPassado")  return handleAvaliarEncontroPassado(dados);
    if (acao === "salvarNovoEncontro")      return handleSalvarNovoEncontro(dados);
    if (acao === "salvarSimulado")          return handleSalvarSimulado(dados);
    if (acao === "buscarTopicosGlobais")    return handleBuscarTopicosGlobais();
    if (acao === "salvarAutopsia")          return handleSalvarAutopsia(dados);
    if (acao === "listarCaderno")           return handleListarCaderno(dados);
    if (acao === "salvarCardCaderno")       return handleSalvarCardCaderno(dados);
    if (acao === "incrementarRepeticao")    return handleIncrementarRepeticao(dados);
    if (acao === "deletarCardCaderno")      return handleDeletarCardCaderno(dados);
    if (acao === "buscarOnboarding")        return handleBuscarOnboarding(dados);
    if (acao === "registrarRevisaoCaderno") return handleRegistrarRevisaoCaderno(dados);
    if (acao === "editarRegistro")          return handleEditarRegistro(dados);
    if (acao === "editarEncontro")          return handleEditarEncontro(dados);
    if (acao === "dashboardLider")          return handleDashboardLider(dados);

    throw new Error("Ação não reconhecida: " + acao);

  } catch (error) {
    registrarErro(error, e ? e.postData.contents : "Sem payload");
    return responderJSON({ status: "erro", mensagem: error.message }, 400);
  }
}


// =====================================================================
// CONTROLADORES
// =====================================================================

function handleLogin(dados) {
  const emailAluno = emailNorm(dados.email);
  if (!emailAluno) throw new Error("E-mail não fornecido para login.");

  const ssMestre   = SpreadsheetApp.getActiveSpreadsheet();
  const sheetMestre = ssMestre.getSheetByName(ABA.MESTRE);
  if (!sheetMestre) throw new Error("Aba mestre '" + ABA.MESTRE + "' não encontrada.");

  const dataMatriz  = sheetMestre.getDataRange().getValues();
  const cabecalho   = dataMatriz[0] || [];
  let colEmail      = COL_MESTRE.EMAIL;
  let colIdPlanilha = COL_MESTRE.ID_PLANILHA;

  for (let c = 0; c < cabecalho.length; c++) {
    const h = txt(cabecalho[c]).toLowerCase().replace(/[^a-z]/g, '');
    if (h === 'email') colEmail = c;
    if (h === 'iddaplanilha' || h === 'idplanilha' || h === 'idplanilhaaluno') colIdPlanilha = c;
  }

  let idPlanilhaAluno = null;
  for (let i = dataMatriz.length - 1; i >= 1; i--) {
    if (dataMatriz[i][colEmail] && emailNorm(dataMatriz[i][colEmail]) === emailAluno) {
      idPlanilhaAluno = dataMatriz[i][colIdPlanilha] || null;
      break;
    }
  }

  if (!idPlanilhaAluno)
    return responderJSON({ status: 200, email: emailAluno, perfil: "PENDENTE" });

  const ssAluno      = SpreadsheetApp.openById(idPlanilhaAluno);
  const dashboardData = obterDadosDoPainel(ssAluno, emailAluno);
  return responderJSON({ status: 200, email: emailAluno, idPlanilha: idPlanilhaAluno, dadosPainel: dashboardData });
}


function handleOnboarding(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheetMestre = ss.getSheetByName(ABA.MESTRE);
    if (!sheetMestre) sheetMestre = ss.insertSheet(ABA.MESTRE);

    const dp = dados.dadosPessoais       || {};
    const pa = dados.perfilAcademico     || {};
    const na = dados.notasAnteriores     || {};
    const dt = dados.diagnosticoTecnica  || {};
    const agora = new Date();

    const arrayOnboarding = new Array(53).fill("");
    arrayOnboarding[COL_BD_ONB.DATA_REGISTRO]          = agora;
    arrayOnboarding[COL_BD_ONB.NOME]                   = txt(dp.nome);
    arrayOnboarding[COL_BD_ONB.DATA_NASCIMENTO]        = txt(dp.dataNascimento);
    arrayOnboarding[COL_BD_ONB.TELEFONE]               = txt(dp.telefone);
    arrayOnboarding[COL_BD_ONB.EMAIL]                  = emailNorm(dp.email);
    arrayOnboarding[COL_BD_ONB.RESPONSAVEL_FINANCEIRO] = txt(dp.responsavelFinanceiro);
    arrayOnboarding[COL_BD_ONB.CIDADE]                 = txt(dp.cidade);
    arrayOnboarding[COL_BD_ONB.ESTADO]                 = txt(dp.estado);
    arrayOnboarding[COL_BD_ONB.ESCOLARIDADE]           = txt(pa.escolaridade);
    arrayOnboarding[COL_BD_ONB.ORIGEM_ENSINO_MEDIO]    = txt(pa.origemEnsinoMedio);
    arrayOnboarding[COL_BD_ONB.COTA]                   = txt(pa.cota);
    arrayOnboarding[COL_BD_ONB.FEZ_ENEM_ANTES]         = txt(pa.fezEnemAntes);
    arrayOnboarding[COL_BD_ONB.PROVAS_INTERESSE]       = txt(pa.provasInteresse);
    arrayOnboarding[COL_BD_ONB.CURSO_INTERESSE]        = txt(pa.cursoInteresse);
    arrayOnboarding[COL_BD_ONB.PLATAFORMA_ONLINE]      = txt(pa.plataformaOnline);
    arrayOnboarding[COL_BD_ONB.HISTORICO_ESTUDOS]      = txt(pa.historicoEstudos);
    arrayOnboarding[COL_BD_ONB.OBSTACULOS]             = txt(pa.tresMaioresObstaculos);
    arrayOnboarding[COL_BD_ONB.EXPECTATIVAS]           = txt(pa.expectativasMentoria);
    arrayOnboarding[COL_BD_ONB.NOTA_LG]                = txt(na.linguagens);
    arrayOnboarding[COL_BD_ONB.NOTA_CH]                = txt(na.humanas);
    arrayOnboarding[COL_BD_ONB.NOTA_CN]                = txt(na.natureza);
    arrayOnboarding[COL_BD_ONB.NOTA_MAT]               = txt(na.matematica);
    arrayOnboarding[COL_BD_ONB.NOTA_REDACAO]           = txt(na.redacao);

    const tecnicas = [
      dt.leituraPrevia, dt.estruturaMental, dt.interacaoAula, dt.atencaoConceitos,
      dt.escrevePerguntas, dt.escreveMinimo, dt.poucasPalavras, dt.setasFiguras,
      dt.logicaPropria, dt.revisaAnotacoes, dt.procuraMaterial, dt.ferramentasMemorizacao,
      dt.passaVariasVezes, dt.cronogramaRevisoes, dt.revisaoEspacada, dt.padraoRevisao,
      dt.revisaoAtiva, dt.diferentesMetodos, dt.criaFlashcards, dt.procuraFraquezas,
      dt.durmo8Horas, dt.horarioRegular, dt.sonoReparador, dt.exercicioFisico,
      dt.treinoAtencao, dt.estudaLugaresDiferentes, dt.objetivosClaros, dt.gestaoAtencao,
      dt.pausasDescanso, dt.pausasSemTelas
    ];
    for (let i = 0; i < tecnicas.length; i++)
      arrayOnboarding[COL_BD_ONB.TECNICA_INICIO + i] = txt(tecnicas[i]);

    const nomeMentorado   = txt(dp.nome) || "Novo Mentorado";
    const emailMentorado  = emailNorm(dp.email);
    const idNovaPlanilha  = provisionarPlanilhaAluno(nomeMentorado, emailMentorado, arrayOnboarding);

    const linhaMestre = new Array(60).fill("");
    linhaMestre[COL_MESTRE.TIMESTAMP]         = agora;
    linhaMestre[COL_MESTRE.NOME]              = nomeMentorado;
    linhaMestre[COL_MESTRE.EMAIL]             = emailMentorado;
    linhaMestre[COL_MESTRE.TELEFONE]          = txt(dp.telefone);
    linhaMestre[COL_MESTRE.ID_PLANILHA]       = idNovaPlanilha;
    linhaMestre[COL_MESTRE.STATUS_ONBOARDING] = "Aguardando Diagnóstico";

    sheetMestre.appendRow(linhaMestre);
    return responderJSON({ status: "sucesso", idPlanilha: idNovaPlanilha });

  } finally {
    lock.releaseLock();
  }
}


function handleDiagnostico(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const emailAluno = emailNorm(dados.email);
    if (!emailAluno) throw new Error("E-mail não fornecido no diagnóstico.");

    const ssMestre    = SpreadsheetApp.getActiveSpreadsheet();
    const sheetMestre = ssMestre.getSheetByName(ABA.MESTRE) || ssMestre.getSheets()[0];
    const dataMatriz  = sheetMestre.getDataRange().getValues();
    let linhaMestreIndex = -1;
    let fileIdEncontrado = null;

    for (let i = dataMatriz.length - 1; i >= 0; i--) {
      if (dataMatriz[i][COL_MESTRE.EMAIL] && emailNorm(dataMatriz[i][COL_MESTRE.EMAIL]) === emailAluno) {
        linhaMestreIndex = i + 1;
        fileIdEncontrado = dataMatriz[i][COL_MESTRE.ID_PLANILHA] || null;
        break;
      }
    }

    if (linhaMestreIndex === -1) throw new Error("Onboarding não localizado para este e-mail.");
    if (!fileIdEncontrado)       throw new Error("Planilha do aluno não encontrada para este e-mail.");

    const ssAluno = SpreadsheetApp.openById(fileIdEncontrado);
    let abaDiag   = ssAluno.getSheetByName(ABA.DIAGNOSTICO);
    if (!abaDiag) {
      abaDiag = ssAluno.insertSheet(ABA.DIAGNOSTICO);
      abaDiag.appendRow(["Data", "Acertos_Bio", "Acertos_Qui", "Acertos_Fis", "Acertos_Mat"]);
    }
    abaDiag.appendRow([
      new Date(),
      num(dados.acertosBiologia), num(dados.acertosQuimica),
      num(dados.acertosFisica),   num(dados.acertosMatematica)
    ]);

    sheetMestre.getRange(linhaMestreIndex, COL_MESTRE.STATUS_ONBOARDING + 1).setValue("Onboarding Completo");
    return responderJSON({ status: "sucesso" });

  } finally {
    lock.releaseLock();
  }
}


// =====================================================================
// SERVIÇOS E EXTRAÇÃO DE DADOS
// =====================================================================

function provisionarPlanilhaAluno(nomeMentorado, emailMentorado, arrayOnboarding) {
  const primeiroNome  = nomeMentorado.split(" ")[0];
  const pastaTriagem  = DriveApp.getFolderById(ID_PASTA_TRIAGEM);
  const arquivoModelo = DriveApp.getFileById(ID_PLANILHA_MODELO);
  const novoArquivo   = arquivoModelo.makeCopy("Mentoria - " + nomeMentorado, pastaTriagem);
  const idNovaPlanilha = novoArquivo.getId();

  const novaPlanilha = SpreadsheetApp.openById(idNovaPlanilha);
  const abaOnb       = novaPlanilha.getSheetByName(ABA.ONBOARDING);
  if (!abaOnb) {
    registrarErro(new Error("Modelo não tem aba '" + ABA.ONBOARDING + "'."), "provisionarPlanilhaAluno");
  } else {
    abaOnb.getRange(2, 1, 1, arrayOnboarding.length).setValues([arrayOnboarding]);
  }

  if (emailMentorado) {
    try {
      MailApp.sendEmail(emailMentorado,
        "Intento — próximo passo: seu Diagnóstico Teórico",
        "Olá, " + primeiroNome + ",\n\n" +
        "Recebi agora seu Questionário de Onboarding. Antes de qualquer coisa,\n" +
        "obrigado pela confiança em nos escolher.\n\n" +
        "O próximo passo é o Diagnóstico Teórico (cerca de 15 minutos).\n\n" +
        "Como acessar:\n" +
        "  1. Entre em " + URL_APP + "\n" +
        "  2. Faça login com este mesmo e-mail (" + emailMentorado + ")\n" +
        "  3. No Hub, clique em 'Diagnóstico Teórico'\n\n" +
        "Filippe Lemos\nHead de Mentoria — Intento"
      );
    } catch (e) { registrarErro(e, "email ao aluno: " + emailMentorado); }
  }

  try {
    MailApp.sendEmail(EMAIL_GESTOR, "Novo Aluno: " + nomeMentorado,
      "Nome: " + nomeMentorado + "\nEmail: " + emailMentorado +
      "\nPlanilha: " + novoArquivo.getUrl());
  } catch (e) { registrarErro(e, "email ao gestor"); }

  return idNovaPlanilha;
}


function obterDadosDoPainel(ss, emailAluno) {
  try {
    const shRegistros  = ss.getSheetByName(ABA.REGISTROS);
    const shEncontros  = ss.getSheetByName(ABA.ENCONTROS);
    const shOnboarding = ss.getSheetByName(ABA.ONBOARDING);

    // ---- Aluno ----
    let nomeAluno = emailAluno;
    if (shOnboarding) {
      const dadosOb = shOnboarding.getDataRange().getValues();
      for (let i = 1; i < dadosOb.length; i++) {
        if (emailNorm(dadosOb[i][COL_BD_ONB.EMAIL]) === emailNorm(emailAluno)) {
          nomeAluno = dadosOb[i][COL_BD_ONB.NOME] || emailAluno;
          break;
        }
      }
    }

    // ---- Registros semanais ----
    const historicoRegistros = [];
    const mensal = { labels: [], meta: [], horas: [], domTot: [], progTot: [], estresse: [], ansiedade: [], motivacao: [], sono: [] };
    const snapshot = { dom: [0, 0, 0, 0], prog: [0, 0, 0, 0] };

    if (shRegistros) {
      const dadosReg = shRegistros.getDataRange().getValues();
      let ultimoReg  = null;
      for (let i = 1; i < dadosReg.length; i++) {
        const row = dadosReg[i];
        if (!row[COL_REG.SEMANA]) continue;
        historicoRegistros.push(row.slice(0, 20));
        mensal.labels.push(String(row[COL_REG.SEMANA]));
        mensal.meta.push(num(row[COL_REG.META]));
        mensal.horas.push(num(row[COL_REG.HORAS]));
        mensal.domTot.push(num(row[COL_REG.DOMINIO_TOTAL]));
        mensal.progTot.push(num(row[COL_REG.PROGRESSO_TOTAL]));
        mensal.estresse.push(num(row[COL_REG.ESTRESSE]));
        mensal.ansiedade.push(num(row[COL_REG.ANSIEDADE]));
        mensal.motivacao.push(num(row[COL_REG.MOTIVACAO]));
        mensal.sono.push(num(row[COL_REG.SONO]));
        ultimoReg = row;
      }
      if (ultimoReg) {
        snapshot.dom  = [num(ultimoReg[COL_REG.DOM_BIO]), num(ultimoReg[COL_REG.DOM_QUI]), num(ultimoReg[COL_REG.DOM_FIS]), num(ultimoReg[COL_REG.DOM_MAT])];
        snapshot.prog = [num(ultimoReg[COL_REG.PROG_BIO]), num(ultimoReg[COL_REG.PROG_QUI]), num(ultimoReg[COL_REG.PROG_FIS]), num(ultimoReg[COL_REG.PROG_MAT])];
      }
    }

    // ---- Semanal (cards estruturados para o frontend) ----
    const n       = historicoRegistros.length;
    const regCurr = n > 0 ? historicoRegistros[n - 1] : null;
    const regPrev = n > 1 ? historicoRegistros[n - 2] : null;

    function mkCard(name, theme, currVal, prevVal) {
      return { name: name, theme: theme, curr: String(currVal ?? ''), prev: String(prevVal ?? '') };
    }

    let autoAvalCurr = '', autoAvalPrev = '';
    if (shEncontros) {
      const dadosEnc = shEncontros.getDataRange().getValues();
      const encRows  = [];
      for (let i = 1; i < dadosEnc.length; i++)
        if (dadosEnc[i][COL_ENC.DATA]) encRows.push(dadosEnc[i]);
      if (encRows.length > 0) autoAvalCurr = txt(encRows[encRows.length - 1][COL_ENC.AUTOAVALIACAO]);
      if (encRows.length > 1) autoAvalPrev = txt(encRows[encRows.length - 2][COL_ENC.AUTOAVALIACAO]);
    }

    const semanal = { isFirstWeek: n === 0, streak: [], geral: [], estilo: [], desempenho: [] };

    if (shEncontros) {
      const dadosEncS = shEncontros.getDataRange().getValues();
      for (let i = 1; i < dadosEncS.length; i++)
        if (dadosEncS[i][COL_ENC.DATA])
          semanal.streak.push(dadosEncS[i][COL_ENC.RESULTADO_1] ? 1 : 0);
    }

    if (regCurr) {
      semanal.geral = [
        mkCard('Autoavaliação',      'blue',    autoAvalCurr,                         autoAvalPrev),
        mkCard('Horas Estudadas',    'emerald', num(regCurr[COL_REG.HORAS]),          regPrev ? num(regPrev[COL_REG.HORAS])          : ''),
        mkCard('Progresso',          'purple',  pct(regCurr[COL_REG.PROGRESSO_TOTAL]),regPrev ? pct(regPrev[COL_REG.PROGRESSO_TOTAL]): ''),
        mkCard('Revisões Atrasadas', 'red',     num(regCurr[COL_REG.REVISOES]),       regPrev ? num(regPrev[COL_REG.REVISOES])       : '')
      ];
      semanal.estilo = [
        mkCard('Estresse',  'red',     num(regCurr[COL_REG.ESTRESSE]),  regPrev ? num(regPrev[COL_REG.ESTRESSE])  : ''),
        mkCard('Ansiedade', 'red',     num(regCurr[COL_REG.ANSIEDADE]), regPrev ? num(regPrev[COL_REG.ANSIEDADE]) : ''),
        mkCard('Motivação', 'emerald', num(regCurr[COL_REG.MOTIVACAO]), regPrev ? num(regPrev[COL_REG.MOTIVACAO]) : ''),
        mkCard('Sono',      'blue',    num(regCurr[COL_REG.SONO]),      regPrev ? num(regPrev[COL_REG.SONO])      : '')
      ];
      semanal.desempenho = [
        mkCard('Dom. Biologia',    'emerald', pct(regCurr[COL_REG.DOM_BIO]),  regPrev ? pct(regPrev[COL_REG.DOM_BIO])  : ''),
        mkCard('Prog. Biologia',   'emerald', pct(regCurr[COL_REG.PROG_BIO]), regPrev ? pct(regPrev[COL_REG.PROG_BIO]) : ''),
        mkCard('Dom. Química',     'purple',  pct(regCurr[COL_REG.DOM_QUI]),  regPrev ? pct(regPrev[COL_REG.DOM_QUI])  : ''),
        mkCard('Prog. Química',    'purple',  pct(regCurr[COL_REG.PROG_QUI]), regPrev ? pct(regPrev[COL_REG.PROG_QUI]) : ''),
        mkCard('Dom. Física',      'blue',    pct(regCurr[COL_REG.DOM_FIS]),  regPrev ? pct(regPrev[COL_REG.DOM_FIS])  : ''),
        mkCard('Prog. Física',     'blue',    pct(regCurr[COL_REG.PROG_FIS]), regPrev ? pct(regPrev[COL_REG.PROG_FIS]) : ''),
        mkCard('Dom. Matemática',  'slate',   pct(regCurr[COL_REG.DOM_MAT]),  regPrev ? pct(regPrev[COL_REG.DOM_MAT])  : ''),
        mkCard('Prog. Matemática', 'slate',   pct(regCurr[COL_REG.PROG_MAT]), regPrev ? pct(regPrev[COL_REG.PROG_MAT]) : '')
      ];
    }

    // ---- Plano ----
    const plano = { data: "--", meta: "Nenhuma meta definida", acao: [] };
    if (shEncontros) {
      const dadosEnc = shEncontros.getDataRange().getValues();
      for (let i = dadosEnc.length - 1; i >= 1; i--) {
        const row = dadosEnc[i];
        if (!row[COL_ENC.DATA]) continue;
        const rawData = row[COL_ENC.DATA];
        plano.data = rawData instanceof Date
          ? Utilities.formatDate(rawData, Session.getScriptTimeZone(), "dd/MM/yyyy")
          : String(rawData);
        plano.meta = txt(row[COL_ENC.META]) || plano.meta;
        const acoes = [row[COL_ENC.ACAO_1], row[COL_ENC.ACAO_2], row[COL_ENC.ACAO_3], row[COL_ENC.ACAO_4], row[COL_ENC.ACAO_5]];
        plano.acao  = acoes.map(function(a) { return txt(a); }).filter(function(a) { return a !== ""; });
        break;
      }
    }

    // ---- Simulados ----
    const simAgg = lerSimulados(ss);
    const simKpi = simAgg.kpi;
    const histSim = simAgg.hist;
    const listaSimulados = simAgg.lista;

    // Semana Padrão (rotina): lê BD_semana e monta { dia: [{hora, atividade}, ...] }
    // BD_semana é gravado pelo mentor com colunas na ordem Seg→Dom; o painel do aluno
    // espera rotinaDias em ordem Dom→Sáb (alinhado com new Date().getDay()).
    const rotinaDias       = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    const COLUNAS_BD_SEMANA = ["Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado", "Domingo"];
    const HORARIOS_ROTINA  = ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"];
    const rotina = {};
    rotinaDias.forEach(function(d) { rotina[d] = []; });
    const abaSemanaPadrao = ss.getSheetByName(ABA.SEMANA);
    if (abaSemanaPadrao) {
      const matrizSemana = abaSemanaPadrao.getRange(2, 2, 16, 7).getValues();
      for (let l = 0; l < 16; l++) {
        for (let c = 0; c < 7; c++) {
          const atividade = txt(matrizSemana[l][c]);
          if (atividade) rotina[COLUNAS_BD_SEMANA[c]].push({ hora: HORARIOS_ROTINA[l], atividade: atividade });
        }
      }
    }

    return {
      aluno: { nome: nomeAluno }, snapshot: snapshot, mensal: mensal,
      semanal: semanal, plano: plano, rotina: rotina, rotinaDias: rotinaDias,
      sim: { kpi: simKpi, hist: histSim, lista: listaSimulados },
      registros: historicoRegistros, idPlanilha: ss.getId()
    };

  } catch (err) {
    Logger.log("obterDadosDoPainel error: " + err.message);
    return { erro: err.message };
  }
}


// =====================================================================
// UTILITÁRIOS
// =====================================================================

function responderJSON(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

function registrarErro(error, payloadRecebido) {
  try {
    const ssErro    = SpreadsheetApp.getActiveSpreadsheet();
    let sheetErro   = ssErro.getSheetByName(ABA.LOGS_ERRO);
    if (!sheetErro) sheetErro = ssErro.insertSheet(ABA.LOGS_ERRO);
    sheetErro.appendRow([new Date(), error.message, error.stack, payloadRecebido]);
  } catch (eLog) { console.error("Falha catastrófica:", eLog); }
}

function removerAcentos(str) {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "");
}


// =====================================================================
// SALA DO MENTOR
// =====================================================================

function handleListaAlunosMentor(dados) {
  const emailMentor = emailNorm(dados.email);
  if (!emailMentor) throw new Error("E-mail do mentor não fornecido.");

  const ssMestre  = SpreadsheetApp.getActiveSpreadsheet();
  const abaMestre = ssMestre.getSheetByName(ABA.MESTRE);
  if (!abaMestre) throw new Error("Aba mestre '" + ABA.MESTRE + "' não encontrada.");

  const matriz = abaMestre.getDataRange().getValues();
  const colMentor = COL_MESTRE.MENTOR_RESPONSAVEL;

  const listaFiltrada = [];
  for (let i = 1; i < matriz.length; i++) {
    if (emailNorm(matriz[i][colMentor]) === emailMentor) {
      listaFiltrada.push({
        id:     matriz[i][COL_MESTRE.ID_PLANILHA],
        nome:   matriz[i][COL_MESTRE.NOME],
        email:  matriz[i][COL_MESTRE.EMAIL],
        status: txt(matriz[i][COL_MESTRE.STATUS_ONBOARDING]) || "Desconhecido"
      });
    }
  }
  return responderJSON({ status: "sucesso", alunos: listaFiltrada });
}


// =====================================================================
// DIÁRIO DE BORDO
// =====================================================================

function handleAvaliarEncontroPassado(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha = exigirIdPlanilha(dados);
    const abaDiario  = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.ENCONTROS);
    if (!abaDiario) throw new Error("Aba '" + ABA.ENCONTROS + "' não encontrada.");
    const linha = parseInt(dados.linha);
    if (!linha || linha < 2) throw new Error("Linha inválida para avaliação.");
    const resultados = Array.isArray(dados.resultados) ? dados.resultados : [];
    abaDiario.getRange(linha, COL_ENC.RESULTADO_1 + 1, 1, 5).setValues([[
      txt(resultados[0]), txt(resultados[1]), txt(resultados[2]), txt(resultados[3]), txt(resultados[4])
    ]]);
    return responderJSON({ status: "sucesso" });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}

function handleEditarEncontro(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha = exigirIdPlanilha(dados);
    const abaDiario  = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.ENCONTROS);
    if (!abaDiario) throw new Error("Aba '" + ABA.ENCONTROS + "' não encontrada.");
    const linha = parseInt(dados.linha);
    if (!linha || linha < 2) throw new Error("Linha inválida.");
    const acoes      = Array.isArray(dados.acoes) ? dados.acoes : [];
    const resultados = Array.isArray(dados.resultados) ? dados.resultados : [];
    abaDiario.getRange(linha, 1, 1, 17).setValues([[
      txt(dados.data),
      txt(dados.autoavaliacao),
      txt(dados.vitorias),
      txt(dados.desafios),
      txt(dados.categoria),
      txt(dados.meta),
      txt(dados.exploracao),
      txt(acoes[0]), txt(acoes[1]), txt(acoes[2]), txt(acoes[3]), txt(acoes[4]),
      txt(resultados[0]), txt(resultados[1]), txt(resultados[2]), txt(resultados[3]), txt(resultados[4])
    ]]);
    return responderJSON({ status: "sucesso" });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}

function handleSalvarNovoEncontro(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha = exigirIdPlanilha(dados);
    const abaDiario  = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.ENCONTROS);
    if (!abaDiario) throw new Error("Aba '" + ABA.ENCONTROS + "' não encontrada.");
    const dataHoje = Utilities.formatDate(new Date(), "GMT-3", "dd/MM/yyyy");
    const acoes    = Array.isArray(dados.acoes) ? dados.acoes : [];
    abaDiario.appendRow([
      dataHoje, txt(dados.autoavaliacao), txt(dados.vitorias), txt(dados.desafios),
      txt(dados.categoria), txt(dados.meta), txt(dados.exploracao),
      txt(acoes[0]), txt(acoes[1]), txt(acoes[2]), txt(acoes[3]), txt(acoes[4])
    ]);
    atualizarCacheMestre(idPlanilha, { ULTIMO_ENCONTRO: dataHoje });
    return responderJSON({ status: "sucesso" });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}


// =====================================================================
// SEMANA PADRÃO
// =====================================================================

function handleSalvarSemanaLote(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha     = exigirIdPlanilha(dados, "idPlanilhaAluno");
    const rotinaCompleta = Array.isArray(dados.rotina) ? dados.rotina : [];
    const ssAluno        = SpreadsheetApp.openById(idPlanilha);
    const abaDB          = ssAluno.getSheetByName(ABA.SEMANA);
    if (!abaDB) return responderJSON({ status: "erro", mensagem: "Aba '" + ABA.SEMANA + "' não encontrada." });

    const HORARIOS = ["07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00"];
    const DIAS     = ["Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado","Domingo"];
    const matrizParaGravar = [];
    for (let l = 0; l < 16; l++) matrizParaGravar.push(["","","","","","",""]);

    let contadorSucesso = 0;
    rotinaCompleta.forEach(function(item) {
      const linhaIndex   = HORARIOS.map(h => h.trim()).indexOf(txt(item.hora));
      const colunaIndex  = DIAS.map(d => d.toLowerCase().trim()).indexOf(txt(item.dia).toLowerCase());
      if (linhaIndex !== -1 && colunaIndex !== -1) {
        matrizParaGravar[linhaIndex][colunaIndex] = txt(item.atividade);
        contadorSucesso++;
      }
    });

    abaDB.getRange(2, 2, 16, 7).setValues(matrizParaGravar);
    return responderJSON({ status: "sucesso", atualizadas: contadorSucesso });
  } catch (erro) { return responderJSON({ status: "erro", mensagem: erro.message }); }
  finally        { lock.releaseLock(); }
}


// =====================================================================
// REGISTRO SEMANAL
// =====================================================================

/**
 * Atualiza colunas de cache na mestre para um aluno (via ID_PLANILHA).
 * updates: { CHAVE_COL_MESTRE: valor, ... } — ex: { ULTIMA_DATA_REGISTRO: '15/04/2026' }
 * Falha silenciosa — não propaga erro pra operação principal.
 */
function atualizarCacheMestre(idPlanilha, updates) {
  Logger.log('atualizarCacheMestre INICIO · idPlanilha=' + idPlanilha + ' · keys=' + Object.keys(updates).join(','));
  try {
    const ssMestre  = SpreadsheetApp.getActiveSpreadsheet();
    const abaMestre = ssMestre.getSheetByName(ABA.MESTRE);
    if (!abaMestre) { Logger.log('  aba mestre ' + ABA.MESTRE + ' não encontrada'); return; }
    const numLinhas = abaMestre.getLastRow() - 1;
    Logger.log('  linhas na mestre: ' + numLinhas);
    if (numLinhas < 1) return;

    const ids = abaMestre.getRange(2, COL_MESTRE.ID_PLANILHA + 1, numLinhas, 1).getValues();
    let linhaAluno = -1;
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === String(idPlanilha).trim()) { linhaAluno = i + 2; break; }
    }
    if (linhaAluno === -1) {
      Logger.log('  aluno ' + idPlanilha + ' não encontrado. primeiros 3 ids: ' + JSON.stringify(ids.slice(0,3).map(function(r){return r[0];})));
      return;
    }
    Logger.log('  aluno encontrado na linha ' + linhaAluno);

    Object.keys(updates).forEach(function(chave) {
      const col = COL_MESTRE[chave];
      if (typeof col !== 'number') { Logger.log('  chave desconhecida ' + chave); return; }
      abaMestre.getRange(linhaAluno, col + 1).setValue(updates[chave]);
      Logger.log('  escrito ' + chave + '=' + updates[chave] + ' na col ' + (col+1));
    });
    Logger.log('atualizarCacheMestre FIM OK');
  } catch (e) {
    Logger.log('atualizarCacheMestre EXCEPTION: ' + e.message);
  }
}

function handleSalvarRegistroGlobal(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha = exigirIdPlanilha(dados, "idAluno");
    const ssAluno    = SpreadsheetApp.openById(idPlanilha);
    const abaDB      = ssAluno.getSheetByName(ABA.REGISTROS);
    if (!abaDB) return responderJSON({ status: "erro", mensagem: "Aba '" + ABA.REGISTROS + "' não encontrada." });

    const novaLinha = [
      txt(dados.semana),
      txt(dados.mes),
      txt(dados.dataRegistro),
      txt(dados.metaSemanal),          // texto, não número
      num(dados.horasEstudadas),
      num(dados.dominioTotal),
      num(dados.progressoTotal),
      num(dados.revisoesAtrasadas),
      num(dados.estresse),
      num(dados.ansiedade),
      num(dados.motivacao),
      num(dados.sono),
      num(dados.dominioBio),
      num(dados.progressoBio),
      num(dados.dominioQui),
      num(dados.progressoQui),
      num(dados.dominioFis),
      num(dados.progressoFis),
      num(dados.dominioMat),
      num(dados.progressoMat)
    ];

    const colA = abaDB.getRange(1, 1, abaDB.getMaxRows(), 1).getValues();
    let ultimaLinhaComDados = 0;
    for (let i = colA.length - 1; i >= 0; i--) {
      if (String(colA[i][0]).trim() !== "") { ultimaLinhaComDados = i + 1; break; }
    }
    const linhaDestino = ultimaLinhaComDados + 1;
    abaDB.getRange(linhaDestino, 1, 1, novaLinha.length).setValues([novaLinha]);
    atualizarCacheMestre(idPlanilha, {
      ULTIMA_DATA_REGISTRO:   txt(dados.dataRegistro),
      ULTIMA_SEMANA_REGISTRO: txt(dados.semana)
    });
    return responderJSON({ status: "sucesso" });
  } catch (erro) { return responderJSON({ status: "erro", mensagem: erro.message }); }
  finally        { lock.releaseLock(); }
}


// =====================================================================
// LER DADOS COMPLETOS DO ALUNO
// =====================================================================

// =====================================================================
// Helper: lê BD_Sim_ENEM e devolve { kpi, hist, lista } (últimos 3)
// =====================================================================
function lerSimulados(ss) {
  const kpi = { realizados: 0, medAcertos: 0, medRedacao: 0, medLG: 0, medCH: 0, medCN: 0, medMAT: 0, erros: { atencao: 0, inter: 0, rec: 0, lac: 0 } };
  const hist = { labels: [], lg: [], ch: [], cn: [], mat: [] };
  const lista = [];

  const shSimulados = ss.getSheetByName(ABA.SIMULADOS);
  if (!shSimulados) return { kpi: kpi, hist: hist, lista: lista };

  const dadosSim  = shSimulados.getDataRange().getValues();
  const concluidos = [];
  for (let i = 1; i < dadosSim.length; i++) {
    const row = dadosSim[i];
    if (!row[COL_SIM.ID]) continue;
    const dataStr = row[COL_SIM.DATA] instanceof Date
      ? Utilities.formatDate(row[COL_SIM.DATA], Session.getScriptTimeZone(), "yyyy-MM-dd")
      : String(row[COL_SIM.DATA]).split(" ")[0];
    let errosObj = { atencao: 0, inter: 0, rec: 0, lac: 0 };
    let errosLista = [];
    try {
      if (row[COL_SIM.ERROS_JSON]) {
        const parsed = JSON.parse(String(row[COL_SIM.ERROS_JSON]));
        if (Array.isArray(parsed)) {
          errosLista = parsed.filter(function(e) { return e && (e.tipo || e.questao || e.disciplina || e.topico); });
          parsed.forEach(function(e) {
            const tipo = txt(e && e.tipo);
            if (tipo === 'Atenção')             errosObj.atencao++;
            else if (tipo === 'Interpretação')  errosObj.inter++;
            else if (tipo === 'Recordação')     errosObj.rec++;
            else if (tipo === 'Lacuna')         errosObj.lac++;
          });
        } else if (parsed && typeof parsed === 'object') {
          errosObj = {
            atencao: parsed.atencao || 0,
            inter:   parsed.inter   || 0,
            rec:     parsed.rec     || 0,
            lac:     parsed.lac     || 0,
          };
        }
      }
    } catch (e) {}
    const sim = {
      id: String(row[COL_SIM.ID]), status: txt(row[COL_SIM.STATUS]) || "Pendente",
      data: dataStr, modelo: "ENEM", especificacao: txt(row[COL_SIM.ESPECIFICACAO]),
      lg: num(row[COL_SIM.LG]), ch: num(row[COL_SIM.CH]), cn: num(row[COL_SIM.CN]),
      mat: num(row[COL_SIM.MAT]), redacao: num(row[COL_SIM.REDACAO]),
      erros: errosObj, errosLista: errosLista,
      kolb: {
        exp: txt(row[COL_SIM.KOLB_EXP]), ref: txt(row[COL_SIM.KOLB_REF]),
        con: txt(row[COL_SIM.KOLB_CON]), acao: txt(row[COL_SIM.KOLB_ACAO]),
        redacao: txt(row[COL_SIM.KOLB_REDACAO])
      }
    };
    lista.push(sim);
    if (sim.status === "Concluída") concluidos.push(sim);
  }

  concluidos.forEach(function(s) {
    hist.labels.push(s.data); hist.lg.push(s.lg); hist.ch.push(s.ch);
    hist.cn.push(s.cn); hist.mat.push(s.mat);
  });
  kpi.realizados = concluidos.length;
  if (concluidos.length > 0) {
    const ultimas3 = concluidos.slice(-3);
    const nn = ultimas3.length;
    let somaLG = 0, somaCH = 0, somaCN = 0, somaMAT = 0, somaTotal = 0;
    let somaAt = 0, somaIn = 0, somaRec = 0, somaLac = 0;
    ultimas3.forEach(function(s) {
      somaLG += s.lg; somaCH += s.ch; somaCN += s.cn; somaMAT += s.mat;
      somaTotal += (s.lg + s.ch + s.cn + s.mat);
      somaAt += (s.erros.atencao || 0); somaIn += (s.erros.inter || 0);
      somaRec += (s.erros.rec || 0); somaLac += (s.erros.lac || 0);
    });
    kpi.medLG  = Math.round(somaLG / nn);  kpi.medCH  = Math.round(somaCH / nn);
    kpi.medCN  = Math.round(somaCN / nn);  kpi.medMAT = Math.round(somaMAT / nn);
    kpi.medAcertos = Math.round(somaTotal / nn);
    kpi.erros = { atencao: Math.round(somaAt / nn), inter: Math.round(somaIn / nn), rec: Math.round(somaRec / nn), lac: Math.round(somaLac / nn) };
    const ultimasComRedacao = concluidos.filter(function(s) { return s.redacao > 0; }).slice(-3);
    if (ultimasComRedacao.length > 0) {
      kpi.medRedacao = Math.round(ultimasComRedacao.reduce(function(acc, s) { return acc + s.redacao; }, 0) / ultimasComRedacao.length);
    }
  }
  return { kpi: kpi, hist: hist, lista: lista };
}


function handleBuscarDadosAluno(dados) {
  try {
    const idPlanilha    = exigirIdPlanilha(dados, "idPlanilhaAluno");
    const ssAluno       = SpreadsheetApp.openById(idPlanilha);
    const pacoteDeDados = { status: "sucesso", semana: [], registros: [], diarios: [] };

    const abaSemana = ssAluno.getSheetByName(ABA.SEMANA);
    if (abaSemana) pacoteDeDados.semana = abaSemana.getRange(2, 2, 16, 7).getValues();

    const abaRegistro = ssAluno.getSheetByName(ABA.REGISTROS);
    if (abaRegistro) {
      const todosRegistros = abaRegistro.getDataRange().getDisplayValues();
      if (todosRegistros.length > 1) pacoteDeDados.registros = todosRegistros.slice(1);
    }

    const abaDiario  = ssAluno.getSheetByName(ABA.ENCONTROS);
    const encontros  = [];
    if (abaDiario) {
      const matriz = abaDiario.getDataRange().getValues();
      for (let i = 1; i < matriz.length; i++) {
        if (matriz[i][COL_ENC.DATA]) {
          encontros.push({
            linha: i + 1, data: matriz[i][COL_ENC.DATA],
            autoavaliacao: matriz[i][COL_ENC.AUTOAVALIACAO], vitorias: matriz[i][COL_ENC.VITORIAS],
            desafios: matriz[i][COL_ENC.DESAFIOS], categoria: matriz[i][COL_ENC.CATEGORIA],
            meta: matriz[i][COL_ENC.META], exploracao: matriz[i][COL_ENC.EXPLORACAO],
            acoes: [matriz[i][COL_ENC.ACAO_1], matriz[i][COL_ENC.ACAO_2], matriz[i][COL_ENC.ACAO_3], matriz[i][COL_ENC.ACAO_4], matriz[i][COL_ENC.ACAO_5]],
            resultados: [matriz[i][COL_ENC.RESULTADO_1], matriz[i][COL_ENC.RESULTADO_2], matriz[i][COL_ENC.RESULTADO_3], matriz[i][COL_ENC.RESULTADO_4], matriz[i][COL_ENC.RESULTADO_5]]
          });
        }
      }
    }
    pacoteDeDados.diarios = encontros.reverse();
    pacoteDeDados.simulados = lerSimulados(ssAluno);
    return responderJSON(pacoteDeDados);
  } catch (erro) { return responderJSON({ status: "erro", mensagem: erro.message }); }
}


// =====================================================================
// LOGIN GLOBAL (SSO)
// =====================================================================

function handleLoginGlobal(dados) {
  try {
    const emailStr = emailNorm(dados.email);
    if (!emailStr) return responderJSON({ status: "erro", mensagem: "E-mail não fornecido." });

    if (emailStr === "filippe@metodointento.com.br")
      return responderJSON({ status: "sucesso", perfil: "lider", rota: "/selecionar-modo" });

    if (emailStr.endsWith("@metodointento.com.br"))
      return responderJSON({ status: "sucesso", perfil: "mentor", rota: "/mentor" });

    const ss        = SpreadsheetApp.getActiveSpreadsheet();
    const abaAlunos = ss.getSheetByName(ABA.MESTRE) || ss.getSheetByName("Controle_Geral") || ss.getSheets()[0];
    const ultimaLinha = abaAlunos.getLastRow();
    if (ultimaLinha < 2) return responderJSON({ status: "sucesso", perfil: "aluno", rota: "/hub", novo: true });

    const matriz = abaAlunos.getRange(1, 1, ultimaLinha, 60).getValues();
    for (let i = matriz.length - 1; i >= 1; i--) {
      if (emailNorm(matriz[i][COL_MESTRE.EMAIL]) === emailStr) {
        const statusBH    = txt(matriz[i][COL_MESTRE.STATUS_ONBOARDING]);
        const idPlanilha  = matriz[i][COL_MESTRE.ID_PLANILHA] || "";
        const rotaDestino = statusBH === "Onboarding Completo" ? "/painel" : "/hub";
        return responderJSON({ status: "sucesso", perfil: "aluno", rota: rotaDestino, nome: matriz[i][COL_MESTRE.NOME] || "Estudante", idPlanilha: idPlanilha });
      }
    }
    return responderJSON({ status: "sucesso", perfil: "aluno", rota: "/hub", nome: "Novo Aluno" });
  } catch (erro) { return responderJSON({ status: "erro", mensagem: "Erro no Porteiro: " + erro.message }); }
}


// =====================================================================
// SIMULADOS
// =====================================================================

function handleSalvarSimulado(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha = exigirIdPlanilha(dados);
    const ssAluno    = SpreadsheetApp.openById(idPlanilha);
    const aba        = ssAluno.getSheetByName(ABA.SIMULADOS);
    if (!aba) throw new Error("Aba '" + ABA.SIMULADOS + "' não encontrada.");
    const idSimulado = "sim_" + new Date().getTime();
    let dataFormatada = txt(dados.data);
    if (dataFormatada && dataFormatada.indexOf("-") !== -1) {
      const partes = dataFormatada.split("-");
      dataFormatada = partes[2] + "/" + partes[1] + "/" + partes[0];
    }
    aba.appendRow([idSimulado, "Pendente", dataFormatada, txt(dados.especificacao),
      num(dados.lg), num(dados.ch), num(dados.cn), num(dados.mat), num(dados.redacao),
      "", "", "", "", "", ""]);
    return responderJSON({ status: "sucesso", id: idSimulado });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}

function handleSalvarAutopsia(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha  = exigirIdPlanilha(dados);
    const ssAluno     = SpreadsheetApp.openById(idPlanilha);
    const aba         = ssAluno.getSheetByName(ABA.SIMULADOS);
    if (!aba) throw new Error("Aba '" + ABA.SIMULADOS + "' não encontrada.");
    const idProcurado = txt(dados.idSimulado);
    if (!idProcurado) throw new Error("idSimulado ausente.");
    const matriz      = aba.getDataRange().getValues();
    let linhaAlvo     = -1;
    for (let i = 1; i < matriz.length; i++) {
      if (String(matriz[i][COL_SIM.ID]) === idProcurado) { linhaAlvo = i + 1; break; }
    }
    if (linhaAlvo === -1) throw new Error("Simulado não encontrado.");
    const statusFinal      = txt(dados.statusAnalise) || "Concluída";
    const errosCompactados = JSON.stringify(dados.erros || []);
    const kolb             = dados.kolb || {};
    aba.getRange(linhaAlvo, COL_SIM.STATUS       + 1).setValue(statusFinal);
    aba.getRange(linhaAlvo, COL_SIM.ERROS_JSON   + 1).setValue(errosCompactados);
    aba.getRange(linhaAlvo, COL_SIM.KOLB_EXP     + 1).setValue(txt(kolb.exp));
    aba.getRange(linhaAlvo, COL_SIM.KOLB_REF     + 1).setValue(txt(kolb.ref));
    aba.getRange(linhaAlvo, COL_SIM.KOLB_CON     + 1).setValue(txt(kolb.con));
    aba.getRange(linhaAlvo, COL_SIM.KOLB_ACAO    + 1).setValue(txt(kolb.acao));
    aba.getRange(linhaAlvo, COL_SIM.KOLB_REDACAO + 1).setValue(txt(kolb.redacao));
    return responderJSON({ status: "sucesso" });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}


// =====================================================================
// TÓPICOS GLOBAIS
// =====================================================================

function handleBuscarTopicosGlobais() {
  try {
    const ssMestre   = SpreadsheetApp.getActiveSpreadsheet();
    const abaTopicos = ssMestre.getSheetByName(ABA.TOPICOS);
    if (!abaTopicos) throw new Error("Aba '" + ABA.TOPICOS + "' não encontrada.");
    const matriz             = abaTopicos.getDataRange().getValues();
    const cabecalhos         = matriz[0];
    const dicionarioTopicos  = {};
    for (let c = 0; c < cabecalhos.length; c++) {
      const disciplina = txt(cabecalhos[c]);
      if (!disciplina) continue;
      dicionarioTopicos[disciplina] = [];
      for (let r = 1; r < matriz.length; r++) {
        const topico = txt(matriz[r][c]);
        if (topico !== "") dicionarioTopicos[disciplina].push(topico);
      }
    }
    return responderJSON({ status: "sucesso", topicos: dicionarioTopicos });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
}


// =====================================================================
// CADERNO DE ERROS
// =====================================================================

function handleListarCaderno(dados) {
  try {
    const idPlanilha = exigirIdPlanilha(dados);
    const aba        = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.CADERNO);
    if (!aba) return responderJSON({ status: "sucesso", cards: [] });
    const hoje  = Utilities.formatDate(new Date(), "GMT-3", "yyyy-MM-dd");
    const linhas = aba.getDataRange().getValues();
    const cards  = linhas.slice(1).map(function(r) {
      return {
        id: r[COL_CAD.ID], disciplina: r[COL_CAD.DISCIPLINA], topico: r[COL_CAD.TOPICO],
        data_erro: r[COL_CAD.DATA_ERRO], pergunta: r[COL_CAD.PERGUNTA], resposta: r[COL_CAD.RESPOSTA],
        estagio: parseInt(r[COL_CAD.ESTAGIO]) || 0,
        proxima_revisao: r[COL_CAD.PROXIMA_REVISAO]
          ? Utilities.formatDate(new Date(r[COL_CAD.PROXIMA_REVISAO]), "GMT-3", "yyyy-MM-dd")
          : hoje,
        historico: r[COL_CAD.HISTORICO] || "[]"
      };
    }).filter(function(c) { return c.id; });
    return responderJSON({ status: "sucesso", cards: cards });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
}

function handleSalvarCardCaderno(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha = exigirIdPlanilha(dados);
    const ss         = SpreadsheetApp.openById(idPlanilha);
    let aba          = ss.getSheetByName(ABA.CADERNO);
    if (!aba) {
      aba = ss.insertSheet(ABA.CADERNO);
      aba.appendRow(["id","disciplina","topico","data_erro","pergunta","resposta","estagio","proxima_revisao","historico"]);
    }
    const hoje = Utilities.formatDate(new Date(), "GMT-3", "yyyy-MM-dd");
    aba.appendRow([txt(dados.id), txt(dados.disciplina), txt(dados.topico),
      txt(dados.data), txt(dados.pergunta), txt(dados.resposta),
      0, calcularProximaRevisao(hoje, 0), "[]"]);
    return responderJSON({ status: "sucesso" });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}

function handleIncrementarRepeticao(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha  = exigirIdPlanilha(dados);
    const aba         = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.CADERNO);
    if (!aba) return responderJSON({ status: "erro", mensagem: "'" + ABA.CADERNO + "' não encontrada." });
    const linhas      = aba.getDataRange().getValues();
    const idProcurado = txt(dados.id);
    for (let i = 1; i < linhas.length; i++) {
      if (String(linhas[i][COL_CAD.ID]) === idProcurado) {
        aba.getRange(i + 1, COL_CAD.ESTAGIO + 1).setValue((parseInt(linhas[i][COL_CAD.ESTAGIO]) || 0) + 1);
        break;
      }
    }
    return responderJSON({ status: "sucesso" });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}

function handleDeletarCardCaderno(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha  = exigirIdPlanilha(dados);
    const aba         = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.CADERNO);
    if (!aba) return responderJSON({ status: "erro", mensagem: "'" + ABA.CADERNO + "' não encontrada." });
    const linhas      = aba.getDataRange().getValues();
    const idProcurado = txt(dados.id);
    for (let i = 1; i < linhas.length; i++) {
      if (String(linhas[i][COL_CAD.ID]) === idProcurado) { aba.deleteRow(i + 1); break; }
    }
    return responderJSON({ status: "sucesso" });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}

function handleRegistrarRevisaoCaderno(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha  = exigirIdPlanilha(dados);
    const aba         = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.CADERNO);
    if (!aba) return responderJSON({ status: "erro", mensagem: "'" + ABA.CADERNO + "' não encontrada." });
    const linhas      = aba.getDataRange().getValues();
    const idProcurado = txt(dados.id);
    for (let i = 1; i < linhas.length; i++) {
      if (String(linhas[i][COL_CAD.ID]) === idProcurado) {
        const estagioAtual = parseInt(linhas[i][COL_CAD.ESTAGIO]) || 0;
        let historico = [];
        try { historico = JSON.parse(String(linhas[i][COL_CAD.HISTORICO] || "[]")); } catch (e) {}
        const hoje           = Utilities.formatDate(new Date(), "GMT-3", "yyyy-MM-dd");
        historico.push({ data: hoje, acertou: !!dados.acertou });
        const novoEstagio    = dados.acertou ? Math.min(estagioAtual + 1, 5) : 0;
        const proximaRevisao = calcularProximaRevisao(hoje, novoEstagio);
        aba.getRange(i + 1, COL_CAD.ESTAGIO        + 1).setValue(novoEstagio);
        aba.getRange(i + 1, COL_CAD.PROXIMA_REVISAO + 1).setValue(proximaRevisao);
        aba.getRange(i + 1, COL_CAD.HISTORICO       + 1).setValue(JSON.stringify(historico));
        return responderJSON({ status: "sucesso", novoEstagio: novoEstagio, proximaRevisao: proximaRevisao });
      }
    }
    return responderJSON({ status: "erro", mensagem: "Card não encontrado." });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}

function calcularProximaRevisao(dataBaseStr, estagio) {
  const intervalos = [3, 7, 14, 30, 60, 90];
  const dias = intervalos[Math.min(estagio, 5)];
  const data = new Date(dataBaseStr + "T12:00:00");
  data.setDate(data.getDate() + dias);
  return Utilities.formatDate(data, "GMT-3", "yyyy-MM-dd");
}


// =====================================================================
// BUSCAR ONBOARDING
// =====================================================================

function handleBuscarOnboarding(dados) {
  try {
    const idPlanilha = exigirIdPlanilha(dados, "idPlanilhaAluno");
    const ssAluno    = SpreadsheetApp.openById(idPlanilha);

    // Onboarding (formulário inicial)
    let onboarding = null;
    const abaOn = ssAluno.getSheetByName(ABA.ONBOARDING);
    if (abaOn) {
      const linhas = abaOn.getDataRange().getValues();
      if (linhas.length >= 2) {
        const cabecalho = linhas[0];
        const linha     = linhas[1];
        const obj       = {};
        for (let i = 0; i < cabecalho.length; i++)
          if (cabecalho[i]) obj[txt(cabecalho[i])] = linha[i] || "";
        onboarding = obj;
      }
    }

    // Diagnóstico — pega a última linha (mais recente) de BD_Diagnostico
    let diagnostico = null;
    const abaDiag = ssAluno.getSheetByName(ABA.DIAGNOSTICO);
    if (abaDiag) {
      const matriz = abaDiag.getDataRange().getValues();
      if (matriz.length >= 2) {
        const ultima = matriz[matriz.length - 1];
        const dataRaw = ultima[0];
        const dataFmt = dataRaw instanceof Date
          ? Utilities.formatDate(dataRaw, Session.getScriptTimeZone(), "dd/MM/yyyy")
          : String(dataRaw || "");
        diagnostico = {
          data:       dataFmt,
          biologia:   num(ultima[1]),
          quimica:    num(ultima[2]),
          fisica:     num(ultima[3]),
          matematica: num(ultima[4]),
        };
      }
    }

    return responderJSON({ status: "sucesso", onboarding: onboarding, diagnostico: diagnostico });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
}


// =====================================================================
// EDITAR REGISTRO
// =====================================================================

function handleEditarRegistro(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const idPlanilha = exigirIdPlanilha(dados);
    const aba        = SpreadsheetApp.openById(idPlanilha).getSheetByName(ABA.REGISTROS);
    if (!aba) return responderJSON({ status: "erro", mensagem: "'" + ABA.REGISTROS + "' não encontrada." });
    const matrix      = aba.getDataRange().getValues();
    const semanaAlvo  = txt(dados.semana);
    const dataAlvo    = normalizarData(dados.dataRegistro);
    for (let i = 1; i < matrix.length; i++) {
      if (txt(matrix[i][COL_REG.SEMANA]) === semanaAlvo && normalizarData(matrix[i][COL_REG.DATA]) === dataAlvo) {
        const novaLinha = [
          txt(dados.semana), txt(dados.mes), txt(dados.dataRegistro),
          txt(dados.metaSemanal),          // texto
          num(dados.horasEstudadas), num(dados.dominioTotal), num(dados.progressoTotal),
          num(dados.revisoesAtrasadas), num(dados.estresse), num(dados.ansiedade),
          num(dados.motivacao), num(dados.sono),
          num(dados.dominioBio), num(dados.progressoBio), num(dados.dominioQui),
          num(dados.progressoQui), num(dados.dominioFis), num(dados.progressoFis),
          num(dados.dominioMat), num(dados.progressoMat)
        ];
        aba.getRange(i + 1, 1, 1, novaLinha.length).setValues([novaLinha]);
        return responderJSON({ status: "sucesso" });
      }
    }
    return responderJSON({ status: "erro", mensagem: "Registro não encontrado." });
  } catch (e) { return responderJSON({ status: "erro", mensagem: e.message }); }
  finally     { lock.releaseLock(); }
}


// =====================================================================
// PAINEL DO LÍDER
// =====================================================================

// Lê BD_Mentores e devolve mapa email → { email, nome, dtEntrada } só dos ativos.
// Tolera ausência da aba (devolve {}) durante migração.
function lerMentoresAtivos() {
  var ssMestre = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ssMestre.getSheetByName(ABA.MENTORES);
  if (!aba) return {};
  var matriz = aba.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < matriz.length; i++) {
    var row = matriz[i];
    var email = emailNorm(row[COL_MENTOR.EMAIL]);
    if (!email || txt(row[COL_MENTOR.STATUS]) !== 'Ativo') continue;
    map[email] = {
      email: email,
      nome:  txt(row[COL_MENTOR.NOME]),
      dtEntrada: row[COL_MENTOR.DT_ENTRADA]
    };
  }
  return map;
}

// Semana anterior (dom→sab passados) no formato "DD/MM/YYYY a DD/MM/YYYY"
// (mesmo formato que getSemanaKey do frontend e ULTIMA_SEMANA_REGISTRO)
function computarSemanaAnterior_() {
  var hoje = new Date();
  var domingo = new Date(hoje);
  domingo.setDate(hoje.getDate() - hoje.getDay() - 7);
  var sabado = new Date(domingo);
  sabado.setDate(domingo.getDate() + 6);
  var tz = "GMT-3";
  return Utilities.formatDate(domingo, tz, "dd/MM/yyyy") + ' a ' +
         Utilities.formatDate(sabado,  tz, "dd/MM/yyyy");
}

// Agregado da base — lê BD_Registro e BD_Sim_ENEM de cada aluno.
// Parte cara. Se >45s no log, otimizar.
function agregarMetricasBase_(alunos) {
  var distribuicao = [
    { faixa: '0-5h',   min: 0,  max: 5,   count: 0 },
    { faixa: '5-10h',  min: 5,  max: 10,  count: 0 },
    { faixa: '10-15h', min: 10, max: 15,  count: 0 },
    { faixa: '15-20h', min: 15, max: 20,  count: 0 },
    { faixa: '20h+',   min: 20, max: 999, count: 0 }
  ];
  var historicoPorSemana = {};
  var somas = { domBio:0, cDomBio:0, domQui:0, cDomQui:0, domFis:0, cDomFis:0, domMat:0, cDomMat:0,
                progBio:0, cProgBio:0, progQui:0, cProgQui:0, progFis:0, cProgFis:0, progMat:0, cProgMat:0 };
  var bem = { est:0, cEst:0, ans:0, cAns:0, mot:0, cMot:0, son:0, cSon:0 };
  var totalSim4W = 0;
  var quatroSemanasAtras = new Date(new Date().getTime() - 28 * 24 * 60 * 60 * 1000);

  function acc(valor, campoSoma, campoCount, alvo) {
    var n = parseFloat(valor);
    if (!isNaN(n) && n > 0) { alvo[campoSoma] += n; alvo[campoCount]++; }
  }

  for (var a = 0; a < alunos.length; a++) {
    try {
      var ss = SpreadsheetApp.openById(alunos[a].idAluno);
      var abaReg = ss.getSheetByName(ABA.REGISTROS);
      if (abaReg) {
        var m = abaReg.getDataRange().getValues();
        var filtrados = []; for (var k = 1; k < m.length; k++) if (m[k][COL_REG.SEMANA]) filtrados.push(m[k]);
        var ultimos = filtrados.slice(-12);
        var ultimo  = ultimos[ultimos.length - 1];
        var ultimas4 = filtrados.slice(-4);

        if (ultimo) {
          var horas = parseFloat(ultimo[COL_REG.HORAS]) || 0;
          for (var f = 0; f < distribuicao.length; f++) {
            if (horas >= distribuicao[f].min && horas < distribuicao[f].max) { distribuicao[f].count++; break; }
          }
          acc(ultimo[COL_REG.ESTRESSE],  'est', 'cEst', bem);
          acc(ultimo[COL_REG.ANSIEDADE], 'ans', 'cAns', bem);
          acc(ultimo[COL_REG.MOTIVACAO], 'mot', 'cMot', bem);
          acc(ultimo[COL_REG.SONO],      'son', 'cSon', bem);
        }

        for (var u = 0; u < ultimos.length; u++) {
          var lbl = String(ultimos[u][COL_REG.SEMANA]);
          if (!historicoPorSemana[lbl]) historicoPorSemana[lbl] = { horas: 0, meta: 0, count: 0 };
          historicoPorSemana[lbl].horas += parseFloat(ultimos[u][COL_REG.HORAS]) || 0;
          historicoPorSemana[lbl].meta  += parseFloat(ultimos[u][COL_REG.META])  || 0;
          historicoPorSemana[lbl].count++;
        }

        for (var w = 0; w < ultimas4.length; w++) {
          var r = ultimas4[w];
          acc(r[COL_REG.DOM_BIO],  'domBio',  'cDomBio',  somas);
          acc(r[COL_REG.DOM_QUI],  'domQui',  'cDomQui',  somas);
          acc(r[COL_REG.DOM_FIS],  'domFis',  'cDomFis',  somas);
          acc(r[COL_REG.DOM_MAT],  'domMat',  'cDomMat',  somas);
          acc(r[COL_REG.PROG_BIO], 'progBio', 'cProgBio', somas);
          acc(r[COL_REG.PROG_QUI], 'progQui', 'cProgQui', somas);
          acc(r[COL_REG.PROG_FIS], 'progFis', 'cProgFis', somas);
          acc(r[COL_REG.PROG_MAT], 'progMat', 'cProgMat', somas);
        }
      }

      var abaSim = ss.getSheetByName(ABA.SIMULADOS);
      if (abaSim) {
        var ms = abaSim.getDataRange().getValues();
        for (var si = 1; si < ms.length; si++) {
          var rs = ms[si];
          if (!rs[COL_SIM.ID] || txt(rs[COL_SIM.STATUS]) !== 'Concluída') continue;
          var raw = rs[COL_SIM.DATA]; var d;
          if (raw instanceof Date) d = raw;
          else {
            var s = String(raw).split(' ')[0];
            if (s.indexOf('/') > 0) { var p = s.split('/'); d = new Date(+p[2], +p[1]-1, +p[0]); }
            else d = new Date(s);
          }
          if (d && !isNaN(d.getTime()) && d >= quatroSemanasAtras) totalSim4W++;
        }
      }
    } catch (e) { Logger.log('agregar: erro em ' + alunos[a].idAluno + ' — ' + e.message); }
  }

  var labels = Object.keys(historicoPorSemana).sort(function(a, b) {
    function pl(l) { var p = l.split(' a ')[0].split('/'); return new Date(+p[2], +p[1]-1, +p[0]).getTime(); }
    return pl(a) - pl(b);
  }).slice(-8);

  function avg(s, c) { return c > 0 ? +(s / c).toFixed(1) : 0; }

  return {
    horasEstudadas: {
      distribuicao: distribuicao.map(function(d){ return { faixa: d.faixa, count: d.count }; }),
      historico8Semanas: labels.map(function(l){
        var h = historicoPorSemana[l];
        return { semana: l, mediaHoras: avg(h.horas, h.count), mediaMeta: avg(h.meta, h.count) };
      })
    },
    dominioPorMateria:   { bio: avg(somas.domBio,  somas.cDomBio),  qui: avg(somas.domQui,  somas.cDomQui),  fis: avg(somas.domFis,  somas.cDomFis),  mat: avg(somas.domMat,  somas.cDomMat) },
    progressoPorMateria: { bio: avg(somas.progBio, somas.cProgBio), qui: avg(somas.progQui, somas.cProgQui), fis: avg(somas.progFis, somas.cProgFis), mat: avg(somas.progMat, somas.cProgMat) },
    bemEstar:            { estresse: avg(bem.est, bem.cEst), ansiedade: avg(bem.ans, bem.cAns), motivacao: avg(bem.mot, bem.cMot), sono: avg(bem.son, bem.cSon) },
    simuladosUltimas4Semanas: totalSim4W
  };
}

function handleDashboardLider(dados) {
  try {
    var email = emailNorm(dados.email);
    if (email !== 'filippe@metodointento.com.br') {
      return responderJSON({ status: 'erro', codigo: 403, mensagem: 'Não autorizado' });
    }

    var semanaAtual = computarSemanaAnterior_();
    var ssMestre  = SpreadsheetApp.getActiveSpreadsheet();
    var abaMestre = ssMestre.getSheetByName(ABA.MESTRE);
    if (!abaMestre) throw new Error('Aba mestre não encontrada');
    var matriz = abaMestre.getDataRange().getValues();

    var mentoresAtivos = lerMentoresAtivos();
    var alunos = [];
    for (var i = 1; i < matriz.length; i++) {
      var row = matriz[i];
      var statusOn   = txt(row[COL_MESTRE.STATUS_ONBOARDING]);
      var idPlanilha = txt(row[COL_MESTRE.ID_PLANILHA]);
      if (statusOn !== 'Onboarding Completo' || !idPlanilha) continue;
      var emailMentor = emailNorm(row[COL_MESTRE.MENTOR_RESPONSAVEL]);
      var mentorObj = mentoresAtivos[emailMentor];
      alunos.push({
        idAluno: idPlanilha,
        nome:    txt(row[COL_MESTRE.NOME]),
        email:   emailNorm(row[COL_MESTRE.EMAIL]),
        mentor:  emailMentor,
        mentorNome:  mentorObj ? mentorObj.nome : emailMentor,
        mentorAtivo: !!mentorObj,
        registrouSemanaAtual: txt(row[COL_MESTRE.ULTIMA_SEMANA_REGISTRO]) === semanaAtual,
        ultimoEncontro: txt(row[COL_MESTRE.ULTIMO_ENCONTRO])
      });
    }

    if (dados.skipAgregado) {
      return responderJSON({ status: 'sucesso', semanaAtual: semanaAtual, alunos: alunos, agregado: null });
    }

    Logger.log('dashboardLider: agregando ' + alunos.length + ' alunos');
    var t0 = new Date().getTime();
    var agregado = agregarMetricasBase_(alunos);
    Logger.log('dashboardLider: agregado em ' + ((new Date().getTime() - t0) / 1000) + 's');

    return responderJSON({ status: 'sucesso', semanaAtual: semanaAtual, alunos: alunos, agregado: agregado });
  } catch (e) {
    Logger.log('dashboardLider EXCEPTION: ' + e.message);
    return responderJSON({ status: 'erro', mensagem: e.message });
  }
}
