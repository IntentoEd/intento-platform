# Gamificação + Marcos de Ciclo — Plano de Implementação

**Data**: 2026-08-18 · **Dono**: Filippe · **Status**: decisões fechadas, implementação em andamento (branch `filippe/gamificacao-marcos`)
**Incorpora a Fase 2 de Fases e Ciclos** (dimensão Simulado + freeze do Perfil no Marco de Ciclo). A conversa/sessão anterior da Fase 2 não deve implementar nada — o trabalho mudou pra cá.

---

## 1. Visão

Três peças que se completam:

1. **Linha do Ano** (`/mentor/[id]` e depois `/painel`) — timeline C1 Fundação → C4 Refinamento ancorada no ENEM, com marcador de "hoje" e nós de **marco** em cada fronteira de trimestre: carimbado (fechamento feito → retrato do ciclo), pendente (chamada de ação) ou futuro.
2. **Reunião de Fechamento de Ciclo** (Modo Encontro) — **não é opção**: aparece automaticamente no 1º Diário de Bordo após a fronteira do ciclo (01/01, 01/04, 01/07, 01/10) sem marco gravado. Retrospectiva auto-computada + reflexão do aluno + confirmação dos carimbos (freeze) + nível-alvo de simulado.
3. **Selos** (`/painel` do aluno) — 12 conquistas derivadas por replay do histórico, reveladas semanalmente no ritmo do cron de domingo.

## 2. Decisões fechadas (18/08/2026)

| # | Decisão |
|---|---|
| 1 | Marco persistido em aba nova **`BD_Marcos`** na planilha do aluno; valores **congelados** (nunca fórmulas/recomputação). |
| 2 | Fechamento **automático** no Modo Encontro (banner + passos extras injetados); adiável — a pendência persiste server-side (ausência da linha) e o banner volta no próximo encontro. |
| 3 | **C1/C2 de 2026 backfilled** (marcos `origem='retroativo'` por replay do histórico). Primeiro fechamento ao vivo: C3, ~01/10/2026. |
| 4 | Coluna **`QUESTOES`** no `BD_Registro` (col 24) — soma do raw `app.atividade` da semana; **nunca** delta de snapshots (semântica per-sessão substitui por tópico; delta pode ser negativo). Backfill one-shot com dry-run. |
| 5 | Escopo: **mentoria/ENEM com app**. EM/AE e non-adopters fora desta rodada. |
| 6 | `/painel`: tudo codado, **gated por flag + allowlist de e-mail** (Filippe vê em prod antes do Encontro Bússola ~24/08; chave geral no fim de agosto). |
| 7 | Catálogo de 12 selos **aprovado** (§4). Palavra externa = **"Selo"**; metáfora de selo postal estampado. |
| 8 | **Carimbos Aprendiz/Veterano/Mestre viram EXTERNOS** (visíveis ao aluno) — supersede a marcação "uso interno" em `components/Carimbos.js`. Perfil (elo mais fraco) apresentado como "onde aplicar força", nunca como nota. |
| 9 | **Nível-alvo padrão de simulado = 85%** (ajustável por aluno no fechamento). |
| 10 | Reflexão do aluno no fechamento: **maior vitória do ciclo · maior aprendizado · o que muda no próximo**. |

## 3. Arquitetura

### 3.1 BD_Marcos (aba nova, por aluno; criada on-demand)

```
ANO | CICLO (C1..C4) | DATA_FECHAMENTO | COMPORTAMENTO | COBERTURA | DOMINIO | SIMULADO |
PERFIL | NIVEL_ALVO (int, default 85) | REFLEXAO_VITORIA | REFLEXAO_APRENDIZADO | REFLEXAO_MUDANCA |
DESTAQUES_JSON | ORIGEM ('fechamento'|'retroativo')
```

`DESTAQUES_JSON` = retrospectiva computada no fechamento (horas do ciclo, cobertura início→fim, domínio início→fim, simulados no ciclo, metas batidas, questões se disponível) — congelada como valores.

