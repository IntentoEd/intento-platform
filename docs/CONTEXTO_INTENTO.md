# Intento — Contexto do Sistema

> Documento self-contained pra qualquer Claude (web, code, etc.) entender a estrutura do sistema da Intento. Atualizado em 2026-04-30.

## 1. Visão Geral

A Intento é uma empresa de mentoria pra vestibulares (ENEM, FUVEST, UNICAMP, FAMERP, FGV, Insper, etc.) e cursos de Medicina. O sistema é uma plataforma web (Next.js + PWA) que conecta alunos, mentores e líderes operacionais.

**URL produção:** mentoria.metodointento.com.br
**Founder/líder de mentoria:** Filippe Ximenes (filippe@metodointento.com.br) — owner da operação no código
**Sócio (CRM/vendas):** Rafael — em onboarding no repo, vai assumir o módulo de pipeline de vendas

## 2. Atores do sistema

| Papel | Email padrão | O que faz |
|---|---|---|
| **Aluno** | qualquer | Acompanha próprio painel (registros, simulados, plano de ação, caderno de erros) |
| **Mentor** | `*@metodointento.com.br` | Atende alunos designados; faz registros semanais e diários de bordo |
| **Líder de mentoria** | `filippe@metodointento.com.br` (hard-coded) | Visão macro da operação, designa mentores, métricas agregadas |
| **Vendedor** (em construção) | Rafael (sócio) e equipe comercial | Gerencia pipeline de leads (CRM) |

Líder também atende mentorias diretamente — por isso ele tem 2 modos (Painel do Mentor ou Painel do Líder), escolhidos numa tela intermediária `/selecionar-modo`.

## 3. Stack Tecnológico

```
┌──────────────────────────────────────────────────────────┐
│  Frontend: Next.js 16 App Router + React + Tailwind     │
│  Hospedagem: Vercel                                      │
│  Auth: Firebase Auth (Google login + email)              │
│  PWA: instalável, offline shell, push notifications     │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  API Proxy: /api/mentor (Next.js route)                 │
│  - cache em memória com TTL por ação                    │
│  - invalidação em ações de escrita                      │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Backend: Google Apps Script (deployed Web App)         │
│  - 30+ handlers via doPost                              │
│  - sincronizado via clasp do repo (gas/Code.gs)         │
└──────────────────────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│  Storage: Google Sheets                                  │
│  - 1 planilha mestre (script bound)                     │
│  - 1 planilha individual por aluno                      │
└──────────────────────────────────────────────────────────┘
```

**Migração planejada:** Supabase no fim do ano de 2026 (quando volume justificar).

## 4. Modelo de Dados

### Planilha Mestre (única, bound ao script)

| Aba | Conteúdo | N° linhas |
|---|---|---|
| `BD_Alunos` | 1 linha por aluno (entidade principal) | ~50 |
| `BD_Mentores` | Mentores ativos (entidade) | ~10 |
| `Cache_Alunos` | Cache de status (semana atual, último encontro) | ≤ alunos |
| `Push_Subscriptions` | Subscriptions de push notifications | ≤ devices ativos |
| `BD_Topicos` | Taxonomia de tópicos das matérias do ENEM | fixo |
| `Logs_Erro` | Auditoria de erros do GAS | crescente |

**Schema `BD_Alunos` (23 cols, snake_case, A-W):**
```
A timestamp
B nome_aluno
C data_nascimento
D telefone
E responsavel_financeiro
F email
G cidade
H estado
I escolaridade
J origem_ensino_medio
K cota
L fez_enem_antes
M provas_interesse
N curso_interesse
O plataforma_online
P nota_linguagens
Q nota_humanas
R nota_natureza
S nota_matematica
T nota_redacao
U id_planilha           ← chave pra abrir spreadsheet do aluno
V mentor_responsavel    ← email (FK pra BD_Mentores)
W status_onboarding     ← "Aguardando Diagnóstico" | "Onboarding Completo"
```

**Schema `BD_Mentores`:**
```
A email | B nome | C status (Ativo|Inativo) | D dt_entrada
```

