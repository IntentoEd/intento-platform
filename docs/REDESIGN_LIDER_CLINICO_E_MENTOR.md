# Redesign /lider: Visão Geral administrativa + clínico na aba Mentores + painel espelho no /mentor

> Documento de planejamento, validado pelo Filippe em 07/08/2026 (v2 — inverte a v1, que propunha clínico na Visão Geral).
> Sucede o REDESIGN_LIDER.md (Fase 1, em prod via PRs #63–#75) — reorganiza o que foi construído, não recomeça.

## 1. Diagnóstico do problema

A fila única "Precisa de você" mistura **três naturezas** que pedem modos mentais diferentes:

| Natureza | Itens hoje | Quem resolve |
|---|---|---|
| **Operação do líder** (pré-mentoria + agenda) | designar, mentor inativo, sem diagnóstico, encontro de 60 dias | o próprio líder |
| **Clínica** (aluno em sofrimento) | alerta clínico (check-in vermelho, overstudying) | mentor age, líder cobra/acompanha |
| **Trajetória** (fora da fila, no chip) | cobertura < piso do ciclo, perfil Aprendiz | pauta de mentoria |

Agravante: o sinal de check-in aparece em 3 lugares (fila, contador de bem-estar, card do mentor) e o chip "Precisam de ação" não diz o motivo.

## 2. Princípio do redesign (decisão do Filippe, 07/08)

- **Visão Geral = administrativa.** O que o líder resolve diretamente: fila de **Operação** (designar, mentor inativo, **sem diagnóstico** — etapa prévia ao mentor —, encontro de 60 dias) + KPIs de processo (encontros do mês, acompanhamentos da semana) + **Perfil da base por dimensão** (mantido).
- **Aba Mentores = análise por mentor: perfil por mentor + alertas clínicos.** A fila clínica com nomes e motivos mora aqui, junto dos cards de mentor.
- **Aba Mentorados**: chip "Precisam de ação" mostra **os critérios que dispararam** (só quando o chip está ativo).
- **Cada sinal tem UMA casa com nomes**; nos demais lugares vira contagem que aponta pra casa.
- **Rafael usa a mesma página**, sem diferenciação (ele quase não usa a plataforma; o que for feito pro Filippe vale pra ele).

## 3. Visão Geral (redesenhada)

```
┌ KPIs ─────────────────────────────────────────────────────────────────┐
│ ⚙ Operação: 4    Encontros do mês: 78%    Acomp. semana: 82%    🚨 3 → │
│   (admin)                                              (aponta p/ Mentores) │
├───────────────────────────────────────────────────────────────────────┤
│ ⚙ OPERAÇÃO (4)                ← fila principal da página              │
│  ● Novato · aguardando designação                  [designar]         │
│  ● Carlos · Ana · sem diagnóstico                  [perfil ↗]         │
│  ● Lia · Bruno · encontro de 60 dias · 64d         [encontro feito ✓] │
├───────────────────────────────────────────────────────────────────────┤
│ Perfil da base · por dimensão (mantido, largura cheia)                │
├───────────────────────────────────────────────────────────────────────┤
│ ▸ explorar base (analytics sob demanda — mantido)                     │
└───────────────────────────────────────────────────────────────────────┘
```

Mudanças vs hoje:

1. **Fila "Precisa de você" vira "Operação"** — só administrativo: designar > mentor inativo > sem diagnóstico > encontro 60d. O clínico sai dela.
2. **"Sem diagnóstico" fica na Operação mesmo com mentor ativo** — é etapa prévia à mentoria, não cobrança ao mentor.
3. **KPI "Alertas clínicos" vira ponteiro**: só a contagem, clicável → aba Mentores. Nome de aluno em risco não aparece na Visão Geral.
4. **Card "Perfil por mentor" sai da Visão Geral** (redundante com a aba Mentores); "Perfil da base · por dimensão" ocupa a largura cheia.
5. Bloco "explorar base" (evolução + bem-estar + fora do app) mantido como está; o contador "em alerta de check-in" segue como contagem (a casa dos nomes é a aba Mentores).

## 4. Aba Mentores (perfil por mentor + alertas clínicos)

> Ajuste 07/08 (v2 → v3): os alunos em risco saem do card standalone no topo e entram
> **dentro do card de cada mentor**, abaixo da linha de métricas, no mesmo enquadramento
> visual dos outros elementos do card.

```
┌ [🚨 Em risco sem mentor — só quando existir: nome · motivo · designar] │
│ Ordenar: Carga | Alertas                                              │
│ ┌ Ana ────────────────────────────┐ ┌ Bruno ────────────────┐          │
│ │ Carga 6 · Acomp 83% ·           │ │ ...                   │          │
│ │ Encontros 75% · Alertas 1       │ │                       │          │
│ │ ┌ 🚨 Alunos em risco ─────────┐ │ │                       │          │
│ │ │ Maria — motivação despencou │ │ │                       │          │
│ │ └─────────────────────────────┘ │ │                       │          │
│ │ Perfis ▓▓▓░░░                   │ │                       │          │
│ └─────────────────────────────────┘ └───────────────────────┘          │
└───────────────────────────────────────────────────────────────────────┘
```

- **Alunos em risco dentro do card do mentor**, abaixo de Carga · Acomp. · Encontros · Alertas: nome + motivo + abrir card dimensional. Enquadramento discreto (borda/acento vermelho), consistente com o resto do card.
- **Aluno sem mentor ativo COM alerta clínico** aparece num card compacto "Em risco sem mentor" acima dos cards (designar inline) — só renderiza quando existe o caso.
- **Cards de mentor sem a métrica "Pendências"** (o administrativo mora na Visão Geral).
- Ordenação: Carga | Alertas.

## 5. Aba Mentorados — critérios no chip "Precisam de ação"

Com o chip ativo (e só com ele ativo), a tabela ganha coluna **Motivo** com *quais critérios dispararam* (pode ser mais de um):

- `🚨 alerta clínico · <alertaMotivo>` (ex: "motivação despencou")
- `cobertura 24% < piso 50% do C3` (números reais)
- `perfil Aprendiz · elo: Comportamento` (qual dimensão trava)

Implementação: nova função **`motivosAcao(d, ciclo)`** em `lib/carimbos.js` devolvendo motivos estruturados; substitui o boolean `precisaAcao()` do page.js. Compartilhada com o /mentor na Fase B.

## 6. Painel do mentor (/mentor) — Fase B

Faixa **"Alerta"** no topo da home do mentor (nome decidido pelo Filippe em 07/08; era "Prioridades da semana" no plano), invisível quando vazia:

- **Em risco** (clínico) dos alunos dele, **com motivo visível** (decisão: o mentor é quem age; só a nota privada é privada).
- **Precisam de ação** (trajetória) com os mesmos critérios de §5.
- O mentor **não vê**: comparação entre mentores, operação do líder (designar, encontro 60d, sem diagnóstico de outros).

### Backend necessário

`listaAlunosMentor` **não** devolve `metricas` (historico/checkin4w/materias) — o diagnóstico não é computável no /mentor hoje. Caminho:

1. **Nova ação GAS `dashboardMentor`** em `gas/Code.gs`: mesmo loop do `handleDashboardLider` filtrado pelo mentor autenticado (só alunos dele), com `agregarMetricasBase_` do subconjunto (~6–10 alunos, custo baixo). Autorização: qualquer mentor ativo, escopo restrito aos próprios alunos.
2. **Allowlist do proxy**: adicionar `dashboardMentor` em `ACOES_AUTENTICADAS` no route.js (lição do hotfix #50).
3. Payload por aluno = mesma shape do `dashboardLider` → `diagnosticoDimensional()` de `lib/carimbos.js` funciona sem adaptação.
4. Deploy casado GAS + Vercel.

## 7. Fases

**Fase A — frontend-only, /lider (sem GAS):** ✅ em prod (PR #78, merged 07/08).
1. Visão Geral: KPIs reordenados (Operação primeiro, alertas como ponteiro) + fila Operação + remoção do Perfil por mentor.
2. Aba Mentores: fila clínica no topo + cards sem métrica Pendências.
3. Aba Mentorados: coluna Motivo no chip.
4. `motivosAcao()` em lib/carimbos.js.

**Fase B — /mentor (GAS + Vercel):** ✅ em prod (PR #79, commit e4f7681).
5. ✅ `dashboardMentor` no GAS (`handleDashboardMentor` em gas/Code.gs) + allowlist no proxy (`ACOES_AUTENTICADAS` em app/api/mentor/route.js).
6. ✅ Faixa "🚨 Alerta" na home do /mentor (`useAlertaMentor` + `FaixaAlerta` em app/mentor/page.js) — degrada silenciosamente (some) se o GAS ainda não tiver a ação, então o deploy não precisa ser rigorosamente casado; ordem segura: GAS primeiro, Vercel depois.

**Bônus entregue (não previsto aqui):** chip "🏁 Fechamento de ciclo no próximo encontro" por aluno na lista do /mentor (app/mentor/page.js), alimentado pelo mesmo payload do `dashboardMentor` (`metricas.marcoPendente`) — entrou depois, via PR #104, no contexto de Gamificação + Marcos (docs/GAMIFICACAO_MARCOS.md).

## 8. Decisões fechadas (Filippe, 07/08/2026)

1. **Encontro 60d e sem diagnóstico** ficam na Operação da Visão Geral (sem diagnóstico é etapa prévia ao mentor; encontro 60d é agenda do líder).
2. **Motivo do alerta clínico visível ao mentor** no /mentor, na faixa **"Alerta"**.
3. **Coluna Motivo** só quando o chip "Precisam de ação" está ativo.
4. **Rafael**: mesma página, sem diferenciação.
5. **Alunos em risco moram dentro do card do mentor** (aba Mentores), não num card próprio.
6. **Check-in zerado (0%) = "sem check-in", não sofrimento**: o app grava 0 quando o aluno pula o check-in. Semana zerada sai da conta de estresse/motivação baixa e o alerta ganha linguagem própria ("sem check-in em N das últimas 4 semanas") — continua alertando, mas pelo motivo certo (`sinalCheckin` em lib/carimbos.js).
