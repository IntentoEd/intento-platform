# Redesign da Plataforma Intento — Sumário da Discussão

**Data**: 2026-05-06
**Escopo**: Suportar Mentoria Pré-vestibular (com escopo expandido custom) e Acompanhamento Escolar (AE) na mesma Plataforma sem que a UI force convergência indevida entre os métodos.
**Plano técnico de implementação**: `~/.claude/plans/1-relat-rio-semanal-da-pure-knuth.md`

---

## 1. Premissas e contexto

### 1.1 Distinção Plataforma vs Aplicativo

A Intento opera **dois produtos digitais separados**:

- **Plataforma** (este repo, `intento-platform`) — portal web do mentor, aluno, família. Cadastros, planejamento, painéis, financeiro, agenda, sessões, relatórios.
- **Aplicativo** — produto separado, fora deste repo. É onde alunos da Mentoria Pré-vestibular fazem log retrospectivo de comportamento de estudo.

Quando se fala em "log de comportamento" da mentoria, o dado **mora no Aplicativo, não na Plataforma**. Não há integração assumida.

### 1.2 Restrições estruturais (não-negociáveis)

- **Escala alvo**: ~150 alunos máx no início de 2027 (somando os dois produtos).
- **Banco de questões**: é de terceiro, em outra plataforma. A Plataforma não armazena itens, não aplica e não calibra questões. Resultado agregado pode entrar.
- **Log comportamental da mentoria**: hoje vive no Aplicativo. Pode ser migrado pra Plataforma — em discussão (ver §11).
- **Migração pra Supabase**: planejada pra **dezembro 2026** (após ENEM em novembro), quando volume é mínimo. Schema em Sheets deve ser desenhado pensando em portabilidade pra Postgres.
- **Sheets+GAS aguenta a escala atual** sem necessidade de DB real agora. O esforço de redesign vai em **disciplina de schema e separação de vocabulário**, não em swap de backend.

---

## 2. Os dois produtos

### 2.1 Mentoria Pré-vestibular

- Método catalogado por protocolos.
- Eixos: **Fase × Ciclo** (Iniciante/Aprendiz/Veterano/Mestre × C1–C4 trimestrais).
- Aluno autônomo, horizonte saliente (ENEM ou outras provas).
- Tracking principal: log de comportamento via **Aplicativo externo**.
- Métrica de desfecho: simulado calibrado.
- **Variação custom**: alunos com `provasAlvo` diferente de ENEM (FUVEST, concursos) e/ou disciplinas extras. **Não é produto novo** — é variação dentro do mesmo produto.

### 2.2 Acompanhamento Escolar (AE)

- Método por princípios estruturantes (não por protocolos).
- Eixo único de fases F1/F2/F3 (implementação adiada — não nesta rodada).
- Aluno do EM, com função executiva em desenvolvimento, sem horizonte terminal saliente.
- Tracking principal: aderência a plano prescrito pelo mentor + banco de questões filtrado por série (banco externo).
- Métrica de desfecho: aderência ao plano + acerto em banco controlado.
- **Família é stakeholder ativo**.

### 2.3 Decisão metodológica fundamental: AE é superconjunto da Mentoria

AE **não é produto paralelo**. Mentoria standalone (cursinho/pré-vest) é o **núcleo**. AE = núcleo + extensões EM-only (avaliações escolares, plano com check, modal pós-check, relatório pra família).

Implicação: estrutura de pastas é aditiva, não excludente:

```
components/painel/
  core/        # núcleo: painel de fase, simulados, semana padrão, registro semanal
  escolar/     # extensões EM-only: boletim escolar, BD_SemanaCheck, modal pós-check, registro diário, relatório família
```

Branching:
```js
<Core aluno={aluno} />
{produto === 'AE' && <ExtensoesEscolares aluno={aluno} />}
```

---

## 3. Decisões consolidadas

### 3.1 Identidade e roteamento de produto