**Schema `Cache_Alunos`:**
```
A id_planilha | B ultima_data_registro | C ultima_semana_registro | D ultimo_encontro
```

**Schema `Push_Subscriptions`:**
```
A email | B endpoint | C p256dh | D auth | E dt_subscricao | F user_agent
```

### Planilha individual do aluno

Cada aluno tem 1 spreadsheet própria (criada no onboarding) com 7 abas:

| Aba | Conteúdo |
|---|---|
| `BD_Onboarding` | Formulário inicial (57 cols) — perfil, hábitos, notas anteriores |
| `BD_Diagnostico` | Acertos do teste teórico (Bio/Qui/Fis/Mat) |
| `BD_Registro` | Registros semanais (semana, meta, horas, domínio/progresso por matéria, bem-estar) |
| `BD_Diario` | Encontros do diário de bordo (data, autoavaliação, vitórias, desafios, plano de ação 5 itens × resultado) |
| `BD_Semana` | Grade horária da semana padrão (16 horas × 7 dias) |
| `BD_Sim_ENEM` | Simulados realizados + análise (autópsia Kolb + classificação de erros) |
| `BD_Caderno` | Caderno de erros pra revisão espaçada (D1, D7, D15, D30) |

## 5. Fluxos principais

### Login → roteamento
1. User abre `/`
2. Faz login (Firebase: Google ou email/senha)
3. Frontend chama `/api/mentor` com `acao: 'loginGlobal'`
4. Backend retorna `{ rota }`:
   - `filippe@metodointento.com.br` → `/selecionar-modo`
   - `*@metodointento.com.br` (outros mentores) → `/mentor`
   - Aluno com `status_onboarding === 'Onboarding Completo'` → `/painel`
   - Aluno sem cadastro completo → `/hub` (checklist de onboarding)

### Painel do Aluno (`/painel`)
7 abas no menu lateral:
1. Visão Geral — KPIs (progresso, domínio, dias ENEM), lista de tarefas, plano de ação resumido
2. Acompanhamento Semanal — cards comparativos (Aspectos Gerais, Estilo de Vida, Desempenho)
3. Mentoria — Meta Principal em destaque + card do último Diário de Bordo (vitórias, desafios, exploração, meta, plano de ação com resultados)
4. Semana Padrão — grade Google Calendar do horário recomendado
5. Simulados — KPIs, distribuição de erros, histórico, autópsia Kolb
6. Acessos — links externos (Plataforma Kiwify, App Intento, Banco de Questões Estuda.com, Suporte WhatsApp)
7. Caderno de Erros — sistema de revisão espaçada

### Painel do Mentor (`/mentor`)
- Lista de alunos do mentor logado, com status semanal (verde/vermelho)
- Click no aluno → `/mentor/[id]` com 5 abas: Diário de Bordo, Semana Padrão, Histórico Analítico, Simulados, Onboarding
- Pode: criar/editar/exportar encontros, registrar semana padrão, ver e analisar simulados, ver dados do onboarding + diagnóstico

### Painel do Líder (`/lider`)
- KPIs de operação (total alunos, taxa de registro, mentores ativos, simulados últ. 4 semanas)
- Filtros (mentor, busca por aluno)
- **Aguardando Designação** — alunos sem mentor ativo, com botão "Designar" (modal: dropdown de mentores → click → grava + email automático aluno + email automático mentor)
- Lista hierárquica colapsável (mentor → alunos com bolinhas verde/vermelho de registro)
- Visão analítica (5 gráficos): histograma horas, domínio por matéria, progresso por matéria, bem-estar, histórico horas vs meta

## 6. Endpoints / Handlers GAS

Todos via `POST /api/mentor` com `{ acao: 'X', ...dados }`:

**Autenticação / roteamento:**
- `loginGlobal` — define rota baseado em email
- `listaAlunosMentor` — alunos sob um mentor

**Leitura:**
- `buscarDadosAluno` — retorna registros, diários, semana, simulados
- `buscarOnboarding` — perfil + diagnóstico
- `buscarTopicosGlobais` — taxonomia do ENEM
- `dashboardLider` — visão agregada da base (apenas Filippe)

