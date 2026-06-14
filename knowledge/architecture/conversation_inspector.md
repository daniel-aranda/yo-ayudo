# Conversation Inspector

## Objetivo

Conversation Inspector es una herramienta interna para depurar conversaciones de bots. No es un inbox comercial; sirve para responder que mensaje llego, que entendio el sistema, que guardo, que agente se eligio, que memoria se creo, que respuesta salio y que fallo.

## Modelo

El inspector agrega una capa minima sobre el modelo existente:

- `organizations`: negocio de alto nivel. En producto/UI un `organizations` es un "Negocio".
- `accounts`: cuenta dentro de una organization.
- `bots`: instancia operativa conectada a un account, bot profile y canal.

Relaciones actuales:

```text
organization
  -> accounts
    -> bots
      -> bot_profile
      -> conversations
        -> messages
```

`conversations`, `messages`, `agent_runs`, `memory_documents` y `review_items` tienen `bot_id` nullable. El inspector prefiere `bot_id` para evitar magia en queries. El aislamiento de conversacion es por `bot_id + contact_id (+ channel)`.

## Rutas

- `GET /inspector` — **no renderea**: el inspector SIEMPRE es por cuenta (no hay home global de plataforma; el overview cross-account es `/admin/bots`). El `?account=<id>` legacy redirige a `/inspector/accounts/:id`; sin cuenta, redirige a `/dashboard` (chooser de negocio→cuenta).
- `GET /inspector/organizations` → redirige a `/dashboard` (era alias de la vista global, ya eliminada).
- `GET /inspector/organizations/:organization_id` (vista de un negocio: lista sus cuentas, cada una enlaza a `/inspector/accounts/:id`)
- `GET /inspector/accounts/:account_id` — **home "Inspector por bots" scopeada a la cuenta** (path param; única home del inspector). 404 si la cuenta no existe. Sin `.scope-banner` (no hay vista global a la que escapar).
- `GET /inspector/bots/:bot_id` (editor; vista admin/plataforma)
- `GET /inspector/bots/:bot_id/business/account` (mismo editor, framing con contexto de cuenta; ver `frontend.md`)
- `POST /inspector/bots/:bot_id` (guardado/autosave del editor de bot)
- `POST /inspector/bots/:bot_id/test-message`
- `GET /inspector/bots/:bot_id/conversations`
- `GET /inspector/accounts/:account_id/conversations/:conversation_id` (visor de una conversación, **scopeado a la cuenta en el path** como el resto del inspector; la org se deriva). La URL plana legacy `GET /inspector/conversations/:conversation_id` **redirige** a la canónica (resuelve la cuenta vía `conversations.account_id` o el bot); sin cuenta resoluble, sirve directo. Es el destino de cada fila de `/admin/conversations`.
- `GET /inspector/messages/:message_id`
- `GET` / `POST /inspector/accounts/:account_id/knowledge` (Knowledge Center canonico con la cuenta en el path, igual que el resto de rutas; POST con upload a S3; la organization se deriva de la cuenta — no viaja en la URL)
- `GET` / `POST /inspector/accounts/:account_id/knowledge/:source_id` (detalle; 404 si la fuente no pertenece a la cuenta)
- `GET` / `POST /inspector/knowledge[/:source_id]` (legacy/global: `?account_id=` redirige a la ruta con cuenta en el path; el detalle plano redirige usando el `account_id` de la fuente; sin cuenta sirve la vista global sin scope)

Todas son server-rendered con Pug. No hay SPA ni librerias pesadas.

## Breadcrumb (navegacion)

Todas las paginas del flujo (account dashboard, editor de bot, conversaciones, conversacion, message trace, actividad) usan el mixin compartido `+breadcrumb(items)` definido en `layout.pug` (`items` = `[{ label, href? }]`; el ultimo o cualquiera sin `href` es la pagina actual). Jerarquia consistente: `Dashboard › {cuenta} › {bot} › Conversaciones › {contacto} › Trace`, de modo que desde cualquier pagina se puede volver al bot y al dashboard. Para que el breadcrumb tenga el nombre de cuenta/bot, `get_bot_conversations` devuelve tambien `bot` y `get_bot_activity_view` usa `get_bot_with_definition` (incluye `account_name`/`organization_name`).

