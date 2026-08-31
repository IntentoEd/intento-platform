# Segurança — auditoria e pendências

Auditoria feita em 30/08/2026 a partir do vídeo "O erro fatal de quem cria apps
sem saber programação" (Breno Perrucho), que lista 7 camadas de vulnerabilidade
comuns em apps feitos sem base técnica.

**Status (31/08/2026): todos os achados resolvidos e verificados em produção.**
Resta só a opção (a) do #1, adiada por decisão de produto. Abaixo o registro de cada um.

## Corrigido na branch `filippe/hardening-auth-push`

Tudo abaixo é código; a parte Next deploya no merge (Vercel), a parte GAS exige
`clasp push` + `clasp deploy` (deploy casado — ver ordem no fim).

1. **`/api/auth` desativada (410).** Rota pública que devolvia o painel completo
   de qualquer aluno a partir do email, sem token nem autorização (IDOR). Sem
   caller no client. Pode ser deletada fisicamente depois.
2. **IDOR do `login` via `/api/mentor` fechado.** A ação `login` (usada pelo
   `/painel` do aluno e pelo export do mentor em `/mentor/ig/painel`) confiava no
   email do body. Agora o gateway injeta `emailCaller` (email verificado do
   token) e o GAS (`handleLogin`) autoriza: próprio aluno, mentor responsável ou
   líder. Fallback mantém o comportamento antigo enquanto `emailCaller` não chega
   (janela do deploy casado) — por isso o GAS pode subir antes ou depois do Next
   sem quebrar.
3. **`/api/push/send` autenticado.** Antes qualquer um na internet disparava push
   com a "voz" da Intento pra qualquer inscrito (phishing). Agora aceita só o
   cron (`x-agent-token` == `AGENT_API_TOKEN`) ou usuário logado notificando o
   **próprio** email.
4. **`/api/push/subscribe` e `/api/push/unsubscribe` autenticados.** Exigem
   Firebase token; o subscribe força o email do token (não dá pra se inscrever no
   nome de outro).
5. **IDOR do `listarPushSubscriptions` fechado.** O gateway passava a sobrescrever
   `email` mas não `emails`; agora remove `emails` das ações autenticadas.
6. **Todas as chamadas Next→GAS passam pelo `chamarGAS`** (carregam o token).
   Isso é pré-requisito pra ligar `VALIDAR_TOKEN` sem quebrar push.

## #1 — escalada de privilégio por email não verificado — ✅ MITIGADO (opção c)

**Risco:** o login aceita email/senha (`createUserWithEmailAndPassword`) e o
cadastro nunca envia verificação. Conta email/senha nasce com
`email_verified = false`. O `verificarUsuario` (lib/auth.js) até calcula
`emailVerificado`, mas **ninguém lia**. Como o GAS autoriza por email
(`_ehLider('filippe@...')` → líder; `endsWith('@metodointento.com.br')` →
mentor), dava pra cadastrar o email de um mentor/líder ainda não registrado no
Firebase, receber um token válido com aquele email **sem provar posse da caixa**,
e assumir o papel.

### Mitigado pela opção (c) — email verificado pros papéis do domínio

`lib/auth.js` exporta `ehStaffPrivilegiado(email)` (líder + `@metodointento.com.br`).
O gateway (`/api/mentor`) e `/api/vendedor/disponibilidade` passam a **rejeitar
(403)** caller de papel privilegiado com `email_verified=false`. Staff usa Google
Workspace (sempre verificado), então é invisível pra eles; o ataque de registrar
`alguem@metodointento.com.br` via email/senha não verificado morre. Só Next, sem
GAS. (Firebase: "proteção contra enumeração de e-mails" está ligada — não fecha
essa falha, só esconde quais emails existem.)

### RESÍDUO — N/A (invariante: todo staff no domínio)

Confirmado em 31/08/2026 (Filippe) que **não há mentor/vendedor ativo com email
fora de `@metodointento.com.br`**. Logo `ehStaffPrivilegiado` (domínio) cobre 100%
do staff e a opção (c) está completa — sem necessidade de layer no GAS.

**Invariante a manter:** se um dia entrar mentor/vendedor com email PESSOAL
(não-domínio) em BD_Mentores/BD_Vendedores, ele NÃO é coberto pelo gateway (que
não lê BD_*). Aí sim reabre o resíduo: fechar exige checagem no GAS (passar
`emailVerificado` do gateway e negar caller que resolve a mentor/vendedor sem
verificação) — deploy casado.

### Opção (a) — adiada (defesa em profundidade pro aluno)

Exigir `email_verified` também pro aluno + `sendEmailVerification` no cadastro +
gate na UI. Fecha a impersonação aluno↔aluno. Requer migração das contas
email/senha atuais. Caminho: começar disparando verificação nos cadastros novos
(sem bloquear) e, quando a taxa de verificados subir, virar a chave.

## #4 — `VALIDAR_TOKEN` no GAS — ✅ CONCLUÍDO (31/08/2026, PRs #100 + #106)

O `/exec` do GAS era uma URL pública protegida só pela URL ser secreta. Agora
`VALIDAR_TOKEN = true`: o `doPost` rejeita (401) qualquer POST sem o token correto.

Ligado com segurança em duas etapas:
1. **Dry-run** (`VALIDAR_TOKEN_DRYRUN`, PR #100): logava o mismatch em Executions
   sem bloquear, pra confirmar sem risco que o tráfego real carrega o token.
2. **Enforce** (PR #106): auditoria multi-agente confirmou que o único caller
   inbound do `/exec` é o Next via `chamarGAS` (injeta o token) — sem `doGet`, sem
   fetch direto no client/SW, crons internos não passam por `doPost`, app Flutter
   é pull via BigQuery, integrações externas (Typebot/agenda) entram por rotas Next
   protegidas. Token rotacionado: `API_TOKEN` (Script Property GAS) == `GAS_API_TOKEN`
   (Vercel prod + preview), Next redeployado.

**Verificado em prod:** `/exec` sem token → `{"status":"erro","mensagem":"Não autorizado."}`;
com token → dados; `/mentor` e `/painel` ok; `origin/main` com `VALIDAR_TOKEN=true`
(sem drift); smoke verde. **Rollback:** `VALIDAR_TOKEN = false` + `./scripts/deploy-gas.sh`.

## `AGENT_API_TOKEN` (push cron) — ✅ CONCLUÍDO (31/08/2026)

A Script Property `AGENT_API_TOKEN` estava ausente → o cron de push (`_enviarPush`
em push.gs) abortava silenciosamente, e a rota `/api/push/send` (endurecida em #94)
exige o mesmo token. Rotacionado: novo valor na Script Property do GAS + env do
Vercel (prod + preview) + redeploy. Smoke `15 OK · 0 FALHAS`. O agente de agenda
n8n que dividia esse token está desativado (confirmado com o responsável), então a
rotação foi sem risco.

## Deploy do GAS (referência)

Mudança em `gas/**` exige `clasp push` + `clasp deploy` — o `push` sozinho NÃO
atualiza a versão fixa de prod. Use `./scripts/deploy-gas.sh "descrição"`, que
embute o deployment id e bloqueia se `gas/` tiver mudança não-commitada. Rodar
`SmokeTest.gs` depois pra validar (deve dar 15 OK · 0 FALHAS).
