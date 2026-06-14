---
name: YoAyudo
description: Warm, plain, owner-first control surface for a configurable WhatsApp Bot Engine.
colors:
  warm-paper: "#f6f4ee"
  counter-white: "#ffffff"
  sand: "#f0ede4"
  ink: "#1a1a16"
  olive-muted: "#6c6f64"
  hairline: "#e7e2d6"
  hairline-strong: "#d8d2c4"
  petrol-emerald: "#0f6a5a"
  deep-pine: "#0a4a3f"
  mint-mist: "#e4f1ea"
  amber-bg: "#f6e7c6"
  amber-ink: "#8a6116"
  clay-bg: "#ecdcdc"
  clay-ink: "#8c4a42"
  sky-bg: "#d8e6f5"
  sky-ink: "#2b5582"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.018em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.018em"
  metric:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.06em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  input: "7px"
  card: "8px"
  button: "9px"
  container: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "18px"
  gutter: "28px"
components:
  button-primary:
    backgroundColor: "{colors.petrol-emerald}"
    textColor: "{colors.counter-white}"
    rounded: "{rounded.button}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.deep-pine}"
    textColor: "{colors.counter-white}"
    rounded: "{rounded.button}"
    padding: "9px 14px"
  button-secondary:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "9px 14px"
  button-disabled:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.olive-muted}"
    rounded: "{rounded.button}"
    padding: "9px 14px"
  input:
    backgroundColor: "{colors.counter-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "9px 10px"
  panel:
    backgroundColor: "{colors.counter-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "18px"
  metric:
    backgroundColor: "{colors.counter-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px 18px"
  tab-active:
    backgroundColor: "{colors.deep-pine}"
    textColor: "{colors.counter-white}"
    rounded: "{rounded.card}"
    padding: "8px 14px"
  nav-link-active:
    backgroundColor: "{colors.mint-mist}"
    textColor: "{colors.deep-pine}"
    rounded: "{rounded.card}"
    padding: "7px 12px"
  status-toggle:
    backgroundColor: "{colors.sand}"
    textColor: "{colors.olive-muted}"
    rounded: "{rounded.pill}"
    padding: "2px"
---

# Design System: YoAyudo

## 1. Overview

**Creative North Star: "El Mostrador Cálido" (The Warm Counter)**

YoAyudo is the calm wooden counter of a small shop, rendered as software. The owner stands at it, glances down, and reads exactly how the day is going — sales, cash, open tasks, what the bot handled over WhatsApp — without studying anything. Everything that matters is within arm's reach; nothing shouts. The surface is warm paper (`#f6f4ee`), the ink is a soft near-black (`#1a1a16`), and a single petrol-emerald (`#0f6a5a`) marks the few things you can act on. It is the opposite of a control room: there are no banks of instruments, no gauges blinking for attention, no jargon. A shopkeeper should feel *"this is for me, I get it at a glance, and it speaks my language."*

Depth comes from soft, layered shadows rather than hard 1px boxes — surfaces feel like paper resting on paper. The accent is rationed: emerald belongs to primary actions and live states, never to decoration or navigation. Two audiences share the system but not the same dial: the **business owner** gets the plain, generous, owner-first surface that is the product being sold; the **platform operator** gets denser inspector/admin tooling behind the same tokens. When the two ever conflict, the owner's clarity wins.

This system explicitly rejects the airplane cockpit — *"nada de tableros de avión."* It rejects decorative vanity dashboards (chart-junk, placeholder metrics, three $0 tiles), raw technology bleeding into the owner's view (payloads, pipeline events, JSON), and the wall-of-controls enterprise density that makes a small-business owner feel they need a manual.

**Key Characteristics:**
- Warm-paper canvas, soft near-black ink, one rationed petrol-emerald accent.
- Layered soft shadows for depth; nested elements go flat (no card-in-card).
- Plain Spanish (es-MX) business language; engine internals stay in the inspector.
- Honest states only: real activity or a clear empty state — never fake numbers.
- Owner-first calm over operator density when the two pull apart.

## 2. Colors: The Warm Counter Palette