### 3.2 Trigger do fechamento

- Helper puro `marcoCicloPendente({ marcos, diarios, hoje })` em `lib/carimbos.js` (fonte única): ciclo fechado = trimestre anterior; pendente sse (a) `Array.isArray(marcos)` — gate de deploy: front dormante até o GAS novo subir; (b) sem linha (ano, ciclo) em BD_Marcos; (c) ≥1 diário datado dentro do trimestre fechado (guarda de recém-matriculado). Retorna só o pendente **mais recente**.
- Gravação: **estender `salvarNovoEncontro`** com `dados.marco` opcional (atômico no mesmo LockService; já está em `ACOES_AUTENTICADAS`; invalidação de cache existente cobre). Upsert idempotente por (ano, ciclo).
- O modal legado de Novo Diário no dossiê é código morto — Modo Encontro é o único ponto de entrada de diários novos.
- **Ordem de deploy: GAS primeiro** (`clasp push && clasp deploy -i <id>`), Vercel depois. O gate (a) mantém o front inerte no intervalo.

### 3.3 Engine de selos

- `lib/selos.js` — catálogo declarativo + replay determinístico sobre `BD_Registro`/`BD_Diario`/`BD_Sim_ENEM`/`BD_Caderno`. Desbloqueio = primeira semana fechada em que o predicado vira verdadeiro. **Sem storage de unlocks**; estado visto/não-visto em localStorage.
- Semana não-mensurável/sem linha é **neutra** (pausa, não quebra) — mesma `janelaMensuravel()` do motor de carimbos; uma única semântica de semana no sistema.
- Monotonicidade: tier estampado é permanente; histerese na entrada (estoques: +3 p.p. ou 2 linhas ≥ limiar; frações de meta: pisos absolutos e cap 105%). Carry-forward **nunca** desbloqueia (só célula preenchida na linha); cobertura só em `ORIGEM='revisado'`.
- Nunca notificar perda de sequência; Volta por Cima nunca aparece como "próxima". Máx. 2 "próximas estampas" no painel, seletor prioriza constância.

## 4. Catálogo aprovado (12 selos)

| Selo | Categoria | Tiers (resumo) | Dado |
|---|---|---|---|
| Diário de Bordo | constância | 1 → 4 → 12 → 30 semanas com estudo (cumulativo) | BD_Registro |
| Presença | constância | dias estudados ≥ planejados−1: 1 sem → 3/4 → 8 → 20 | DIAS_ESTUDO/PLANEJADOS |
| Cadência | constância | consecutivas (dias≥3 e horas≥2): 2 → 4 → 6 → 10; fôlegos (1/3 semanas, máx 2) | BD_Registro |
| Meta Batida | execução | ≥50% (META≥6h) → ≥70% → ≥85% → 70% em 3 de 4; suspende se overstudying | HORAS/META |
| Volta por Cima | resiliência | retomada pós-semana zerada: 1 → com força (≥50%) → 3/ano (teto) | BD_Registro |
| Terreno Ganho | progresso | cobertura validada (ORIGEM=revisado): 25 → 50 → 75 → 90% | PROGRESSO_TOTAL |
| Base Sólida | domínio | 4 linhas ≥70% → ≥75% com cobertura andando → 4 matérias ≥80% nenhuma <70% | DOM_* |
| Ensaio Geral | simulado | 1º concluído → 2 meses distintos → 3 meses consecutivos → 5 meses/ano | BD_Sim_ENEM |
| Caderno Vivo | revisão | 10 cards c/ revisão → domingo zerado → 5 cards estágio final → 4 domingos ≤3 | BD_Caderno + REVISOES |
| Combinado é Combinado | compromisso | metas de encontro batidas: 1 → 2 → 4 consecutivos (absorção de 1 Parcial) | BD_Diario (mentor preenche) |
| Quilometragem | volume | questões acumuladas ~100 → 500 → 1500 → 3000 (**provisório até backfill**) | QUESTOES (nova) |
| Marco de Ciclo | ritual | 1º marco → 2 consecutivos → 4 no ano (premia o ritual, nunca o conteúdo) | BD_Marcos (nova) |