## Home "Inspector Por Bots"

`/inspector/accounts/:account_id` es la **única** home del inspector (`inspector/index.pug`, h1 "Inspector por bots"): siempre por cuenta (NO hay vista global de plataforma — el overview cross-account vive en `/admin/bots`). Mismo lenguaje visual que `/admin/bots` (filtro de periodo 24h/7d/30d, toolbar de una fila con búsqueda + tipo que auto-submitea, métricas Bots/Activos/Mensajes/Errores, tabla `.activity-table` con chips, status pills, conteos y acciones por fila). Por ser siempre por cuenta: default `type=all` (ver todos los bots de la cuenta), eyebrow "Cuenta · {negocio}", NO se muestra la columna "Negocio / cuenta" ni un `.scope-banner` de escape.

- Datos: `get_inspector_bots_view(pool, { account_id, q, type, include_archived, since_hours })` (`inspector_repository.js`) **reusa `get_bots_admin_view`** (`admin_bots_service.js`, acepta `account_id` para scopear) como única fuente de verdad de los conteos, y agrega `account`/`business` para el header.
- Acciones por fila = **links** (no forms): Editar (`/inspector/bots/:id`), Conversaciones (`.../conversations`), Actividad (`.../activity`), con `a.icon-button`. El inspector NO cambia estado de bots (eso es admin); son links de inspección.
- El scope vive en el **path**, y **la cuenta basta** (el negocio se deriva). El top nav (`navigation_middleware` + `layout.pug`) deriva `nav_context = { account_id }` del path `/(dashboard|inspector)/accounts/:id` y arma `inspector_href = /inspector/accounts/:account_id` + `dashboard_href = /dashboard/accounts/:account_id`. Las rutas del inspector **ya no setean `response.locals.nav_context` a mano** (lo cubre el middleware). Sin contexto, `inspector_href = /inspector` redirige a `/dashboard` (chooser). Review usa `?account=`.

## Lista De Conversaciones Por Bot

`GET /inspector/bots/:bot_id/conversations` (`inspector/conversations.pug`, datos en `get_bot_conversations`). Tabla **en español** con columnas: **Contacto** (link al visor; `.conv-sender` con `min-width` para que el nombre no se parta), **Teléfono** (`phone()`), **Último mensaje**, **Interacciones**, **Mensajes**, **Revisión**, **Última actividad**, **Estado**. Decisiones de UX:
- **Interacciones** = las acciones que la conversación **ejecutó** (`action_audit_logs` `status='executed'`, distinct `action_id`, recientes primero), una por chip (`.conv-tag`) con la etiqueta humana (`get_action(action_id).nombre`). Reemplaza las viejas columnas `last_intent`/`last_agent` (crudas, poco útiles): muestra qué hizo la conversación (Registrar venta, Crear tarea, Cierre del día…).
- **Última actividad** = fecha corta `format_short_date_es` ("9 jun"; agrega año solo si no es el actual) — no el `Date` crudo.
- **Estado** = `summary.status_label` en español (Abierta/Cerrada/…), no el valor crudo en inglés.

## Vista De Conversacion

`GET /inspector/conversations/:id` (`conversation.pug`) es un visor de observabilidad, no una lista cruda de logs. `get_conversation_view` devuelve, ademas de `messages` (lista plana, la consumen tests), un arreglo `turns`, `operational_day` y `value_summary`:

- **Wrapper de conversacion**: todos los turnos van dentro de un solo contenedor `.conversation-thread` (chat window), con separador entre turnos — no tarjetas flotando.
- **Turnos**: cada mensaje inbound se agrupa con los outbound que lo respondieron (via `reply_to_message_id`); el outbound sin padre queda como turno propio (esto lo hace `get_conversation_view`). La **presentacion** la arma `present_conversation_turns` (`inspector_presenter.js`, view-model puro): la ruta la pasa como `view_turns` sin tocar `get_conversation_view`. Cada turno es una **turn-card** con barra de estado lateral (`.turn-status-bar`: verde ok / ambar baja confianza / rojo error / gris sin accion o esperando) y `.turn-body`: burbuja Usuario (izq, neutra) -> panel "Lo que entendio el agente" -> burbuja(s) Agente (der, mint) -> link "Ver trace completo".
- **Interpretacion minimalista**: por default cada turno muestra SOLO el/los label(s) de accion (`.turn-action-chip`), conectados al mensaje del usuario con una **flecha** (`.turn-actions-arrow`, SVG ↳) para que se lean como derivados de el. Los chips son discretos y **neutros** (gris muy claro `#f2f1ed`, texto gris medio) a propósito — NO verdes/mint como la burbuja del agente ni beige como la del usuario —, **sin borde**, hover sutil (`filter: brightness`). Solo los estados pending/blocked usan ámbar/rojo (son status con significado). Van **scopeados bajo `.turn-actions`** (especificidad 0,2,0) para ganarle a los estilos globales de `button`/`button:hover` (si no, el `button:hover` global los pinta verde oscuro y se ven como un blob). Al hacer click en un chip se abre un **popover** (`.turn-detail`, toggle por JS con cierre por click-fuera/Escape) con Intencion (en espanol, via `conversation_intent_label`) y `Confianza N%`. Si la accion derivo una tarea (por `output_json.tarea_id` o `internal_tasks.message_id`), el chip se muestra como combo (`.turn-action-combo`) con boton **"Ver tarea"** que abre el mismo popup iframe de tareas; cuando el turno es `human_help`, el label visible es **"Consultar humano"** aunque la action auditada siga siendo `crear_tarea`. NO se muestran intent crudo en ingles, ni `Memoria guardada`/`Embedding completado` (eran ruido constante). El detalle completo sigue en "Ver trace completo". Multi-interaccion = varios chips en el mismo turno.
- **Franja resumen** (`.conv-summary`, sobre el thread): rollup **generico** de la conversacion via `present_conversation_overview(view_turns)` — turnos, ultima accion, errores (turnos con `status_tone === "error"`) y ultima actualizacion. Aplica a CUALQUIER bot y no inventa valores.
- **Header**: breadcrumb (Dashboard › cuenta › Conversaciones › contacto), titulo "Conversacion con {contacto}", badge de status y boton "Volver al dashboard".
- **Sidebar sticky**: `Contacto y canal` (contacto, telefono del contacto, **numero del bot** y estado), `Valor capturado` y **Tareas**. No hay cards de Agente/Diagnostico/Acciones rapidas: el breadcrumb ya resuelve bot/cuenta/negocio y el sidebar debe reservarse para artefactos de valor.
- **Valor capturado**: `value_summary` agrega solo datos reales de la conversacion: tareas, ventas (`op_sales_updates` por `source_message_id`), compras (`op_purchases`), caja inicial/final desde `action_audit_logs`, inventario, notas y ultimo resumen. Si no hay dato, no muestra la fila.
- **Panel Tareas** (slim): si la conversacion generó `internal_tasks` (p. ej. `crear_tarea` ante "necesito que me llame una persona" o una ayuda humana que deriva en tarea), muestra SOLO filas clickeables (`.conv-task-row`: titulo + pill de estado) — sin descripcion ni metadata. Click abre el **detalle en popup iframe** (`/admin/tasks/:id` → `task_detail.pug`: estado + historial de quién atendió y qué pasó), y el detalle tiene un boton prominente **"Ver conversación relevante"** (`target="_top"`, navega la pestaña completa, no dentro del modal). La ruta pasa `tasks` via `list_tasks_for_conversation` (`admin_tasks_service.js`) y tambien las entrega a `present_conversation_turns` para que el chip `crear_tarea`/`Consultar humano` muestre **"Ver tarea"** dentro del turno que la genero. Cierra el loop: el chip de la interaccion en el thread tiene su contraparte accionable con seguimiento completo.
- Estilos scopeados bajo `.conversation-view` en `dashboard.css`; no afectan `message_trace.pug`. Helpers de vista (`datetime`, `money`, `date`) vienen de `app.locals` (server.js); si montas un app de test que renderice esta vista, registralos.

