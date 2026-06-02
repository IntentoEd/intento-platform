-- ============================================================
-- REGISTRO SEMANAL — query master. Replica a lógica do app Flutter
-- (intento-fe: subject_performance.dart, topic_metrics.dart, performance.dart).
-- 1 linha por aluno. Domínio/Progresso = "foto" até semana_fim.
--
-- ESTA É A VERSÃO ROBUSTA (recursive + nome). Mantida em sincronia com
-- _SQL_REGISTRO_APP em gas/integracaoApp.gs. A versão antiga (nivel=1 / folha
-- + ID canônico de disciplina) quebrava em 2 casos reais:
--   1. árvores de 3 níveis (o app deveria ter 2, mas alguns alunos têm 3);
--   2. disciplinas renomeadas ou com IDs próprios (ex: Gabriel).
--
-- COMO A VERSÃO ROBUSTA RESOLVE:
-- · hier (WITH RECURSIVE) percorre topicoPrep de profundidade arbitrária,
--   carregando raizId (disciplina) e n1Id (tópico nível 1) em cada nó.
-- · raiz_materia mapeia disciplina→BIO/QUI/FIS/MAT pelo NOME normalizado
--   (LIKE com `_` como wildcard de acento), imune a IDs divergentes.
--
-- LÓGICA (validada contra o app, mai/2026):
-- · DOMÍNIO por matéria  = SUM(rightAnswers)/SUM(right+wrong) de todos os nós
--   da disciplina. right/wrong de cada folha vêm da ÚLTIMA atividade (por
--   activity.date).
-- · DOMÍNIO total        = SUM(right)/SUM(total) global das matérias.
-- · PROGRESSO por matéria= folhas concluídas / folhas totais (PONDERADO por
--   folha, pooled entre as disciplinas da matéria). Folha = nó sem filhos
--   (subtópico nível 2, ou 3 nas árvores mais fundas). Folha concluída =
--   `finalizada` na própria folha OU em qualquer ancestral (marcar o pai
--   conclui a subárvore, via ramo_fin) OU ≥1 atividade finished até semana_fim.
--   NÃO usa MAX(finalizada): um subtópico marcado não fecha o tópico inteiro;
--   o tópico só fica 100% quando todas as folhas dele estão concluídas.
-- · PROGRESSO total      = folhas concluídas / folhas totais (todas as matérias).
-- · HORAS                = SUM(app.atividade.duration)/3600 na semana.
-- · CHECK-IN             = AVG(app.checkin.*) na semana.
-- · REVISÕES ATRASADAS   = replica activity_service.dueReviews (app.topico.reviews).
--
-- ATENÇÃO: a lógica de PROGRESSO mudou (jun/2026) — passou de "% de tópicos
-- nível-1 finished, por atividade + MAX(finalizada)" para "% de folhas
-- concluídas, ponderado". Os baselines de progresso (prog_*) abaixo são
-- ANTERIORES e NÃO valem mais; re-validar contra o app. Domínio/horas/check-in
-- não foram afetados.
-- Validado mai/2026 (semana 10-16/05) [progresso pré-mudança]:
--   betina  B=0.92 Q=0.88 F=0.85 M=0.89 T=0.89
--   gabriel B=0.89 Q=0.89 F=0.88 M=0.94 T=0.89
--   lisa    B=0.75 Q=0.82 F=0.82 M=0.71 T=0.78
--   claudia B=0.85 Q=0.82 F=0.85 M=0.85 T=0.84
-- ============================================================
-- Semana Dom-Sáb: inicio = domingo, fim = sábado (limite da foto).
DECLARE semana_inicio DATE DEFAULT DATE("2026-05-10");
DECLARE semana_fim    DATE DEFAULT DATE("2026-05-16");
-- Para rodar pra todos os alunos, deixe o array vazio: []
DECLARE alvos ARRAY<STRING> DEFAULT [
  "gabriel.limamoreira@gmail.com","silvaclaudialuisa@gmail.com",
  "lisarevertu@gmail.com","betinavfcarnevale@gmail.com"
];