A warm-neutral paper foundation, soft near-black ink, a single petrol-emerald for action, and a small set of muted earthen tints that carry status. One accent does the talking; everything else is paper, ink, and hairlines.

### Primary
- **Petrol Emerald** (`#0f6a5a`): the one action color. Primary buttons, focus rings, the live/"active" state, and small accents. Its scarcity is the point.
- **Deep Pine** (`#0a4a3f`): the emerald's pressed/serious register. Button hover, the filled active tab, link text, and ink that sits on the mint tint.
- **Mint Mist** (`#e4f1ea`): the soft emerald tint. Active nav pill, selected chips, the "Activo"/"Hecha" status fills, scope banners.

### Neutral
- **Warm Paper** (`#f6f4ee`): the body background. The calm sheet the whole interface rests on.
- **Counter White** (`#ffffff`): raised surfaces — panels, cards, metrics, inputs, popups.
- **Sand** (`#f0ede4`): the warm second neutral. Secondary buttons, nested row fills, chat bubbles, the switch/segmented track.
- **Ink** (`#1a1a16`): primary text. A warm near-black, never pure `#000`.
- **Olive Muted** (`#6c6f64`): secondary text, labels, resting icons. (Use deliberately — see the Legibility Rule.)
- **Hairline** (`#e7e2d6`) / **Hairline Strong** (`#d8d2c4`): borders and dividers. Quiet by default, stronger only where a line must read.

### Tertiary — Status Tints (earthen, paired bg + ink)
- **Amber** (bg `#f6e7c6` / ink `#8a6116`): "Pausado" and "Pendiente".
- **Clay** (bg `#ecdcdc` / ink `#8c4a42`): "Archivado".
- **Sky** (bg `#d8e6f5` / ink `#2b5582`): "En progreso".
- *Active/Done reuse* **Mint Mist + Deep Pine**, so green always reads as "good/live".

### Named Rules
**The One Accent Rule.** Petrol-emerald is reserved for primary actions and live states. Navigation, decoration, and chrome use neutrals — never the accent. If emerald is everywhere, it means nothing.

**The Earthen-Status Rule.** Status color is always a muted earthen *pair* (tinted bg + same-hue darker ink), never saturated ink on white. Status must also carry a word or icon, never color alone.

**The Legibility Rule.** Olive Muted (`#6c6f64`) is for labels and secondary text, not body copy on tinted surfaces. If a muted value lands near a paper/sand tint and the contrast is borderline, push it toward Ink. Washed-out gray-on-cream is the failure mode; refuse it.

## 3. Typography

