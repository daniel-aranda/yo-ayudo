# Arquitectura Frontend

## Enfoque MVP

El dashboard es server-rendered con Pug, CSS propio y JavaScript mínimo. No se usa React/Vue/Svelte en el MVP.

La UI debe ser una cabina de control, no una landing page.

## Ubicación

```text
src/web/views
src/web/public/css
src/web/public/js
src/dashboard
```

## Rutas Actuales

- `GET /dashboard`
- `GET /dashboard/business/:business_id`
- `GET /dashboard/business/:business_id/accounts/:account_id`
- `GET /inspector`
- `GET /review`

## Principios UI

- Mostrar business, accounts, canales, bots, conversaciones y eventos del engine.
- No hardcodear métricas verticales como ventas, compras, caja o inventario en el dashboard base.
- Evitar dashboards decorativos.
- Evitar cards dentro de cards.
- No mostrar raw payloads en dashboard público.
- El texto debe caber en mobile y desktop.

## Editor De Bot

El editor de bot (`src/web/views/inspector/bot.pug`) es server-rendered con Pug y un mínimo de JavaScript propio en `src/web/public/js`.

- Usa un Tab Navigator (`src/web/public/js/core/Tab_Navigator.js`) con 7 tabs en este orden: Identidad, Conversaciones, Probar, Knowledge, Canales, Interacciones, Restricciones. Los tabs usan `data-section` y los paneles `.tab-section[data-parent-tab][data-section]` se muestran u ocultan via `hidden`.
- Tiene un sistema de iconos SVG inline mediante mixins de Pug (`+icon(name)`, `+section_head(icon, title, subtitle)`).
- Autosave (`src/web/public/js/inspector/Bot_Editor_Autosave.js`): postea el form a `POST /inspector/bots/:bot_id` en `input`/`change`/`blur` y muestra un timestamp proactivo tipo "Guardado 3:58pm" o "Guardado 5 jun, 4pm" (es-MX 12h). No hay botón "Guardar cambios".
- Interacciones: el botón "Agregar interacción" abre un **popup de selección múltiple** (no un dropdown) que lista las interacciones disponibles con su descripción; puedes marcar una o varias y agregarlas de golpe. Las interacciones ya configuradas se excluyen.

## Componentes Core (JS)

Viven en `src/web/public/js/core/` y se incluyen via `script` + `include` de Pug (no son módulos ES; se exponen en `window`).

- `Tab_Navigator.js` (`window.TabNavigator`): tabs por `data-section` que muestran/ocultan paneles `.tab-section[data-parent-tab][data-section]`.
- `Popup.js` (`window.Popup`): popup/modal **agnóstico y markup-driven**. Contrato: overlay `[data-popup-overlay]`, disparadores de cierre `[data-popup-close]`, `data-popup-overlay-close="true"` para cerrar al click en el backdrop; clases `is-open` (overlay) y `body--popup-open` (body); métodos `iniciar()/open()/close()/destroy()` y cierre con Escape. El CSS vive en `dashboard.css` (`.popup-overlay`, `.popup`, `.popup__header/__body/__footer/__close`, sizes `--sm/--md/--lg`). Reutilízalo para cualquier modal nuevo en vez de reinventarlo.

## Seguridad De Vistas

Pug escapa interpolaciones por defecto. Mantener esa propiedad:

- Usar `=` para datos del usuario.
- Evitar `!=` salvo contenido propio y sanitizado.
- No renderizar tokens ni raw payloads completos.
