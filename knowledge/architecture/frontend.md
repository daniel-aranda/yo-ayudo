# Arquitectura Frontend

## Enfoque MVP

El dashboard es server-rendered con Pug, CSS propio y JavaScript mínimo. No se usa React/Vue/Svelte en el MVP.

La UI debe ser una cabina de control, no una landing page.

## Sistema visual

Tokens en `:root` (`dashboard.css`) — úsalos siempre, no hardcodees colores:

- Color: `--bg` (paper cálido), `--surface` (blanco), `--surface-strong` (gris cálido para filas/burbujas), `--text`, `--muted`, `--line` / `--line-strong` (bordes), `--accent` (emerald/petrol) + `--accent-dark` + `--accent-soft` (tint de chips).
- Profundidad: `--shadow-xs/sm/md`. Las superficies principales (`.panel`, `.metric`, `.card`, `.inspector-panel`, `.trace-section`, `.tabs`, `.conversation-thread`, `.trace-hero`) llevan `--shadow-sm`; las filas anidadas (`.trace-card`, `.config-card`, burbujas) van planas.
- Foco: anillo `--accent-ring` en inputs/select/textarea/botones (`:focus-visible`).
- Topbar sticky con `backdrop-filter` (frosted); nav en `--muted` con hover de pill. El verde se reserva para acciones primarias y acentos, no para la navegación.
- Tipografía Inter con `letter-spacing` negativo en headings y `font-smoothing` antialiased.

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
- `GET /inspector` (acepta `?account=` para filtrar a una cuenta)
- `GET /review` (acepta `?account=` para filtrar a una cuenta)

## Principios UI

- Mostrar business, accounts, canales, bots, conversaciones y actividad del negocio.
- No hardcodear métricas verticales como ventas, compras, caja o inventario en el dashboard base.
- Evitar dashboards decorativos.
- Evitar cards dentro de cards.
- No mostrar raw payloads ni eventos técnicos del pipeline en el dashboard: es la vista del dueño, no del desarrollador (eso vive en el inspector).
- El texto debe caber en mobile y desktop.

## Jerarquía Negocio → Cuenta

Modelo: **Negocio** = `organizations`, **Cuenta** = `accounts` (ambos con `status` active/paused/archived). La navegación es explícita y NO salta niveles:
- `/dashboard` (`dashboard.pug`): lista Negocios; "Abrir" → la página del Negocio (no a una cuenta).
- `/dashboard/business/:id` (`business.pug`): página del Negocio con sus Cuentas (ya **no** redirige a la cuenta primaria). Eyebrow "Negocio" + lista de cuentas (solo `active`) con "Abrir cuenta".
- `/dashboard/business/:id/accounts/:id` (`account.pug`): la Cuenta. Breadcrumb `Dashboard › {Negocio} › {Cuenta}`, eyebrow "Cuenta · Negocio: X", h1 = nombre de la cuenta. Métricas de dominio (venta/caja) viven aquí (capability-driven), nunca en vistas genéricas.
- Admin CRUD en `/admin/businesses` (`admin/businesses.pug`): crear Negocio/Cuenta y pausar/archivar/activar ambos. Muestra TODOS los estados (la vista de dashboard solo `active`). `.page-eyebrow` etiqueta el tipo de entidad; `.inline-form`/`.entity-actions` para crear y cambiar estado.

## Dashboard Operativo De Cuenta

`account.pug` (ruta `/dashboard/business/:id/accounts/:id`; datos en `dashboard_queries.js::get_account_dashboard_data`). El panel "Dashboard operativo" es:

- **Capability-driven**: las métricas operativas (ventas, caja, compras, cierre) solo aparecen si uno o más bots activos de la cuenta las declaran. Se deriva en vivo de la unión de `acciones_habilitadas_json` de los bots → `capabilities { sales, cash, close, purchases, inventory, operational }`. No hay cache: guardar o asociar un bot se refleja en el siguiente render (la "invalidación" es automática).
- **Single-day scoped**: muestra el último `op_business_days` de la cuenta. Todo el panel (ventas, caja, `purchases_total`/`count` y la tabla de compras) se scopea a ese `business_day_id`, así "Compras del día" y la tabla siempre concuerdan (días previos son historia, no la operación de hoy).
- **State-driven (sin placeholders falsos)**: "Caja final" solo si el día está cerrado (`is_closed`); el desglose Efectivo/Tarjeta/Transferencia solo si hay datos (`has_sales_breakdown`), no tres $0. Sin `op_business_days` → estado vacío "Aún no hay actividad operativa". Sin capacidad operativa → no se renderiza el panel. Subsecciones con `h3.panel-subhead`.

"Actividad reciente" (`get_account_activity`) es un feed **de negocio en lenguaje natural**, NO el trace técnico: traduce `action_audit_logs` a etiquetas como "Venta registrada"/"Inicio del día"/"Búsqueda de prospectos" (mapa `ACTIVITY_LABELS`) con el mensaje que la disparó como contexto + tiempo relativo + punto de estado (ok/error/pending), e incluye los mensajes entrantes sin operación como "Mensaje recibido" (dedupe por `message_id`). Los `processing_events` (webhook/parsing/agent/memory) ya no se muestran aquí; viven en el inspector.

Las 4 métricas de arriba (Bots/Canales/Conversaciones/Eventos con error) son **anclas clickeables** (`a.metric.metric--link`) hacia su panel en la misma página (`#panel-bots`, `#panel-canales`, `#panel-conversaciones`, `#panel-actividad`); los paneles llevan `scroll-margin-top` para no quedar bajo el header.

## Admin (server-rendered)

Tres vistas en `src/web/views/admin/` que comparten patrón: `.admin-subnav` (links Integraciones / Interacciones / Bots, `.is-active` el actual), `.period-filter` (24h/7d/30d via `?since_hours=`), tira de `.metric` y tabla `.activity-table`. Las arma `register_admin_routes` (`src/admin/admin_routes.js`) desde `admin_*_service.js`. `bots.pug` lista todos los bots con conteos por bot (mensajes/conversaciones/errores/última actividad) y enlaza cada nombre a `/inspector/bots/:id`. Detalle de endpoints y servicios en `IMPLEMENTATION_STATUS.md`.

## Editor De Bot

El editor de bot (`src/web/views/inspector/bot.pug`) es server-rendered con Pug y un mínimo de JavaScript propio en `src/web/public/js`.

- Usa un Tab Navigator (`src/web/public/js/core/Tab_Navigator.js`) con 7 tabs en este orden: Identidad, Conversaciones, Probar, Knowledge, Canales, Interacciones, Restricciones. Los tabs usan `data-section` y los paneles `.tab-section[data-parent-tab][data-section]` se muestran u ocultan via `hidden`.
- Tiene un sistema de iconos SVG inline mediante mixins de Pug (`+icon(name)`, `+section_head(icon, title, subtitle)`).
- Autosave (`src/web/public/js/inspector/Bot_Editor_Autosave.js`): postea el form a `POST /inspector/bots/:bot_id` en `input`/`change`/`blur` y muestra un timestamp proactivo tipo "Guardado 3:58pm" o "Guardado 5 jun, 4pm" (es-MX 12h). No hay botón "Guardar cambios".
- Interacciones: el botón "Agregar interacción" abre un **popup de selección múltiple** (no un dropdown) que lista las interacciones disponibles con su descripción; puedes marcar una o varias y agregarlas de golpe. Las interacciones ya configuradas se excluyen.
- Identidad: las dos filas usan grids asimétricos (`.form-grid--identity` = Nombre 2.6fr / Estado 1.1fr / Tipo 1fr; `.form-grid--identity-detail` = Descripción 2.2fr / Objetivo 1fr) para que Nombre/Descripción dominen y Estado/Tipo/Objetivo queden compactos. Colapsan a 1 columna ≤780px. Instrucciones operativas usa `.form-grid--operativas` (Idioma 1fr / Tono 1fr / Modelo IA 1.7fr) porque el modelo lleva etiquetas largas (proveedor + modelo).
- "Ver settings JSON" (botón `.json-view-button` en el header) abre la config cruda en un **popup** (componente `Popup`), no en un `<details>` inline — el `<pre>` con líneas largas vivía en el flex del header y reventaba el ancho de la página; en el modal scrollea adentro.

