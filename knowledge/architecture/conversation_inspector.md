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

- `GET /inspector` (`?account=<id>` → scopea la home a esa cuenta: `get_inspector_home(pool, { account_id })` filtra los bots a la cuenta y devuelve `account` para el header + `.scope-banner`; sin `account` lista todos los bots activos)
- `GET /inspector/organizations`
- `GET /inspector/organizations/:organization_id`
- `GET /inspector/accounts/:account_id`
- `GET /inspector/bots/:bot_id` (editor; vista admin/plataforma)
- `GET /inspector/bots/:bot_id/business/account` (mismo editor, framing con contexto de cuenta; ver `frontend.md`)
- `POST /inspector/bots/:bot_id` (guardado/autosave del editor de bot)
- `POST /inspector/bots/:bot_id/test-message`
- `GET /inspector/bots/:bot_id/conversations`
- `GET /inspector/conversations/:conversation_id`
- `GET /inspector/messages/:message_id`
- `GET` / `POST /inspector/accounts/:account_id/knowledge` (Knowledge Center canonico con la cuenta en el path, igual que el resto de rutas; POST con upload a S3; la organization se deriva de la cuenta — no viaja en la URL)
- `GET` / `POST /inspector/accounts/:account_id/knowledge/:source_id` (detalle; 404 si la fuente no pertenece a la cuenta)
- `GET` / `POST /inspector/knowledge[/:source_id]` (legacy/global: `?account_id=` redirige a la ruta con cuenta en el path; el detalle plano redirige usando el `account_id` de la fuente; sin cuenta sirve la vista global sin scope)

Todas son server-rendered con Pug. No hay SPA ni librerias pesadas.

## Breadcrumb (navegacion)

Todas las paginas del flujo (account dashboard, editor de bot, conversaciones, conversacion, message trace, actividad) usan el mixin compartido `+breadcrumb(items)` definido en `layout.pug` (`items` = `[{ label, href? }]`; el ultimo o cualquiera sin `href` es la pagina actual). Jerarquia consistente: `Dashboard › {cuenta} › {bot} › Conversaciones › {contacto} › Trace`, de modo que desde cualquier pagina se puede volver al bot y al dashboard. Para que el breadcrumb tenga el nombre de cuenta/bot, `get_bot_conversations` devuelve tambien `bot` y `get_bot_activity_view` usa `get_bot_with_definition` (incluye `account_name`/`organization_name`).

## Vista De Conversacion

`GET /inspector/conversations/:id` (`conversation.pug`) es un visor de observabilidad, no una lista cruda de logs. `get_conversation_view` devuelve, ademas de `messages` (lista plana, la consumen tests), un arreglo `turns` y un `operational_day`:

- **Wrapper de conversacion**: todos los turnos van dentro de un solo contenedor `.conversation-thread` (chat window), con separador entre turnos — no tarjetas flotando.
- **Turnos**: cada mensaje inbound se agrupa con los outbound que lo respondieron (via `reply_to_message_id`); el outbound sin padre queda como turno propio (esto lo hace `get_conversation_view`). La **presentacion** la arma `present_conversation_turns` (`inspector_presenter.js`, view-model puro): la ruta la pasa como `view_turns` sin tocar `get_conversation_view`. Cada turno es una **turn-card** con barra de estado lateral (`.turn-status-bar`: verde ok / ambar baja confianza / rojo error / gris sin accion o esperando) y `.turn-body`: burbuja Usuario (izq, neutra) -> panel "Lo que entendio el agente" -> burbuja(s) Agente (der, mint) -> link "Ver trace completo".
- **Interpretacion minimalista**: por default cada turno muestra SOLO el/los label(s) de accion (`.turn-action-chip`), conectados al mensaje del usuario con una **flecha** (`.turn-actions-arrow`, SVG ↳) para que se lean como derivados de el. Los chips son discretos y **neutros** (gris muy claro `#f2f1ed`, texto gris medio) a propósito — NO verdes/mint como la burbuja del agente ni beige como la del usuario —, **sin borde**, hover sutil (`filter: brightness`). Solo los estados pending/blocked usan ámbar/rojo (son status con significado). Van **scopeados bajo `.turn-actions`** (especificidad 0,2,0) para ganarle a los estilos globales de `button`/`button:hover` (si no, el `button:hover` global los pinta verde oscuro y se ven como un blob). Al hacer click en un chip se abre un **popover** (`.turn-detail`, toggle por JS con cierre por click-fuera/Escape) con Intencion (en espanol, via `conversation_intent_label`) y `Confianza N%`. NO se muestran intent crudo en ingles, ni `Memoria guardada`/`Embedding completado` (eran ruido constante). El detalle completo sigue en "Ver trace completo". Multi-interaccion = varios chips en el mismo turno.
- **Franja resumen** (`.conv-summary`, sobre el thread) y **Diagnostico** (panel sticky en el sidebar): rollup **generico** de la conversacion via `present_conversation_overview(view_turns)` — turnos, ultima accion, errores (turnos con `status_tone === "error"`), acciones exitosas, ultima intencion (solo en Diagnostico) y ultima actualizacion. Aplica a CUALQUIER bot: **no** mete metricas de dominio (venta/caja). Esas son operativas y de cuenta, viven en el dashboard del negocio (enlazado desde Acciones rapidas), NO en el visor de conversacion (que puede abarcar varios dias y no asume capacidad de ventas). Valores no inventados: si falta el dato, "No disponible".
- **Header**: breadcrumb (Dashboard › cuenta › Conversaciones › contacto), titulo "Conversacion con {contacto}", badge de status y boton "Volver al dashboard".
- **Sidebar sticky**: Contacto (con copiar telefono), Agente (Bot/Cuenta/Negocio son enlaces `.entity-link` a su pagina: `/inspector/bots/:id`, dashboard de cuenta y dashboard de negocio), Diagnostico y Acciones rapidas. (Se quito "Estado del dia": era account-level + single-day y asumia capacidad de ventas/caja; lo operativo vive en el dashboard, no por conversacion.)
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
