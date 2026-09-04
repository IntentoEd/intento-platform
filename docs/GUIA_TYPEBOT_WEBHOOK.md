# Guia de configuração do webhook no Typebot

**Para:** quem configurar o Typebot (qualquer conta de vendedor / Filippe)
**De:** Filippe / Intento
**Sobre:** Integração entre o fluxo do Typebot e o CRM da Intento

---

## O que esse webhook faz

Cada lead que finaliza o fluxo do Typebot é enviado automaticamente pro CRM da Intento. O lead aparece em `https://mentoria.metodointento.com.br/vendas` na coluna "Lead", pronto pra ser atribuído a um vendedor.

Você não precisa mais exportar planilha, copiar dados, nem fazer importação manual.

---

## 1. Pegue o secret

Peça pro Filippe te enviar o valor do `LEADS_WEBHOOK_SECRET` (Production, no Vercel). Esse valor vai ser referenciado neste guia como `<SECRET>` — substitua pelo valor real quando configurar.

> **Importante:** trate o secret como uma senha. Não compartilhe em grupos públicos, não comite em código aberto.

---

## 2. Adicione um bloco "HTTP Request" no Typebot

No editor do Typebot:

1. Vá ao **final do fluxo**, depois que todas as variáveis tiverem sido preenchidas.
2. Clique em `+` para adicionar um novo bloco.
3. Em **Integrations** (ou **Logic**, depende da versão do Typebot), selecione **HTTP Request** (em versões mais antigas, pode aparecer como **Webhook**).

---

## 3. Configure a requisição

**Method:**
```
POST
```

**URL:**
```
https://mentoria.metodointento.com.br/api/leads/webhook
```

---

## 4. Configure os Headers

Clique em "Headers" e adicione **exatamente estas duas entradas**:

| Key | Value |
|---|---|
| `Content-Type` | `application/json` |
| `x-webhook-secret` | `<SECRET>` |

> **Atenção:** o nome do header é `x-webhook-secret`, exatamente assim — tudo em minúsculas, com hífens. Sem espaços, sem aspas em volta.

---

## 5. Configure o Body (JSON)

Cole o JSON abaixo no campo "Body" / "Request body". O Typebot vai substituir as `{{variáveis}}` automaticamente quando o fluxo rodar:

```json
{
  "name": "{{name}}",
  "nome_acr": "{{nome_acr}}",
  "nome_asr": "{{nome_asr}}",
  "nome_pais": "{{nome_pais}}",
  "nome_filho": "{{nome_filho}}",
  "nome_responsavel": "{{nome_responsavel}}",
  "phone_formatted": "{{phone_formatted}}",
  "email": "{{email}}",
  "medicina_ou_outros": "{{medicina_ou_outros}}",
  "editais_interesse": "{{editais_interesse}}",
  "esta_em": "{{esta_em}}",
  "estuda_ha": "{{estuda_ha}}",
  "orcamento_referido": "{{orcamento_referido}}",
  "motivo_busca": "{{motivo_busca}}",
  "deseja_comecar_em": "{{deseja_comecar_em}}",
  "autoavaliacao_progresso": "{{autoavaliacao_progresso}}",
  "finalizou_aplicacao": "{{finalizou_aplicacao}}",
  "historico_conversa": "{{historico_conversa}}",
  "mentor_indicacao": "{{mentor_indicacao}}",
  "aluno_indicacao": "{{aluno_indicacao}}",
  "origem": "{{origem}}",
  "compromisso": "{{compromisso}}",
  "utm_campaign": "{{utm_campaign}}",
  "utm_adset": "{{utm_adset}}",
  "utm_ad": "{{utm_ad}}"
}
```

### Pontos importantes