## Componentes Core (JS)

Viven en `src/web/public/js/core/` y se incluyen via `script` + `include` de Pug (no son módulos ES; se exponen en `window`).

- `Tab_Navigator.js` (`window.TabNavigator`): tabs por `data-section` que muestran/ocultan paneles `.tab-section[data-parent-tab][data-section]`.
- `Popup.js` (`window.Popup`): popup/modal **agnóstico y markup-driven**. Contrato: overlay `[data-popup-overlay]`, disparadores de cierre `[data-popup-close]`, `data-popup-overlay-close="true"` para cerrar al click en el backdrop; clases `is-open` (overlay) y `body--popup-open` (body); métodos `iniciar()/open()/close()/destroy()` y cierre con Escape. El CSS vive en `dashboard.css` (`.popup-overlay`, `.popup`, `.popup__header/__body/__footer/__close`, sizes `--sm/--md/--lg/--full`, donde `--full` es casi-pantalla-completa, 96vw×92vh, para visores densos como el JSON). Reutilízalo para cualquier modal nuevo en vez de reinventarlo.

Mixin Pug compartido: `+breadcrumb(items)` en `layout.pug` (disponible en toda vista que haga `extends`). `items` = `[{ label, href? }]`; sin `href` = página actual. Úsalo en cualquier página nueva del inspector/dashboard para mantener la navegación consistente (CSS `.breadcrumb` en `dashboard.css`).

Topbar: el link de la sección actual se resalta solo (`.nav a.is-active`, pill `accent-soft`). El middleware `navigation_context` (`src/app/navigation_middleware.js`, montado en `server.js`) expone dos locals en cada request: `active_nav` (sección actual, del primer segmento del path) y `nav_context` (scope de cuenta, ver abajo). Funciona en toda página sin tocar cada ruta. El layout usa `typeof active_nav !== "undefined"` y `typeof nav_context !== "undefined"` para no romper apps de test que renderizan sin el middleware (las apps de test que sí lo quieren lo importan, p. ej. `operational_dashboard.test.js`).

### Navegación scopeada por cuenta

Cuando hay una cuenta en contexto, el menú de arriba **se queda en esa cuenta**; Admin es global a propósito ("otro animal"). `navigation_context` deriva `nav_context = { business_id, account_id }` de la ruta del dashboard de cuenta (`/dashboard/business/:b/accounts/:a`) o de `?business=&account=` en las secciones scopeables. `layout.pug` lo usa para los hrefs del nav:

- **Dashboard** → el dashboard de esa cuenta (`/dashboard/business/:b/accounts/:a`) si hay scope; si no, `/dashboard`.
- **Inspector** → `/inspector?business=&account=` (filtra los bots a esa cuenta).
- **Review** → `/review?business=&account=` (filtra los pendientes a esa cuenta).
- **Admin** → siempre `/admin/integrations`, sin scope.

Las vistas scopeadas (`inspector/index.pug`, `review.pug`) muestran un `.scope-banner` (CSS en `dashboard.css`: fill `accent-soft`, borde `accent-ring`) con el nombre de la cuenta y un link de escape ("Ver todos") a la versión sin scope, más un `.page-eyebrow` "Cuenta · Negocio: X". El POST de resolver review reenvía `business`/`account` (hidden inputs) para preservar el scope en el redirect.

## Seguridad De Vistas

Pug escapa interpolaciones por defecto. Mantener esa propiedad:

- Usar `=` para datos del usuario.
- Evitar `!=` salvo contenido propio y sanitizado.
- No renderizar tokens ni raw payloads completos.
