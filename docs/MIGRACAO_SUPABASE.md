# Migração Supabase — Plano e Backlog de Escopo

**Data alvo**: dezembro/2026 (após o ENEM em novembro, quando o volume de uso é mínimo).
**Criado**: 2026-08-31.
**Referências**: `docs/REDESIGN_PLATAFORMA_DUAL_PRODUTO.md` §1.2 (âncora da data) e `docs/CONTEXTO_INTENTO.md` (Sheets como DB transitório).

Este doc é a casa das decisões que ficam **acopladas à migração** — mudanças que seriam caras/arriscadas no layout atual de Sheets, mas ficam baratas (ou de graça) no modelo Postgres. Ao planejar a migração, cada item daqui entra no desenho do schema desde o dia 1.

---

## 1. Princípios

- Sheets+GAS segue até dezembro/2026. Schema em Sheets continua sendo desenhado portável pra Postgres (snake_case, FKs por email/id).
- **Não** fazer migrações estruturais de layout nas planilhas de aluno entre agora e dezembro se a mesma mudança fica trivial no Postgres — evita migração dupla (Sheets agora + Postgres depois).
- Cada item do backlog registra: o que foi decidido, por que foi adiado pra cá, e o que da análise original sobrevive.

---

## 2. Backlog de escopo

### 2.1 Semana Padrão em granularidade de 30 minutos

**Decisão de produto** (fechada em 08/08/2026, Filippe): a grade da Semana Padrão passa de slots de 1h pra slots de 30 min, com janela estendida **06:00–23:00** (34 slots). Adiada deliberadamente pra migração: no Sheets exigiria reescrever a aba `BD_Semana` de cada planilha de aluno (grade 16×7 → 34×7, meta manual saindo da linha 19) + deploy casado GAS+Vercel com janela de inconsistência. No Postgres, granularidade não é conceito estrutural — sai de graça no desenho do schema.

**Decisões confirmadas que valem na implementação:**

1. **Janela horária**: 06:00–23:00.
2. **Conversão do dado atual**: cada atividade de 1h vira o equivalente a 2 slots de 30 min (preserva o total de horas planejadas e a meta derivada).
3. **Painel do aluno**: slots consecutivos da mesma atividade são mesclados num evento único com faixa (ex.: `"09:00 - 10:30"`) — menos checkboxes, blocos visuais maiores.

**Schema proposto** (granularidade livre; 30 min vira só convenção de UI):

```
semana_padrao_evento
  id, aluno_id, dia_semana, hora_inicio, hora_fim, categoria, descricao
```

- **Meta de horas derivada**: soma de `(hora_fim − hora_inicio)` dos eventos de categoria Codificação/Revisão/Simulado. Substitui a regra "1 slot = 1h" do cron (`_calcularMetaEDiasDaSemanaPadrao` em `gas/integracaoApp.gs`).
- **Meta manual do mentor** continua existindo e tendo prioridade sobre a derivada (hoje: linha 19, col B de `BD_Semana`) — vira coluna própria do aluno, fora da grade.
- **Dias planejados** (usado no critério de semana mensurável): dias distintos com ≥1 evento dessas categorias — semântica inalterada.

**ETL do layout atual** (fonte: aba `BD_Semana` de cada planilha de aluno):

- Grade em B2:H17 — 16 slots de 1h (07:00–22:00) × 7 colunas (Seg→Dom), célula no formato `[Categoria] - descrição`.
- Meta manual em B19 (rótulo `meta_horas_semanal` em A19).
- Cada célula preenchida vira evento de 1h; mesclar células consecutivas idênticas no mesmo dia num evento único.

**Superfície de código que muda junto** (mapeada em 08/08/2026; conferir drift na hora):

- `gas/Code.gs`: `handleSalvarSemanaLote` (escrita da grade + meta), `handleBuscarDadosAluno` (leitura pro dossiê), `obterDadosDoPainel` (monta `{hora, atividade}` pro painel) — substituídos pelos equivalentes Supabase.
- `gas/integracaoApp.gs`: `_calcularMetaEDiasDaSemanaPadrao` (cron do app).
- `app/mentor/[id]/page.js`: constante `HORARIOS`, grade editável, templates (`TEMPLATE_BASE`, `TEMPLATE_EM_ESCOLAR` — viram blocos de 2 slots), `resumoHoras` (0,5h/slot), dados demo.
- `app/mentor/[id]/encontro/page.js`: mesma constante `HORARIOS` (heatmap + modal do Modo Encontro), dados demo.
- `app/painel/page.js`: `parseHora` já aceita faixa `"HH:MM - HH:MM"` — com a mesclagem no backend, mudança mínima aqui.

**Nota de UI**: com 34 linhas, a grade do mentor precisa compactar a altura das linhas e rotular hora só nas horas cheias, senão vira um paredão.

**Efeito colateral conhecido**: os checkboxes da rotina no painel do aluno são indexados por posição do evento — o estado marcado da semana corrente embaralha uma vez na virada (aceitável, one-time).

---

*Próximos itens de escopo acoplados à migração entram como §2.2, §2.3, …*
