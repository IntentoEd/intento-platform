# Redesign do `/lider` — plano (Fase 1)

> **HISTÓRICO (status em 2026-09-02)** — Fase 1 concluída e **em produção** (PRs #63–#75).
> Este doc foi **superado por [REDESIGN_LIDER_CLINICO_E_MENTOR.md](REDESIGN_LIDER_CLINICO_E_MENTOR.md)**,
> que reorganizou o que foi construído: a implementação final difere do §6 — a UI real usa
> **sub-abas** (visao | mentores | mentorados) e cards de mentor ordenáveis, não o scroll
> único com tabela desenhado aqui. Itens da Fase 2 também já entregues: **dimensão Simulado
> como 4º sinal** do eixo Aluno (lib/carimbos.js) e **Perfil da base por dimensão**
> (app/lider/page.js). O doc segue valendo como registro conceitual do motor de
> carimbos/sinais (dois eixos, réguas, limiares).
>
> Documento de planejamento (escrito antes do código; hoje há código implementando e
> divergindo dele — ver acima). Base pra análise externa e pra implementação da Fase 1.
> Plataforma Intento (Next.js App Router + Google Apps Script/Sheets como backend). Escala-alvo: ~150 alunos / ~8 mentores.

## 1. Objetivo

Reestruturar o `/lider` (painel do líder de mentores) pra dar uma **visão macro** da empresa, dos mentores e dos mentorados, com olhar de UX/UI **e** de análise de dados. O líder precisa saber: as mentorias estão acontecendo? a qualidade está boa? os mentorados estão evoluindo? como estão os check-ins? — e poder filtrar por mentor, plano, tipo etc.

**Pergunta-herói** (o que o líder quer responder ao abrir a página): **"As mentorias estão bem encaminhadas?"**

**Definição de qualidade** (do próprio líder): não é um critério único, é o **composto** de — evolução dos alunos + processos realizados (encontros + acompanhamento semanal) + check-in do aluno bom. Operacionalizado como **dois eixos** (Processo + Aluno), não como um status de pior-sinal único — ver §2.

## 2. Princípio central: dois status por mentoria (Processo + Aluno) + rollup

Cada mentoria carrega **dois status independentes**, porque o líder precisa separar *o que o mentor faz* (**Processo** — que ele **cobra**) de *como o aluno está* (**Aluno** — que ele **vigia**). Um selo único pro topo é **derivado** dos dois por rollup pior-eixo.

**Por que dois eixos (e não um status de pior-sinal único):** fundir tudo num selo só conflacionava coisas que pedem intervenções diferentes — *o que o mentor faz* (processo, que o líder cobra) e *como o aluno está* (estado, que o líder vigia). Um aluno evoluindo bem mas com acompanhamento atrasado virava "🔴 crítico" idêntico a um aluno em crise real — telefonemas diferentes, mesmo alarme. Separar os eixos (a) resolve a conflação, (b) é justo com o mentor, que é medido só pelo que controla, e (c) elimina o "falso verde": um status verde que só atesta papelada em dia, não evolução do aluno.

### Eixo Processo — o que o mentor faz (o líder cobra)

Dois sinais **separados** — têm cadências diferentes e quebram em horizontes diferentes (acompanhamento pendente é alarme de dias; encontro atrasado é alarme de semana/mês). **Não fundir num critério só** — são duas colunas.

**Encontros** — régua pelo **intervalo-alvo do plano**, não por fim-de-mês. Intervalo-alvo = período ÷ encontros esperados no período (plano de 1/mês → ~30 dias; 2/mês → ~15 dias). O número que importa é **dias desde o último encontro** (`hoje − ultimoEncontro`).

| | régua |
|---|---|
| 🟢 | dentro do intervalo-alvo |
| 🟡 | entre 1× e 1,5× o intervalo-alvo |
| 🔴 | acima de 1,5× o intervalo-alvo |

Usa `ultimoEncontro` + `encontrosEsperados` (já entregues pela `dashboardLider`). `encontrosEsperados` **já trata entrada parcial** — aluno que entrou no meio do mês não dispara falso 🔴 na primeira semana. *(Substitui a régua antiga de "faltam poucos dias pro fim do mês e realizados < esperados", que assumia cadência mensal fixa — errado, depende do plano — e zerava o contador na virada do mês.)*

**Acompanhamento** — sinal = `ULTIMA_EXPORTACAO` do `Cache_Alunos` (exportação do .png; reseta sozinho por comparação de data a cada semana). Ritual **semanal e religioso**, separado do Encontro (mensal por plano — ver glossário do CONTEXTO_INTENTO.md §14).

| | régua |
|---|---|
| 🟢 | enviado na semana corrente |
| 🔴 | pendente há 2+ semanas |

### Eixo Aluno — como o aluno está (o líder vigia)

**Check-in** — dispara por **tendência, não pelo último valor**:
- 🔴 se estresse **ou** motivação ≤ 40 em **2 das últimas N semanas**, ou em **queda relativa acentuada** (vinha alto, despencou).
- Construível na **Fase 1**: os valores **diários** do aluno estão guardados por trás do histórico semanal — não dependemos só da média 4w.
- **Escala do check-in:** maior = melhor para todos, inclusive estresse (valor alto = pouco estressado). Logo **≤ 40 é ruim**.

*(Substitui o gatilho de "último registro", que tinha três falhas: dia ruim isolado virava 🔴 — falso alarme; aluno que sempre marca baixo virava 🔴 eterno — ruído permanente que mata a fila; aluno em crise que marca alto pra esconder ficava 🟢 — falso negativo, justo quem mais importa.)*

> **Evolução** de domínio/progresso é o **4º sinal** do eixo Aluno, mas entra só na **Fase 2** (hoje só guardamos a média das últimas 4 semanas, não a tendência).

### Rollup pro herói do topo — pior-eixo (pessimista)

O herói do topo mostra **um selo só** por mentoria, combinando os dois eixos:
- 🔴 em **qualquer** eixo → 🔴
- 🟡 em **qualquer** eixo → 🟡
- 🟢 nos dois → 🟢

A granularidade dos dois eixos fica **na tabela de mentores e na fila de atenção** — o rollup existe só pro escaneável do topo. Escolha deliberada: o topo erra pro lado de "olha isso", nunca pro falso conforto.

### Limiares confirmados
- **Encontro atrasado:** dias-desde-último-encontro > **1,5× o intervalo-alvo do plano** (período ÷ encontros esperados).
- **Acompanhamento crítico:** pendente há 2+ semanas (`ULTIMA_EXPORTACAO`).
- **Check-in crítico:** estresse **ou** motivação ≤ 40 em 2 das últimas N semanas, **ou** queda relativa acentuada — por tendência.
- **Non-adopters de app** ficam fora do status e da fila (balde separado — ver §7).
- **Período padrão dos filtros/métricas:** últimas 4 semanas.

## 3. Inventário de dados disponíveis (o que o backend já entrega)

Ação GAS `dashboardLider` (`gas/Code.gs` → `handleDashboardLider` + `agregarMetricasBase_`). O front **re-agrega no cliente** quando há filtro (cada aluno carrega suas métricas brutas), sem round-trip ao backend.

**Por aluno:** `mentor`, `mentorNome`, `mentorAtivo`, `plano`, `tipoAluno` (ENEM/EM), `escola`, `statusApp` (Usa / Não se adaptou / Nunca vai usar), `registrouSemanaAtual` (bool), `ultimoEncontro` (data), `encontrosMesCorrente`, `encontrosEsperados` (do plano + matrícula), e `metricas`:
- `faixaHoras` (0-5/5-10/10-15/15-20/20+),
- `bem` = check-in do último registro (estresse, ansiedade, motivação, sono),
- `materias` = domínio e progresso por matéria (BIO/QUI/FIS/MAT), média das **últimas 4 semanas**,
- `historico` = horas e meta por semana (últimas 12),
- `simulados4w` = nº de simulados concluídos nas últimas 4 semanas.

**Agregado da base (e recalculável por filtro):** distribuição de horas por faixa, histórico 8 semanas (média horas × meta), domínio médio por matéria, progresso médio por matéria, bem-estar médio, total de simulados 4 semanas.

**Operacional:** `pendencias` (alunos "Aguardando Diagnóstico" — designar mentor / cobrar diagnóstico), lista de `mentoresAtivos`. Aluno inativo (`DT_SAIDA` preenchida) é ignorado.

**NÃO disponível hoje (precisa de agregação GAS — Fase 2):** autoavaliação dos encontros (estrelas, está nos diários), % de metas batidas (está nos diários via `statusMetasAnteriores`), tendência temporal de domínio/progresso, nota/acertos de simulado agregada, churn histórico (`DT_SAIDA` existe mas não é métrica).

## 4. Estado atual — pontos fortes e fracos

### Fortes
- Fundação de dados sólida + re-agregação no cliente ao filtrar.
- "Encontros do mês corrente" (realizados/esperados, ordenado pelos mais atrasados) — já responde "está acontecendo?".
- Filas de ação: pendências de diagnóstico / aguardando designação.
- Gráficos: distribuição de horas, domínio, progresso, bem-estar, histórico horas×meta; cobertura do app.
- Filtros mentor/tipo/busca com recálculo ao vivo; acordeões pra densidade.

### Fracos → melhoria
| Fraqueza | Melhoria |
|---|---|
| Sem comparação entre mentores (só lista com bolinha) | **Tabela comparativa de mentores** (peça central; ferramenta de coaching) |
| Sem tendência de evolução (só média atual) | Série temporal de domínio/progresso (Fase 2) |
| Sem fila de risco (há `filtroDesempenho` morto) | **Fila de atenção** automática |
| Faltam filtros plano e período | Adicionar **plano** + **período**; remover dead code |
| Qualidade sub-medida (autoaval/metas batidas não agregados) | Agregar no GAS (Fase 2) |
| KPIs de topo magros (só mentores ativos + simulados) | Faixa de **KPIs-herói** |
| Check-in só como média (esconde a cauda) | **Distribuição + contagem de alertas** |
| Tudo em acordeão fechado | Topo (herói + fila) sempre visível |
| Churn invisível (`DT_SAIDA` não usado) | Card de saídas no mês (Fase 2) |

## 5. Framework: o que um líder de mentores precisa saber

Separar **indicadores de processo (leading)** — o que o líder *gerencia* — de **resultado (lagging)** — se o processo *funciona*. Cobra-se processo, vigia-se resultado.

- **Camada 1 — A empresa está saudável? (topo, macro):** mentorados ativos · mentores · alunos/mentor · % acompanhamento da semana · % encontros em dia · nº em alerta · saídas no mês · distribuição por plano/tipo.
- **Camada 2 — Acontecendo e com qualidade? (processo, por mentor):** encontros realizados vs esperados, dias desde o último encontro, acompanhamento enviado, uso do app; (Fase 2) autoavaliação média, % metas batidas. → tabela de mentores.
- **Camada 3 — Evoluindo e bem? (resultado):** tendência de domínio/progresso (Fase 2), simulados, distribuição de desempenho; check-in com distribuição + alertas.
- **Transversal:** filtros globais (mentor, plano, tipo, período) recortam tudo; fila de atenção puxa o que está fora do trilho.

## 6. Estrutura de telas (layout)

```
┌ Painel do Líder ──────── [mentor▾] [plano▾] [tipo▾] [período▾] ──────────┐
│                                                                            │
│  AS MENTORIAS ESTÃO BEM ENCAMINHADAS?            (rollup pior-eixo)          │
│  🟢 41 encaminhadas   🟡 8 atenção   🔴 3 críticas        (de 52)           │
│  drill →  Processo: 🟢44 🟡5 🔴3   ·   Aluno: 🟢47 🟡3 🔴2                  │
│  Acomp. 82% · 8 mentores · 6,5 alunos/mentor · Fora do app: 4               │
├────────────────────────────────────────────────────────────────────────────┤
│  ⚠ FILA DE ATENÇÃO (11)  — ordenada por gravidade                           │
│   🔴 João · Bruno · 18d sem encontro · motivação 20%         [perfil]       │
│   🟡 Lia · Ana · horas 40% da meta · acomp. pendente         [perfil]       │
├────────────────────────────────────────────────────────────────────────────┤
│  MENTORES (8) — ordenável, clique filtra tudo no mentor                      │
│   Mentor  Alunos  rollup   Acomp%  Encontros  Domínio  Horas/meta  Check-in  │
│                  🟢/🟡/🔴          (intervalo)         (só app)             │
│   Ana       6     5/1/0     100%      83%        64%      92%        bom     │
│   Bruno     7     3/2/2      57%      40%        58%      61%        atenção │
├────────────────────────────────────────────────────────────────────────────┤
│  EVOLUÇÃO DA BASE        BEM-ESTAR (distribuição + nº em alerta)             │
│   horas×meta (8 sem)      estresse · ansiedade · motivação · sono           │
│   domínio/progresso atual por matéria                                        │
└────────────────────────────────────────────────────────────────────────────┘
```

**Hierarquia (macro → detalhe):**
1. **Herói** — **rollup pior-eixo** (encaminhadas/atenção/críticas) + **drill nos dois eixos** (Processo / Aluno) logo abaixo + números de operação. Sempre visível. O topo erra pro lado de "olha isso", nunca pro falso conforto.
2. **Fila de atenção** — quem está fora do trilho, com motivo + link pro perfil. Tira o garimpo.
3. **Tabela de mentores (8 linhas)** — comparar quem está em dia e cujos alunos vão melhor. Ordenável; clicar filtra tudo no mentor.
4. **Evolução + bem-estar** — leitura de resultado da base (distribuição, não só média).

Interações: clicar num mentor → filtra tudo nele; clicar num aluno (fila/tabela) → abre o perfil (`/mentor/[id]`).

## 7. Escopo

### Fase 1 — frontend-only (dado já existe), modelo de dois eixos
- **Herói** com **rollup pior-eixo** + drill nos dois eixos (Processo / Aluno) logo abaixo.
- **Eixo Processo:** encontros (régua intervalo-de-plano × 1,5) + acompanhamento (`ULTIMA_EXPORTACAO`) — **duas colunas separadas** na tabela de mentores, nunca fundidas.
- **Eixo Aluno:** check-in por tendência.
- **Fila de atenção** automática, ordenada por gravidade, com **motivo explícito** (qual eixo, qual sinal) + link pro perfil (`/mentor/[id]`). A fila diz *por quê* e *de quem é o próximo passo* (cobrar mentor vs. olhar aluno).
- **Balde separado de non-adopters de app:** `statusApp` "Não se adaptou" / "Nunca vai usar" saem do status **e** da fila — card próprio "Fora do app (N)". O sinal de engajamento (horas vs. meta) **só se aplica a quem usa o app** — elimina o falso 🔴 permanente de quem não loga.
- Filtros **plano** + **período** (faltam hoje); remover `filtroDesempenho` morto.
- Bem-estar com distribuição + contagem de alertas.
- Manter pendências de diagnóstico/designação e cobertura do app.

### Fase 2 — precisa de agregação no GAS
- **Evolução de domínio/progresso** vira o **4º sinal** (entra no eixo Aluno) — hoje só guardamos a média das últimas 4 semanas, não a tendência.
- **Autoavaliação média (★)** e **% de metas batidas** por mentor (ambos vivem nos diários).
- Nota/acertos de simulado agregada; churn histórico (`DT_SAIDA`).
- **Restrição técnica:** Fase 2 exige **cron pré-computado** escrevendo um `Cache_Lider`, **não** agregação ao vivo na `dashboardLider` síncrona. Ler os diários de ~150 alunos numa única chamada síncrona encosta no **teto de 6 min de execução do GAS** e trava o load. A estrutura de dois eixos da Fase 1 já comporta o 4º sinal — colunas novas na mesma tabela + um sinal a mais no eixo Aluno.

## 8. Decisões confirmadas
1. **Pergunta-herói:** "As mentorias estão bem encaminhadas?" (mantido).
2. **Qualidade = dois eixos separados** (Processo do mentor + Estado do aluno), com **rollup pior-eixo** pro topo. Não é mais um composto de pior-sinal único.
3. **Encontro atrasado** = dias-desde-último-encontro > **1,5× o intervalo-alvo do plano** (período ÷ encontros esperados). Substitui a régua de "fim do mês".
4. **Acompanhamento crítico** = pendente há 2+ semanas, via `ULTIMA_EXPORTACAO`.
5. **Check-in crítico** = estresse ou motivação ≤ 40 em 2 das últimas N semanas, **ou** queda relativa acentuada — por **tendência, não último valor**. Limiar ≤ 40 mantido.
6. **Non-adopters de app** ficam fora do status e da fila, em balde separado.
7. **Período padrão** dos filtros/métricas: últimas 4 semanas (mantido).
8. **8 mentores** → tabela comparativa é peça central (mantido).
9. **Faseamento:** fazer Fase 1 já pensando na Fase 2 (mantido).
