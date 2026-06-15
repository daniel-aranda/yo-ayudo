---
target: bot editor (src/web/views/inspector/bot.pug)
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-06-14T21-59-30Z
slug: src-web-views-inspector-bot-pug
---
# Critique — Bot editor (`src/web/views/inspector/bot.pug`)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Autosave indicator (idle/saving/saved/error + relative timestamp + retry + beforeunload guard) is genuinely excellent. |
| 2 | Match System / Real World | 3 | Mostly plain Spanish, but Identidad leaks raw enums verbatim (`draft`/`active`/`archived`, `system`/`custom`) in the selects (bot.pug:267–273). |
| 3 | User Control and Freedom | 3 | Autosave persists instantly with no undo; `confirm()` only fires when an interaction already has text. Removing knowledge / toggling Habilitada is irreversible. |
| 4 | Consistency and Standards | 2 | Two button systems collide — global `button{}` paints every button emerald (css:293–319), so Quitar/Cancelar/Reintentar fight the primary unless marked `.secondary-button`. Plus rainbow stripes + dual status palettes. |
| 5 | Error Prevention | 3 | `consult_human` warns when no human group set (good); destructive removes are one-click; no empty-name guard on the title. |
| 6 | Recognition Rather Than Recall | 3 | Icons + labels on every tab/card help; but 7 tabs force the user to remember which holds what, and per-tab state isn't surfaced on the tab. |
| 7 | Flexibility and Efficiency | 3 | Cmd-click → full-page Knowledge Center, searchable picker, expand/collapse-all. No keyboard tab nav (arrow keys). |
| 8 | Aesthetic and Minimalist Design | 2 | The interaction grid (stripe + tinted badge + 15-color rainbow) is the one place the editor reads as a cockpit against an otherwise calm system. |
| 9 | Error Recovery | 3 | Autosave error shows message + Reintentar; test errors render inline — but messages are raw (`Error: ${error.message}`) and `.config-warning` uses off-token `#9a3412`. |
| 10 | Help and Documentation | 2 | Section subtitles do real onboarding work, but no first-run guidance and the Probar result dumps `prompt_compilation_id` / JSON with no explanation. |
| **Total** | | **28/40** | **Good (lower band) — a competent, real product held back from higher by component-vocabulary inconsistency and the rainbow/stripe slop.** |

## Anti-Patterns Verdict

**Does this look AI-generated? Mostly no — but there's one real slop cluster.**

**LLM assessment:** The shell is coherent and trustworthy (warm paper, rationed emerald, soft shadows, inline-editable title, pill tabs, honest autosave). The tell is the **interaction cards**: a `border-left: 4px solid var(--ix-accent)` colored stripe (css:1204) — an *absolute ban* in DESIGN.md — fed by a **15-color hardcoded rainbow** (bot.pug:110–126) that abandons the One-Accent thesis. Secondary tells: autosave/status chips run a separate off-palette color system (cool Tailwind-default greens/oranges), an indigo `is-multi` count badge with a ⚡ emoji, and a 5-stop Instagram gradient glyph. The side-stripe is systemic, not isolated — it recurs at css:2100, 2264–2272, 2924, 3375.

**Deterministic scan:** `detect.mjs --json src/web/views/inspector/bot.pug` → `[]` (exit 0). This is a **false-clean**, not a pass: the detector targets HTML/JSX, not Pug, and the slop lives in the linked CSS (which the detector flow excludes from direct scanning). The deterministic pass is structurally blind to this surface; the LLM review caught what it couldn't.

**Visual overlays:** none — the live page needs a seeded DB + auth + a bot id, so browser visualization was not run. All visual judgments are from source (Pug + CSS + JS); assumptions stated inline.

## Overall Impression

A competent, honest operator tool whose chrome is on-brand everywhere except one screen. The autosave system is the best embodiment of the brand's "estados honestos / confianza por la traza" principles in the whole app. But the **Interacciones** tab — a striped, multicolor wall of toggles — is exactly the *"tablero de avión"* the founder rejected, and it's both an absolute-ban violation and the surface's biggest AI-slop tell. The single biggest opportunity: kill the per-interaction color identity and unify the button + status vocabulary on the `:root` tokens. That one move fixes the side-stripe ban, the One-Accent violation, and most of the cognitive-load loudness at once.

## What's Working

1. **Inline-editable title that *is* the h1** (`.builder-title-input`, 28px, border only on hover/focus; bot.pug:169). The Linear/Notion "edit where you read" pattern done right — mirrors to canonical `#name` with shared autosave.
2. **Honest, stateful autosave** (css:737–792): distinct idle/saving/saved/error visuals, humanized "Guardado 3:40pm" timestamp, beforeunload guard, save queue. The strongest principle-#4/#5 moment in the product.
3. **Progressive disclosure on interactions**: collapse-by-default cards + expand/collapse-all + searchable add-picker popup. The disclosure *architecture* is right (even though the skin is too loud).

## Priority Issues

**[P1] Interaction cards violate the side-stripe ban and the One-Accent Rule.**
- **Why it matters:** DESIGN.md lists `border-left > 1px as a colored stripe` as an absolute Don't, and "if emerald is everywhere it means nothing." A rainbow of indigo/magenta/teal stripes is the loudest thing on a restrained surface — the cockpit the founder rejected and the top slop tell. It's systemic (5+ rules use colored left-borders).
- **Fix:** Drop `border-left` to a full 1px `var(--line)`. Collapse the 15 colors to the token system (neutral icon badge for all, or at most a few earthen category tints). Delete `interaction_colors` / `--ix-accent` / `--ix-tint`.
- **Suggested command:** `/impeccable quieter`

