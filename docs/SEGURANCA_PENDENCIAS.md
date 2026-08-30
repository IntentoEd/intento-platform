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

## PENDENTE #1 (crítico) — escalada de privilégio por email não verificado

**Risco:** o login aceita email/senha (`createUserWithEmailAndPassword`) e o
cadastro nunca envia verificação. Conta email/senha nasce com
`email_verified = false`. O `verificarUsuario` (lib/auth.js) até calcula
`emailVerificado`, mas **ninguém lê**. Como o GAS autoriza por email
(`_ehLider('filippe@...')` → líder; `endsWith('@metodointento.com.br')` →
mentor), dá pra cadastrar o email de um mentor/líder ainda não registrado no
Firebase, receber um token válido com aquele email **sem provar posse da caixa**,
e assumir o papel.

**O que segura hoje (frágil, fora do código):** a config "one account per email"
do Firebase + o staff já ter conta Google nesses emails. Não deveria ser a única
barreira.

**Decisão de produto necessária (uma das):**
- (a) Passar a exigir `email_verified` no `verificarUsuario` **e** enviar
  `sendEmailVerification` no cadastro + gating na UI. Logins Google já vêm
  verificados, não quebram. Quebra logins email/senha existentes até verificarem.
- (b) Desligar o provedor email/senha no Firebase e ir só Google.
- (c) Exigir `email_verified` só pros papéis privilegiados (líder/mentor),
  mantendo aluno no fluxo atual.

**Antes de decidir:** confirmar no console do Firebase se email/senha está mesmo
habilitado (não dá pra checar pelo repo).

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