**Escrita aluno:**
- `salvarRegistroGlobal`, `editarRegistro` — registro semanal
- `salvarNovoEncontro`, `editarEncontro`, `avaliarEncontroPassado` — diário de bordo
- `salvarSemanaLote` — grade da semana padrão
- `salvarSimulado`, `salvarAutopsia` — simulados
- `salvarCardCaderno`, `incrementarRepeticao`, `deletarCardCaderno`, `registrarRevisaoCaderno` — caderno de erros

**Onboarding:**
- `onboarding` — cria spreadsheet do aluno + linha na mestre
- `diagnostico` — registra resultado do teste teórico

**Líder:**
- `designarMentor` — atribui aluno a mentor + envia 2 emails (via GmailApp)

**Push notifications:**
- `subscribePush`, `unsubscribePush`, `listarPushSubscriptions`

## 7. PWA

- **Fase 1:** instalável (manifest, ícones, service worker básico)
- **Fase 2:** offline shell (cache de assets, página `/offline`)
- **Fase 3:** cache de leituras client-side (localStorage) em `/lider` e `/painel` — exibe último estado conhecido imediatamente
- **Fase 4:** polish — banner "Nova versão disponível", install prompt customizado, splash screens iOS
- **Fase 5A (atual):** infraestrutura de push notifications (web-push + VAPID + service worker handler)
- **Fase 5B (parcialmente bloqueada):** plano original era 4 cron jobs cobrindo casos de uso reais. O Vercel Hobby aceita no máximo 2 crons em frequência diária — não roda `*/5 min`. Implementação completa fica condicionada ao upgrade pro Vercel Pro. Workaround atual: `/api/agenda/sync` é disparado externamente.
- **Aguardando:** kickoff do Rafael no módulo de CRM/Pipeline de vendas

## 8. Integrações Externas

**Hoje:**
- **Firebase Auth** — autenticação (Google login + email)
- **Vercel** — hospedagem do Next.js
- **Google Sheets / Apps Script** — backend e storage
- **Google Calendar (Appointment Schedule)** — fonte de verdade dos agendamentos de mentoria; sincronizado via `/api/agenda/sync` (chamado externamente pelo bloqueio do Vercel Hobby)
- **Web Push API** — notificações nativas (Chrome, Edge, Android, iOS 16.4+ instalado)
- **GmailApp** — envio de emails transacionais (designação de mentor)

**Planejado (CRM):**
- **Asaas** — gateway de pagamentos, status de mensalidades
- **Zapsign** — contratos digitais
- **WhatsApp** — possivelmente Z-API ou Cloud API

## 9. Convenções de Código

- **Abas e colunas:** sempre `snake_case` (ex: `nome_aluno`, `dt_entrada`)
- **Constantes JS:** `MAIUSCULAS_SNAKE` (ex: `COL_MESTRE.MENTOR_RESPONSAVEL`)
- **Email** é chave única em pessoas (alunos, mentores)
- **Datas:** formato `dd/MM/yyyy` ou `"DD/MM/YYYY a DD/MM/YYYY"` pra semanas
- **Status onboarding:** `"Aguardando Diagnóstico"` | `"Onboarding Completo"`
- **Cache em camadas:** server (Next route TTL) + client (localStorage)

## 10. Decisões Arquiteturais Importantes

1. **Mentor é entidade primeira-classe** (`BD_Mentores`) — antes era texto livre na coluna `mentor_responsavel`
2. **Cache em aba dedicada** (`Cache_Alunos`) — antes era colunas soltas no fim da `BD_Alunos`
3. **`BD_Alunos` enxuta** — 23 colunas (era 60 com hábitos detalhados duplicados)
4. **Headers em snake_case** preparando migração SQL
5. **Sheets como DB transitório** — Supabase no fim do ano
6. **GmailApp em vez de MailApp** — mais robusto pra deliverability
7. **Push notifications** sem dependência de provedor externo (web-push padrão W3C)

## 11. Estado atual e backlog

