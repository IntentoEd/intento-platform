# Identidade Visual — Plataforma Intento

> Referência da linguagem visual aplicada na Plataforma (`intento-platform`). Reflete o que está em produção hoje no bloco `@theme` de [app/globals.css](../app/globals.css), em [app/layout.js](../app/layout.js) e nos componentes em [components/](../components/). Atualizado em 2026-09-02.

## 1. Princípios

- **Sóbrio, com poucos acentos de cor.** A interface é majoritariamente branco / `slate` neutro; o azul-marinho da marca aparece em CTAs, títulos e estados ativos. O amarelo é reservado pra destaque pontual.
- **Card-first.** Tudo é organizado em cards brancos com borda `slate-200` 1px, raio `xl` e sombra suave.
- **Tipografia única.** Ubuntu em todas as telas (sem pares de fonte). Hierarquia é por peso e cor, não por família.
- **Sem gradientes.** Nenhum `bg-gradient-*` em uso na base — preferência por cores chapadas.
- **Ícones inline.** SVGs com `stroke="currentColor"` e `viewBox="0 0 24 24"` (estilo Heroicons outline). Sem biblioteca de ícones.

## 2. Marca

### 2.1 Logos e símbolos

| Asset | Uso | Caminho |
|---|---|---|
| Símbolo branco | Sobre fundo azul-marinho (hero do login, header escuro) | [public/simbolo-branco.png](../public/simbolo-branco.png) |
| Símbolo azul | Sobre fundo claro (header mobile do login, splash) | [public/simbolo-azul.png](../public/simbolo-azul.png) |
| Logo completa | Quando precisar do wordmark | [public/logo.png](../public/logo.png) |
| Hero de fundo | Textura de grade de símbolos com fade — coluna esquerda do login | [public/hero-login.svg](../public/hero-login.svg) |
| Favicon / ícones PWA | 72 → 512 px, maskable em 192/512 | [public/icons/](../public/icons/) |

**Nome:** "Intento" em peso bold, `tracking-tight`. Quando vem ao lado do símbolo, gap de 12px (`gap-3`) e tamanho do símbolo entre 36–40px.

### 2.2 Cores da marca

