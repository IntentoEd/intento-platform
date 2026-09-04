# Intento — Contexto da Plataforma

> Documento self-contained pra qualquer Claude (web, code, etc.) entender a estrutura atual da **Plataforma Intento** (este repo). Atualizado em 2026-09-02.
>
> **Esta é a Plataforma, não o Aplicativo.** Ver §1.1.

## 1. Visão Geral

A Intento é uma empresa de mentoria pra vestibulares (ENEM, FUVEST, UNICAMP, FAMERP, FGV, Insper, etc.) + cursos de Medicina, e também faz **Acompanhamento Escolar (AE)** pra alunos de Ensino Médio. A Plataforma é uma web app (Next.js 16 App Router + PWA) que conecta alunos, mentores e o líder da operação.

**URL produção:** mentoria.metodointento.com.br
**Founder / líder de mentoria:** Filippe Ximenes ([filippe@metodointento.com.br](mailto:filippe@metodointento.com.br)) — **único dono ativo do repo**.

**Rafael (sócio) saiu da operação da Plataforma.** O CRM/comercial operacional migrou pra uma plataforma externa. O código do CRM (`app/vendas/`, `gas/crm.gs`, `gas/agenda.gs`) permanece no repo e funcional, mas **sem dono ativo — tratar como legado em manutenção** (ver §5.5 e §11).

### 1.1 Plataforma ≠ Aplicativo

A Intento opera **dois produtos digitais separados**:

- **Plataforma** (este repo, `intento-platform`) — portal web do mentor, aluno e líder. Cadastros, planejamento, painéis, simulados, provas, gamificação, relatórios. (Também abriga o CRM legado.)
- **Aplicativo** (`intento-fe`, repo Flutter externo do Gustavo Oliveira em `github.com/cetres/intento-fe`) — onde alunos da Mentoria Pré-vestibular fazem log retrospectivo de comportamento de estudo (check-in de bem-estar incluso).

O **log comportamental bruto mora no Aplicativo, não aqui** — MAS existe **integração em produção desde maio/2026**: [gas/integracaoApp.gs](gas/integracaoApp.gs) lê o BigQuery do projeto `intento-edu` via Service Account (`intento-platform-bq-reader@intento-edu.iam.gserviceaccount.com`) e um **cron no GAS (Domingo 22h, `cronGerarRegistrosApp`)** gera os Registros Semanais de cada aluno a partir do uso do app (query em [gas/sql/registro_semanal_app.sql](gas/sql/registro_semanal_app.sql)). O mentor **revisa** o registro auto-gerado via UI. Cada aluno tem um `status_app` (`Usa` | `Não se adaptou` | `Nunca vai usar` — `COL_MESTRE.STATUS_APP`, [components/StatusAppSelect.js](components/StatusAppSelect.js), handler `salvarStatusApp`) que define se o cron tenta puxar registro pra ele.

Ou seja: a Plataforma **não armazena** o log bruto, mas **importa o resumo semanal** via BigQuery.

## 2. Atores do sistema

| Papel | Email padrão | O que faz |
|---|---|---|
| **Aluno** | qualquer | Acompanha próprio painel (registros, simulados, plano de ação, caderno de erros, jornada/gamificação, boletim escolar se for AE) |
| **Mentor** | `*@metodointento.com.br` | Atende alunos designados; revisa registros semanais; conduz encontros (Modo Encontro); lança avaliações em `BD_Avaliacoes` |
| **Líder de mentoria** | `filippe@metodointento.com.br` (hard-coded) | Visão macro da operação, filas de atenção operacional e clínica, designa mentores, inativa alunos, métricas agregadas |
| **Vendedor** *(legado)* | `BD_Vendedores` | Papel do CRM legado — pipeline de leads e agenda comercial. Sem operação ativa; a operação comercial migrou pra plataforma externa |

Líder também atende mentorias diretamente — por isso ele tem 2 modos (Painel do Mentor ou Painel do Líder), escolhidos numa tela intermediária `/selecionar-modo`. O login também suporta perfil **híbrido vendedor+mentor** → `/selecionar-modo` (ver §5.1).

