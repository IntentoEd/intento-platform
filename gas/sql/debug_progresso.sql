-- ============================================================
-- DEBUG / VALIDAÇÃO do PROGRESSO por folha (jun/2026)
-- ============================================================
-- Roda no console do BigQuery pra conferir o progresso novo (% de folhas
-- concluídas, ponderado) contra o que o aluno vê no app. Ajuste semana_fim
-- pra a "foto" que você quer comparar (mesma data que o app reflete hoje).
--
-- Saída A (por matéria): n_topicos, prog_novo (= média das frações dos tópicos).
-- Saída B (por tópico nível-1): drill-down pra ver folhas/feitas/prog_n1.
--   Troque o SELECT final no fim do arquivo pra ver uma ou outra.
-- ============================================================
DECLARE semana_fim DATE DEFAULT DATE("2026-05-30");  -- ajuste p/ a semana comparada
DECLARE alvos ARRAY<STRING> DEFAULT [
  "contato.ana93@gmail.com",          -- Ana   (relato: MAT app 0.22)
  "joaopedrofrancisco23@gmail.com",   -- João  (relato: FIS app 0.58)
  "vallsr11@gmail.com"                -- Val   (relato: FIS app 0.27)
];

WITH RECURSIVE
alunos AS (
  SELECT uid, email FROM `intento-edu.app.usuario`
  WHERE email IN UNNEST(alvos)
),
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
raiz_materia AS (
  SELECT topicoId AS raizId, usuarioId,
    CASE
      WHEN LOWER(nome) LIKE '%biolog%'  THEN 'BIO'
      WHEN LOWER(nome) LIKE '%qu_mic%'  THEN 'QUI'
      WHEN LOWER(nome) LIKE '%f_sic%'   THEN 'FIS'
      WHEN LOWER(nome) LIKE '%matem_t%' THEN 'MAT'
      ELSE NULL END AS materia
  FROM `intento-edu.app.topicoPrep`
  WHERE usuarioId IN (SELECT uid FROM alunos) AND paiId IS NULL
),
-- nome do tópico nível-1 (pra leitura do drill-down)
n1_nome AS (
  SELECT topicoId AS n1Id, usuarioId, nome AS n1_nome
  FROM `intento-edu.app.topicoPrep`
  WHERE usuarioId IN (SELECT uid FROM alunos)
),
tem_filho AS (
  SELECT DISTINCT paiId AS topicoId, usuarioId FROM `intento-edu.app.topicoPrep`
  WHERE usuarioId IN (SELECT uid FROM alunos) AND paiId IS NOT NULL
),
ativ AS (
  SELECT REGEXP_EXTRACT(__key__.path, r'"u",\s*"([^"]+)"') AS usuarioId, subjectId AS topicoId,
    COUNTIF(finished) AS n_finished
  FROM `intento-edu.app.atividade`
  WHERE REGEXP_EXTRACT(__key__.path, r'"u",\s*"([^"]+)"') IN (SELECT uid FROM alunos)
    AND DATE(TIMESTAMP_SECONDS(date)) <= semana_fim
  GROUP BY usuarioId, topicoId
),
nos AS (
  SELECT h.raizId, h.n1Id, h.usuarioId, h.ramo_fin,
    (tf.topicoId IS NULL) AS eh_folha,
    COALESCE(a.n_finished, 0) AS n_finished
  FROM hier h
  LEFT JOIN tem_filho tf ON tf.topicoId = h.topicoId AND tf.usuarioId = h.usuarioId
  LEFT JOIN ativ a ON a.topicoId = h.topicoId AND a.usuarioId = h.usuarioId
  WHERE h.n1Id IS NOT NULL
),
-- por tópico nível-1: folhas e quantas concluídas
n1 AS (
  SELECT usuarioId, raizId, n1Id,
    COUNTIF(eh_folha) AS folhas,
    COUNTIF(eh_folha AND (ramo_fin OR n_finished >= 1)) AS folhas_feitas,
    -- fração de subtópicos concluídos DENTRO do tópico (cada tópico pesa 1/N)
    SAFE_DIVIDE(COUNTIF(eh_folha AND (ramo_fin OR n_finished >= 1)), COUNTIF(eh_folha)) AS prog_n1
  FROM nos GROUP BY usuarioId, raizId, n1Id
)
-- ---------- SAÍDA A: por matéria ----------
-- prog_novo = MÉDIA das frações dos tópicos (fórmula em prod desde jun/2026).
SELECT a.email, rm.materia,
  COUNT(*)              AS n_topicos,
  ROUND(AVG(n1.prog_n1), 2) AS prog_novo
FROM n1
JOIN alunos a       ON a.uid = n1.usuarioId
JOIN raiz_materia rm ON rm.raizId = n1.raizId AND rm.usuarioId = n1.usuarioId
WHERE rm.materia IS NOT NULL
GROUP BY a.email, rm.materia
ORDER BY a.email, rm.materia;

-- ---------- SAÍDA B: drill-down por tópico nível-1 ----------
-- (comente a SAÍDA A acima e descomente esta pra ver tópico a tópico)
-- SELECT a.email, rm.materia, nn.n1_nome,
--   n1.folhas, n1.folhas_feitas,
--   ROUND(SAFE_DIVIDE(n1.folhas_feitas, n1.folhas), 2) AS prog_n1
-- FROM n1
-- JOIN alunos a        ON a.uid = n1.usuarioId
-- JOIN raiz_materia rm  ON rm.raizId = n1.raizId AND rm.usuarioId = n1.usuarioId
-- LEFT JOIN n1_nome nn  ON nn.n1Id = n1.n1Id AND nn.usuarioId = n1.usuarioId
-- WHERE rm.materia IS NOT NULL
-- ORDER BY a.email, rm.materia, nn.n1_nome;