WITH RECURSIVE
alunos AS (
  SELECT uid, email FROM `intento-edu.app.usuario`
  WHERE ARRAY_LENGTH(alvos) = 0 OR email IN UNNEST(alvos)
),
-- árvore completa por recursão; cada nó carrega raizId (disciplina) e n1Id
-- (tópico nível 1 = 1º descendente da raiz).
-- ramo_fin = `finalizada` acumulado do nó + qualquer ancestral (propaga pra
-- baixo: marcar um pai conclui toda a subárvore dele).
hier AS (
  SELECT topicoId, topicoId AS raizId, CAST(NULL AS STRING) AS n1Id, usuarioId,
    finalizada AS ramo_fin
  FROM `intento-edu.app.topicoPrep`
  WHERE usuarioId IN (SELECT uid FROM alunos) AND paiId IS NULL
  UNION ALL
  SELECT t.topicoId, h.raizId, COALESCE(h.n1Id, t.topicoId), t.usuarioId,
    h.ramo_fin OR t.finalizada
  FROM `intento-edu.app.topicoPrep` t
  JOIN hier h ON t.paiId = h.topicoId AND t.usuarioId = h.usuarioId
),
-- disciplina-raiz → matéria canônica pelo nome (LIKE `_` = wildcard acento).
raiz_materia AS (
  SELECT topicoId AS raizId, usuarioId,
    CASE
      WHEN LOWER(nome) LIKE '%biolog%'  THEN 'BIO'
      WHEN LOWER(nome) LIKE '%qu_mic%'  THEN 'QUI'
      WHEN LOWER(nome) LIKE '%f_sic%'   THEN 'FIS'
      WHEN LOWER(nome) LIKE '%matem_t%' THEN 'MAT'
      ELSE NULL
    END AS materia
  FROM `intento-edu.app.topicoPrep`
  WHERE usuarioId IN (SELECT uid FROM alunos) AND paiId IS NULL
),
-- nós que são pai de alguém (logo, não são folha).
tem_filho AS (
  SELECT DISTINCT paiId AS topicoId, usuarioId FROM `intento-edu.app.topicoPrep`
  WHERE usuarioId IN (SELECT uid FROM alunos) AND paiId IS NOT NULL
),
-- última atividade por (aluno, nó) até semana_fim + contagem de finished.
ativ AS (
  SELECT REGEXP_EXTRACT(__key__.path, r'"u",\s*"([^"]+)"') AS usuarioId, subjectId AS topicoId,
    ARRAY_AGG(STRUCT(rightAnswers, wrongAnswers) ORDER BY TIMESTAMP_SECONDS(date) DESC LIMIT 1)[OFFSET(0)] AS u,
    COUNTIF(finished) AS n_finished
  FROM `intento-edu.app.atividade`
  WHERE REGEXP_EXTRACT(__key__.path, r'"u",\s*"([^"]+)"') IN (SELECT uid FROM alunos)
    AND DATE(TIMESTAMP_SECONDS(date)) <= semana_fim
  GROUP BY usuarioId, topicoId
),
-- só nós dentro de uma disciplina (n1Id NOT NULL exclui a raiz).
nos AS (
  SELECT h.topicoId, h.raizId, h.n1Id, h.usuarioId, h.ramo_fin,
    (tf.topicoId IS NULL) AS eh_folha,
    COALESCE(a.u.rightAnswers, 0) AS right_a,
    COALESCE(a.u.rightAnswers, 0) + COALESCE(a.u.wrongAnswers, 0) AS total_a,
    COALESCE(a.n_finished, 0) AS n_finished
  FROM hier h
  LEFT JOIN tem_filho tf ON tf.topicoId = h.topicoId AND tf.usuarioId = h.usuarioId
  LEFT JOIN ativ a ON a.topicoId = h.topicoId AND a.usuarioId = h.usuarioId
  WHERE h.n1Id IS NOT NULL
),
dominio AS (
  SELECT usuarioId, raizId, SUM(right_a) AS right_d, SUM(total_a) AS total_d
  FROM nos GROUP BY usuarioId, raizId
),
-- folhas concluídas por disciplina. Só folhas (eh_folha) entram na conta.
-- Concluída = ramo_fin (finalizada própria ou de ancestral) OU ≥1 atividade.
folhas AS (
  SELECT usuarioId, raizId,
    COUNT(*) AS total_folhas,
    COUNTIF(ramo_fin OR n_finished >= 1) AS folhas_feitas
  FROM nos WHERE eh_folha
  GROUP BY usuarioId, raizId
),
-- agrega disciplinas pela matéria canônica. Progresso ponderado por folha:
-- soma folhas feitas / soma folhas totais (disciplina maior pesa mais).
metrica AS (
  SELECT d.usuarioId, rm.materia,
    SUM(d.right_d) AS right_d, SUM(d.total_d) AS total_d,
    SUM(f.folhas_feitas) AS folhas_feitas, SUM(f.total_folhas) AS total_folhas
  FROM dominio d
  JOIN raiz_materia rm ON rm.raizId = d.raizId AND rm.usuarioId = d.usuarioId
  LEFT JOIN folhas f ON f.usuarioId = d.usuarioId AND f.raizId = d.raizId
  WHERE rm.materia IS NOT NULL
  GROUP BY d.usuarioId, rm.materia
),
-- HORAS direto do raw (app.atividade.duration). A tratada
-- analise.atividadesSemanais.minutos divergia da realidade do app.
semana_horas AS (
  SELECT REGEXP_EXTRACT(__key__.path, r'"u",\s*"([^"]+)"') AS usuarioId,
    ROUND(SUM(duration) / 3600.0, 1) AS horas
  FROM `intento-edu.app.atividade`
  WHERE DATE(TIMESTAMP_SECONDS(date)) BETWEEN semana_inicio AND semana_fim
  GROUP BY usuarioId
),
-- CHECK-IN direto do raw (app.checkin). A tratada enviesava a média.
semana_checkin AS (
  SELECT REGEXP_EXTRACT(__key__.path, r'"u",\s*"([^"]+)"') AS usuarioId,
    ROUND(AVG(stress.float), 2)     AS estresse,
    ROUND(AVG(anxiety.float), 2)    AS ansiedade,
    ROUND(AVG(motivation.float), 2) AS motivacao,
    ROUND(AVG(rest.float), 2)       AS sono
  FROM `intento-edu.app.checkin`
  WHERE DATE(createdAt) BETWEEN semana_inicio AND semana_fim
  GROUP BY usuarioId
),
-- Revisões Atrasadas — replica activity_service.dueReviews do app.
-- Pra cada (aluno, tópico): dueRev = MAX(r em topico.reviews) onde r < (fim+1d).
-- Atrasado = existe dueRev E sem atividade depois dele.
rev_due AS (
  SELECT REGEXP_EXTRACT(__key__.path, r'"u",\s*"([^"]+)"') AS usuarioId,
    REGEXP_EXTRACT(__key__.path, r'"s",\s*"([^"]+)"') AS topicoId, MAX(r) AS due_rev
  FROM `intento-edu.app.topico`, UNNEST(reviews) r
  WHERE ARRAY_LENGTH(reviews) > 0
    AND r < UNIX_SECONDS(TIMESTAMP(DATE_ADD(semana_fim, INTERVAL 1 DAY)))
  GROUP BY usuarioId, topicoId
),
rev_ult_ativ AS (
  SELECT REGEXP_EXTRACT(__key__.path, r'"u",\s*"([^"]+)"') AS usuarioId,
    subjectId AS topicoId, MAX(date) AS last_ts
  FROM `intento-edu.app.atividade` WHERE DATE(TIMESTAMP_SECONDS(date)) <= semana_fim
  GROUP BY usuarioId, topicoId
),
rev_atrasadas AS (
  SELECT d.usuarioId, COUNT(*) AS revisoes_atrasadas
  FROM rev_due d LEFT JOIN rev_ult_ativ a USING (usuarioId, topicoId)
  WHERE a.last_ts IS NULL OR a.last_ts <= d.due_rev
  GROUP BY d.usuarioId
)
SELECT a.email,
  ROUND(MAX(IF(m.materia='BIO', SAFE_DIVIDE(m.right_d,m.total_d), NULL)), 2) AS dom_BIO,
  ROUND(MAX(IF(m.materia='QUI', SAFE_DIVIDE(m.right_d,m.total_d), NULL)), 2) AS dom_QUI,
  ROUND(MAX(IF(m.materia='FIS', SAFE_DIVIDE(m.right_d,m.total_d), NULL)), 2) AS dom_FIS,
  ROUND(MAX(IF(m.materia='MAT', SAFE_DIVIDE(m.right_d,m.total_d), NULL)), 2) AS dom_MAT,
  ROUND(SAFE_DIVIDE(SUM(m.right_d), SUM(m.total_d)), 2) AS dom_TOTAL,
  ROUND(MAX(IF(m.materia='BIO', SAFE_DIVIDE(m.folhas_feitas, m.total_folhas), NULL)), 2) AS prog_BIO,
  ROUND(MAX(IF(m.materia='QUI', SAFE_DIVIDE(m.folhas_feitas, m.total_folhas), NULL)), 2) AS prog_QUI,
  ROUND(MAX(IF(m.materia='FIS', SAFE_DIVIDE(m.folhas_feitas, m.total_folhas), NULL)), 2) AS prog_FIS,
  ROUND(MAX(IF(m.materia='MAT', SAFE_DIVIDE(m.folhas_feitas, m.total_folhas), NULL)), 2) AS prog_MAT,
  ROUND(SAFE_DIVIDE(SUM(m.folhas_feitas), SUM(m.total_folhas)), 2) AS prog_TOTAL,
  COALESCE(sh.horas, 0) AS horas,
  sc.estresse, sc.ansiedade, sc.motivacao, sc.sono,
  COALESCE(ra.revisoes_atrasadas, 0) AS revisoes_atrasadas
FROM alunos a
LEFT JOIN metrica m ON m.usuarioId = a.uid
LEFT JOIN semana_horas sh ON sh.usuarioId = a.uid
LEFT JOIN semana_checkin sc ON sc.usuarioId = a.uid
LEFT JOIN rev_atrasadas ra ON ra.usuarioId = a.uid
GROUP BY a.email, sh.horas, sc.estresse, sc.ansiedade, sc.motivacao, sc.sono, ra.revisoes_atrasadas
ORDER BY a.email
