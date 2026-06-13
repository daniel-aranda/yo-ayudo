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
- `/dashboard/business/:id/accounts/:id` (`account.pug`): la Cuenta. Breadcrumb `Dashboard › {Negocio} › {Cuenta}`, eyebrow "Cuenta · Negocio: X", h1 = nombre de la cuenta. Métricas de dominio (venta/caja) viven aquí (capability-driven), nunca en vistas genéricas. El panel "Bots asignados" muestra bots no archivados (incluye drafts) y tiene botón **"Agregar bot"** → popup **grande** (`popup--lg popup--tall`; `--tall` fija height ~min(82vh,900px) y sube el max-height base para que la lista interna scrollee, pensado para un catálogo largo) con **Tab Navigator** (`#add-bot-tabs`, mismo patrón pill del editor): tab **"Bot Nuevo"** (nombre → bot custom desde cero) y tab **"Bot preconfigurado"**, donde los bots `bot_type='system'` activos se eligen en **tarjetas radio** (`.system-bot-pick`: nombre + descripción, seleccionada con tint accent; primera pre-marcada; `.system-bot-list` con max-height y scroll propio) — NO dropdown — con **buscador client-side** (`#system_bot_search` filtra por texto; si el filtro esconde la tarjeta marcada se marca la primera visible, y sin coincidencias se muestra estado vacío y se deshabilita el submit). La explicación de qué es un preconfigurado NO es párrafo inline: vive en un **icono de ayuda con tooltip** (`button.help-tip` con `data-tip`, tooltip CSS-only en hover/focus — patrón reutilizable para cualquier helper text que robe espacio).

El panel "Canales conectados" tiene botón **"Agregar canal"** → popup con tabs **WhatsApp | Instagram** (`#add-channel-tabs`). WhatsApp: número visible + `phone_number_id` de Meta (con hints de dónde sale) + select opcional "Conectar a un bot" (bots de la cuenta; solo si hay). Instagram: tarjeta **coming soon** (`.channel-coming-soon`) — llegará vía OAuth, no se capturan IDs a mano (el endpoint rechaza `channel_type != whatsapp`). POST `/dashboard/business/:b/accounts/:a/channels`; guarda clave: un `phone_number_id` ya registrado en OTRA cuenta se rechaza (el upsert por `phone_number_id` re-parentaría el canal — sería robarlo). El clon copia `definition_json` como bot custom en draft de la cuenta, sin `knowledge_source_ids` ni `human_group_ids` de la cuenta origen (`custom_bot_service.clone_system_bot`, vía `upsert_bot` directo porque el zod de `create_custom_bot` solo acepta interacciones simples). POST `/dashboard/business/:b/accounts/:a/bots` (`name` o `source_bot_id`), redirect a `#panel-bots`. Las capabilities operativas se derivan SOLO de bots `active` (un draft clonado no prende paneles).
- Admin CRUD en `/admin/businesses` (`admin/businesses.pug`): crear Negocio/Cuenta y pausar/archivar/activar ambos. Muestra TODOS los estados (la vista de dashboard solo `active`). `.page-eyebrow` etiqueta el tipo de entidad; `.inline-form`/`.entity-actions` para crear y cambiar estado.

## Dashboard Operativo De Cuenta

`account.pug` (ruta `/dashboard/business/:id/accounts/:id`; datos en `dashboard_queries.js::get_account_dashboard_data`). El panel "Dashboard operativo" es:

- **Capability-driven**: las métricas operativas (ventas, caja, compras, cierre) solo aparecen si uno o más bots activos de la cuenta las declaran. Se deriva en vivo de la unión de `acciones_habilitadas_json` de los bots → `capabilities { sales, cash, close, purchases, inventory, operational }`. No hay cache: guardar o asociar un bot se refleja en el siguiente render (la "invalidación" es automática).
- **Single-day scoped**: muestra el último `op_business_days` de la cuenta. Todo el panel (ventas, caja, `purchases_total`/`count` y la tabla de compras) se scopea a ese `business_day_id`, así "Compras del día" y la tabla siempre concuerdan (días previos son historia, no la operación de hoy).
- **State-driven (sin placeholders falsos)**: "Caja final" solo si el día está cerrado (`is_closed`); el desglose Efectivo/Tarjeta/Transferencia solo si hay datos (`has_sales_breakdown`), no tres $0. Sin `op_business_days` → estado vacío "Aún no hay actividad operativa". Sin capacidad operativa → no se renderiza el panel. Subsecciones con `h3.panel-subhead`.

