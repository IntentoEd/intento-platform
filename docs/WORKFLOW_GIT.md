# Workflow Git — branch + PR pra trabalhar em paralelo

> Pra evitar o caos de quando 2+ pessoas mexem no mesmo working tree (vide incidentes de 05-08/05/2026: gasClient.js esquecido, MentorContext desatualizado, stashes perdidos).
>
> Regra principal: **nunca commitar direto na `main`**, exceto hotfix de prod quebrada.

## TL;DR — fluxo padrão

```bash
# 1. Antes de começar, garante que main está atualizada
git checkout main
git pull origin main

# 2. Cria branch própria (com seu prefixo)
git checkout -b filippe/nome-curto-da-feature

# 3. Edita arquivos, comita normal
git add <arquivos>
git commit -m "feat: o que fez"

# 4. Push da branch (não da main)
git push origin filippe/nome-curto-da-feature

# 5. Abre PR no GitHub
gh pr create --title "Título curto" --body "Descrição do que faz"
# (ou clica "Compare & pull request" no botão verde que aparece no GitHub.com)

# 6. Vercel cria URL de preview automática (aparece no PR)
#    Testa lá antes de mergear

# 7. Revisa o diff no próprio PR (self-review) → Merge. Vercel deploya prod.

# 8. Volta pra main e limpa
git checkout main
git pull origin main
git branch -d filippe/nome-curto-da-feature
```

## Convenção de nome de branch

Sempre prefixo + assunto curto em kebab-case:

```
filippe/joice-pendencias
filippe/fix-diagnostico-erro-silencioso
hotfix/login-quebrado     ← pra emergências
```

**Por quê:** quando aparece no `git branch -a`, vê na hora o que é cada trabalho em andamento — inclusive de sessões Claude paralelas. (Prefixos `rafa/...` eram usados até o Rafael sair da operação; não criar novos.)

## Review de PR — opcional (dono único)

Desde a saída do Rafael, Filippe é o único dono ativo do repo. **Review de outra pessoa não é mais parte do fluxo** — self-merge é o normal. O PR continua sendo o default porque entrega, mesmo sem reviewer:

- **Audit trail**: fica registro do que mudou, quando e por quê, revertível com 1 clique
- **Vercel preview**: URL automática pra testar antes de ir pra prod
- **Diff limpo**: o próprio autor bate o olho no diff consolidado antes de mergear

### Feature normal (default)
1. Abre PR
2. Auto-revisa o diff (`gh pr diff`) e testa no preview da Vercel
3. Merge (self-merge, sem esperar ninguém)

### Hotfix urgente (prod quebrada)
Mesma coisa, mas com auto-merge programado:
```bash
git checkout -b hotfix/login-quebrado
# edita
git commit -am "hotfix: ..."
git push origin hotfix/login-quebrado
gh pr create --title "hotfix: ..." --body "Prod quebrada, mergeando direto"
gh pr merge --auto --squash    # mergeia assim que CI passa
```

A vantagem mesmo em hotfix: fica registro do que mudou + Vercel preview onde você testou + dá pra reverter o PR inteiro com 1 clique se piorar.

### Mudança em código sensível (`lib/`, `gas/Code.gs` constantes, `app/layout.js`)
Sempre via PR, com auto-revisão calma do diff antes do merge — são arquivos que quebram várias páginas de uma vez.

## Como abrir PR pelo GitHub web (sem `gh` CLI)

1. Após `git push origin sua-branch`, o GitHub mostra um banner "Compare & pull request" no topo do repositório
2. Clica
3. Preenche título + descrição
4. "Create pull request"
5. Vercel comenta no PR com a URL de preview

## Vercel preview por branch

Toda branch pushada gera uma URL automática tipo:
```
https://intento-platform-git-filippe-nome-da-branch-IntentoEd.vercel.app
```

Aparece no PR como comentário do bot da Vercel. Testa **lá** antes de mergear pra `main`. Se quebrar no preview, conserta na branch (mais commits) — preview atualiza automático.

## O que fazer quando dá conflito

Se sua branch divergiu da `main` (alguém mergeou outra coisa enquanto você trabalhava):

```bash
# Atualiza main local
git checkout main
git pull origin main

# Volta pra sua branch e traz as mudanças da main
git checkout filippe/sua-branch
git merge main

# Se git apontar conflito em algum arquivo:
#   - Abre o arquivo, procura por <<<<<<<, ======, >>>>>>>
#   - Decide qual versão fica (sua, do main, ou mistura)
#   - Remove os marcadores
#   - git add <arquivo conflitado>
#   - git commit (sem -m, ele preenche mensagem padrão de merge)

# Push de novo
git push origin filippe/sua-branch
```

