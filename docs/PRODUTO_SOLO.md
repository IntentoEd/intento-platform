# Produto Solo — Plano e Design do Loop (F1)

**Criado**: 2026-09-04 (kickoff do F1).
**Status**: F1 iniciado; F0 (validação de campo) roda em paralelo.
**Referências**: `docs/REDESIGN_PLATAFORMA_DUAL_PRODUTO.md` (§7.1-7.2 — logs do App, schema-semente), `docs/MIGRACAO_SUPABASE.md` (PR #113, não mergeado — **superseded por este plano**, backlog absorvido no §4.7), `docs/CONTEXTO_INTENTO.md`.

---

## 1. O que é

Produto **self-serve** com os elementos do aluno da Plataforma + o log comportamental do Aplicativo, vendido **sem mentoria**. Funciona como **funil de entrada** pra mentoria.

| Dimensão | Decisão |
|---|---|
| Comprador v1 | Lead que não fechou a mentoria (por preço) |
| Oferta v1 | **R$197 à vista, acesso até o ENEM 2027** (season pass; sem mensalidade no v1) |
| Métrica-norte | **Conversão pra mentoria** — não MRR |
| Âncora de retenção | **Encontro Bússola quinzenal** (cohort-based; solo participa da mesma Bússola dos mentorados) |
| Visão futura | Verticais por troca de taxonomia (ex.: residência médica). Consequência prática hoje: **nunca hard-codar ENEM** |

O produto não precisa ser um SaaS completo e defensável: é a **demonstração jogável do método**. A Bússola vende; o produto prova.

## 2. Decisões estruturais (fechadas em 04/09/2026)

| Decisão | Detalhe | Por quê |
|---|---|---|
| **Paralelo, não migração** | Repo novo; Plataforma da mentoria fica intocada no stack atual até F2 | Não migrar sistema interno (risco alto, receita zero) antes de provar o produto vendável |
| **Backend Supabase (Postgres)** | Desde o dia 1 | Sheets/GAS é desqualificado pra self-serve: sem RLS, quota de criação de arquivo no signup, latência de segundos, erro HTML intermitente conhecido |
| **Firebase Auth mantido** | Supabase só como DB/API | A dor de login PWA no iOS (standalone/redirect/authDomain) já foi paga e resolvida no stack atual |
| **Fluxos redesenhados, visual importado** | Componentes React/Tailwind vêm do repo atual; fluxos não | Os fluxos atuais são *mentor-shaped* (registro é preenchido pelo mentor); o solo precisa de fluxo leve e auto-explicativo |
| **Taxonomia de tópicos como configuração** | Tabela compartilhada com coluna `vertical` (`enem`, futura `residencia`) | Única ponte de dados entre os produtos; semente da tese de verticais |
| **App Flutter aposentado por switch de UX** | Solo nasce logando na PWA; mentorados migram no F2. Log do App não tem API — histórico fica lá (dados acessíveis via BigQuery) | Nada a migrar; conversa com Gustavo é pré-requisito do **F2**, não do F1 |
| **Billing = Kiwify** | Checkout + webhook de compra; sem billing próprio | Não se constrói billing pra validar funil |
| **Escopo do produto novo** | Só telas do aluno. Mentor/líder não existem nele | A fronteira é "tudo que o aluno vê" |

**Dívida deliberada**: a partir do F1, melhorias no caderno/simulados têm duas casas (repo atual + novo). Aceita conscientemente — velocidade agora, unificação no F2. O risco de "F2 nunca acontecer" é mitigado pelo gatilho numérico do §3.

## 3. Fases e gates

### F0 — Validação de campo (setembro, **em paralelo ao F1**)

Venda 1-a-1 no stack atual: oferta por escrito (WhatsApp), ≥10 ofertas reais pra lista de leads "não fechou", checkout Kiwify manual, onboarding na mão. Exige um toque único no repo atual: `produto: 'solo'` liberando o `/painel` sem mentor (contorna o guard do PR #116).

**🚦 Gate G0**: ≥3 compras em 10 ofertas **E** ≥metade dos compradores ativa (logando) na semana 4.
Decisão de 04/09: F1 começou sem esperar o G0. Consequência: **se o G0 falhar em *retenção*, o F1 pausa e o loop (§4) é redesenhado antes de continuar o build.** Se falhar em *compra*, itera-se oferta/preço/lista sem parar o build.

Em paralelo (não bloqueia): upgrade **Vercel Pro** (produto vendido no plano Hobby viola ToS), Termos de Uso/Privacidade (comprador pode ser menor — responsável no checkout), conversa com Gustavo (alinhamento; executa no F2), **nome do produto**.

### F1 — Construção (out–dez/2026; lançamento jan/2027, temporada de matrícula)

Objetivo: **compra → ativação → primeira semana de uso sem nenhum toque manual.** Design no §4; sequência no §4.8.

**🚦 Gate G1 (fev/2027)**: fluxo 100% self-serve comprovado + 20-30 pagantes + retenção semana 4 ≥ F0. Passou → decidir entre dobrar em aquisição (tráfego) ou segurar como funil morno.

### F2 — Unificação (2027; por gatilho, não por data)

**Gatilho**: produto solo estável 2-3 meses com ~50+ ativos. Então: painéis mentor/líder passam a ler do Supabase, planilhas por aluno se aposentam, App Flutter é desligado formalmente. **F2 é o novo nome da migração Supabase** — a big-bang de dez/2026 deixa de existir como projeto separado (PR #113 recebe nota de supersessão; o item "Semana Padrão 30/30" dele já entra no schema do §4.7).

## 4. Design do loop solo

### 4.1 Princípios

1. **Valor na primeira sessão** — o diagnóstico devolve um plano na hora; o caderno de erros é útil no primeiro uso. Gráficos longitudinais são recompensa de quem persiste, não porta de entrada.
2. **O produto substitui o mentor por mecânica** — batidas fixas + push + streak + Bússola. Sem mentor no loop, a cadência é do produto.
3. **Logar tem que custar ≤2 min/dia** — defaults, últimos valores lembrados, edição fácil. O produto morre se logar for caro (espiral: sem log → dashboards vazios → churn).
4. **Empty states ensinam** — toda tela vazia mostra o que ela vira com dados + o CTA da ação que a alimenta.
5. **Funil explícito, nunca invasivo** — sem paywall interno nem nag; a Bússola é o palco de venda, o produto é a demo.

### 4.2 As batidas (cadência do aluno)

| Batida | Frequência | O aluno faz | O produto devolve |
|---|---|---|---|
| **Log de sessão** | Diária (~2 min) | Área → disciplina → tipo de atividade → minutos (3-4 taps) | Streak, soma de horas da semana em tempo real |
| **Fechamento semanal** | Domingo (~10 min) | Autoavaliação 1-5, check-in (estresse/ansiedade/motivação/sono — escala maior=melhor), plano de ação da semana (3-5 itens, com sugestões) | **Horas vs meta derivadas do log automaticamente** (diferencial vs mentoria: zero transcrição) + retrato da semana |
| **Encontro Bússola** | Quinzenal, ao vivo | Participa (com os mentorados) | Retrato da quinzena pra "levar" + replay. A Bússola abre com dados agregados da turma — razão social pra logar |
| **Simulado** | Por evento | Registra resultado por área + autópsia Kolb | Classificação de erros (Lacuna/Recordação/Interpretação/Atenção), comparativo com simulados anteriores |
| **Caderno de erros** | Por evento + revisões | Cadastra questão errada; revisa em D1/D7/D15/D30 | Fila de revisão do dia + push na hora certa |

### 4.3 Primeira sessão (ativação, ~15 min)

1. Compra na Kiwify → webhook cria conta → e-mail de boas-vindas com link de acesso.
2. Login (Firebase Auth).
3. Instalação da PWA **guiada mas não bloqueante** (iOS: passo-a-passo do share sheet; Android: prompt nativo). Quem pular vê banner persistente.
4. Mini-onboarding: **6-8 campos** (provas-alvo, ano/situação escolar, curso de interesse, horas disponíveis/semana, já fez ENEM? + notas). *Não* reusar o formulário de 57 colunas da mentoria.
5. Diagnóstico enxuto: autoavaliação de domínio por área com âncoras descritivas (§5, decisão 3: teste teórico auto-corrigido fica pra v1.1).
6. **Devolução imediata**: fase sugerida (Iniciante/Aprendiz/Veterano), semana padrão template dimensionada pelas horas disponíveis, 3 primeiras ações.
7. Primeira tarefa concreta: *"registre sua primeira sessão de estudo hoje"* → inaugura o streak.

### 4.4 Mapa de telas do v1

| Tela | Conteúdo |
|---|---|
| **Hoje** (home) | Streak, sessões de hoje, revisões do caderno pendentes, próxima Bússola, CTA "registrar sessão" |
| **Registrar sessão** | A tela mais importante do produto — 3-4 taps, defaults do último log |
| **Minha semana** | Horas vs meta (derivada), fechamento dominical, histórico das últimas semanas |
| **Semana padrão** | Grade em slots de 30 min, 06:00-23:00 (§4.7 — granularidade livre desde o dia 1) |
| **Simulados** | Lista, registro, autópsia Kolb |
| **Caderno de erros** | Fila de revisões do dia + acervo de cards |
| **Bússola** | Agenda, link do encontro, replays, retrato da quinzena |
| **Plano & Fase** | Fase atual, plano de ação vigente com check |
| **Perfil** | Push (horário do lembrete), conta, acesso |

**Fora do v1 (esta lista é contrato)**: painéis mentor/líder, relatórios longitudinais, export PNG, tela pra família, mensalidade, residência, qualquer sync com o sistema da mentoria.

### 4.5 Retenção

- **Streak + marcos** — importar o desenho da gamificação/selos do repo atual (já calibrado pro método).
- **Push** (infra web-push já dominada): lembrete diário no horário que o aluno escolher; revisões do caderno (D1/D7/D15/D30); domingo = fechamento semanal; véspera de Bússola; win-back D7 ("sumiu há 7 dias").
- **D14 sem log** = mensagem *pessoal* (WhatsApp, não push) — melhor momento de conversa de mentoria do funil.

### 4.6 Funil pra mentoria (design explícito)

Momentos contextuais de upsell: (a) pós-autópsia de simulado — "um mentor analisaria isso com você"; (b) retrato da quinzena; (c) D14 travado (mensagem pessoal); (d) Bússola ao vivo. Mais um CTA fixo discreto ("Conhecer a mentoria"). Nada de paywall interno ou nag screens.

### 4.7 Schema (esboço Postgres/Supabase)

```
aluno              (id, firebase_uid, email, nome, nascimento, provas_alvo[], curso_interesse,
                    horas_semanais_alvo, fase, status, origem, criado_em)
compra             (id, aluno_id, kiwify_ref, produto, valor_centavos, valido_ate, status)
log_sessao         (id, aluno_id, data, hora, area, disciplina, tipo_atividade, minutos,
                    observacao, origem)          -- semente: REDESIGN_DUAL §7.2
semana             (id, aluno_id, semana_inicio, autoavaliacao, checkin_estresse, checkin_ansiedade,
                    checkin_motivacao, checkin_sono, meta_horas, fechada_em)
plano_acao_item    (id, semana_id, texto, resultado)
semana_padrao_evento (id, aluno_id, dia_semana, hora_inicio, hora_fim, categoria, descricao)
                                                 -- 30/30 nativo: absorve o backlog do PR #113
simulado           (id, aluno_id, data, escopo, resultado_json, autopsia_json)
caderno_card       (id, aluno_id, disciplina, topico_id, origem_desc, tipo_erro, criado_em)
caderno_revisao    (id, card_id, etapa, prevista_para, feita_em, resultado)
taxonomia_topico   (id, vertical, area, disciplina, topico, subtopico, ordem)   -- vertical='enem'
push_subscription  (id, aluno_id, endpoint, p256dh, auth, criado_em)
```

**Acesso a dados**: toda query passa por route handlers do Next (server) com service key + sessão Firebase verificada — mesmo padrão de proxy do produto atual, que o time já domina. RLS entra como defesa em profundidade. (Se um dia quisermos client-side direto, Supabase aceita Firebase como third-party auth.)

### 4.8 Sequência de build (8-10 semanas, part-time)

| Semana | Entrega |
|---|---|
| S1 | Setup: repo, Supabase, Vercel, Firebase, esqueleto PWA — **bloqueado pelo nome do produto** |
| S2-3 | Auth + onboarding + diagnóstico + devolução do plano |
| S4-5 | Log de sessão + fechamento semanal + semana padrão |
| S6 | Caderno de erros + push de revisão |
| S7 | Simulados + autópsia |
| S8 | Webhook Kiwify + e-mails + fluxo de ativação PWA + streak/marcos |
| S9-10 | Polish + beta com compradores do F0 + lançamento |

## 5. Decisões em aberto

1. **Nome do produto** — bloqueia S1 (repo, checkout Kiwify, domínio/subdomínio).
2. **Firebase project**: compartilhar o existente (recomendado — conta única quando o solo converter pra mentoria) vs projeto novo.
3. **Diagnóstico**: só autoavaliação guiada (v1) vs incluir teste teórico auto-corrigido (v1.1?).
4. **Bússola em escala**: turma única com mentorados (F0 e início do F1) vs turma solo separada quando crescer.
5. Pendências do F0 que calibram o funil: **preço da mentoria** (valor de 1 conversão) e **tamanho da lista de leads**.

## 6. Custos e riscos

**Infra**: Supabase Pro (US$25) + Vercel Pro (US$20) + taxa Kiwify por venda ≈ **R$300-400/mês fixo** — irrelevante perto do custo real, que é tempo do Filippe na alta temporada (150 mentorados no início de 2027).

| Risco | Mitigação |
|---|---|
| Retenção solo (espiral do não-log) | Bússola como âncora + G0 mede retenção real em setembro; falhou → pausa e redesenha o loop |
| F2 nunca acontecer (dois produtos pra sempre) | Gatilho numérico explícito (§3) |
| Scope creep no F1 | Lista "fora do v1" do §4.4 é contrato |
