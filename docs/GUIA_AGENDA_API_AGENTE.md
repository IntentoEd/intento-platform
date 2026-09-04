# API de Agenda — Guia do Agente (n8n)

**Para:** Rafael / Agente WhatsApp (n8n)
**Sobre:** API de agendamento, cancelamento e reagendamento de reuniões com vendedores

---

## Visão geral

A API expõe 4 endpoints que o agente do WhatsApp pode chamar para gerenciar reuniões dos leads com os vendedores. O backend cuida de:

- Verificar se o horário pedido cai dentro dos **horários padrão** declarados pelo vendedor (armazenados no sistema, não no Calendar)
- Descartar horários com **exceção de bloqueio** cadastrada pelo vendedor
- Fazer duplo-check de conflito no **Google Calendar** do vendedor (freebusy)
- Escolher o vendedor de menor carga (round-robin)
- Criar evento com Google Meet automático
- Convidar lead, vendedor e suporte por email
- Atualizar o lead no CRM

---

## Como o vendedor declara disponibilidade

> ⚠️ **Modelo antigo desativado:** já existiu um esquema de eventos no Google Calendar com título `[Intento]` funcionando como janela de plantão. **Isso não existe mais** — eventos assim são ignorados.

Hoje a disponibilidade vive no próprio sistema, em duas camadas (ver cabeçalho de `gas/agenda.gs`):

1. **Horários padrão semanais** — JSON na coluna `HORARIOS` de `BD_Vendedores`, salvo por `handleSalvarHorariosPadrao` (`gas/agenda.gs`). Ex.: "terça 19:00–21:30, toda semana".
2. **Exceções de bloqueio** — períodos pontuais de indisponibilidade (férias, médico, etc.) gravados em `BD_Disponibilidade_Excecoes`, via `handleCriarExcecaoDisponibilidade` / `handleRemoverExcecaoDisponibilidade` (`gas/agenda.gs`).

O vendedor configura tudo por UI própria: **`/vendedor/disponibilidade`** (`app/vendedor/disponibilidade/page.js`), que fala com `app/api/vendedor/disponibilidade/route.js`.

Não declarar horários padrão = não receber reuniões.

Além disso, o sistema **faz duplo-check contra o Google Calendar do vendedor**: antes de agendar, `/api/agenda/agendar` consulta freebusy (`vendedorLivreNoCalendar`) e descarta vendedores com evento conflitando no horário. Se o freebusy falhar, o vendedor é considerado livre (não bloqueia o agendamento).

---

## Autenticação

Todas as chamadas exigem o header:

```
x-agent-token: <AGENT_API_TOKEN>
```

O secret está no env var `AGENT_API_TOKEN` no Vercel (Production). Pede pro Filippe.

> Token errado, ausente ou diferente → resposta **401**.

---

## Endpoints

### 1. Agendar reunião — `POST /api/agenda/agendar`

Cria evento + atualiza o lead.

**Headers:**
```
Content-Type: application/json
x-agent-token: <SECRET>
```

**Body:**
```json
{
  "horarioISO": "2026-05-06T19:00:00-03:00",
  "idLead": "lead_1234567890",
  "idempotencyKey": "uuid-gerado-pelo-n8n",
  "durMin": 30
}
```

| Campo | Obrig | Descrição |
|---|---|---|
| `horarioISO` | sim | ISO 8601 com timezone, recomendado `-03:00` (BRT) |
| `idLead` | sim | ID do lead em `BD_Leads` (ex: `lead_xyz`). Lead **deve já existir**. |
| `idempotencyKey` | sim | UUID único da operação. Repetir a mesma chave em 1h retorna o mesmo resultado. |
| `durMin` | não | Duração em minutos. Padrão: 30. |

**Resposta — sucesso:**
```json
{
  "status": "agendado",
  "eventId": "abc123xyz",
  "vendedor": {
    "email": "rafael@metodointento.com.br",
    "nome": "Rafael"
  },
  "horario": "2026-05-06T19:00:00-03:00",
  "horarioBR": "Terça-feira, 06/05 às 19h00",
  "meetLink": "https://meet.google.com/xxx-yyyy-zzz",
  "calendarLink": "https://calendar.google.com/event?eid=..."
}
```