## 3. Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend: Next.js 16.2.3 App Router + React 19.2.4        │
│  + Tailwind 4 (sem tailwind.config.js — tokens no @theme   │
│  de app/globals.css)                                        │
│  Hospedagem: Vercel (Hobby — pendente upgrade pro Pro)     │
│  Auth: Firebase Auth (Google login + email)                │
│  PWA: instalável, offline shell, push notifications        │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  API Routes (Next.js): /api/{mentor,leads,agenda,...}      │
│  - cache em memória com TTL por ação, por-email            │
│  - chamarGAS (lib/gasClient.js) injeta GAS_API_TOKEN       │
│  - endpoints sensíveis validam Firebase ID token (Bearer)  │
│  - firebase-admin 13 valida token no server                │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend: Google Apps Script (deployed Web App)            │
│  - ~65 despachos de ação no doPost (gas/Code.gs)           │
│  - split por domínio: Code.gs + crm/agenda/escolar/push/   │
│    marcos/integracaoApp/SmokeTest (.gs) — ver abaixo       │
│  - sincronizado via clasp do repo                          │
│  - VALIDAR_TOKEN = true (enforcement ativo)                │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Storage: Google Sheets                                     │
│  - 1 planilha mestre (script bound)                        │
│  - 1 planilha individual por aluno                         │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Integrações: BigQuery (intento-edu — resumo semanal do    │
│  Aplicativo), Google Calendar, GmailApp, Web Push,         │
│  Typebot (webhook leads), WhatsApp (link wa.me)            │
└─────────────────────────────────────────────────────────────┘
```

**Split do GAS por domínio** (handlers de Lead/Agenda **não** estão mais em `Code.gs`):

- [gas/Code.gs](gas/Code.gs) — core: constantes (ABA, COL_*, FASES_LEAD, TIPOS_*, OUTCOMES_*), doPost/roteamento, aluno, onboarding, diagnóstico, simulados, login
- [gas/crm.gs](gas/crm.gs) — CRM/leads (legado)
- [gas/agenda.gs](gas/agenda.gs) — agenda comercial (legado)
- [gas/escolar.gs](gas/escolar.gs) — Ciclo de Provas / `BD_Avaliacoes`
- [gas/push.gs](gas/push.gs) — push notifications
- [gas/marcos.gs](gas/marcos.gs) — gamificação (aba `BD_Marcos`)
- [gas/integracaoApp.gs](gas/integracaoApp.gs) — integração BigQuery com o Aplicativo (cron Dom 22h)
- [gas/SmokeTest.gs](gas/SmokeTest.gs) — smoke tests

**`lib/` (client + server):** `MentorContext.js` (estado do /mentor), `cacheClient.js` (cache localStorage), `gasClient.js` (`chamarGAS`), `auth.js` (validação Bearer server-side), `api.js` (`apiFetch`), `firebase.js`, `carimbos.js` + `selos.js` + `carimboCores.js` (gamificação), `semanaLabel.js`, `simuladoData.js`, `whatsapp.js`, `googleCalendar.js`.

**Escala alvo:** ~150 alunos máx no início de 2027. Sheets + GAS aguenta confortável — não migrar de backend só por escala.
**Migração Supabase planejada:** dezembro 2026 (após ENEM em novembro) — ver [docs/MIGRACAO_SUPABASE.md](docs/MIGRACAO_SUPABASE.md). Schema em Sheets é desenhado pensando em portabilidade pra Postgres (snake_case, FKs por email/id).

## 4. Modelo de Dados

### 4.1 Planilha Mestre (única, bound ao script)

| Aba | Conteúdo |
|---|---|
| `BD_Alunos` | 1 linha por aluno (entidade principal) |
| `BD_Mentores` | Mentores ativos (entidade) |
| `BD_Vendedores` | Vendedores comerciais (entidade, legado) — inclui coluna `HORARIOS` (JSON) com a grade de disponibilidade semanal |
| `BD_Leads` | Leads do CRM (entrada via webhook ou criação manual) — legado |
| `Eventos_Pipeline` | Auditoria de movimentações do pipeline de leads — legado |
| `BD_Disponibilidade_Excecoes` | Bloqueios pontuais de agenda do vendedor — legado |
| `BD_Avaliacoes` | Avaliações (Ciclo de Provas): prova escolar E prova de vestibular |
| `BD_Marcos` | Marcos de gamificação (Fechamentos de Ciclo, conquistas) — ver [gas/marcos.gs](gas/marcos.gs) |
| `LGPD_Aceites` | Aceites de termos/privacidade (LGPD) |
| `Cache_Alunos` | Cache de status (semana atual, último encontro, última exportação) |
| `Push_Subscriptions` | Subscriptions de push notifications |
| `BD_Topicos` | Taxonomia de tópicos das matérias do ENEM (fixo) |
| `Logs_Erro` | Auditoria de erros do GAS |
| `Logs_Erro_Frontend` | Erros do frontend (Error Boundary → `handleRegistrarErroFrontend`) |

> **Não existe aba `BD_Horarios_Padrao`.** A grade de disponibilidade semanal do vendedor é a **coluna JSON `HORARIOS` em `BD_Vendedores`** (`COL_VENDEDOR.HORARIOS`, escrita por `salvarHorariosPadrao` em [gas/agenda.gs](gas/agenda.gs)). As exceções ficam na aba `BD_Disponibilidade_Excecoes`.

**Schema `BD_Alunos` (snake_case):**

Colunas core: `timestamp, nome_aluno, data_nascimento, telefone, responsavel_financeiro, email, cidade, estado, escolaridade, origem_ensino_medio, cota, fez_enem_antes, provas_interesse, curso_interesse, plataforma_online, nota_linguagens, nota_humanas, nota_natureza, nota_matematica, nota_redacao, id_planilha (chave da spreadsheet do aluno), mentor_responsavel (email — FK pra BD_Mentores), status_onboarding ("Aguardando Diagnóstico" | "Onboarding Completo" | "Inativo")`.

Colunas posteriores: `plano`, `tipo_aluno ("EM" | "ENEM"), turma, escola, fase` (AE), `dt_saida`, `status_app` (integração com o Aplicativo — §1.1), `motivo_saida`, `obs_saida`, `encontro_lider` (data do encontro 60d líder↔mentorado).

> Roadmap (ver REDESIGN doc): `tipo_aluno` será substituído por `produto: 'mentoria' | 'AE'` + colunas `provasAlvo`, `disciplinas`, `serieEscolar`, `tokenFamilia`. Não migrado ainda.

**Schema `BD_Mentores`:** `email, nome, status (Ativo|Inativo), dt_entrada`
**Schema `BD_Vendedores`:** `email, nome, status, dt_entrada, horarios (JSON)`
**Schema `BD_Leads`:** `id_lead, nome, telefone, email, fase, vendedor_responsavel, outcome_reuniao, anotacoes (utm_campaign/adset/ad), gcal_event_id, dt_criacao, dt_ultima_movimentacao` (12 fases de funil — ver §6).

**Schema `Push_Subscriptions`:** `email, endpoint, p256dh, auth, dt_subscricao, user_agent`

**Schema `BD_Avaliacoes`:** `id, id_aluno, data, materia, tipo, observacao, nota, criado_por, criado_em, substitui_id, resultado_em`. Cobre **prova escolar** (`TIPOS_AVAL = ['bimestral','mensal','semanal','recuperacao']`, nota 0-10) e **prova de vestibular** (`TIPOS_AVAL_ENEM = ['fase1','fase2','dia1','dia2','unica']`, `materia` = nome do vestibular, sem nota). Aluno EM pode ter as duas; aluno ENEM só vestibular. `substitui_id` faz recuperação substituir a original no Boletim; `resultado_em` marca quando o resultado foi registrado (vazio + data passada = pendente na fila "A registrar").

### 4.2 Planilha individual do aluno

Cada aluno tem 1 spreadsheet própria (criada no onboarding) com abas:

| Aba | Conteúdo |
|---|---|
| `BD_Onboarding` | Formulário inicial (perfil, hábitos, notas anteriores) |
| `BD_Diagnostico` | Acertos do teste teórico (Bio/Qui/Fis/Mat) |
| `BD_Registro` | Registros semanais (semana, meta, horas, domínio/progresso por matéria, bem-estar) |
| `BD_Diario` | Encontros do diário de bordo (data, autoavaliação, vitórias, desafios, plano de ação 5 itens × resultado) |
| `BD_Semana` | Grade horária da semana padrão (16 horas × 7 dias) — tem template "EM (escola 07-13h)" |
| `BD_Sim_ENEM` | Simulados realizados + análise (autópsia Kolb + classificação de erros: Lacuna/Recordação/Interpretação/Atenção) |
| `BD_Caderno` | Caderno de erros — virou **lista tipo caderno** (não-flashcard) com classificação por fonte + método |
| `BD_Marcos` | Marcos de gamificação do aluno (Fechamentos de Ciclo, carimbos) — [gas/marcos.gs](gas/marcos.gs) |

## 5. Fluxos principais

### 5.1 Login → roteamento (`handleLoginGlobal`)

1. User abre `/`
2. Login Firebase (Google ou email/senha) — mensagens específicas por código de erro do Firebase Auth
3. Frontend chama `/api/mentor` com `acao: 'loginGlobal'` + Bearer ID token
4. Backend retorna `{ rota, perfil, papeis }` ([gas/Code.gs](gas/Code.gs) `handleLoginGlobal`):
   - Líder (`filippe@` / `rafael@`) → `/selecionar-modo`
   - **Híbrido vendedor+mentor** → `/selecionar-modo` (payload `papeis: { lider, vendedor, mentor }`)
   - Só vendedor (`BD_Vendedores`) → `/vendas`
   - `*@metodointento.com.br` (outros mentores) → `/mentor`
   - Aluno — **3 destinos** por `status_onboarding`:
     - `Onboarding Completo` → `/painel`
     - `Aguardando Diagnóstico` → `/diagnostico`
     - resto (novo / sem cadastro) → `/hub` (checklist de onboarding)

O **"porteiro" do onboarding** distingue 3 estados (não 2): novo / em diagnóstico / completo. `handleOnboarding` bloqueia duplicata.

Páginas de suporte: `/hub` (checklist), `/selecionar-modo`, `/termos` + `/privacidade` (LGPD — aceites gravados na aba `LGPD_Aceites`), `/offline` (shell PWA). `app/dados/questoes.json` guarda as questões estáticas do diagnóstico.

### 5.2 Painel do Aluno (`/painel`)

Abas no menu lateral:
1. **Visão Geral** — KPIs (progresso, domínio, dias ENEM), lista de tarefas, plano de ação resumido
2. **Acompanhamento Semanal** — cards comparativos (Aspectos Gerais, Estilo de Vida, Desempenho). O **check-in de bem-estar é feito no Aplicativo Intento**, não na Plataforma — a UI avisa "Seu check-in é feito no Aplicativo Intento" e os dados chegam via integração (§1.1)
3. **Mentoria** — Meta Principal em destaque + card do último Diário de Bordo (vitórias, desafios, exploração, meta, plano de ação com resultados)
4. **Semana Padrão** — grade tipo Google Calendar do horário recomendado
5. **Simulados** — KPIs, distribuição de erros, histórico, autópsia Kolb
6. **Caderno de Erros** — lista por fonte + classificação do método (não-flashcard)
7. **Boletim** (só AE) — quantitativo das avaliações escolares, recuperação substitui prova original
8. **Jornada** — selos/carimbos + Linha do Ano da gamificação ([components/painel/Jornada.js](components/painel/Jornada.js)); aba gated por `jornadaVisivel` em [lib/selos.js](lib/selos.js)
9. **Recursos** (no final do menu) — links externos (Plataforma Kiwify, App Intento, Banco de Questões Estuda.com, Suporte WhatsApp)

### 5.3 Painel do Mentor (`/mentor`, `/mentor/[id]`)

- Lista de alunos do mentor logado, com status semanal (verde/vermelho) + sub-badge AE quando aplicável
- Click no aluno → `/mentor/[id]` com abas: Diário de Bordo, Semana Padrão, Histórico Analítico, Simulados, **Provas** (lança/edita avaliações em `BD_Avaliacoes` — prova escolar e de vestibular), Onboarding
- **Modo Encontro** (`app/mentor/[id]/encontro/page.js`) — roteiro do encontro ao vivo em passos, preenchido durante a reunião com o aluno; dispara o Fechamento de Ciclo da gamificação quando aplicável
- **Exportação/relatórios**: `app/mentor/ig/diario/page.js` e `app/mentor/ig/painel/page.js` geram as artes do acompanhamento; [app/mentor/ig/exportarPng.js](app/mentor/ig/exportarPng.js) faz o export .png (com share sheet no iOS)
- Anotações privadas do mentor no Diário de Bordo (não aparecem pro aluno)

### 5.4 Painel do Líder (`/lider`)

Ação GAS: `dashboardLider` (`handleDashboardLider` + `agregarMetricasBase_` em [gas/Code.gs](gas/Code.gs)). Autorizado só pra `filippe@` e `rafael@`. O front **re-agrega no cliente** quando há filtro (cada aluno carrega suas métricas brutas) — sem round-trip ao backend.

**Dados que a ação entrega** (matéria-prima de qualquer análise do líder):
- **Por aluno:** `mentor`, `plano`, `tipoAluno` (ENEM/EM), `statusApp`, `registrouSemanaAtual`, `ultimoEncontro`, `encontrosMesCorrente`/`encontrosEsperados`, e `metricas` = { faixa de horas, check-in do último registro (estresse/ansiedade/motivação/sono), domínio e progresso por matéria (média das **últimas 4 semanas**), histórico horas×meta (12 sem), simulados (4 sem) }.
- **Agregado da base** (recalculável por filtro): distribuição de horas, histórico 8 semanas (horas×meta), domínio/progresso médios por matéria, bem-estar médio, total de simulados 4 sem.
- **Operacional:** `pendencias` (alunos "Aguardando Diagnóstico"), lista de mentores ativos. Alunos inativos (`DT_SAIDA`) são ignorados.

**Redesign clínico/admin — IMPLEMENTADO** (ver [docs/REDESIGN_LIDER_CLINICO_E_MENTOR.md](docs/REDESIGN_LIDER_CLINICO_E_MENTOR.md)). A tela hoje é organizada em **sub-abas `visao | mentores | mentorados`** ([app/lider/page.js](app/lider/page.js)):
- **Visão Geral** — KPIs de operação, Cobertura do App (distribuição de `statusApp`), **fila de Operação** (pendências de designação/diagnóstico, encontros atrasados) e Visão Analítica (gráficos agregados, respeitam filtros)
- **Mentores** — tabela por mentor com **fila Clínica** (mentorias precisando de atenção, com motivo no chip) e **fila de Fechamentos de Ciclo pendentes** por mentor
- **Mentorados** — lista filtrável (mentor multi-select, tipo_aluno, busca, chips por carimbo)
- **Alerta de encontro 60d líder↔mentorado** — alunos com 60-90 dias desde o 1º diário sem encontro individual com o líder entram na fila; botão "encontro feito" grava via `handleMarcarEncontroLider` (coluna `encontro_lider`)
- **Designar mentor** (modal exige plano + dropdown → grava + emails automáticos pra aluno e mentor) e **Inativar aluno** (`handleInativarAluno`, com motivo de saída)

### 5.5 CRM / Vendas (`/vendas`) — LEGADO

> A operação comercial migrou pra uma plataforma externa. O código abaixo permanece no repo e funcional, mas sem dono ativo — manutenção mínima, sem evolução planejada.

- **Kanban de leads** com **12 fases** (drag-and-drop) — `FASES_LEAD` em [gas/Code.gs](gas/Code.gs):
  - `Lead`, `Numero invalido`, `Contactado WPP`, `Ativo WPP`, `Reuniao agendada`, `Reuniao realizada`, `Convertido`, `Taxa matricula paga`, `Contrato assinado`, `1a mensalidade paga`, `Em mentoria`, `Não convertido`
  - O Kanban é **inline em [app/vendas/page.js](app/vendas/page.js)** (não há componente `PainelLiderPipeline`); as fases vêm do backend
- **Outcome de reunião** é campo separado da fase (padrão HubSpot) — `OUTCOMES_REUNIAO = ['', 'realizada', 'no-show', 'reagendada', 'cancelada']`
- Card mostra: timer "tempo na fase", link wa.me, atribuição de vendedor inline, delete com auditoria (movimentações vão pra `Eventos_Pipeline`)
- **Fila pública**: vendedor sem dono pega lead da fila ou usa filtros "meus" / "sem dono"
- **Webhook Typebot** (`/api/leads/webhook`) cria lead automaticamente. Anotações trazem `utm_campaign`, `utm_adset`, `utm_ad`
- **Agendamento** (`/api/agenda/{agendar,cancelar,reagendar,sugestoes}`):
  - Vendedor define a grade semanal (coluna JSON `HORARIOS` em `BD_Vendedores`) + exceções (`BD_Disponibilidade_Excecoes`) em `/vendedor/disponibilidade` — **única página sob `app/vendedor/`; não existe página índice `/vendedor`**
  - Round-robin proper + anti double-booking
  - Cria evento no Google Calendar do vendedor; cancela/reagenda mantém `gcal_event_id` consistente
- Conversão Lead → Aluno: `handleConverterLeadEmAluno` cria spreadsheet do aluno e move o registro

### 5.6 Gamificação — "Fases e Ciclos"

Sistema de progressão do aluno ao longo do ano (ver [docs/GAMIFICACAO_MARCOS.md](docs/GAMIFICACAO_MARCOS.md)):

- **Ciclos C1–C4** dividem o ano letivo; cada ciclo fecha com um **Fechamento de Ciclo** disparado automaticamente no **Modo Encontro**
- **Dimensões com carimbos** em níveis **Aprendiz / Veterano / Mestre** — regras em [lib/carimbos.js](lib/carimbos.js) e [lib/selos.js](lib/selos.js), UI em [components/Carimbos.js](components/Carimbos.js)
- **Linha do Ano** — timeline visual da jornada do aluno na aba Jornada do `/painel` ([components/painel/Jornada.js](components/painel/Jornada.js))
- Persistência na aba **`BD_Marcos`** (mestre + planilha do aluno), handlers em [gas/marcos.gs](gas/marcos.gs)

## 6. Endpoints / Handlers GAS

Todos via `POST /api/mentor` (ou rotas dedicadas) com `{ acao: 'X', ...dados }`. São **~65 despachos de ação no doPost**. `chamarGAS` ([lib/gasClient.js](lib/gasClient.js)) injeta o `GAS_API_TOKEN` — **11 rotas** usam `chamarGAS` (`/api/mentor`, `/api/submit`, `/api/leads/webhook`, `/api/vendedor/disponibilidade`, `/api/push/{subscribe,unsubscribe,send}`, `/api/agenda/{agendar,cancelar,reagendar,sugestoes}`), validação de Bearer (Firebase ID token) nas ACOES_AUTENTICADAS.

**Autenticação / roteamento:**
- `login`, `loginGlobal`, `listaAlunosMentor`

**Leitura aluno/mentor:**
- `buscarDadosAluno`, `buscarOnboarding`, `buscarTopicosGlobais`, `verificarRegistroSemana`, `buscarMetaAnterior`

**Escrita aluno (registro/diário/semana):**
- `salvarRegistroGlobal`, `editarRegistro`, `deletarRegistro`
- `salvarNovoEncontro`, `editarEncontro`, `avaliarEncontroPassado`, `salvarDiario`
- `salvarSemanaLote`

**Acompanhamento / integração App:**
- `salvarStatusApp` (status do aluno em relação ao Aplicativo), `registrarExportacao` (marca o .png semanal como enviado), `marcarAcompanhamento`

**Simulados:**
- `salvarSimulado`, `salvarAutopsia`, `editarSimulado`, `excluirSimulado`

**Caderno de erros:**
- `listarCaderno`, `salvarCardCaderno`, `incrementarRepeticao`, `deletarCardCaderno`, `registrarRevisaoCaderno`

**Onboarding / diagnóstico:**
- `onboarding`, `diagnostico`, `atualizarDadosAluno`

**Líder / mentor (dashboards):**
- `dashboardLider`, `dashboardMentor`, `designarMentor`, `inativarAluno`, `marcarEncontroLider`

**Avaliações (Ciclo de Provas — [gas/escolar.gs](gas/escolar.gs)):**
- `cadastrarAvaliacoes`, `listarAvaliacoesAluno`, `atualizarAvaliacao`, `deletarAvaliacao`

**Push:**
- `subscribePush`, `unsubscribePush`, `listarPushSubscriptions`

**CRM / Leads (legado — [gas/crm.gs](gas/crm.gs)):**
- `criarLead`, `editarLead`, `moverLeadFase`, `listarLeads`, `deletarLead`, `buscarLead`, `buscarLeadPorEmail`, `buscarLeadPorGcalEventId`, `dashboardCrm`, `converterLeadEmAluno`

**Vendedor / Agenda (legado — [gas/agenda.gs](gas/agenda.gs)):**
- `listarVendedoresAtendimento`, `salvarHorariosPadrao`, `lerHorariosPadrao`
- `criarExcecaoDisponibilidade`, `removerExcecaoDisponibilidade`, `listarExcecoesDisponibilidade`
- `cargaPorVendedorNoMes`

**Observabilidade:**
- `registrarErroFrontend` (frontend posta erros → `Logs_Erro_Frontend` na mestre)

## 7. PWA

- **Fase 1:** instalável (manifest, ícones, service worker básico)
- **Fase 2:** offline shell (cache de assets, página `/offline`)
- **Fase 3:** cache de leituras client-side (localStorage) em `/lider` e `/painel` — exibe último estado conhecido imediatamente
- **Fase 4:** polish — banner "Nova versão disponível", install prompt customizado, splash screens iOS
- **Fase 5A (em prod):** infraestrutura de push notifications (web-push + VAPID + service worker handler)
- **Fase 5B (parcial):** não há cron na Vercel (Hobby limita a 2 crons diários e não há `vercel.json`). Os crons que existem rodam como **triggers time-based no próprio GAS** (ex: `cronGerarRegistrosApp` Dom 22h). Push agendado (ex: véspera de prova) segue pendente.

## 8. Integrações Externas

**Hoje:**
- **Firebase Auth** — autenticação (Google login + email) + verificação de ID token nos endpoints sensíveis
- **BigQuery (`intento-edu`)** — leitura do uso do Aplicativo via Service Account pra gerar Registros Semanais (§1.1)
- **Vercel** — hospedagem do Next.js
- **Google Sheets / Apps Script** — backend e storage
- **Google Calendar (Appointment Schedule)** — agendamentos comerciais (legado); sincronizado via `/api/agenda/*`
- **Web Push API** — notificações nativas (Chrome, Edge, Android, iOS 16.4+ instalado)
- **GmailApp** — envio de emails transacionais (designação de mentor)
- **Typebot** — webhook de captura de leads (`/api/leads/webhook`) com UTM (legado)
- **WhatsApp** — link `wa.me` nos cards/modal de leads (sem API)

**Planejado (era do CRM completo — congelado com a saída da operação comercial):**
- Asaas (pagamentos), Zapsign (contratos), WhatsApp Cloud API / Z-API

## 9. Segurança

Estado atual (detalhes e histórico em [docs/SEGURANCA_PENDENCIAS.md](docs/SEGURANCA_PENDENCIAS.md)):

- **Firebase ID token verification** nos endpoints sensíveis (correção de CVE crítico em 2026-05).
- `lib/auth.js` valida Bearer no `/api/*` e **exige `email_verified` pra staff** (`@metodointento.com.br` entra por Google Workspace, sempre verificado); `lib/api.js` (`apiFetch`) aguarda `auth.authStateReady` antes de pegar `getIdToken`.
- `lib/gasClient.js` (`chamarGAS`) injeta `GAS_API_TOKEN` lado servidor — token nunca trafega no client.
- **`VALIDAR_TOKEN = true`** no GAS — enforcement do token ativo no `/exec`. `VALIDAR_TOKEN_DRYRUN = true` ainda ligado (resíduo do rollout; só loga, pode ser desligado).
- **`AGENT_API_TOKEN`** protege as rotas de agenda (`/api/agenda/*`) e `/api/push/send` pra chamadas server-to-server de agentes.
- **`/api/auth` está desativada** — responde `410 Gone` (mantida só pra não reintroduzir a exposição).
- Cache do `/api/mentor` é por-email (não vaza dado entre sessões).

## 10. Convenções de Código

- **Abas e colunas:** sempre `snake_case` (ex: `nome_aluno`, `dt_entrada`)
- **Constantes JS:** `MAIUSCULAS_SNAKE` (ex: `COL_MESTRE.MENTOR_RESPONSAVEL`, `FASES_LEAD`, `OUTCOMES_REUNIAO`, `TIPOS_AVAL`)
- **Terminologia de provas:** sempre **"prova escolar"** vs **"prova de vestibular"** e **"aluno EM"** vs **"aluno ENEM"** — nunca jargão interno tipo "sabor"
- **Email** é chave única em pessoas (alunos, mentores, vendedores)
- **Datas:** formato `dd/MM/yyyy` ou `"DD/MM/YYYY a DD/MM/YYYY"` pra semanas
- **Cache em camadas:** server (Next route TTL) + client (localStorage via `lib/cacheClient.js`)
- **Identidade de commits:** Filippe = `Filippe Ximenes <filippex@gmail.com>` (GitHub: `filippeximenes`)

## 11. Workflow Git e donos por pasta

Default desde 11/05/2026: **trabalho novo sai em branch + PR. `main` só recebe via merge de PR.** Detalhes completos em [docs/WORKFLOW_GIT.md](docs/WORKFLOW_GIT.md) e [CLAUDE.md](CLAUDE.md).

**Donos por pasta — estado atual:** **Filippe é o único dono ativo do repo.** Com a saída do Rafael, a divisão CRM/mentoria virou histórica:

- **Filippe (tudo que é ativo):** `app/mentor/`, `app/painel/`, `app/onboarding/`, `app/diagnostico/`, `app/lider/`, `app/hub/`, `app/api/{mentor,submit}/`, `components/`, `lib/`, `gas/{Code,escolar,push,marcos,integracaoApp,SmokeTest}.gs`, `docs/`
- **Legado sem dono ativo (manutenção mínima):** `app/vendas/`, `app/vendedor/`, `app/api/{leads,agenda}/`, `components/Modal{Lead,NovoLead}.js`, `gas/crm.gs`, `gas/agenda.gs`

> Nota: `components/PainelLiderPipeline.js` **não existe** (o Kanban é inline em `app/vendas/page.js`) e `components/ModalRegistro.js` **foi removido** (o registro semanal nasce da integração com o Aplicativo, não de modal manual). A lista de donos do CLAUDE.md ainda cita ambos — está desatualizada.

**Pre-push hook** em `scripts/git-hooks/pre-push` (ativado via `./scripts/setup-hooks.sh`) simula o build exato que vai pra prod (`git stash --keep-index --include-untracked && npm run build && git stash pop`) — evita os incidentes recorrentes de imports apontando pra untracked.

**GAS deploy:** `clasp push` não basta. Prod usa deployment versionado fixo; depois do push, rodar `clasp deploy -i <id>` pra atualizar a versão (ver `scripts/deploy-gas.sh`).

## 12. Decisões Arquiteturais Importantes

1. **Mentor é entidade de primeira-classe** (`BD_Mentores`) — antes era texto livre
2. **Vendedor é entidade de primeira-classe** (`BD_Vendedores`) — necessário pro round-robin e relatório de carga (legado)
3. **Lead tem fase + outcome separados** (padrão HubSpot) — reunião pode ter desfecho independente da fase
4. **Cache em aba dedicada** (`Cache_Alunos`) — antes eram colunas soltas no fim da `BD_Alunos`
5. **Headers em snake_case** preparando migração SQL
6. **Sheets como DB transitório** — Supabase em dezembro 2026 ([docs/MIGRACAO_SUPABASE.md](docs/MIGRACAO_SUPABASE.md))
7. **GmailApp em vez de MailApp** — mais robusto pra deliverability
8. **Push notifications** sem dependência de provedor externo (web-push padrão W3C)
9. **AE é superconjunto da Mentoria** (ver REDESIGN doc) — estrutura de pastas será aditiva: `components/painel/{core,escolar}/`
10. **Log comportamental bruto fica no Aplicativo externo** (intento-fe) — a Plataforma não o armazena, mas **importa o resumo semanal via BigQuery** (cron GAS Dom 22h) e o mentor revisa. Ver §1.1.
11. **GAS split por domínio** — `Code.gs` virou core + arquivos por área (crm, agenda, escolar, push, marcos, integracaoApp) pra reduzir conflito e deixar claro o que é legado.

## 13. Estado atual e backlog

**Em produção (funcionando):**
- ✅ Painéis Aluno, Mentor, Líder
- ✅ **Integração Aplicativo → Registro Semanal** — cron GAS Dom 22h gera registros do BigQuery; mentor revisa; `status_app` por aluno
- ✅ **Redesign do /lider (clínico/admin)** — sub-abas visao|mentores|mentorados, filas Operação + Clínica, fechamentos de ciclo pendentes, alerta encontro 60d
- ✅ **Gamificação "Fases e Ciclos"** — ciclos C1–C4, carimbos Aprendiz/Veterano/Mestre, Fechamento de Ciclo no Modo Encontro, aba Jornada com Linha do Ano
- ✅ **Modo Encontro** (`/mentor/[id]/encontro`) — roteiro do encontro ao vivo
- ✅ **Ciclo de Provas** — `BD_Avaliacoes` com prova escolar + prova de vestibular, calendário compartilhado, fila "A registrar" (`resultado_em`)
- ✅ Designação de mentor com emails automáticos + exigência de plano; inativar aluno com motivo de saída
- ✅ Caderno de erros (formato lista tipo caderno, com fonte + classificação)
- ✅ Diário de bordo (criar, editar, exportar .png com share sheet iOS, anotações privadas)
- ✅ Simulados com autópsia Kolb, classificação de erros, editar/excluir, escopo ENEM dia1/dia2
- ✅ **Acompanhamento Escolar (AE)** — `tipo_aluno`, aba Provas em `/mentor/[id]`, sub-badge mentor, boletim quantitativo, recuperação substitui prova original, template "EM (escola 07-13h)" na Semana Padrão
- ✅ PWA instalável (Fases 1-4) + Push notifications (Fase 5A)
- ✅ Segurança: VALIDAR_TOKEN ligado, Bearer + email_verified, AGENT_API_TOKEN, /api/auth desativada
- ✅ **CRM + Agenda comercial (legado)** — Kanban 12 fases, outcome separado, webhook Typebot, round-robin; funcional mas sem operação ativa
- ✅ **Plano/cadência da mentoria visível** — prefixo `Quinzenal · 1/2 encontros no mês` nos cards do `/mentor` e tabela do `/lider` (PR #114)
- ✅ **Checks do Plano de Ação no servidor** — coluna `CHECKS` no BD; `/hub` lê o funil real; banner de mentor no `/painel` (PR #115)
- ✅ **Tela de encerramento** — aluno com `DT_SAIDA` preenchida perde acesso ao `/painel` (UI + escrita) e vê tela acolhedora; histórico segue visível pra líder/mentor (PR #116)

**Em desenvolvimento / aberto:**
- 🔄 **Fechamento da gamificação (prazo 01/10, 1º fechamento ao vivo do C3):** PR F (Retrato do Ciclo .png + selo da semana no export), baseline `RESULTADO_1..5` pro Combinado é Combinado, soft-delete de simulado/caderno (hard-delete regride selo)
- 🔄 Push agendado (ex: véspera de prova) — Fase 2 do Ciclo de Provas
- 🔄 Redesign Plataforma dual-produto (ver REDESIGN doc): `produto: 'mentoria' | 'AE'`, `provasAlvo`, `disciplinas`, `serieEscolar`, `tokenFamilia`, reorganização `components/painel/{core,escolar}/`

**Decisões pendentes:**
- ⏳ Boletim do AE: blocos de "Constância" + "Marcos do mês" (sem nota) pra relatório de família
- ⏳ Reformulação Kolb dos simulados (substituir 5 cols por 7 campos estruturados) — diagnóstico empírico antes
- ⏳ Upgrade Vercel Pro ($20/seat) — destrava crons na Vercel e regulariza uso comercial

**Longo prazo:**
- Migração Supabase (dezembro 2026 — [docs/MIGRACAO_SUPABASE.md](docs/MIGRACAO_SUPABASE.md))
- Desligar `VALIDAR_TOKEN_DRYRUN` (resíduo de rollout)

## 14. Glossário operacional

- **Encontro** — reunião do mentor com o aluno, registrada no Diário de Bordo (cadência depende do plano — não é semanal). Ritual SEPARADO do acompanhamento semanal. Conduzido via **Modo Encontro** (roteiro ao vivo).
- **Registro Semanal** — fechamento da semana (horas, domínio, progresso, check-in). **Auto-gerado** do Aplicativo via cron GAS (Dom 22h); o mentor revisa.
- **Acompanhamento semanal** — relatório (.png) + áudio que o mentor envia ao aluno no início de cada semana, a partir do registro. Sinal de "enviado" = exportação do .png (coluna `ULTIMA_EXPORTACAO` no `Cache_Alunos`); reseta sozinho por comparação de data a cada semana. Ritual SEMANAL e religioso, separado do Encontro.
- **Check-in** — 4 parâmetros de bem-estar (estresse, ansiedade, motivação, sono), **feito no Aplicativo**. **Escala onde maior = melhor para todos, inclusive estresse** (valor alto = pouco estressado). Logo, valor baixo (≤ 40) é sinal de alerta.
- **Plano de Ação** — 5 ações definidas no encontro pra próxima semana
- **Autoavaliação** — escala 1-5 do aluno sobre a semana
- **Domínio** — % de quanto o aluno entende da matéria
- **Progresso** — % de avanço no conteúdo programático
- **Autópsia (Kolb)** — análise pós-simulado em 4 etapas (Experiência, Reflexão, Conceituação, Ação)
- **Caderno de Erros** — coleção de questões erradas (lista, não flashcard), classificada por fonte + categoria do método
- **Encontro Bússola** — reunião quinzenal coletiva com Filippe (todos os alunos)
- **Prova escolar** — avaliação da escola do aluno EM (bimestral/mensal/semanal/recuperação, nota 0-10) em `BD_Avaliacoes`
- **Prova de vestibular** — prova de processo seletivo (ENEM, FUVEST...) em `BD_Avaliacoes` (fase1/fase2/dia1/dia2/unica, sem nota 0-10)
- **Ciclo (C1–C4)** — divisão do ano letivo na gamificação; fecha com o **Fechamento de Ciclo** no Modo Encontro
- **Carimbo** — conquista por dimensão na gamificação, em níveis Aprendiz/Veterano/Mestre
- **Linha do Ano** — timeline da jornada do aluno (aba Jornada do /painel)
- **Fase do lead** *(legado)* — etapa do funil de vendas (12 fases — ver §5.5) — Kanban no `/vendas`
- **Outcome de reunião** *(legado)* — desfecho da reunião, separado da fase: `realizada / no-show / reagendada / cancelada`
- **AE (Acompanhamento Escolar)** — produto pra alunos de EM, com avaliações escolares e boletim quantitativo
- **Mentoria custom** — alunos com `provasAlvo` diferente de ENEM (FUVEST, concursos) ou disciplinas extras

## 15. Repositório, time e plataforma

**GitHub**
- Repo principal: `IntentoEd/app` (Private, Org `IntentoEd` plano Free, migrado de `metodointento-art/app` em 2026-04-30)
- Member ativo: `filippeximenes` (toda a operação). Rafael saiu da operação da Plataforma — commits `feat(crm):`/`feat(vendas):` no histórico são dele
- Outros repos auxiliares ainda sob `metodointento-art` (não migrados): `metodo-intento-onboarding`, `painel-intento-fgv-insper`, etc.

**Aplicativo (separado deste repo):**
- `github.com/cetres/intento-fe` (Flutter + Firebase) — dono Gustavo Oliveira — clonado em `~/Documents/intento-app`
- Workflow dev → main
- Integra com a Plataforma via BigQuery (§1.1)

**Vercel**
- Team: `linus' projects` (plano **Hobby**)
- GitHub App da Vercel instalado na Org `IntentoEd` com acesso ao repo `app`
- Branch de produção: `main` — preview automático em toda branch pushada
- Limites do Hobby: máx 2 crons (freq. diária), 1 team member, 100GB banda, uso comercial fora dos ToS
- Upgrade Pro pendente

**Identidade dos commits**
- Filippe: `Filippe Ximenes <filippex@gmail.com>` (GitHub `filippeximenes`)
- Conta legada `metodointento-art` permanece dona dos repos auxiliares; não usar pra novos commits

## 16. Docs relacionadas (neste repo)

- [CLAUDE.md](CLAUDE.md) — regras de multi-sessão, commit cirúrgico, branch+PR, donos por pasta (lista de donos desatualizada — ver §11)
- [AGENTS.md](AGENTS.md) — aviso sobre quebra de compat do Next.js
- [docs/WORKFLOW_GIT.md](docs/WORKFLOW_GIT.md) — fluxo branch + PR + Vercel preview
- [docs/MIGRACAO_SUPABASE.md](docs/MIGRACAO_SUPABASE.md) — plano da migração Sheets → Supabase (dez/2026)
- [docs/SEGURANCA_PENDENCIAS.md](docs/SEGURANCA_PENDENCIAS.md) — registro de segurança (tokens, email_verified, histórico)
- [docs/GAMIFICACAO_MARCOS.md](docs/GAMIFICACAO_MARCOS.md) — design da gamificação Fases e Ciclos + BD_Marcos
- [docs/REDESIGN_LIDER_CLINICO_E_MENTOR.md](docs/REDESIGN_LIDER_CLINICO_E_MENTOR.md) — redesign do /lider (implementado) + painel do mentor
- [docs/REDESIGN_LIDER.md](docs/REDESIGN_LIDER.md) — plano original do redesign do painel do líder
- [docs/REDESIGN_PLATAFORMA_DUAL_PRODUTO.md](docs/REDESIGN_PLATAFORMA_DUAL_PRODUTO.md) — plano de evolução dual-produto (mentoria + AE)
- [docs/IDENTIDADE_VISUAL.md](docs/IDENTIDADE_VISUAL.md) — identidade visual (cores, tipografia, tokens)
- [docs/RELATORIO_ENCERRAMENTO_2026S1.md](docs/RELATORIO_ENCERRAMENTO_2026S1.md) — relatório de encerramento do 1º semestre 2026
- [docs/COMUNICADO_MENTORES_SET2026.md](docs/COMUNICADO_MENTORES_SET2026.md) — comunicado aos mentores (set/2026)
- [docs/FLUXO_CLIENTE.md](docs/FLUXO_CLIENTE.md) — fluxo end-to-end do cliente (lead → aluno)
- [docs/GUIA_AGENDA_API_AGENTE.md](docs/GUIA_AGENDA_API_AGENTE.md) — API de agenda comercial pra integrações (legado)
- [docs/GUIA_TYPEBOT_WEBHOOK.md](docs/GUIA_TYPEBOT_WEBHOOK.md) — webhook de captura de leads (legado)

---

Este documento é referência viva — atualize conforme o sistema evolui. Use-o como contexto pra qualquer Claude (web, Code, etc.) que precise entender a Plataforma sem ler o código.