**Em produção (funcionando):**
- ✅ Painéis Aluno, Mentor, Líder
- ✅ Designação de mentor com emails automáticos
- ✅ Painel do Líder com dashboard, filtros, designação
- ✅ Caderno de erros com revisão espaçada
- ✅ Diário de bordo (criar, editar, exportar)
- ✅ Anotações privadas do mentor no Diário de Bordo
- ✅ Simulados com autópsia Kolb e classificação de erros (Lacuna/Recordação/Interpretação/Atenção)
- ✅ PWA instalável (Fases 1-4)
- ✅ Push notifications (Fase 5A — infraestrutura)
- ✅ Sync de agenda com Google Calendar Appointment Schedule (`/api/agenda/sync`) — disparado externamente

**Em desenvolvimento / aberto:**
- 🔄 Fase 5B — cron jobs com casos de uso reais (bloqueado pelo limite do Vercel Hobby; aguarda upgrade pra Pro)
- 🔄 Onboarding do sócio Rafael no repo `IntentoEd/app` (acesso, divisão de pastas via CODEOWNERS)

**Aguardando:**
- ⏳ Brief do Rafael sobre CRM/Pipeline (8 fases de funil definidas, 23 cols esboçadas)
- ⏳ Decisão sobre upgrade Vercel Pro ($20/seat) — destrava crons, segundo seat e regulariza uso comercial

**Pós-CRM:**
- Campo `plano` no aluno (semanal/quinzenal/mensal/etc.)
- Dashboard líder com "encontros realizados/esperados no mês" por aluno

**Longo prazo:**
- Migração Supabase
- Integrações WhatsApp / Asaas / Zapsign

## 12. Glossário operacional

- **Encontro** — reunião do mentor com o aluno, registrada no Diário de Bordo
- **Registro Semanal** — fechamento da semana feito pelo mentor (horas, domínio, progresso)
- **Plano de Ação** — 5 ações definidas no encontro pra próxima semana
- **Autoavaliação** — escala 1-5 do aluno sobre a semana
- **Domínio** — % de quanto o aluno entende da matéria
- **Progresso** — % de avanço no conteúdo programático
- **Autópsia (Kolb)** — análise pós-simulado em 4 etapas (Experiência, Reflexão, Conceituação, Ação)
- **Caderno de Erros** — coleção de questões erradas com revisão espaçada
- **Encontro Bússola** — reunião quinzenal coletiva com Filippe (todos os alunos)

## 13. Repositório, time e plataforma

**GitHub**
- Repo principal: `IntentoEd/app` (Private)
- Org: `IntentoEd` (plano Free) — migrado de `metodointento-art/app` em 2026-04-30
- Members: `filippeximenes` (operação) — `Rafael` em onboarding (CRM)
- Outros repos auxiliares ainda sob `metodointento-art` (não foram migrados): `metodo-intento-onboarding`, `painel-intento-fgv-insper`, etc.
- Convenção de divisão futura: Filippe foca em operação (mentor/líder/aluno, agenda, push, simulados); Rafael, no módulo CRM/Pipeline. Formalizar via `CODEOWNERS` quando o módulo de CRM existir como pasta no repo.

**Vercel**
- Team: `linus' projects` (plano **Hobby**)
- GitHub App da Vercel instalado na Org `IntentoEd` com acesso ao repo `app`
- Branch de produção: `main`
- Limites relevantes do Hobby:
  - Crons: máx 2, frequência mínima diária — não roda `*/5 min`. Por isso `/api/agenda/sync` precisa ser disparado externamente.
  - Team members: 1 (Rafael não consegue acesso direto enquanto for Hobby)
  - Banda: 100GB/mês
  - Uso comercial: tecnicamente fora dos ToS no Hobby
- Upgrade Pro ($20/seat/mês) destrava crons, segundo seat e regulariza uso comercial — decisão pendente.

**Identidade dos commits**
- Filippe commita como `Filippe Ximenes <filippex@gmail.com>` (conta GitHub: `filippeximenes`)
- Conta legada `metodointento-art` permanece dona dos repos auxiliares; não usar pra novos commits.

---

Este documento foi gerado pra alimentar uma instância do Claude.ai que vai discutir aspectos macros da operação Intento. Use como referência viva — atualize conforme o sistema evolui.