**Descartados por princípio**: qualquer selo de check-in emocional (corrompe sinal clínico); critérios baseados em nota ou em "subir de carimbo" (diagnóstico não vira nota); XP/níveis de pessoa (START/CORE/ELITE do protótipo `ProfileTab.jsx`).

**Visual**: selo circular SVG inline navy, anel serrilhado, numeral do tier e data; nova-da-semana = anel `intento-yellow` temporário + pill; próxima = contorno tracejado slate com frase-critério. Sem dourado, sem XP, sem cadeado.

## 5. Roadmap de PRs

| PR | Escopo | Depende de |
|---|---|---|
| **A** | GAS: BD_Marcos (leitura em `buscarDadosAluno` + `dados.marco` em `salvarNovoEncontro`) · `marcoCicloPendente` em lib · Fechamento no Modo Encontro (banner + 2 passos: Retrospectiva/reflexões e Carimbo do Marco/nível-alvo) · chip pendente no dossiê · Linha do Ano no `CardCarimbosAluno` | — |
| **B** | Coluna QUESTOES: CTE `semana_questoes` (fuso America/Sao_Paulo igual no cron e backfill), COL_REG 24, cron, `_garantirColunaOrigem`, `backfillColunaQuestoes(dryRun)` · extrai distribuição p/ calibrar Quilometragem · **avisar Rafa** (constantes compartilhadas) | — |
| **C** | Backfill retroativo C1/C2 2026 (`origem='retroativo'`, dry-run, replay do histórico) | A |
| **D** | `lib/selos.js` + `/painel`: Linha do Ano do aluno, carimbos externos ("onde aplicar força"), seção Selos, gate flag+allowlist, estender `obterDadosDoPainel` (slice 21 → incluir QUESTOES) · baseline RESULTADO_1..5 p/ Combinado é Combinado | A, B |
| **E** | Fase 2 restante: carimbo Simulado no `diagnosticoDimensional` (proposta: ativa com simulado no ciclo; Mestre = ritmo mensal + áreas ≥ nível-alvo — **validar com Filippe**) · scores de simulado no `/lider` · marcos pendentes por mentor no `/lider` | A |
| **F** | Polish: Retrato do Ciclo em PNG (html2canvas) · selo da semana no .png do acompanhamento | A–D |

**Timeline alvo**: A + D gated antes do Encontro Bússola (~24/08); B + C na mesma semana; chave geral do `/painel` no fim de agosto; E antes de 01/10 (1º fechamento ao vivo do C3).

## 6. Gates de calibração (não congelar antes)

1. Limiar de **Quilometragem** ← distribuição do backfill de QUESTOES (T1 ≈ P40 de 4 semanas; topo ≈ P90 anual).
2. Critério T1 de **Combinado é Combinado** ← baseline dos `RESULTADO_1..5` do S1 (se <30% dos encontros batem, relaxar).
3. Regra geral: 1º degrau ≈ o que 40–50% da base consegue em 2 semanas (validar contra o relatório semestral).

## 7. Riscos operacionais

- `COL_REG`/`ABA` são área compartilhada (Rafa) — PR com review e aviso.
- Backfills escrevem em N planilhas: sempre dry-run + gate de header posicional (padrão `escolar.gs`).
- Vazio ≠ 0 na coluna QUESTOES (vazio = não-mensurável, convenção de DIAS_ESTUDO).
- Rollout retroativo destrava selos em massa: comunicar como "reconhecimento do percurso", onda única, sem rajada de notificações.
- Mentor inflar "Realizado" corromperia o dado clínico: monitorar taxa no `/lider` pós-lançamento.