## Editor De Bot

`GET /inspector/bots/:bot_id` renderiza el editor del bot (`src/web/views/inspector/bot.pug`). Es Pug server-rendered con un Tab Navigator (`src/web/public/js/core/Tab_Navigator.js`) y 7 tabs en este orden: Identidad, Conversaciones, Probar, Knowledge, Canales, Interacciones, Restricciones.

- Los tabs usan `data-section` y los paneles `.tab-section[data-parent-tab][data-section]` se muestran u ocultan via `hidden`.
- Hay un sistema de iconos SVG inline con mixins de Pug (`+icon(name)`, `+section_head(icon, title, subtitle)`).
- Autosave: el form se postea a `POST /inspector/bots/:bot_id` en `input`/`change`/`blur` y muestra un timestamp proactivo tipo "Guardado 3:58pm" o "Guardado 5 jun, 4pm" (es-MX 12h). No hay boton "Guardar cambios".
- `Probar` postea a `POST /inspector/bots/:bot_id/test-message`.
- El tab `Conversaciones` lista cada conversación como una fila de inbox (`.conv-row`): título = nombre del contacto (o teléfono con `format_phone`, o "Conversación de WhatsApp" — nunca el id), preview del último mensaje (o etiqueta de intent vía `conversation_intent_label`), tiempo relativo y pill de estado. Lo arma `present_conversation_summary` (en `inspector_presenter.js`) y `get_bot_conversations` adjunta el resultado como `conversation.summary`, así el id crudo nunca se muestra.

El tab Knowledge abre el Knowledge Center en un popup con iframe y refresca el dropdown de asignar al cerrarse (detalle del patron en `frontend.md`, seccion Editor De Bot).

Las capacidades ejecutables se configuran como interacciones, cada una con su propio prompt. Los tipos ejecutables cargan un `action_id` (`buscar_negocios`, `guardar_nota`, `crear_tarea`, `generar_resumen` son los handlers reales; el resto son `stub_*`). Al guardar, `acciones_habilitadas_json` se deriva de las interacciones habilitadas que tienen `action_id`.

## Trace De Mensaje

`trace_builder.js` arma el trace con estas fuentes:

- `messages`: mensaje, raw payload y respuesta vinculada por `reply_to_message_id`.
- `parsing_results`: intent, confianza, JSON extraido y errores de validacion.
- `agent_runs`: decision del router y ejecuciones de agentes.
- `memory_documents`: status de store local/S3, embedding y metadata.
- `ai_calls`: llamadas al provider observado.
- `op_purchases`, `op_sales_updates`, `op_inventory_snapshots`, `op_business_days`, `op_daily_reports`: escrituras operativas.
- `action_audit_logs`: interacciones (acciones) que el mensaje disparo, con su status.
- `review_items`: pendientes de revision.
- `processing_events`: timeline tecnica compacta.

Si una seccion no existe, la UI muestra un estado vacio claro en vez de fallar.

UI (`message_trace.pug`): el **mensaje es el hero** (`.trace-hero`: texto grande con borde de acento + chips de intent humano / `Confianza N%` / accion). El detalle tecnico se agrupa en tabs (`#trace-tabs` con `TabNavigator`, mismo patron que el editor de bot): Interpretacion (parsing + interacciones), Memoria & AI, **Ruteo**, Operacion, Eventos, Mensaje (metadata + raw payload).