**[P1] No single primary action — the global `button{}` rule paints every button emerald.**
- **Why it matters:** `.button, button { background: var(--accent) }` (css:293–319) makes Quitar, Cancelar, Reintentar, "Ir a Knowledge Center" all read as primary unless individually downgraded. When everything is primary, nothing is — and emerald stops signaling "act here." Heuristic #4 + the rationed-accent brand rule.
- **Fix:** Make the default `<button>` ghost/secondary; require an explicit `.button--primary` for the one real primary per tab (Probar bot, Agregar interacción). Audit every button in the view.
- **Suggested command:** `/impeccable distill`

**[P1] The Probar result leaks raw machine internals as the emotional finale.**
- **Why it matters:** The test result renders `prompt_compilation_id`, `response_id`, "AI real: openai · gpt-5.5 · resp_…" and `<pre>` JSON of action inputs/outputs + guardrails. This is the operator surface so *some* density is fine, but the reassuring part (it worked!) is buried under payloads — and the project persona who can land here hits "tecnología cruda."
- **Fix:** Lead with the bot's reply + a plain-language list of what it did; move IDs and JSON behind a collapsible "Ver detalle técnico." Replace the ⚡/indigo `is-multi` badge with an earthen-token chip.
- **Suggested command:** `/impeccable clarify`

**[P2] Autosave / status chips use a parallel off-token color system.**
- **Why it matters:** Autosave states use `#fff7ed`/`#9a3412`, `#ecfdf5`/`#047857`, `#fef2f2`/`#b91c1c` (css:764–791); status dots use `#16a34a`/`#d97706` (css:987–992); status pills use yet another set. None come from `:root`, and DESIGN.md mandates earthen status pairs. The cool Tailwind-default greens/reds read as a different product than the warm-paper shell.
- **Fix:** Add `--amber-/--clay-/--sky-/--mint-/--pine` tokens (already named in DESIGN.md) and repoint autosave, `.config-warning`, status dots, and `.status-*` pills to them.
- **Suggested command:** `/impeccable colorize`

**[P2] (a11y — low priority by founder decision) Tab + switch semantics are partial.**
- **Why it matters:** Tagged P2 per the no-WCAG-gate call, noted for completeness. `role="tablist"` exists but Tab_Navigator binds click only (no arrow-key nav, no `aria-controls`/`tabpanel`); interaction category is carried by stripe color alone (color-only meaning).
- **Fix:** Add arrow-key handling + `aria-controls`/`role="tabpanel"`; ensure category reads from icon/label, not color. Keyboard tab nav is the highest-value item if ever addressed.
- **Suggested command:** `/impeccable harden`

## Persona Red Flags

**Alex (power user / operator):** (1) 7-tab bar `overflow-x: auto` (css:848) can scroll Interacciones/Restricciones out of view on a 13" laptop with no scroll affordance. (2) Autosave has no manual "save now" and no undo — a fat-finger toggle silently persists. (3) No way to reorder interactions (order is positional, but no drag handle).

**Jordan (confused first-timer):** (1) Identidad shows raw `draft`/`system` enums. (2) Interacciones is a striped rainbow wall of toggles + textareas with no "start here." (3) Probar throws `prompt_compilation_id` + JSON. (4) No save button anywhere, and the saved chip auto-hides after ~1.6s — a glance a moment later shows nothing, so Jordan may fear changes weren't saved.

**Owner-by-mistake (non-technical, project persona):** Near-total wall — machine enums, "ID del número en Meta → phone_number_id," raw JSON, "Ver settings JSON." The only mercy is the warm-Spanish section subtitles. No guardrail banner signals "this is the advanced editor."

## Minor Observations

- `.section-badge` (40px tinted emerald square) appears on *every* section head — borderline decorative chrome (skirts the literal eyebrow rule since it's an icon).
- Icon-badge sizes drift: `.section-badge` 40px/10px-radius vs `.interaction-icon` 38px/10px vs `.channel-icon` 36px/9px.
- `.json-view-button:hover` and `.secondary-button:hover` independently hardcode the same `#e5e3dc` — should be a `--surface-strong-hover` token.
- Instagram glyph is the only gradient in the editor; sits oddly beside the flat WhatsApp square.
- The char-counter is absolutely positioned inside the textarea with `pointer-events:none` — at long values it can overlap the last line of typed text.
- Empty/error copy is honest and on-brand throughout ("Ninguna interacción configurada", "Sin conversaciones recientes").

## Questions to Consider

1. **Does configuring a bot need 7 flat tabs?** Conversaciones and Probar are observation/runtime, not configuration. Splitting into a "Configurar" group (Identidad/Knowledge/Canales/Interacciones/Restricciones) and an "Operar" group (Probar/Conversaciones) turns a 7-item wall into two comprehensible sets.
2. **Why does each interaction need its own color identity?** The icon already signals the category. Killing the color fixes the side-stripe ban, the One-Accent violation, and the cognitive-load loudness in one move.
3. **If autosave is the trust mechanism, why hide it after 1.6s?** A persistently visible "Todo guardado" pill might reassure a first-timer more than a confirmation that vanishes before they look.