- Os nomes das variáveis dentro de `{{...}}` precisam ser **exatamente iguais** aos que você usa no seu Typebot. Se alguma variável tem nome diferente (por exemplo, `phoneFormatted` em vez de `phone_formatted`), ajuste só a `{{variável}}` correspondente — a chave do JSON pode ficar como está.
- Os campos `utm_campaign`, `utm_adset` e `utm_ad` alimentam a atribuição de campanha (viram linhas nas anotações do lead) — **sem eles perde-se de qual anúncio o lead veio**. `compromisso` também é registrado nas anotações.
- Variáveis vazias não são problema. Se um fluxo do tipo "self" não preencher `nome_pais` ou `nome_filho`, eles chegam vazios e o sistema lida com isso.
- **Você não precisa decidir o `tipoPerfil` no Typebot.** O sistema deduz automaticamente, nesta ordem:
  - Se `nome_pais` **ou** `nome_filho` está preenchido → é um responsável (pai/mãe) cadastrando o filho. Basta um dos dois: só `nome_filho` preenchido já dispara este ramo (o nome do lead cai em `name` nesse caso).
  - Senão, se `nome_acr` está preenchido → é um aluno **com** responsável financeiro.
  - Senão, se `nome_asr` está preenchido → é um aluno **sem** responsável financeiro.
  - Caso contrário → o sistema usa `name` como nome do lead.
- O webhook é **tolerante a variações de formato** (`app/api/leads/webhook/route.js`):
  - Chaves com acento, maiúscula, espaço ou hífen são normalizadas automaticamente (`"Nome Filho"`, `"e-mail - pais"` etc. funcionam), e há aliases pros nomes mais comuns (`phone` → `telefone`, `e_mail` → `email`, ...).
  - O parser de body conserta padrões malformados típicos do Typebot/Make, como valores embrulhados em array-string (`"campo": "["valor"]"`).

---

## 6. Teste o fluxo

1. Clique em **"Test"** dentro do Typebot e rode o fluxo até o final.
2. Quando o fluxo chegar no bloco HTTP Request, a requisição é disparada.
3. A resposta esperada (no painel de logs do Typebot) é:

```json
{
  "status": "sucesso",
  "idLead": "lead_1234567890_456"
}
```

Se aparecer `"status": "sucesso"`, **funcionou**. ✅

---

## 7. Valide no CRM

1. Abra `https://mentoria.metodointento.com.br/vendas` no navegador.
2. Faça login com qualquer conta de vendedor ativa (ou com o Filippe).
3. O lead que você criou no teste deve aparecer na primeira coluna (**"Lead"**), com:
   - Nome correto
   - Telefone correto
   - Origem preenchida
   - Anotações com modalidade, motivo, histórico do WPP (tudo concatenado)

Se você clicar no card, vê todos os detalhes — e pode atribuir o lead a um vendedor pela interface.

---

## Erros comuns

| Resposta do webhook | Causa provável | Como arrumar |
|---|---|---|
| `401 Não autorizado` | Secret errado, ausente, ou nome do header digitado errado | Confira se o header é exatamente `x-webhook-secret` (minúsculo, com hífens). Verifique se o valor é igual ao que está em Production no Vercel. |
| `400 nome e telefone são obrigatórios` | Todas as variáveis de nome (`name`, `nome_acr`, `nome_asr`, `nome_pais`) chegaram vazias **OU** `phone_formatted` está vazio. | Verifique se o fluxo do Typebot preencheu pelo menos um campo de nome e o telefone antes de chegar no webhook. |
| Erro `500` ou genérico | Bug ou indisponibilidade do GAS | Tire um screenshot da resposta e envie pro Filippe. |

---

## Colocar em produção

Quando o teste estiver funcionando:

1. Clique em **"Publish"** no Typebot pra publicar a versão atualizada.
2. A partir desse momento, todo lead que terminar o fluxo entra automaticamente no CRM da Intento.

---

## Dúvidas e suporte

Qualquer coisa que não esteja clara, ou que dê um erro inesperado:

- Tire **prints da tela** mostrando:
  - Configuração do bloco HTTP Request (URL, Headers, Body).
  - Resposta do teste (logs ou erro retornado).
- Envie pro Filippe junto com uma descrição do que estava tentando fazer.

---

*Documento gerado por Filippe Ximenes — Intento Mentoria*