| Decisão | Detalhe |
|---|---|
| Split por flag | `produto: 'mentoria' \| 'AE'` em BD_Alunos. Substitui `tipoAluno: 'EM' \| 'ENEM'`. Espelho mantido por 1 release pra rollback. |
| Onboarding | 1º, 2º, 3º EM → AE. Cursinho/Pré-vestibular → mentoria. **Regra dura**, sem override. |
| Mentor cross-produto | Mentor pode atender alunos de ambos. UI é função do aluno aberto, nunca toggle global. |
| Líder substitui produto | TODAS as abas (de ambos os produtos) existem em todas as planilhas individuais. Vazias não consomem células. Líder troca produto sem migrar estrutura. |

### 3.2 Mentoria custom (prioridade declarada)

- 80% dos alunos de mentoria seguem default ENEM (não percebem diferença).
- 20% custom: `provasAlvo: ['FUVEST', 'UNICAMP']` ou similar + `disciplinas` extras.
- **Implementação**: constantes hard-coded (`COL_REG.DOM_BIO`, cards de Domínio Biologia/Química/..., colunas LG/CH/CN/MAT/REDACAO em simulados) viram **iteração sobre `aluno.disciplinas`**.
- Campos mutáveis pós-onboarding. **Só mentor edita** (decisão pedagógica). Aluno apenas visualiza qual versão está ativa.

### 3.3 Família — modelo mínimo

- **Stakeholder exclusivo do AE.** Mentoria não tem visão de família.
- Sem login próprio. Acesso por **link assinado** (token JWT/HMAC contra `BD_Alunos.tokenFamilia`).
- Read-only.
- Vê: contato com mentor + relatório semanal (gerado em PNG, distribuído por WhatsApp pelo mentor).
- Sem múltiplos responsáveis com permissão fina, sem ações da família, sem comparação social.

### 3.4 Vocabulário

- **Adiado**: dicionário centralizado de vocabulário por produto.
- Por enquanto: vocabulário hard-coded por componente da pasta do produto.
- Quando implementar fases F1/F2/F3 (não nesta rodada), aí vale formalizar.

### 3.5 Decisões removidas do escopo

- Nível de andaimento (era pra ser derivado de F1/F2/F3 — fora desta rodada).
- Pausar relatório familiar pelo aluno.
- Toggle "ver o que minha família recebe" no /painel.
- Vigilância automatizada de saúde mental.
- Tabela `BD_Caderno_Revisoes`.
- Vocabulário unificado `AREAS_METODO`.
- Email automático para família.
- Geração via HTML→PDF (Puppeteer/Vercel Cron).
- Cron sexta de manhã automatizado.

---

## 4. Schema de dados

### 4.1 BD_Alunos (planilha mestre — colunas novas)

- `produto: 'mentoria' | 'AE'`
- `provasAlvo: string[]` (CSV) — só mentoria. Default `ENEM`.
- `disciplinas: string[]` (CSV) — só mentoria. Default = ENEM padrão.
- `serieEscolar: '1EM'|'2EM'|'3EM'` — só AE.
- `tokenFamilia: string` — só AE.

### 4.2 Sheets novas

| Sheet | Localização | Propósito |
|---|---|---|
| `BD_Simulados` | mestre | Header de simulados. Migra de `BD_Sim_ENEM` (per-aluno hoje). |
| `BD_Simulado_Notas` | mestre | EAV das notas: `id_nota, id_simulado, id_aluno, disciplina, nota`. Suporta disciplinas custom. |
| `BD_Simulados_Archive` | mestre | Cron anual move registros >12 meses pra cá. |
| `BD_SemanaCheck` | per-aluno | Matriz 16×7 de check de cumprimento (espelho do `BD_Semana`). Só AE escreve. |
| `BD_RegistroAE` | per-aluno | Registro semanal AE (data, semanaRef, % aderência, observação do mentor). |
| `BD_Registro_Diario_AE` | per-aluno | Registro diário do aluno EM: `DATA, HORAS, AREA, OBSERVACAO`. `AREA` ∈ {Codificação, Revisão, Hábitos, Estratégia de Prova}. |
| `BD_Registro_Notas` | per-aluno | EAV das notas de domínio/progresso por disciplina (vinculado a `BD_Registro` da mentoria). Suporta disciplinas custom. |