Tab **Ruteo** ("Decisión de ruteo"): siempre muestra la decisión, no un estado vacío. Si hay `router_runs` (`agent_runs` con `run_type='route'`, vía `agent_router`/`create_agent_run`) los renderiza —agente elegido, confianza, candidatos, contexto recuperado—; si no, muestra la tarjeta "Ruteo determinístico por intención" con la decisión real `intención (Confianza N%) → interacción(es)` (`.route-decision`), porque en el pipeline determinístico es la intención clasificada la que elige las interacciones. Así "Ruteo" nunca aparece vacío cuando sí hubo una decisión (antes decía "Sin routing" pese a haber elegido una interacción). Estados vacios **sutiles** (`.trace-empty`, una linea muted) en lugar de cajas dashed invasivas. Strings largos no rompen el layout: `min-width: 0` en grid items, `.mono` (monospace + `word-break`) para ids/paths/hashes, `<pre>` con scroll, `.trace-card` como fila clara (`--surface-strong`). Fechas con `datetime`, no `Date` crudo. Heading "Escrituras operativas" (el test de render lo verifica).

## Interacciones Disparadas

El edge del producto es que un mensaje puede disparar **mas de una interaccion**. El inspector lo hace visible:

- **Timeline de conversacion** (`conversation.pug`): bajo cada mensaje, un conteo (`⚡ N interacciones`, resaltado cuando N > 1) y un chip por interaccion, con color por status (verde = ejecutada, ambar = pendiente, rojo = bloqueada).
- **Trace de mensaje** (`message_trace.pug`): seccion "Interacciones disparadas" con los chips + detalle (`action_id`, status, output) por interaccion.
- **Probar bot** (resultado de `test-message`): panel "Interacciones" que muestra el `interaction_trace` completo y ordenado (recibir -> N acciones -> consultar humano -> enviar) con el conteo de interacciones disparadas.

De donde sale el dato:
- Conversacion y trace: de `action_audit_logs` por `message_id`. `compact_trace_summary` (en `inspector_presenter.js`) mapea cada `action_id` a su label via el registry (`get_action`) y expone `interactions` + `interaction_count`. `trace_builder.js` consulta `action_audit_logs` en `compact_trace_for_message` y `build_message_trace`.
- Probar bot: del `interaction_trace` que arma `bot_engine_test_service` (`build_interaction_trace`), que ahora intercala cada accion ejecutada como una interaccion entre "recibir" y "enviar".

## Processing Events

`processing_events` captura eventos tecnicos del pipeline:

- webhook recibido
- mensaje guardado
- parsing completado (resume todos los intents detectados)
- escritura operativa: **una por interaccion disparada** (`event_stage = operation_write`, con `action_id` y status)
- memory document creado
- outbound creado
- review creado
- errores de pipeline cuando aplique

Estos eventos complementan las tablas especificas y facilitan leer el flujo sin inspeccionar JSON crudo.

## Seguridad

Variables:

```env
INSPECTOR_ENABLED=true
INSPECTOR_INTERNAL_TOKEN=
```

En development puede estar abierto. En production, si `INSPECTOR_INTERNAL_TOKEN` tiene valor, las rutas requieren header `x-internal-token`. Esto no sustituye auth productiva.

## Uso Local

1. Correr `npm run db:up`.
2. Correr `npm run db:migrate`.
3. Correr `npm run db:seed`.
4. Correr `npm run dev`.
5. Simular un mensaje con `/dev/simulate-whatsapp-message`.
6. Abrir `/inspector`.

Seed crea:

- organization `YoAyudo Demo`
- account `YoAyudo Ventas`
- bot demo conectado al account demo

## Pendiente Para Produccion

- Auth real y control de acceso por organization/account/bot.
- Paginacion fuerte y filtros completos.
- Links internos para descargar/ver documentos S3 cuando haya credenciales.
- (Hecho) Vista de `bot_guardrail_events` y capability gaps: `GET /admin/guardrails`.
- Mejor correlacion de respuestas para outbounds legacy sin `reply_to_message_id`.