"Actividad reciente" (`get_account_activity`) es un feed **de negocio en lenguaje natural**, NO el trace técnico: traduce `action_audit_logs` a etiquetas como "Venta registrada"/"Inicio del día"/"Búsqueda de prospectos" (mapa `ACTIVITY_LABELS`) con el mensaje que la disparó como contexto + tiempo relativo + punto de estado (ok/error/pending), e incluye los mensajes entrantes sin operación como "Mensaje recibido" (dedupe por `message_id`). Los `processing_events` (webhook/parsing/agent/memory) ya no se muestran aquí; viven en el inspector.

Las 4 métricas de arriba (Bots/Canales/Conversaciones/Eventos con error) son **anclas clickeables** (`a.metric.metric--link`) hacia su panel en la misma página (`#panel-bots`, `#panel-canales`, `#panel-conversaciones`, `#panel-actividad`); los paneles llevan `scroll-margin-top` para no quedar bajo el header.

## Admin (server-rendered)

Vistas en `src/web/views/admin/` que comparten patrón: `.admin-subnav` (links Integraciones / Interacciones / Bots / Negocios, `.is-active` el actual), `.period-filter` (24h/7d/30d via `?since_hours=`), tira de `.metric` y tabla `.activity-table`. Las arma `register_admin_routes` (`src/admin/admin_routes.js`) desde `admin_*_service.js`. `bots.pug` lista todos los bots con conteos por bot (mensajes/conversaciones/errores/última actividad) y enlaza cada nombre a `/inspector/bots/:id`. Detalle de endpoints y servicios en `IMPLEMENTATION_STATUS.md`.

`businesses.pug` está pensado para escalar a cientos/miles de negocios: toolbar con búsqueda server-side (`?q=` por nombre/slug) + tamaño de página (`?per_page=`, default 100) + paginación (`?page=`), botón "Colapsar/Expandir todos" y colapso por negocio (client-side, `[data-business-panel]`/`[data-business-body]`/`[data-business-toggle]`; colapsado = solo el header del negocio). El nombre del negocio enlaza a `/dashboard/business/:id` y cada cuenta a su dashboard de cuenta.

Estado y altas (decisión UX del founder): el estado de negocio/cuenta es un **segmented control** (`+status_toggle`, `.status-toggle`: Activo/Pausado/Archivado; el actual relleno con su color, los otros dos son forms-botón que postean el cambio) — NO pill + botones "Pausar/Archivar" separados. Las altas son **botones que abren popups** (componente `Popup`): "Crear negocio" en el header de la página, y por negocio una `.entity-create-row` con "Crear cuenta" / "Crear bot" / "Crear usuario". Los popups son compartidos (uno por tipo): el trigger lleva el contexto en data-attrs (`data-organization-id`, `data-business-name`, `data-accounts` JSON para el select de cuentas del bot) y el JS lo inyecta al abrir. Los POST endpoints no cambian: `POST /admin/businesses|/admin/accounts|/admin/bots|/admin/users`. "Crear bot" crea un **custom en draft** y redirige al editor `/inspector/bots/:id` (slug desambiguado vía `custom_bot_service.unique_slug_for`). También lista **usuarios** por negocio.