**Importante**: todas as abas acima criadas em **todas as planilhas individuais**, mesmo se aluno hoje é mentoria — pra permitir líder trocar produto sem migrar estrutura. Vazias não consomem células.

### 4.3 BD_Avaliacoes (já existe, mestre — reutilizado)

- Modal pós-check do aluno (AE) grava com `TIPO='banco-serie'` e `CRIADO_POR='aluno:{email}'`.
- Handler novo: `handleAlunoRegistraAplicacao` — validação obrigatória `ID_ALUNO === seu_id`.

### 4.4 Decisão D-1: BD_Simulados — migração total

- Migrar de `BD_Sim_ENEM` (per-aluno) → `BD_Simulados` (mestre).
- **Justificativa de peso**: 150 alunos × ~12 simulados/ano × 15 cols = 27k cells/ano. Cap do Sheets = 10M. Folgado mesmo com 5 anos acumulados.
- Cron de migração 1x. Cron anual move >12 meses pra Archive.

### 4.5 Decisão D-2: notas em EAV

- `BD_Simulados` (header) sem colunas LG/CH/CN/MAT/REDACAO.
- `BD_Simulado_Notas` (EAV: `id_nota, id_simulado, id_aluno, disciplina, nota`).
- **Justificativa**: mapeamento direto pro Postgres na migração futura. Disciplinas custom não exigem schema migration. Em Sheets, ~12.600 linhas/ano, custo de JOIN manual aceitável.

### 4.6 Decisão D-5: reformulação Kolb