**Display / Body Font:** Inter (with `ui-sans-serif, system-ui, -apple-system, sans-serif`)
**Mono Font:** `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

**Character:** One humanist sans across the whole product, differentiated by weight and size rather than a second family — quiet, modern, and legible at a glance. Headings carry slightly tight tracking (`-0.018em`) for an editorial, premium feel; mono appears only for machine facts (IDs, `phone_number_id`, raw JSON in the inspector). Antialiased rendering (`-webkit-font-smoothing: antialiased`).

### Hierarchy
- **Display / Page Title** (700, 28px, line-height 1.15, `-0.018em`): the `h1` of each page (`.page-header h1`). One per screen.
- **Headline / Section** (700, 17px, line-height 1.3, `-0.018em`): panel and card headers (`.panel h2`, `.card h2`).
- **Metric** (700, 24px, `-0.01em`): the single big number in a metric tile (`.metric strong`).
- **Body** (400, 16px, line-height 1.45): default reading text; cap measure at 65–75ch. Dense tables and chrome may drop to ~13–14px.
- **Label / Eyebrow** (700, 11–12px, UPPERCASE, `+0.04–0.06em`): entity eyebrows (`.page-eyebrow`) and panel subheads (`.panel-subhead`) that name *what kind of thing* this is (Negocio / Cuenta).
- **Mono** (400, 13px): IDs, codes, and raw payloads — inspector only.

### Named Rules
**The Brand-Weight Rule.** The wordmark "YoAyudo" is the heaviest type in the product (800, `-0.01em`). Nothing else competes at that weight.

**The Eyebrow-With-A-Job Rule.** The uppercase tracked label is allowed *only* when it names entity type or scope (Negocio, Cuenta, panel subhead) — a real disambiguator. It is forbidden as decorative kicker above every section.

## 4. Elevation

Layered and soft, not flat. Depth is carried by warm, low-opacity shadows (tinted with the ink hue, `rgba(26,26,18,…)`) instead of hard borders — "premium depth instead of flat 1px borders." Primary surfaces lift gently off the paper; nested elements stay flat so the page never becomes boxes-in-boxes.

### Shadow Vocabulary
- **`--shadow-xs`** (`0 1px 2px rgba(26,26,18,0.05)`): buttons and the sticky topbar at rest.
- **`--shadow-sm`** (`0 1px 3px rgba(26,26,18,0.06), 0 1px 2px rgba(26,26,18,0.04)`): the standard lift for primary surfaces — `.panel`, `.metric`, `.card`, `.inspector-panel`, `.trace-section`, `.tabs`, `.conversation-thread`, `.trace-hero`.
- **`--shadow-md`** (`0 12px 32px rgba(26,26,18,0.09), 0 3px 8px rgba(26,26,18,0.05)`): raised/hover and floating affordances.
- **Popup shadow** (`0 18px 48px rgba(0,0,0,0.22)`): modals only, over a `rgba(20,20,18,0.45)` backdrop with `blur(3px)`.

### Named Rules
**The Flat-Nest Rule.** A surface lifts once. Rows and cards *inside* a lifted panel (`.trace-card`, `.config-card`, chat bubbles) are flat. Two stacked shadows = nested cards = forbidden.

**The Frosted-Topbar Exception.** The only sanctioned glass is the sticky topbar: near-opaque warm fill (`rgba(250,249,245,0.94)`) with a faint `blur(6px)`. Glassmorphism is not a general material here.

## 5. Components

### Buttons
- **Shape:** gently rounded (9px).
- **Primary:** petrol-emerald fill, white text, `9px 14px` padding, weight 650, `--shadow-xs` at rest. The default `<button>` IS the primary button.
- **Hover / Active:** hover → Deep Pine fill + `--shadow-sm`; active → `translateY(1px)`. Transitions: `background 140ms ease, box-shadow 140ms ease, transform 80ms ease`.
- **Secondary:** Sand fill, 1px Hairline border, Ink text (`.secondary-button`). For non-primary actions.
- **Ghost:** transparent, used for low-emphasis inline actions (`.button-ghost`).
- **Icon button:** square, neutral icon, surface-strong hover (`.icon-button`) — used for row actions (activate/pause/archive/clone).
- **Disabled:** Sand fill, Olive Muted text, `not-allowed`.
- **Focus:** `0 0 0 3px` accent-ring halo, no default outline.

### Inputs / Fields
- **Style:** Counter White fill, 1px Hairline border, 7px radius, `~9–10px` padding, inherited font.
- **Focus:** border shifts to Petrol Emerald + `0 0 0 3px` accent-ring halo (`rgba(15,106,90,0.24)`); outline removed.
- **Readonly:** Sand fill + Olive Muted text. **Placeholder:** must clear the same legibility bar as body text — no faint gray.

### Cards / Panels / Metrics
- **Corner Style:** 8px.
- **Background:** Counter White on Warm Paper.
- **Shadow Strategy:** `--shadow-sm` (see Elevation). Never stack shadows when nested.
- **Border:** 1px Hairline.
- **Internal Padding:** 18px (panels/cards); metrics are compact (12px vertical).
- **Metric tile:** a 13px Olive Muted `.label` over a 24px Ink number. Variants: `.metric--success` / `.metric--warn` (earthen tints), `.metric--link` (a clickable metric that lifts on hover and anchors to its panel). Metrics are *navigation and honest counts*, never a decorative hero band.

### Navigation (Topbar)
- **Style:** sticky, frosted near-opaque warm fill, 1px Hairline bottom, `--shadow-xs`.
- **Links:** Olive Muted, weight 600, 8px radius; hover → Sand fill + Ink. **Active:** Mint Mist pill + Deep Pine text, weight 700 (`.nav a.is-active`).
- **Scoping:** when an account is in context, Dashboard/Inspector/Review stay scoped to it; Admin is global on purpose. Business users see a reduced nav (Dashboard only).

### Pill Tabs (signature)
- Container: Counter White, 1px Hairline, 12px radius, 6px padding (`.tabs`).
- Tab: transparent, 8px radius, Olive Muted, weight 650, `min-height 40px`, `8px 14px` padding; hover → Sand. **Active:** Deep Pine fill + white text + white icon.
- The same pill pattern drives the bot editor, the account dashboard, and tabbed popups via `Tab_Navigator.js`.

### Status Segmented Control (signature)
- A pill track (Sand fill, 1px Hairline, 999px radius, 2px padding) holding 2–3 options.
- The **current** state is filled with its earthen tint (Activo/Hecha → Mint Mist + Deep Pine; Pausado/Pendiente → Amber; Archivado → Clay; En progreso → Sky); the others are quiet form-buttons that POST the change on click (`.status-toggle` / `.status-toggle-option`). This replaces "pill + separate Pause/Archive buttons" everywhere status changes.

### Switch
- Accessible toggle (`.switch` / `.switch-track`): ON = Petrol Emerald track; focus-visible ring. Used for on/off settings (e.g. interaction enable).

### Popup / Modal (signature)
- Backdrop `rgba(20,20,18,0.45)` + `blur(3px)`; panel Counter White, 1px Hairline, 12px radius, heavy popup shadow, `header / body / footer` grid.
- Sizes: `--sm` 26rem, `--md` 36rem, `--lg` 52rem, `--full` 96vw×92vh (dense viewers like the JSON inspector).
- Entrance: backdrop fade 160ms ease-out + panel `200ms cubic-bezier(0.2,0.8,0.2,1)`. Reuse `Popup.js` for every modal; never hand-roll one.

### Breadcrumb
- Shared `+breadcrumb(items)` mixin; `›` separator; last/href-less item is the current page. Use on every new inspector/dashboard page for consistent wayfinding.

## 6. Do's and Don'ts

### Do:
- **Do** keep the accent rationed — Petrol Emerald only on primary actions and live states (the One Accent Rule).
- **Do** lift primary surfaces once with `--shadow-sm` and keep nested rows flat (the Flat-Nest Rule).
- **Do** translate engine internals into plain Spanish business language ("Venta registrada", "Tarea abierta", "Caja inicial del día").
- **Do** show honest states: real activity or a clear empty state ("Aún no hay actividad operativa"), and only render an operational panel when a bot actually declares that capability.
- **Do** carry status as an earthen tint *pair* plus a word/icon, never color alone.
- **Do** reuse the core components — `button`, `.status-toggle`, `.tabs`, `Popup.js`, `+breadcrumb` — instead of inventing new chrome.
- **Do** keep the `:root` tokens in `dashboard.css` as the single source of truth; never hardcode a hex.

### Don't:
- **Don't** build the owner's surface like an airplane cockpit — *"nada de tableros de avión, no debe ser UI complejo."* Progressive disclosure over a wall of controls.
- **Don't** ship decorative or vanity dashboards: no chart-junk, no placeholder metrics, no three $0 tiles. (The metric tile is a count or a link, never a hero-metric band.)
- **Don't** leak raw technology into the owner's view — no raw payloads, processing events, or JSON. That lives only in the inspector.
- **Don't** overwhelm with enterprise density: don't cram every control onto one screen.
- **Don't** use `border-left`/`border-right` > 1px as a colored accent stripe on cards, rows, or callouts — use a full border or a Mint/earthen background tint instead.
- **Don't** use gradient text (`background-clip: text`) or decorative glassmorphism; the only sanctioned frost is the topbar.
- **Don't** set body or placeholder text in faint gray on a tinted surface — washed-out cream-on-paper is the readability failure this brand refuses.
- **Don't** add a decorative uppercase eyebrow above every section; the tracked label is allowed only when it names entity type or scope.
- **Don't** nest cards inside cards, or stack two shadows on one element.