`bots.pug` (admin global) es por default el **catálogo de bots de sistema vivos**: filtra `type=system` y esconde archivados. El toolbar es **una sola fila compacta** `[búsqueda | select de tipo]` que **auto-filtra** (sin botón "Filtrar": el select submitea en `change` y la búsqueda con debounce de 450ms; filtros server-side en `get_bots_admin_view`, que también regresa `archived_count`). Los archivados viven detrás de un **link discreto al pie** (`.archived-link`: "Ver archivados (N)" / "Ocultar archivados", `?archived=1`). El tipo tiene labels bonitos como chips (`.bot-type-chip`: "Sistema" accent / "Personalizado" neutro) y la búsqueda cubre nombre/slug/descripción/negocio/cuenta (`?q=`; los links de periodo preservan los filtros). Las acciones por fila son **iconos** (`.bot-actions` + `button.icon-button`): activar/pausar (active⇄draft) y archivar vía `POST /admin/bots/:id/status`, y **clonar** vía `POST /admin/bots/:id/clone` (copia custom en draft "{nombre} (copia)" dentro de SU cuenta, redirige al editor — `custom_bot_service.clone_bot`, el mismo del flujo preconfigurado del dashboard). La columna "Mover a" se quitó (mover bots de sistema no tiene sentido y el alta por cuenta ya cubre el caso); `POST /admin/bots/:id/move` sigue existiendo como endpoint utilitario con sus guardas (`move_bot_to_account`: sin conversaciones/mensajes ni canales activos; limpia knowledge y `bot_profile_id`).

Ojo producto: `/dashboard` (lista de negocios) muestra solo negocios `active`; el admin muestra todos los estados. Cuando hay negocios `paused`/`archived`, el dashboard lo dice explícitamente ("N negocios pausados o archivados no se muestran aquí" + link a admin) para que la diferencia contra admin no parezca un bug.

## Login y sesión (AUTH_ENABLED)

Con `AUTH_ENABLED=true`: `login.pug` (card centrada `.login-card`) en `/login`; el topbar muestra el nombre del usuario + botón "Salir" (`.nav-logout`, POST `/logout`). Para un **usuario de negocio** el nav se reduce a Dashboard (su negocio) — Inspector/Review/Admin se ocultan (`unless is_business_user` en `layout.pug`) y la política del server además lo regresa a su negocio si intenta la URL directa. El owner de plataforma ve el nav completo. Detalle de la política y módulos en `IMPLEMENTATION_STATUS.md` sección Auth.

## Editor De Bot

El editor de bot (`src/web/views/inspector/bot.pug`) es server-rendered con Pug y un mínimo de JavaScript propio en `src/web/public/js`.