**Resposta — sem vaga:**
```json
{
  "status": "sem_vaga",
  "motivo": "Nenhum vendedor tem janela padrão cobrindo esse horário",
  "sugestoes": [
    { "horarioISO": "2026-05-06T19:30:00-03:00", "horarioBR": "Terça-feira, 06/05 às 19h30" },
    { "horarioISO": "2026-05-06T20:00:00-03:00", "horarioBR": "Terça-feira, 06/05 às 20h00" },
    { "horarioISO": "2026-05-07T19:00:00-03:00", "horarioBR": "Quarta-feira, 07/05 às 19h00" }
  ]
}
```

Os 4 valores possíveis de `motivo` (de `app/api/agenda/agendar/route.js`):

1. `Nenhum vendedor com horarios_padrao definido`
2. `Nenhum vendedor tem janela padrão cobrindo esse horário`
3. `Vendedores com janela padrão estão bloqueados nesse horário`
4. `Vendedores estão ocupados nesse horário (conflito no Calendar)`

> ⚠️ **Não faça match por string literal do `motivo`** no fluxo do agente — são textos de UI e podem mudar sem aviso. Decida pelo `status` (`agendado` vs `sem_vaga`) e use `motivo` só pra exibir/logar.

---

### 2. Listar sugestões — `GET /api/agenda/sugestoes?dias=7&durMin=30`

Retorna até 30 horários livres dos próximos `dias` (padrão 7, máximo 14). Útil quando o lead pergunta "quais horários vocês têm?".

**Resposta:**
```json
{
  "status": "sucesso",
  "sugestoes": [
    { "horarioISO": "2026-05-06T19:00:00-03:00", "horarioBR": "Terça-feira, 06/05 às 19h00", "vendedoresLivres": 2 },
    ...
  ],
  "total": 18,
  "dias": 7,
  "durMin": 30
}
```

---

### 3. Cancelar reunião — `POST /api/agenda/cancelar`

```json
{ "idLead": "lead_1234567890" }
```

Resposta: `{ "status": "cancelado", "idLead": "..." }`

> Lead volta pra fase `Ativo WPP`.

---

### 4. Reagendar — `POST /api/agenda/reagendar`

```json
{
  "idLead": "lead_1234567890",
  "novoHorarioISO": "2026-05-07T20:00:00-03:00",
  "idempotencyKey": "uuid-do-n8n"
}
```

Resposta: mesma estrutura de `/agendar` (sucesso ou sem_vaga).

---

## Fluxo recomendado no n8n

```
Lead manda: "quero marcar terça 19h"
    ↓
Agente parsea o horário → "2026-05-06T19:00:00-03:00"
    ↓
Agente gera idempotencyKey (UUID v4)
    ↓
POST /api/agenda/agendar
    ↓
"agendado" → "Marquei sua reunião com X em DD/MM HH:MM. Link Meet: ..."
    ↓
"sem_vaga" → mostra sugestoes pro lead, espera escolha, repete
```

### Idempotency

Gera **um UUID novo por tentativa de marcar**, não por lead. Em retry de timeout, **mantém o mesmo UUID** pra evitar marcação duplicada.

---

## Limites e observações

- **Antecedência mínima:** 4 horas. Slots dentro de 4h são rejeitados.
- **Granularidade:** 30 em 30 minutos.
- **Janela de busca de sugestões:** padrão 7 dias, máximo 14. Até 30 sugestões por resposta.
- **Round-robin:** quando vários vendedores têm janela cobrindo o slot, o sistema escolhe o de menor número de reuniões marcadas no mês corrente.
- **Convidados sempre incluem:** lead, vendedor escolhido, `suporte@metodointento.com.br`.
- **Convite por email:** o Google Calendar envia automaticamente.
- **Idempotency cache:** 1h em memória do servidor.
- **Sem horário comercial fixo** — quem define é cada vendedor pelos horários padrão configurados em `/vendedor/disponibilidade`. Se ninguém declarar disponibilidade, retorna sem vagas.

---

## Erros comuns

| Resposta | Causa |
|---|---|
| `401 Não autorizado` | header `x-agent-token` ausente ou errado |
| `400 horarioISO inválido` | string ISO mal formatada |
| `404 lead não encontrado` | `idLead` não existe em `BD_Leads` |
| `sem_vaga` | nenhum vendedor disponível no slot — sem horário padrão cobrindo, com exceção de bloqueio, ou ocupado no Calendar (ver os 4 `motivo`s acima) |

---

## Suporte

Em caso de erro inesperado, manda pro Filippe:

1. Endpoint chamado
2. Body completo
3. Resposta recebida (status + body)
4. Timestamp da chamada

---

*Documento gerado por Filippe Ximenes — Intento Mentoria*