Definidas em um único lugar: o bloco `@theme` em [app/globals.css:4-15](../app/globals.css#L4-L15) (o projeto usa Tailwind v4 — **não existe** `tailwind.config.js`; o `@theme` é a fonte única de tokens).

```css
--color-intento-blue:         #060242;   /* azul-marinho profundo — quase preto */
--color-intento-yellow:       #D4B726;   /* mostarda — destaque/marca */
--color-intento-azul:         #1307CF;   /* azul vivo — links/tabs ativos em painéis admin */
--color-intento-verde:        #2FA838;   /* verde da marca */
--color-intento-amarelo-vivo: #F5D83B;   /* amarelo vivo da marca */
```

`intento-azul` está em uso no `/lider` ([app/lider/page.js](../app/lider/page.js) — borda de tab ativa e links "abrir"/"ver alunos"). `intento-verde` e `intento-amarelo-vivo` estão definidos no `@theme` mas ainda sem uso na UI (reservados da paleta da marca).

Classes utilitárias resultantes:

| Token | Onde aparece |
|---|---|
| `bg-intento-blue` | Botões primários, hero do login, headers escuros, badges |
| `text-intento-blue` | Títulos `h1/h2`, links, ícones ativos, valores de KPI |
| `border-intento-blue` | Borda de cards/tabs em estado selecionado |
| `ring-intento-blue` | Focus ring em inputs (`focus:ring-2 focus:ring-intento-blue`) |
| `bg-intento-yellow` | Acentos pontuais — badges, barra de progresso parcial, highlight de palavra-chave no hero |
| `text-intento-yellow` | Palavras-chave em headlines sobre fundo azul (ex: "à aprovação."), ícones decorativos sobre azul |

**Tom de uso:** o azul é a cor que carrega ação e identidade. O amarelo tem dois papéis: tempero (uma palavra do headline, ícones decorativos sobre o azul, estado intermediário de progresso) e, desde o sweep de contraste (PR #111), **CTA sólido de alta ênfase** — `bg-intento-yellow` com texto `text-intento-blue` (ver §6.1).

### 2.3 Theme color do navegador / PWA

- `theme-color` (status bar mobile, splash): `#060242` — [app/layout.js:31](../app/layout.js#L31)
- `background_color` do manifest: `#f8fafc` (= `slate-50`) — [app/manifest.js:9](../app/manifest.js#L9)
- iOS splash status bar: `black-translucent`

## 3. Paleta neutra e semântica

A Plataforma usa `slate` como única escala neutra (não misturar com `gray`/`zinc`/`neutral`).

### 3.1 Neutros (slate)

| Token | Uso |
|---|---|
| `bg-slate-50` | Fundo de tela (`min-h-screen bg-slate-50`) e seções secundárias |
| `bg-slate-100` | Áreas de agrupamento secundárias, skeletons, segmented controls |
| `bg-slate-200` | Skeletons de loading, divisores fortes |
| `bg-white` | Cards, modais, header sticky |
| `border-slate-100` | Divisores internos sutis dentro de cards |
| `border-slate-200` | Borda padrão de card, input, botão secundário |
| `border-slate-300` | Borda em hover de elementos secundários |
| `text-slate-300` | Ícones decorativos esmaecidos (não-textuais) |
| `text-slate-400` | **Só elementos decorativos não-textuais** (ícones esmaecidos, separadores) — não usar em texto: reprova contraste WCAG sobre branco |
| `text-slate-500` | **Labels uppercase, placeholders, textos auxiliares, copy de rodapé** — o mínimo pra qualquer texto (mais usado) |
| `text-slate-600` | Parágrafos secundários |
| `text-slate-700` | Texto de corpo padrão |
| `text-slate-800` | Texto enfatizado em cards claros |

> **Regra de contraste (sweep WCAG, PR #111 / commit `b67348d`):** texto auxiliar usa **`text-slate-500` no mínimo** — `text-slate-400` sobre fundo claro reprova contraste WCAG AA e foi varrido da base (hoje: ~625 ocorrências de `text-slate-500` vs ~69 residuais de `text-slate-400`, restritas a decoração). Não reintroduzir `slate-400` em texto.

### 3.2 Cores semânticas (status)

Sempre na combinação `bg-*-100 text-*-700` pra pill/badge e `bg-*-50 + border-*-100 text-*-600/700` pra alertas.

| Intenção | Combinação canônica | Exemplos de uso |
|---|---|---|
| Sucesso / OK | `bg-emerald-100 text-emerald-700` (badge) · `bg-emerald-50 border-emerald-100 text-emerald-700` (alerta) | "Registro feito", semana completa, link de recuperação enviado |
| Erro / crítico | `bg-red-100 text-red-700` · `bg-red-50 border-red-100 text-red-600` | Validação de formulário, ação destrutiva, sem registro na semana |
| Atenção / pendente | `bg-amber-50` + `text-amber-600/700` · `bg-yellow-100 text-yellow-800` | Pendência de diagnóstico, aviso de informação faltando |
| Info / neutro | `bg-blue-100 text-blue-700` · `bg-blue-50` | Tags informativas, badges de tipo |
| Ação primária preenchida (sólida) | `bg-emerald-500/600`, `bg-red-500`, `bg-amber-500`, `bg-yellow-500` | Botões de status forte, progress bar |

Cores de ação intensa (500/600) são usadas em **barras de progresso, ícones de status e botões secundários de ação afirmativa** — nunca como fundo de página.

## 4. Tipografia

### 4.1 Fonte

Ubuntu (Google Fonts), carregada via `next/font/google` em [app/layout.js:8-12](../app/layout.js#L8-L12) com pesos `300, 400, 500, 700` e `display: 'swap'`. Aplicada no `<body>` via `className`.

Tokens equivalentes em [globals.css](../app/globals.css):
```css
--font-sans:    "Ubuntu", ui-sans-serif, system-ui, sans-serif;
--font-ubuntu:  "Ubuntu", ui-sans-serif, system-ui, sans-serif;
```

### 4.2 Escala e pesos típicos

| Papel | Classe | Exemplo |
|---|---|---|
| Headline hero | `text-4xl font-bold leading-tight` | "Da base sólida à aprovação." no login |
| H1 página | `text-2xl font-bold text-intento-blue` | "Bem-vindo de volta" |
| Título de seção | `text-xl font-bold` ou `font-semibold` | Cabeçalhos dos painéis |
| Subtítulo / lead | `text-sm font-medium text-slate-500` | Apoio do H1 |
| Corpo | `text-sm` (padrão de UI) e `text-base` quando lê-se mais | Forms, cards |
| Auxiliar / metadados | `text-xs` | Hints, timestamps |
| Micro (legal/IDs) | `text-[10px]` ou `text-[11px]` | Rodapé, CNPJ |
| **Label de formulário** | `text-xs font-semibold text-slate-500 uppercase tracking-wider` | Todos os inputs |

Pesos usados: `font-medium` (texto de apoio), `font-semibold` (CTAs/links de destaque), `font-bold` (títulos e valores de KPI). `font-light` (300) é carregado mas raro.

## 5. Forma e profundidade

### 5.1 Raios (border-radius)

A escala curta: praticamente só **`rounded-lg`, `rounded-xl`, `rounded-full`** + `rounded-md` em coisas pequenas.

| Token | Onde |
|---|---|
| `rounded-lg` | Inputs, botões, alertas, ícones quadrados pequenos |
| `rounded-xl` | **Cards** (padrão), modais, skeletons de bloco, segmented controls |
| `rounded-2xl` | Cards de destaque maiores (raro), modais cheios em mobile |
| `rounded-full` | Pills/badges, avatares, spinner, botão circular de ação |
| `rounded-md` | Elementos compactos auxiliares |

**Padrão de card:**
```html
<div class="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
```

### 5.2 Sombras

Sombra é discreta — a profundidade vem mais da borda do que do glow.

| Token | Uso |
|---|---|
| `shadow-sm` | Padrão de card, botão secundário (mais usado) |
| `shadow-md` / `shadow-lg` | Botões flutuantes, dropdowns |
| `shadow-2xl` | Modais centralizados |
| `shadow-intento` | Sombra custom da marca: `0 4px 12px rgba(6, 2, 66, 0.03)` — **definida mas com zero usos na base** (candidata a remoção do `@theme`) |

Definidos no `@theme` em [app/globals.css:14](../app/globals.css#L14).

## 6. Componentes recorrentes

### 6.1 Botão primário

```html
<button class="w-full py-3 bg-intento-blue text-white font-semibold rounded-lg
               hover:bg-blue-900 transition-all disabled:opacity-50 text-sm">
  Entrar
</button>
```

- Fundo `bg-intento-blue`, hover `bg-blue-900` (escurece levemente).
- `font-semibold`, `text-sm`, raio `lg`.
- Largura cheia em formulários (`w-full`), `py-3` (alto) ou `py-2.5` (médio).
- Estado disabled: `disabled:opacity-50`.

**Variante de alta ênfase — CTA amarelo/navy.** Desde o sweep de contraste (PR #111), a ação principal de uma tela de trabalho usa amarelo sólido da marca com texto azul-marinho (contraste alto nos dois sentidos):

```html
<button class="bg-intento-yellow hover:bg-yellow-500 text-intento-blue font-bold
               px-5 py-2 rounded-lg shadow-sm transition-all text-sm disabled:opacity-60">
  Salvar Diário
</button>
```

- `bg-intento-yellow` + `text-intento-blue` + `font-bold` (bold, não semibold — o amarelo pede peso), hover `bg-yellow-500`.
- Usada quando o CTA precisa se destacar do azul dominante da tela: "Salvar Diário" e "Salvar semana" no Modo Encontro ([app/mentor/[id]/encontro/page.js:696,777,1056](../app/mentor/%5Bid%5D/encontro/page.js)), "Exportar →" na lista de mentorados ([app/mentor/page.js:391](../app/mentor/page.js)), "Começar o Diagnóstico →" e "Enviar Resultados" no diagnóstico ([app/diagnostico/page.js:247,429](../app/diagnostico/page.js)).
- O botão azul (§ acima) segue sendo o primário padrão de formulários/login; o amarelo/navy é a variante pra ação de maior ênfase.

### 6.2 Botão secundário / Google

```html
<button class="w-full flex items-center justify-center gap-3 bg-white border border-slate-200
               text-slate-600 py-2.5 rounded-lg font-medium hover:bg-slate-50
               hover:border-slate-300 transition-all text-sm shadow-sm">
```

Borda em vez de fundo colorido; sobe um nível de cinza no hover.

### 6.3 Input

```html
<input class="w-full p-3 border border-slate-200 rounded-lg outline-none
              focus:ring-2 focus:ring-intento-blue transition-all
              font-medium text-intento-blue text-sm" />
```

- Texto do input em `text-intento-blue` (não slate) — o que o usuário digita "vira" da marca.
- Foco com `ring-2 ring-intento-blue` (sem alterar a borda).
- Label sempre `text-xs font-semibold text-slate-500 uppercase tracking-wider`.

### 6.4 Pill / badge

```html
<span class="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1.5
             rounded-full border border-emerald-200">Onboarding completo</span>
```

- `rounded-full`, `text-xs font-bold`, combinação `bg-*-100 text-*-700` + borda 200.
- Variante micro: `text-[10px] font-bold px-2.5 py-1`.

### 6.5 Card colorido (tinted)

Pra realçar uma métrica/estado dentro de uma grade, usa-se card com tint suave + faixa lateral:
```
bg-{tint}-50 rounded-xl border border-l-4 border-{tint}-500 p-5 shadow-sm
```
Exemplos vivos: cards de KPI do `/painel` ([app/painel/page.js:104](../app/painel/page.js#L104)) e alertas/itens de prova em [components/ProvasAluno.js](../components/ProvasAluno.js) e [components/AbaProvas.js](../components/AbaProvas.js).

### 6.6 Loading

Componentes centralizados em [components/Loading.js](../components/Loading.js):

- **Spinner**: borda dupla — `border-intento-blue/20` com topo opaco `border-t-intento-blue`. Tamanhos `sm | md | lg`.
- **LoadingScreen**: full screen `bg-slate-50` + spinner grande + texto `text-intento-blue font-semibold animate-pulse`.
- **LoadingInline**: spinner médio + `text-slate-500 text-xs animate-pulse`.

Skeletons: `bg-slate-200 rounded-xl animate-pulse` (alturas variando conforme o bloco simulado).

### 6.7 Footer

Não existe mais componente `Footer` compartilhado (removido no PR #109). Onde há rodapé, ele é inline por página — ex: `<footer class="bg-white border-t border-slate-200 px-6 py-4 mt-8 text-center">` em [app/privacidade/page.js:179](../app/privacidade/page.js#L179) e [app/termos/page.js](../app/termos/page.js). Links `font-semibold text-xs`; linha legal em `text-[11px]`.

## 7. Layout e densidade

- **Container central:** padrão `max-w-3xl mx-auto` em conteúdo legível; formulários `max-w-[400px]`; painéis administrativos podem abrir mais (`max-w-6xl/7xl`).
- **Gutter:** `p-6` em desktop, `p-4`/`p-5` em mobile. Modais usam `p-6 lg:p-12`.
- **Espaçamento vertical:** `space-y-4` em forms, `space-y-6/8` entre seções.
- **Breakpoints:** Tailwind padrão. Layout dual-coluna do login só ativa em `lg:` (≥1024px) — abaixo disso, header mobile com símbolo + nome centralizado.
- **PWA safe area:** quando `display-mode: standalone`, o `body` recebe padding equivalente ao notch / home indicator via `env(safe-area-inset-*)`. Sticky headers usam classes utilitárias `.safe-area-top` / `.safe-area-bottom` definidas em [globals.css:37-38](../app/globals.css#L37-L38).

## 8. Iconografia

- **Estilo:** Heroicons outline inline. Sem dependência (`react-icons`, `lucide-react`, etc. **não** instaladas — ver [package.json](../package.json)).
- **Padrão:**
  ```html
  <svg class="w-4 h-4 text-intento-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="…" />
  </svg>
  ```
- **Tamanhos comuns:** `w-3.5 h-3.5` (inline em texto), `w-4 h-4` (padrão), `w-5 h-5` (ações), `w-9 h-9` (ilustrativo em alertas).
- **Cor:** sempre via `text-*` no SVG (`currentColor` no `stroke`), pra herdar do contexto.
- **Stroke:** `1.5` é o peso padrão da plataforma; `2` em ícones pequenos quando precisa contraste.

## 9. Gráficos

- **Biblioteca:** Chart.js + `react-chartjs-2` + `chartjs-plugin-datalabels` ([package.json](../package.json)).
- Wrapper em [components/Charts.js](../components/Charts.js).
- Cores dos gráficos seguem a paleta acima — azul-marinho como série primária, amarelo da marca como série de comparação, semânticas (`emerald/red/amber`) pra estados.

## 10. Tom de voz visual

- **Português brasileiro informal-profissional.** "Bem-vindo de volta", "Acesse seu painel de mentoria".
- **Mensagens de erro humanizadas**, não literais do Firebase: "E-mail ou senha incorretos." em vez de `auth/wrong-password`. Quando o navegador do app (Instagram/WhatsApp) bloqueia OAuth, a UI explica o que fazer.
- **Labels curtos em UPPERCASE** (`tracking-wider`) marcam contexto, não gritam — sempre em `text-slate-500`.
- **CTAs verbais e diretos**: "Entrar", "Criar Conta", "Designar", "Continuar com Google" — sem icone seguido só de seta.

## 11. Regras práticas (checklist de PR)

Ao criar nova tela ou componente, conferir:

- [ ] Fundo da tela é `bg-slate-50` (claro) ou `bg-intento-blue` (hero/escuro).
- [ ] Cards são `bg-white rounded-xl border border-slate-200 shadow-sm`.
- [ ] Cor de marca só em CTA primário (azul ou amarelo/navy, §6.1), valores de KPI, links, foco e ícones decorativos.
- [ ] Status usa as combinações canônicas da §3.2 (não inventar `text-green-*` ou `text-yellow-*` fora do padrão).
- [ ] Texto auxiliar é `text-slate-500` no mínimo (não `text-gray-*`); `text-slate-400` só em elementos decorativos não-textuais — regra do sweep WCAG (PR #111).
- [ ] Inputs têm `focus:ring-2 focus:ring-intento-blue` e label uppercase `text-xs font-semibold`.
- [ ] Ícones são SVG inline outline 24, stroke 1.5, cor via `text-*`.
- [ ] Nenhuma fonte além de Ubuntu (chega via `body className`, não precisa redeclarar).
- [ ] Headers sticky em PWA usam `safe-area-top`.

## 12. O que evitar

- Misturar `gray`/`zinc`/`neutral` com `slate` — escolher uma escala (slate) e ficar nela.
- Usar `bg-blue-500/600/700` quando o pedido é cor da marca — `intento-blue` é `#060242`, próximo de `blue-950`/preto, não dos tons médios.
- Gradientes (`bg-gradient-to-*`) — a Plataforma não usa.
- Bibliotecas de ícone pesadas — manter SVG inline.
- Sombras grandes em cards (`shadow-xl/2xl` é só pra modal).
- Borda colorida cheia em card sem motivo — preferir `border-slate-200` + tint suave de `bg-*-50` quando precisar realçar.

---

Documento vivo — atualizar quando entrar gradiente, mudar fonte, ou aparecer nova convenção. Cross-refs principais: [app/globals.css](../app/globals.css) (bloco `@theme` — fonte única de tokens), [app/layout.js](../app/layout.js), [components/Loading.js](../components/Loading.js), [app/page.js](../app/page.js).
