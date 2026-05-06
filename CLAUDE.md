@AGENTS.md

# Multi-sessão — sempre validar antes de commitar

Este repo costuma ter múltiplas sessões Claude Code rodando em paralelo (Filippe + Rafa, ou janelas separadas). Cada sessão tem seu estado mental do repo, mas o filesystem é único — incidentes acontecem quando uma sessão commita+pusha sem saber o que outra deixou pendente.

**Antes de qualquer `git add` / `git commit` / `git push`:**

1. Rode `git status` e `git log origin/main..HEAD` e `git log -5`.
2. Se houver arquivos modificados que VOCÊ não tocou nesta sessão, ou commits recentes que VOCÊ não fez, **liste pro usuário antes de prosseguir.** Pode ser trabalho de outra conversa que não pode entrar no seu commit.
3. Use `git stash push -m "outra conversa: <descrição>" -- <arquivos>` pra isolar o que não é seu antes de `git add`.
4. Após push, sempre `git stash pop` pra devolver o trabalho que era de outra sessão.

**Se descobrir mid-task que outra conversa modificou o estado** (ex: `gas/Code.gs` aparece como modificado por outra mão, ou commit novo apareceu no `git log`), pare e mostre o estado pro usuário decidir. Não tente reconciliar sozinho.

**Sincronização GAS ↔ Next:** mudanças que mexem nos dois lados (ex: novo handler no GAS + caller no Next) devem ser deployadas em janela curta. Se só uma ponta sobe, o outro lado pode quebrar silenciosamente em produção.

# Commit cirúrgico — incluir dependências

Se a sessão tem N arquivos modificados e você vai commitar SÓ alguns, **antes do `git add` faça um sweep**:

1. Pra cada arquivo que vai entrar no commit, verifique:
   - `import` ou `require` aponta pra arquivo **untracked** ou **modificado** que NÃO está sendo commitado? Se sim, ou inclui também ou aborta.
   - O comportamento esperado depende de outro arquivo modificado (ex: backend novo exige header novo do client)? Se sim, listar e perguntar antes.

2. Sempre que possível, antes do push: `git stash push --keep-index --include-untracked && npm run build && git stash pop`. Isso simula EXATO o que vai pra prod (só HEAD + arquivos staged). O hook `scripts/git-hooks/pre-push` faz isso automaticamente — se não estiver ativo, rodar manualmente. Pra ativar: `./scripts/setup-hooks.sh`.

**Por quê:** hoje tivemos 2 incidentes em prod (`/mentor/[id]` e `/mentor` lista) porque commits cirúrgicos importavam módulos cujos arquivos ficaram untracked, ou ativavam auth no backend sem que o cliente correspondente fosse atualizado. Build local passava porque o working tree tinha tudo; em prod faltava.