Substituir as 5 colunas Kolb (`KOLB_EXP/REF/CON/ACAO/REDACAO` em [gas/Code.gs:148-152](gas/Code.gs#L148-L152)) por 7 campos estruturados:

- `PREDICAO_ACERTOS` (int 0-100): predição prévia de calibração.
- `ERRO_PRINCIPAL` (text 1 frase): "o erro que mais te incomodou — você errou porque..."
- `PLANO_ATE_PROXIMO` (text 1 frase): implementation intention.
- `SUBJ_CANSACO`, `SUBJ_ANSIEDADE`, `SUBJ_CONFIANCA`, `SUBJ_DISTRACAO` (int 1-6 cada).

**Diagnóstico empírico antes de migrar**: contar % de simulados com algum `KOLB_*` preenchido. Se < 30%, descarta. Se ≥ 30%, preserva como `kolbLegado: JSON` na nova schema.

**Base na literatura**: self-explanation effect (Bisra et al. 2018, g≈0.55), generation effect, calibration judgments (Koriat), implementation intentions (Gollwitzer).

**UI nova**: tela linear pós-notas com 7 campos + visualização de simulado anterior + cartão agregado de calibração + lista de últimos 5 erros e planos.

**Não fazer**: categorização automática de `ERRO_PRINCIPAL`, exigir reflexão profunda genérica, bloquear registro por reflexão obrigatória.

---

## 5. Relatórios semanais

### 5.1 Mentoria — sem mudança estrutural

- Atual "Acompanhamento Semanal" (16 cards comparativos current × prev em [gas/Code.gs:685-717](gas/Code.gs#L685-L717), preenchidos pelo MENTOR em `BD_Registro` semanal) **continua exatamente como é hoje**.
- Apenas renomeação cosmética: "Acompanhamento Semanal" → "Relatório Semanal do Aluno" (Fase 0).
- Os 8 cards de "Domínio/Progresso por disciplina" passam a iterar sobre `aluno.disciplinas` (suporta mentoria custom).
- **Sem relatório de família para mentoria.**

### 5.2 AE — relatórios novos

Baseados nos documentos `relatorio_semanal_aluno.md` e `relatorio_semanal_familia.md`.

**Relatório do aluno AE** (3 blocos):
- Bloco 1 (Constância): grade 7 dias com 3 estados (cheio/parcial/vazio) lendo `BD_Registro_Diario_AE`. Comparação intrapessoal com semana anterior.
- Bloco 2 (Caderno de erros): 3 números (adicionados, revisados, atrasados). Cor: 0 navy, 1-5 amarelo, 6+ vermelho. Sem `BD_Caderno_Revisoes` — contar revisões direto do `BD_Caderno.HISTORICO` se possível, ou simplificar.
- Bloco 3 (Áreas de atividade): barra segmentada com **distribuição realizada** (somando horas por `AREA` em `BD_Registro_Diario_AE`). 4 áreas fixas: Codificação, Revisão, Hábitos, Estratégia de Prova.

**Relatório da família AE** (2 blocos):
- Bloco 1 (Constância): grade 7 dias idêntica ao do aluno. Com comparação intrapessoal.
- Bloco 2 (Marcos do mês): lista factual de avaliações (`BD_Avaliacoes`) do mês. **Sem nota** (decisão pedagógica: evita comparação social, descontextualização e invasão do espaço de processamento do aluno).

**Princípios fixos**:
- Quantitativo apenas, sem prosa interpretativa.
- Complementa o áudio do mentor.
- Tipografia: Source Serif 4 + Ubuntu.
- Paleta: navy `#060242`, amarelo `#F5D83B`, cinzas, vermelho permitido (apenas para atrasos 6+ no Bloco 2).

### 5.3 Geração e distribuição

- **PNG via `html2canvas`** no cliente (modelo do `app/mentor/ig/painel/page.js`). Sem Puppeteer, sem cron servidor.
- **Distribuição: WhatsApp**. Sem email. Sem cron automático.
- **Mentor gera os dois PNGs** (aluno + família) toda sexta na visão `/mentor/[id]`. Manda no WhatsApp do aluno e da família. Garante cadência ao custo de trabalho operacional recorrente do mentor.

---

## 6. Plano de execução faseado

Cada fase é commit/deploy separado. GAS sobe antes do Next em cada fase. `clasp push && clasp deploy -i <id>` obrigatório.

| Fase | Escopo |
|---|---|
| **0** | Renomear "Acompanhamento Semanal" → "Registro Semanal" no client. Mata colisão com produto AE. |
| **1** | Schema base: `produto`, `provasAlvo`, `disciplinas`, `serieEscolar`, `tokenFamilia` em BD_Alunos. Cron de população retroativa. Espelho `tipoAluno` mantido por 1 release. |
| **2** | Reorganização de pastas: `components/painel/{core,escolar}/`. Mover componentes existentes. Decisão única no topo das páginas. Sem mudança de comportamento. |
| **3** | Mentoria custom (PRIORIDADE): refator pra ler `disciplinas`/`provasAlvo`. EAV em `BD_Registro_Notas`. Boletim, simulado, cards iteram em vez de hard-coded. |
| **4** | AE: plano prescrito + check + registro diário. `BD_SemanaCheck`, modal pós-check, `BD_Registro_Diario_AE` com seletor de área. |
| **5** | Relatórios semanais AE. `RelatorioSemanalAlunoAE` (3 blocos) + `RelatorioSemanalFamiliaAE` (2 blocos). Exportador PNG via html2canvas. |
| **6** | BD_Simulados: migração total + reformulação Kolb (sub-passos 6.0 diagnóstico → 6.5 archive anual). |

---

## 7. Decisões em aberto

### 7.1 Logs do App externo — migrar pra Plataforma? (CRÍTICA)

**Contexto**: alunos da mentoria hoje fazem 5-6 entradas/dia no App externo. Total estimado: 150 alunos × 5,5 entradas/dia × 7 meses até Supabase = ~173k linhas (mestre) ou ~1.155 linhas/aluno (per-aluno). **Sheets aguenta os 7 meses sem dor real**, especialmente per-aluno.

**Ganho da migração**: automação do Registro pro mentor (hoje mentor transcreve manualmente do App pro `BD_Registro` semanal — significativo em horas-mentor) + UX unificada pro aluno.

**Restrição**: App externo não tem API. Migração é "switch UX" — aluno passa a logar na Plataforma a partir de data X. Histórico do App fica no App. App não vai expirar (pode coexistir).

**3 caminhos possíveis**:

| Caminho | Descrição | Trade-off |
|---|---|---|
| **A. Migrar tudo agora** | Aluno loga na Plataforma + `BD_Registro` semanal vira derivado automático do diário. Mentor para de transcrever. | Ganho operacional grande. **Refator duplo** (Sheets agora, Postgres em dezembro). Risco: bug na agregação = mentor sem dado. |
| **B. Intermediário** | Aluno loga na Plataforma. `BD_Registro` semanal continua input manual do mentor (mas mentor olha o log na Plataforma, não no App). | UX unificada agora. Sem automação até Supabase. Refator único em dezembro. Risco baixo. |
| **C. Esperar Supabase (status quo)** | Tudo continua como hoje até dezembro. Mentor transcreve, aluno usa App. | Faz uma vez certo. 7 meses operando fragmentado. |

**Heurística**:
- Argumento principal = tempo recuperado do mentor → caminho A.
- Argumento principal = UX unificada do aluno → caminho B.
- Operação atual não incomoda → caminho C.

**Decisão pendente do user**.

### 7.2 Implicações se A ou B forem escolhidos

Se A ou B, o plano técnico precisa ajustar:

- **Renomear** `BD_Registro_Diario_AE` → `BD_Registro_Diario` (genérico, ambos produtos usam).
- **Schema** desenhado portável pra Postgres:
  ```
  BD_Registro_Diario (per-aluno)
    id_log, data, hora, area, horas, disciplina, tipo_atividade, observacao, origem
  ```
- Se A: nova subfase 4.5 — refator do "Acompanhamento Semanal" da mentoria pra ler do diário em vez de input direto do mentor.

### 7.3 Pontos menores ainda em aberto

- **Implementação das fases F1/F2/F3** do AE — adiada pra rodada futura. Quando vier, pode trazer dicionário de vocabulário centralizado.
- **Boletim quantitativo do AE** (já no roadmap antigo de memória) — encaixa em `boletim/escolar/` quando vier.

---

## 8. Memórias relevantes acumuladas

Persistidas em `~/.claude/projects/-Users-filippeximenes-Documents-intento-platform/memory/`:

- `project_plataforma_vs_aplicativo.md` — Plataforma e Aplicativo são produtos digitais separados.
- `project_banco_questoes_terceiro.md` — Banco de questões fora da Plataforma.
- `project_escala_alvo_2027.md` — 150 alunos máx início 2027.
- `project_acompanhamento_escolar.md` — AE Phase 3 em prod.
- `project_gas_deploy.md` — `clasp deploy -i <id>` obrigatório.
- `project_split_code_gs.md` — refator de gas/Code.gs adiado.
- `feedback_critique_before_implementing.md` — criticar antes de implementar.
- `feedback_session_reset.md`, `feedback_run_tests_after_push.md`, `feedback_inspect_before_gas_deploy.md`, `feedback_build_before_commit.md`.

---

## 9. Próximos passos

1. **User decide caminho dos logs** (A, B ou C) — §7.1.
2. Se necessário, ajustar plano técnico em `~/.claude/plans/1-relat-rio-semanal-da-pure-knuth.md` em consequência.
3. Iniciar pela **Fase 0** (renomeação preventiva) — commit isolado, baixo risco, mata colisão de nomenclatura antes que cresça.
4. Smoke test obrigatório pós-cada-deploy (`npm run build` + `git stash --keep-index` + `clasp deploy -i <id>` + verificação manual em produção).