- Usa un Tab Navigator (`src/web/public/js/core/Tab_Navigator.js`) con 7 tabs en este orden: Identidad, Conversaciones, Probar, Knowledge, Canales, Interacciones, Restricciones. Los tabs usan `data-section` y los paneles `.tab-section[data-parent-tab][data-section]` se muestran u ocultan via `hidden`.
- Tiene un sistema de iconos SVG inline mediante mixins de Pug (`+icon(name)`, `+section_head(icon, title, subtitle)`).
- Autosave (`src/web/public/js/inspector/Bot_Editor_Autosave.js`): postea el form a `POST /inspector/bots/:bot_id` en `input`/`change`/`blur` y muestra un timestamp proactivo tipo "Guardado 3:58pm" o "Guardado 5 jun, 4pm" (es-MX 12h). No hay botón "Guardar cambios".
- **Header del editor (framing por tipo/scope)**: el título es un **input editable inline** (`#bot_title_input`, se ve como el h1; vive FUERA del form, así que espeja a `#name` y dispara `window.bot_editor_autosave.request_save` — editar el nombre desde donde se ve). Junto al título va el **chip de tipo** (`Sistema`/`Personalizado`). Dos URLs sirven el MISMO editor con distinto framing: `/inspector/bots/:id` (admin/plataforma) y `/inspector/bots/:id/business/account` (`show_account_scope=true`, contexto de cuenta). `show_account_context = account_scope || !is_system_bot`: cuando es true → subtitle `org / account` + breadcrumb `Dashboard › cuenta › bot`; cuando es false (system bot en vista admin) → subtitle "Plataforma YoAyudo · Bot de sistema" + breadcrumb `Inspector › bot` + link cruzado "Ver en cuenta (prueba)"/"Ver a nivel plataforma". Un bot custom siempre muestra contexto de cuenta (pertenece a una).
- Interacciones: el botón "Agregar interacción" abre un **popup de selección múltiple** (no un dropdown) que lista las interacciones disponibles con su descripción; puedes marcar una o varias y agregarlas de golpe. Las interacciones ya configuradas se excluyen. Arriba de la lista hay un **buscador** (`#interaction_picker_search`, filtra por label + descripción; se resetea y enfoca al abrir; muestra "Sin interacciones que coincidan" cuando el filtro vacía la lista). El filtro solo oculta tarjetas — una marca oculta sobrevive y se agrega igual al confirmar (el contador "Agregar (N)" la sigue contando).
- Grupos humanos (interacción `consult_human`): **multi-select** — checkboxes en chips (`.human-group-multi` / `.human-group-option`, uno por grupo de `supported_human_groups`), no un dropdown de un solo valor. El valor real viaja en UN hidden input `interaction_human_group_ids` por interacción con los ids **comma-joined** (un valor por interacción preserva el mapeo posicional de `row_objects`; `parse_human_group_ids` ya hace split por coma y valida). Un listener delegado recomputa el hidden y autosava al togglear; el warning "Sin grupo humano asignado" se muestra solo cuando no queda ninguno. Rendea igual server-side (interacciones existentes) y client-side (`renderHumanGroupSelect(selectedIds)` para nuevas).
- Asignar knowledge (custom + system): al hacer "Asignar knowledge" el handler agrega el hidden input, autosava y **luego re-lee del server** (`refreshKnowledgeFromServer`) para pintar la fila en la tabla al instante (antes solo se veía tras recargar; el handler no construía la fila visible).
- Identidad: la primera fila usa grid asimétrico (`.form-grid--identity` = Nombre 2.6fr / Estado 1.1fr / Tipo 1fr) para que Nombre domine; la segunda (`.form-grid--identity-detail`) es **mitad y mitad** (Descripción 1fr / Objetivo 1fr). Colapsan a 1 columna ≤780px. Instrucciones operativas usa `.form-grid--operativas` (Idioma 1fr / Tono 1fr / Modelo IA 1.7fr) porque el modelo lleva etiquetas largas (proveedor + modelo).
- "Ver settings JSON" (botón `.json-view-button` en el header) abre la config cruda en un **popup** (componente `Popup`), no en un `<details>` inline — el `<pre>` con líneas largas vivía en el flex del header y reventaba el ancho de la página; en el modal scrollea adentro.
- Knowledge: el tab **bifurca por `bot_type`** (`is_system_bot` en `bot.pug`). **Bot de sistema**: muestra el textarea **"Knowledge esperado"** (`name="expected_knowledge"`, persistido en `definition_json.expected_knowledge`) — el contrato de knowledge que un negocio debe proveer al instalar/clonar el bot — Y, bajo un subhead **"Knowledge para probar"** (`.knowledge-test-head`), el mismo picker/tabla de asignación que los custom: como el system bot vive en la cuenta oficial de YoAyudo, esas fuentes son las oficiales y sirven solo para probarlo (al clonarlo a una cuenta, `clone_bot` deja `knowledge_source_ids` vacío — no se copia nada). **Bot custom**: solo el flujo de asignar fuentes. El picker + popup del Knowledge Center se renderizan para ambos tipos (scopeados a `bot.account_id`). "Ir a Knowledge Center" abre un **popup** (`popup--full`) con un **iframe de la página real** del Knowledge Center scopeado a la cuenta (click con cmd/ctrl/shift respeta el href y abre la página; el popup tiene link "Abrir en página"). El iframe se carga lazy (src se setea al abrir). Al **cerrar** el popup, el editor re-fetchea su propia página y repobla el `select#knowledge_source_picker` y `#knowledge_assigned_area` (DOMParser), así las altas/bajas hechas en el popup aparecen en el dropdown de asignar sin recargar; los hidden `knowledge_source_ids` sueltos en el form se deduplican contra la tabla fresca. El picker y el botón "Asignar knowledge" SIEMPRE se renderizan (deshabilitados si no hay nada que asignar) para poder re-habilitarlos en ese refresh. La tabla de asignados tiene botón **"Quitar"** por fila (handler delegado en `#knowledge_assigned_area` porque el popup reemplaza su innerHTML): quita la fila + su hidden input, devuelve la opción al picker y autosavea — el form completo es la verdad, así que quitar la última fuente persiste la lista vacía. Las páginas cargadas dentro de un iframe se marcan solas con `html.is-framed` (script inline en `layout.pug` cuando `window.self !== window.top`) y el CSS esconde su `.topbar`.

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