## Regras pra reverter PR

Se mergeou e descobriu que quebrou prod:

```bash
# Opção 1 — Revert pelo GitHub
# No PR mergeado, botão "Revert" cria PR oposto. Mergeia esse, prod volta.

# Opção 2 — git local
git checkout main
git pull
git revert <SHA-do-merge>
git push origin main
```

`git revert` cria um commit novo que **desfaz** o anterior. Não reescreve história. Vercel deploya o revert.

## Donos por pasta (CODEOWNERS implícito)

Documentado em [CLAUDE.md](../CLAUDE.md). Resumo do modelo atual (dono único):

- **Filippe é o único dono ativo** de todo o repo — mentoria/escolar (`app/mentor/`, `app/painel/`, `app/onboarding/`, `app/diagnostico/`, `app/lider/`, `app/api/{mentor,submit,auth}/`, `components/AbaProvas.js`, `Boletim*`, `Provas*`, `Push*`, `gas/escolar.gs`, `gas/marcos.gs`, `gas/integracaoApp.gs`, `gas/push.gs`) e infra compartilhada (`lib/`, `scripts/`, `app/layout.js`, `gas/Code.gs` — constantes + handlers de aluno/onboarding/diagnóstico/simulados —, `gas/SmokeTest.gs`)
- **Legado CRM/comercial** (ex-módulo do Rafael, sem dono ativo): `app/vendas/`, `app/vendedor/`, `app/api/leads/`, `app/api/agenda/`, `components/Modal{Lead,NovoLead}.js`, `gas/crm.gs`, `gas/agenda.gs`. O CRM opera em plataforma externa; esse código permanece como legado funcional — mudanças ali merecem cautela extra (confirmar com Filippe antes)

## Checklist antes de mergear PR

- [ ] Branch tá atualizada com `main` (sem conflitos)
- [ ] Build validado: o pre-push hook **só roda o build em push pra `main`** (`scripts/git-hooks/pre-push:22-29` — push de branch sai com exit 0). Como o fluxo padrão é branch+PR, na prática quem valida o build é o **preview da Vercel** — confira que o deploy de preview ficou verde. Se o PR for urgente (vai mergear sem esperar), rode `npm run build` manualmente antes do push
- [ ] Vercel preview testado pelo menos no caminho principal
- [ ] Se mexe em `gas/*.gs`: roda `smokeTest()` mentalmente — listou impacto na descrição do PR. Deploy do GAS é à parte do merge: `./scripts/deploy-gas.sh` (bloqueia se `gas/` tiver mudança não-commitada, faz `clasp push` + `clasp deploy` no deployment versionado de prod)
- [ ] Se mexe no legado CRM (`app/vendas/`, `gas/crm.gs`, etc.): confirmou com Filippe que a mudança é intencional

## Erros comuns

| Erro | Causa | Fix |
|---|---|---|
| `git push` recusado em `main` (depois que ativarmos branch protection — segue pendente em set/2026) | Você commitou direto na main por engano | `git checkout -b filippe/oops`, `git push origin filippe/oops`, abre PR |
| Vercel deploya da branch errada em prod | Improvável — só `main` deploya prod, branches são preview | — |
| Pre-push hook bloqueia (build falhou) | `.gas` ou `npm` quebrou (só acontece em push direto pra `main` — o hook não roda em push de branch) | Lê o erro, conserta, tenta de novo |
| Pop de stash dá conflito | Trabalho de outra sessão e o seu mexem no mesmo arquivo | Resolve conflito manualmente, commita |

## Comandos uteis no dia-a-dia

```bash
# Ver branches (suas e remotas)
git branch -a

# Ver PRs abertos no repo
gh pr list

# Ver PR específico
gh pr view 42

# Ver diff de um PR antes de aprovar
gh pr diff 42

# Aprovar PR pela CLI (em vez do botão)
gh pr review 42 --approve

# Mergear PR pela CLI
gh pr merge 42 --squash

# Apagar branch já mergeada (limpeza)
git branch -d filippe/feature-mergeada
```

## Fora do nosso escopo

Fluxos que NÃO vamos adotar (complicação demais pra operação de dono único):
- **Git flow** (`develop`, `release`, etc.) — use só `main` + branches de feature
- **Rebase interactive** — squash no merge do GitHub resolve
- **Review obrigatório** — self-merge basta; o valor do PR aqui é audit trail + preview, não gate humano
- **Staging/QA branches separadas** — Vercel preview já cobre

Quando entrar mais gente no repo, revisita.
