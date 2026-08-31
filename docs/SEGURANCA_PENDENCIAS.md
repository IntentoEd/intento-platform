# Segurança — auditoria e pendências

Auditoria feita em 30/08/2026 a partir do vídeo "O erro fatal de quem cria apps
sem saber programação" (Breno Perrucho), que lista 7 camadas de vulnerabilidade
comuns em apps feitos sem base técnica. Abaixo o que já foi corrigido e o que
ainda depende de decisão ou de config em produção.

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

## #1 — escalada de privilégio por email não verificado

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

### RESÍDUO em aberto (avaliar)

- **Mentor/vendedor cadastrado em BD_Mentores/BD_Vendedores com email PESSOAL**
  (não-domínio): não é pego pelo `ehStaffPrivilegiado` (o gateway não lê BD_*).
  Fechar exige checagem no GAS (passar `emailVerificado` do gateway e negar
  callers que resolvem a mentor/vendedor sem verificação) — deploy casado.
  Risco é estreito: enumeration protection ligada + o atacante teria que saber
  que aquele email pessoal específico é staff. **TODO se existir staff assim.**

### Opção (a) — adiada (defesa em profundidade pro aluno)

Exigir `email_verified` também pro aluno + `sendEmailVerification` no cadastro +
gate na UI. Fecha a impersonação aluno↔aluno. Requer migração das contas
email/senha atuais. Caminho: começar disparando verificação nos cadastros novos
(sem bloquear) e, quando a taxa de verificados subir, virar a chave.

## PENDENTE #4 — ligar `VALIDAR_TOKEN` no GAS

Hoje `VALIDAR_TOKEN = false` (gas/Code.gs). O `/exec` é uma URL pública: a única
proteção é a URL ser secreta. O código já está pronto pra ligar (item 6 acima).

**Ordem obrigatória (senão derruba prod):**
1. Garantir que o Next com o roteamento via `chamarGAS` já está em produção.
2. No editor do GAS: Project Settings → Script Properties → criar `API_TOKEN`
   com o **mesmo valor** da env `GAS_API_TOKEN` do Vercel.
3. Só então mudar `VALIDAR_TOKEN = true` (gas/Code.gs) e fazer `clasp push` +
   `clasp deploy -i <id>`.
4. Rodar o smoke (`SmokeTest.gs`) e conferir uma chamada real do app.

Se ligar `VALIDAR_TOKEN` antes do passo 2, o GAS responde 500 "Servidor mal
configurado" pra tudo → outage total.

## Ordem de deploy desta branch

1. Merge do PR → Vercel sobe a parte Next (tudo backward-compatible).
2. `clasp push` + `clasp deploy` do `gas/Code.gs` (authz do `handleLogin`). Pode
   ser antes ou depois do passo 1 graças ao fallback.
3. Só depois, quando quiser, encarar o PENDENTE #4 (procedimento acima).
