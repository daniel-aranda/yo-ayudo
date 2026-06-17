# Implementation Status

Fecha de auditoria: 2026-06-09.

## Resumen Actual

YoAyudo corre como JavaScript ES Modules sobre Node.js, Express, PostgreSQL, Pug y Zod. No hay TypeScript, build step ni ORM.

La direccion actual es Bot Engine configurable:

- El codigo es el motor.
- Los bots son configuracion.
- Las acciones son capacidades.
- Las interacciones describen como el agente puede usar canales o consultar humanos.
- Los guardrails registran riesgos y capability gaps.

`src/agents` sigue existiendo por routing actual y compatibilidad, pero no es el centro conceptual para nuevas features.

## Implementado

- Express con `GET /health`.
- Configuracion por env vars con Zod.
- PostgreSQL con migraciones SQL explicitas.
- Seed demo local.
- Webhook WhatsApp con verificacion `X-Hub-Signature-256`, ack rapido (200) y procesamiento async tras el ack.
- Idempotencia inbound at-least-once por id externo de mensaje (migracion `0004`).
- Aislamiento de conversation por `bot_id` + `contact_id` (+ canal), sin tenant.
- Resolver por `phone_number_id`:
  - `whatsapp_phone_numbers`
  - active `phone_number_bot_assignments`
  - bot
  - account
  - organization
- Modelo SaaS base:
  - `organizations`
  - `accounts`
  - `whatsapp_phone_numbers`
  - `bots`
  - `phone_number_bot_assignments`
- Bots `system` y `custom`.
- Bot config:
  - `instrucciones_operativas`
  - `tono`
  - `definition_json.identity`
  - `definition_json.behavior`
  - `definition_json.knowledge_source_ids`
  - `definition_json.interactions`
  - `objetivos_json`
  - `knowledge_base_ids_json`
  - `acciones_habilitadas_json`
  - `reglas_guardrail_json`
  - `reglas_escalamiento_json`
  - `campos_requeridos_json`
  - `memoria_habilitada`
- `bot_templates` editables en DB.
- `prompt_compiler` para prompt final auditable.
- Action Registry en codigo.
- Action Executor con validacion de schema, permiso por bot, riesgo, confirmacion, audit log y guardrails.
- Actions con handler real: `buscar_negocios` (prospeccion via Google Places), `crear_contacto` (CRM), `guardar_nota`, `crear_tarea`, `generar_resumen`. El resto del registry son stubs `stub_*` de roadmap.
- **CRM (prospectos/clientes)**: `crear_contacto` es accion real de upsert con resolucion de identidad. Tabla `crm_clients` (migracion `0018`) con id interno estable + identificadores (`curp`/`phone`/`instagram`/`email`) y clave de negocio derivada (`client_key`/`client_key_type`) por prioridad CURP > telefono > instagram > email > id. Repo `src/crm/crm_repository.js` (dedupe en JS), parser compartido `src/crm/lead_text_parser.js`. Captura por inbound con el intent `lead_capture` (mock `classify_intents`/`extract_lead_capture`, `INTENT_TO_OPERATION_ACTION.lead_capture = crear_contacto`); si falta telefono lo hereda del remitente y enlaza el contacto/conversacion. Interaccion "Guardar prospecto o cliente" en el editor (icono `id_card`) y panel "Valor capturado" del visor de conversacion (`value_summary.crm`) con **filas clickeables** + chip de turno **"Ver prospecto"** que abren el detalle en popup iframe (`GET /inspector/crm/:client_id` → `crm_client_detail.pug`, mismo patron que "Ver tarea"). La instrucción de la interacción indica **pedir el nombre completo** si detecta un prospecto y no lo conoce (guarda igual con `display_name` null; un guardado posterior con el nombre actualiza el mismo registro). Seeds: bot comercial y de prospectos la traen habilitada + conversaciones demo dev-only `seed_crm_demo_conversation` (operador registra prospecto), `seed_inbound_lead_conversation` (el **lead es el remitente**, llega por campaña preguntando, el bot lo captura y deja tarea), `seed_lead_without_name_conversation` (el lead llega **sin nombre**, el bot lo pregunta y al recibirlo actualiza el mismo prospecto) y `seed_prospeccion_venta_conversation` (**prospección para vender YoAyudo**: un vendedor pide prospectos por zona, el bot propone 3 con `buscar_negocios` y al elegir guarda ese negocio como prospecto con `crear_contacto` + tarea). **Vista CRM consolidada**: `GET /dashboard/accounts/:id/crm` muestra los prospectos/clientes en un **tablero de 4 etapas base** (`CRM_BASE_STAGES`: nuevo/interesado/ganado/perdido; alias legacy `cerrado_ganado`→`ganado`). Las **categorías custom** (cualquier `pipeline_status` no-base) se pliegan bajo **Interesado** con un **dropdown** que solo aparece si la cuenta tiene custom (`get_account_crm_view`). El tablero es **drag & drop** (arrastrar una tarjeta a otra columna persiste su etapa vía `update_crm_client_stage`; alternativa accesible: select de etapa en el detalle). El detalle scopeado al dashboard tiene botón **"Ver conversación con el prospecto"**. Entrada desde la métrica "Prospectos". Falta: kanban con etapas configurables/ocultables por cuenta. Ver `architecture/crm.md`.
- Capacidades unificadas como interacciones: el editor ya no tiene una lista separada de "Acciones del bot". Todo se configura como interacciones con prompt; las ejecutables llevan `action_id` y de ahi se deriva `acciones_habilitadas_json`. El prompt compiler inyecta el prompt de cada interaccion en "# Acciones disponibles".
- Multi-ejecucion en el inbound real: un mensaje de WhatsApp puede disparar varias interacciones. `classify_intents` detecta multiples categorias de operacion y segmenta el texto; `route_and_dispatch_operations` (en `message_processor.js`) ejecuta cada una via `execute_action` (auditada) y `build_multi_reply` combina la respuesta. Mensajes de una sola operacion se comportan igual que antes. Ver `architecture/bot_engine.md`.
- Clasificacion de intenciones por AI en el inbound, **on por default para todos los bots** (no opt-in; el selector de Modelo IA ya implica AI): `openai_provider.classify_intents` (override) llama al modelo para multi-intent de lenguaje libre. `message_processor` siempre pide AI; el provider decide capacidad (OpenAI con key → AI; mock o sin key → keywords). En error de AI degrada a deterministico y registra el fallo en `ai_calls`. `use_ai_classification` es control interno AI/fallback (el reintento lo pone en false), no config de bot. Extraccion de campos sigue determinista.
- Visibilidad de interacciones disparadas en el inspector: chips por mensaje en la conversacion (`⚡ N interacciones`), seccion en el trace de mensaje, y panel "Interacciones" en Probar bot. Datos de `action_audit_logs` (via `compact_trace_summary` / `trace_builder.js`) y del `interaction_trace` de `bot_engine_test_service`.
- Picker de interacciones por popup: agregar interacciones al bot usa un popup de seleccion multiple con descripciones, sobre el componente agnostico `Popup` (`src/web/public/js/core/Popup.js`).
- Editor de bot server-rendered con tab navigator (Identidad, Conversaciones, Probar, Knowledge, Canales, Interacciones, Restricciones), iconos SVG inline via mixins de Pug y autosave proactivo (`POST /inspector/bots/:bot_id`, indicador "Guardado 3:58pm").
- `action_audit_logs`.
- `bot_guardrail_events`.
- `internal_notes` e `internal_tasks` para preflight founder sin integraciones externas.
- `diagnosticos_ai` con `bots_recomendados`.
- `discovery_questions` versionadas.
- BusinessKnowledgeService y ConversationMemoryService separados por `document_family`.
- Knowledge Center con texto, URL y upload de documentos a S3 via `.env`.
- Memory local/mock, S3 memory store stub, Bedrock embedding stub.
- Conversation Inspector interno.
- Processing events.
- Observabilidad de APIs externas: toda llamada a AI (`ai_calls`, con latencia) y a proveedores (`integration_events`, ahora con latencia en google_places/elevenlabs/whatsapp) se registra y se mide; cada ejecucion de accion queda en `action_audit_logs`.
- Admin de interacciones (`/admin/interactions`, `admin_interactions_service.js`): catalogo + uso real (usos/OK/error/ultimo desde `action_audit_logs`), APIs externas (AI + proveedores, OK/error/latencia), logs recientes unificados, **filtro de periodo** (24h/7d/30d) y tab **Configuración**.
- Admin de bots global (`/admin/bots`, `admin_bots_service.js`): todos los bots de la plataforma (JOIN a accounts/organizations) con conteos operativos por bot —mensajes, conversaciones, errores (`action_audit_logs` failed/blocked/... + `bot_guardrail_events`) y ultima actividad— y totales arriba; filtro de periodo (24h/7d/30d). El nombre enlaza a `/inspector/bots/:id`. La columna **Negocio/cuenta** se oculta en la vista `type=system` (los bots de sistema son de plataforma, clonables a cualquier cuenta) y en vistas mixtas las filas de sistema muestran "Plataforma". `get_bots_admin_view` acepta `account_id` opcional para scopear (lo reusa la home del inspector "por bots"). Sub-nav comun entre `/admin/integrations`, `/admin/interactions`, `/admin/bots`, `/admin/businesses`, `/admin/conversations` y `/admin/guardrails`.
- Admin de Conversaciones (`/admin/conversations`, `admin_conversations_service.js`): conversaciones globales (cualquier cuenta) con filtros (cuenta/bot/estado/canal + busqueda de contacto, auto-submit) y rollup (total, esperando humano, pendientes de review). Reusa `present_conversation_summary` del inspector; cada fila abre el visor `/inspector/conversations/:id`. Enriquecimiento por conversacion (N+1), cap 100.
- Tareas internas (`admin_tasks_service.js`): bandeja accionable de `internal_tasks` (lo que un humano tiene que hacer). Las crea el bot con la interacción `crear_tarea` (`metadata_json.source = bot_engine_action`) o la conversión de un guardrail (`source = guardrail_event`); antes se escribían y **nadie las veía**.
  - **Bandeja** (admin global `/admin/tasks`; por cuenta `/dashboard/accounts/:account_id/tasks` — misma vista `admin/tasks.pug` parametrizada por `base_path`/`scoped`): filtros (estado/cuenta/bot + búsqueda, auto-submit), rollup (pendiente/en progreso/hecha). Fila compacta (sin descripción —va en "Ver tarea"—, sin columna "Vence", "Creada" en formato corto): **estado como dropdown** (Pendiente/En progreso/Hecha/**Cancelada**), **responsable inline editable** (`POST .../assign`), e **icono de conversación** que abre la conversación que originó la tarea en popup.
  - **Detalle por tarea** (`admin/task_detail.pug`, en página o **popup iframe** desde la bandeja y el visor de conversación): estado + **historial de seguimiento** ("quién atendió y qué pasó") desde `task_updates`, con form para **agregar actualización** (actor + nota + cambio de estado opcional) que también setea `assigned_to`. El toggle de estado loguea un update también.
  - **Account-level**: los usuarios del negocio ven/atienden las tareas de SU cuenta (scopeado por `account_id`, 404 cross-account); el dashboard de cuenta tiene una tarjeta "Tareas abiertas".
  - Cierra el loop en ambos sentidos: el visor de conversación muestra `Valor capturado` + un panel "Tareas" con link al detalle; además, el chip del turno muestra **"Ver tarea"** cuando hay una tarea derivada. Si el turno venía de `human_help`, el label visible del combo es **"Consultar humano"** aunque la action auditada siga siendo `crear_tarea`. Cada tarea enlaza a su conversación.
- Admin de Negocios/Cuentas (`/admin/businesses`, `admin_businesses_service.js`): lista todos los negocios (organizations) y sus cuentas (accounts) en cualquier estado, con conteos por cuenta (bots/canales/conversaciones; el conteo de bots incluye TODOS los status para que un draft recien creado sea visible). Soporta **busqueda** (`?q=` por nombre/slug, case-insensitive) y **paginacion** (`?page=`, `?per_page=` default 100, clamp 10–500; filtro+slice en JS sobre organizations, pg-mem-safe), con colapso/expansion por negocio y global (client-side). Nombre de negocio enlaza a `/dashboard/business/:id` y cada cuenta a su dashboard. Permite **crear negocio**, **crear cuenta**, **crear usuario** de negocio (login) y **pausar/archivar/activar** negocio/cuenta (status `active`/`paused`/`archived`). Los **bots se crean solo desde el dashboard de cuenta** ("Agregar bot", con tabs Bot Nuevo / preconfigurado) — aquí no hay alta de bot. Repo `src/organizations/organization_repository.js` (`create_organization`, `set_organization_status`, `set_account_status`, `slugify`) + `upsert_account`.
- **Auth opcional por negocio** (`src/auth/`, flag `AUTH_ENABLED`, default OFF = cero cambio de comportamiento): login con email+password en `/login` (scrypt nativo de `node:crypto`, cookie HMAC firmada `yoayudo_session`, sin tabla de sesiones — revocar = cambiar `SESSION_SECRET` o desactivar el usuario). Politica (`auth_middleware.js`): el **platform owner** (`is_platform_owner`) ve todo; un **usuario de negocio** solo `/dashboard/business/:su_organization_id` y subrutas — cualquier otra ruta lo regresa a su negocio, y el topbar le esconde Inspector/Review/Admin (solo ve Dashboard + Salir). Publicos: `/login`, `/logout`, `/health`, `/public/`, `/webhooks/` (Meta) e `/internal/` (token propio). En production con auth activo, `SESSION_SECRET` es obligatorio (throw al firmar). Seed crea `owner@yoayudo.local`/`yoayudo-owner` (owner global) y `demo@yoayudo.local`/`yoayudo-demo` (usuario del negocio demo). Esto es control de acceso founder-stage, no auth productivo completo (sin reset de password, sin invitaciones, sin rate-limit de login).
- Navegacion dashboard explicita Negocio → Cuenta: `/dashboard/business/:id` YA NO redirige a la cuenta primaria; muestra la pagina del negocio con sus cuentas. El home y el visor de conversacion enlazan al negocio; la pagina de cuenta lleva breadcrumb `Dashboard › Negocio › Cuenta` y eyebrow "Cuenta · Negocio: X". Ver `architecture/frontend.md`.
- Navegacion scopeada por cuenta: **la cuenta es el único scope** (el negocio se deriva de ella, no viaja en la URL). Cuando hay una cuenta en contexto — ruta `/dashboard/accounts/:id` o `/inspector/accounts/:id`, o `?account=` (Review) — el top nav se queda en esa cuenta: Dashboard → `/dashboard/accounts/:id`, Inspector → `/inspector/accounts/:id` (path), Review → `/review?account=:id`, Admin siempre global. Lo deriva el middleware `navigation_context` (`src/app/navigation_middleware.js`) `→ nav_context = { account_id }`; las rutas ya no setean `nav_context` a mano. Review (vista global) muestra `.scope-banner` con link de escape; el inspector no (su home siempre es por cuenta). Ver `architecture/frontend.md`.
- Interaction settings (capa system-level, migracion `0013`, tabla `interaction_settings`, `src/interactions/interaction_settings_repository.js`): habilitar/deshabilitar una interaccion a nivel plataforma y configurar su proveedor (ej. `responder_voz` -> modelo/voz de ElevenLabs). El `action_execution_service` **bloquea** (con guardrail `interaccion_deshabilitada`) cualquier accion cuya interaccion este deshabilitada, sin importar la config por bot; la config fluye al handler (`context.interaction_config`). Es la tercera capa: catalogo estatico (codigo) -> settings system-level -> config por bot (`definition_json.interactions`).
- Dashboard server-rendered. El panel operativo de cuenta es capability-driven (deriva en vivo de `acciones_habilitadas_json` de los bots; sin cache), single-day scoped (todo el panel y la tabla de compras al mismo `business_day_id`) y state-driven (sin cards $0: "Caja final" solo si cerrado, desglose solo si hay datos). Ver `architecture/frontend.md`.
- Review queue.
- Tests unitarios e integracion del pipeline, router, memory, inspector, auth, clasificacion por AI, guardrails admin, auto-aprendizaje y Bot Engine comercial. **152 tests / 30 archivos, todos verdes** (Vitest sobre pg-mem). Incluye `tests/integration/crm_clients.test.js` (identidad/clave de negocio, dedupe cross-canal, ciclo lead→cliente, captura sin nombre→completar nombre, ejecución por test-message e inbound, guardrail, value_summary, chip "Ver prospecto" y render del detalle CRM). Incluye `tests/integration/review_queue.test.js` (scope + auto-learn) y, en `operational_dashboard.test.js`, el scope account-only del top nav y el redirect legacy `/dashboard/business/:b/accounts/:a[/...]` → `/dashboard/accounts/:a`.

## Migraciones

Migraciones SQL explicitas aplicadas en orden por `npm run db:migrate` (registradas en `schema_migrations`):

- `0001_initial.sql`: esquema base (modelo operativo legacy, SaaS base, memory/knowledge, routing transicional, Bot Engine configurable, diagnosticos, action audit, guardrails, templates, notas y tareas internas).
- `0002_repair_business_account_schema.sql`, `0003_repair_bot_engine_schema.sql`: reparaciones de esquema.
- `0004_message_idempotency.sql`: idempotencia inbound (dedupe por id externo de mensaje).
- `0005`–`0011`: patron expand-migrate-contract para retirar `tenant`/`branch` y unificar en organization/account (`0005_unify_operational_account`, `0006_account_prep`, `0007_account_lookup_tables`, `0008_loosen_remaining_tenant`, `0009_account_remaining_tables`, `0010_drop_tenant_branch` borra fisicamente tenant/branch, `0011_sync_bot_organization` alinea `bots.organization_id` con su account).
- `0012_integration_events.sql`: eventos de integraciones (llamadas a proveedores externos) con status y latencia.
- `0013_interaction_settings.sql`: settings system-level por interaccion (`enabled` + `config_json`, con `action_id` denormalizado).
- `0014_instagram_channels.sql`: Instagram como canal de primera clase, espejo de WhatsApp — `instagram_accounts` (org/account, `external_account_id` UNIQUE, `username`) + `instagram_account_bot_assignments` (bot↔cuenta, `UNIQUE(instagram_account_id, active_key)`). Repo `src/channels/instagram/instagram_account_repository.js` (`upsert_instagram_account`, `assign_bot_to_instagram_account`). El bot semilla principal queda asignado a una cuenta IG (`@yoayudo.ventas`); la pestaña Canales lo edita/guarda igual que WhatsApp (`sync_instagram_channel_from_body`).
- `0015_agent_runs_routing_columns.sql`: re-aplica idempotente (`ADD COLUMN IF NOT EXISTS`) las columnas de decisión de ruteo en `agent_runs` (`selected_agent_*`, `routing_reason`, `routing_confidence`, `routing_candidates_json`, `used_context_summary_json`, `handoff_*`). Están en `0001` vía ALTER, pero DBs que aplicaron un `0001` viejo (antes de esas columnas) nunca las recibieron y no re-corren `0001`; sin ellas `create_agent_run` falla. Brinca DBs frescas/pg-mem (ya las tienen).
- `0016_users_auth.sql`: login en la tabla `users` legacy — agrega `organization_id` (FK a organizations), `password_hash` (scrypt, formato `scrypt:salt:hash`) e `is_platform_owner`. La unicidad de email se valida en `src/auth/user_repository.js` (emails normalizados a minúsculas), no en DB.
- `0017_task_activity.sql`: `internal_tasks.assigned_to` + tabla `task_updates` (seguimiento de tareas: quién atendió y qué pasó).
- `0018_crm_clients.sql`: tabla `crm_clients` para CRM (prospectos/clientes). Id interno estable + identificadores (`curp`/`phone`/`instagram`/`email`), clave de negocio derivada (`client_key`/`client_key_type`), `kind`/`pipeline_status` y links opcionales a contact/bot/conversation. Indices por identificador para resolucion; dedupe en JS (sin unicos parciales, pg-mem-safe). Ver `architecture/crm.md`.

El modelo de datos ya no tiene `tenant` ni `branch`: organization (negocio) -> account (cuenta) -> bot.

## Endpoints Actuales

Core:

- `GET /health`
- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`
- `POST /dev/seed`
- `POST /dev/simulate-whatsapp-message`

Dashboard/review/inspector:

- `GET /dashboard`
- `GET /dashboard/business/:business_id`
- `GET /dashboard/accounts/:account_id` (dashboard de cuenta; el negocio se deriva. Legacy `GET /dashboard/business/:b/accounts/:a[/...]` → 301 a la canónica account-only)
- `GET /review` (`?account=` filtra los pendientes a una cuenta; muestra `.scope-banner` + link de escape)
- `POST /review/:review_item_id/resolve` (reenvía `account` para preservar el scope; con `learn` marcado guarda la resolución como business_knowledge reusable — auto-aprendizaje, ver `architecture/memory.md`)
- `GET /inspector` (NO renderea: el inspector siempre es por cuenta. `?account=` legacy redirige a `/inspector/accounts/:id`; sin cuenta redirige a `/dashboard`)
- `GET /inspector/organizations` → redirige a `/dashboard`
- `GET /inspector/organizations/:organization_id`
- `GET /inspector/accounts/:account_id` (única home "Inspector por bots", scopeada a la cuenta vía path; reusa `get_bots_admin_view`; sin vista global ni scope-banner)
- `GET /inspector/bots/:bot_id`
- `POST /inspector/bots/:bot_id` (guardado del builder / autosave)
- `POST /inspector/bots/:bot_id/test-message`
- `GET` / `POST /inspector/accounts/:account_id/knowledge` (Knowledge Center canonico, scopeado a la cuenta; texto, URL o upload a S3; organization se deriva de la cuenta)
- `GET` / `POST /inspector/accounts/:account_id/knowledge/:source_id`
- `GET` / `POST /inspector/knowledge[/:source_id]` (legacy/global: con `?account_id=` o fuente con `account_id` redirige a la ruta con cuenta en el path; sin cuenta lista/edita global)
- `GET /inspector/bots/:bot_id/conversations`
- `GET /inspector/accounts/:account_id/conversations/:conversation_id` (visor scopeado a la cuenta; la URL plana `GET /inspector/conversations/:conversation_id` redirige a la canónica)
- `GET /inspector/messages/:message_id`
- `GET /inspector/crm/:client_id` (detalle de prospecto/cliente CRM; popup iframe desde el visor de conversación)

Admin:

- `GET /admin` (redirige a `/admin/integrations`)
- `GET /admin/integrations` (salud + eventos por integracion)
- `GET /admin/interactions` (catalogo de interacciones + uso + APIs externas + logs; `?since_hours=` y `?tab=config`)
- `GET /admin/bots` (bots globales con conteos; `?since_hours=`, `?q=` busqueda, `?type=system|custom|all` default system, `?archived=1` para ver archivados)
- `POST /admin/bots/:bot_id/status` (activar/pausar-a-draft/archivar) · `POST /admin/bots/:bot_id/clone` (copia custom en draft en su cuenta, redirige al editor)
- `GET /admin/conversations` (conversaciones de TODAS las cuentas, filtrable por `?account_id=`/`?bot_id=`/`?status=`/`?channel=`/`?q=` busqueda de contacto; cada fila enlaza a `/inspector/conversations/:id`)
- `GET /admin/guardrails` (guardrail events / capability gaps filtrable por `?account_id=`/`?bot_id=`/`?tipo=`/`?action_id=`/`?status=`; rollup de gaps por accion) · `POST /admin/guardrails/:event_id/task` (convertir evento en tarea interna)
- `GET /admin/tasks` (bandeja de `internal_tasks` filtrable por `?status=`/`?account_id=`/`?bot_id=`/`?q=`; rollup por estado) · `GET /admin/tasks/:task_id` (detalle + historial, sirve standalone o en popup iframe) · `POST /admin/tasks/:task_id/status` (toggle de estado; `return_to` opcional) · `POST /admin/tasks/:task_id/update` (agregar actualización: actor + nota + estado opcional)
- `GET /dashboard/accounts/:account_id/tasks` + `/tasks/:task_id` + `POST .../tasks/:task_id/status` + `POST .../tasks/:task_id/update` (módulo de tareas a nivel cuenta, scopeado por cuenta con `dashboard_auth`)
- `GET /dashboard/accounts/:account_id/crm` (página CRM: prospectos/clientes en tablero por etapa, **drag & drop**) + `GET /dashboard/accounts/:account_id/crm/:client_id` (detalle scopeado al dashboard, con botón "Ver conversación" + select de etapa) + `POST /dashboard/accounts/:account_id/crm/:client_id/stage` (mover de etapa: drop del tablero o select del detalle). Entrada desde la métrica "Prospectos". Ver `architecture/crm.md`.
- `POST /dashboard/accounts/:account_id/tasks/:task_id/assign` y `POST /admin/tasks/:task_id/assign` (asignar/reasignar responsable de una tarea, con bitácora; `update_task_assignee`).
- `GET /admin/businesses` (negocios + cuentas + usuarios con conteos y estado; `?q=` busqueda, `?page=`/`?per_page=` paginacion default 100)
- `POST /admin/businesses` (crear negocio) · `POST /admin/businesses/:id/status` (pausar/archivar/activar)
- `POST /dashboard/accounts/:account_id/bots` (única alta de bot: desde el dashboard de cuenta — custom con `name`, o clon de bot de sistema con `source_bot_id`; redirect a `#panel-bots`)
- `POST /dashboard/accounts/:account_id/channels` (alta de canal WhatsApp: `display_phone_number` + `phone_number_id` de Meta + `bot_id` opcional para asignarlo; el negocio se deriva de la cuenta; bloquea `phone_number_id` ya dado de alta en otra cuenta; `channel_type` != whatsapp → 400, Instagram llegará vía OAuth)
- `POST /admin/users` (crear usuario de negocio para login; valida email único y contraseña mínima)
- `GET`/`POST /login` · `POST /logout` (auth opcional, ver seccion Auth)
- `POST /admin/accounts` (crear cuenta) · `POST /admin/accounts/:id/status` (pausar/archivar/activar)
- `POST /admin/interactions/settings` (enable/disable + config por interaccion)

Internas Bot Engine/comercial:

- `GET /internal/bot-templates`
- `GET /internal/bot-templates/:template_id`
- `GET /internal/actions`
- `GET /internal/actions/:action_id`
- `POST /internal/action-executions`
- `GET /internal/action-audit-logs`
- `GET /internal/guardrail-events`
- `GET /internal/discovery-interview`
- `GET /internal/bots`
- `POST /internal/bots`
- `GET /internal/bots/:bot_id`
- `PATCH /internal/bots/:bot_id`
- `POST /internal/bots/:bot_id/actions/:action_id`
- `POST /internal/bots/:bot_id/compile-prompt`
- `POST /internal/bots/:bot_id/test-message`
- `POST /internal/diagnosticos-ai`
- `GET /internal/diagnosticos-ai`
- `GET /internal/diagnosticos-ai/:diagnostico_id`
- `PATCH /internal/diagnosticos-ai/:diagnostico_id`
- `POST /internal/diagnosticos-ai/:diagnostico_id/status`
- `POST /internal/diagnosticos-ai/:diagnostico_id/propuesta-preliminar`

## Templates Seed Editables

Viven en `bot_templates`, no en runtime:

- `recepcionista_ai`
- `seguimiento_ventas`
- `agenda_facil`
- `factura_facil`
- `documentos_facil`
- `cobranza_suave`

No hay clases ni branches de codigo para estos templates.

## Legacy / Transicional

- `solution_templates`: compatibilidad tecnica del runtime legacy.
- `bot_profiles` y `bot_intents`: runtime legacy.
- `src/agents`, `agent_router`, `agent_runs`, `subagents`: routing/orquestacion actual, no centro del futuro.
- `agent_routing_rules`: fallback legacy.
- `tenant` y `branch`: eliminados (migracion `0010_drop_tenant_branch.sql`). El modelo es organization -> account -> bot.

## No Funciona Todavia

- WhatsApp Cloud API real end-to-end probado con Meta.
- Auth productiva y roles.
- UI comercial avanzada para vendedores.
- UI de alta completa organization/account/numero/bot.
- Builder LLM de bots desde lenguaje natural.
- Router LLM real (el inbound ya clasifica intenciones por AI opt-in, pero el routing entre agentes/subagentes sigue determinista).
- OCR real.
- Voz/Twilio real.
- Bedrock Knowledge Bases real.
- S3 productivo probado sin credenciales reales.
- Vector DB real.
- Generacion PDF de propuesta.
- Handlers reales para la mayoria de actions; hoy `buscar_negocios`, `crear_contacto` (CRM), `guardar_nota`, `crear_tarea`, `generar_resumen` y las operativas (`registrar_*`/`generar_reporte_dia`) tienen ejecución real. El resto son stubs.

## Riesgos Tecnicos

- Las rutas internas usan proteccion minima por token en produccion; necesitan auth/roles antes de pilotos reales.
- `pg-mem` puede diferir de PostgreSQL real.
- Parser mock sigue siendo basico.
- Retrieval local es heuristico, no semantico real.
- Las acciones stub no deben venderse como ejecucion real hasta tener handler/proveedor.
- El folder `src/agents` puede confundir si se usa como base para nuevas features; leer `bot_engine.md` primero.

## Comandos Verificados

- `npm test`: OK, 30 archivos, 152 tests (Vitest).
- `npm run db:migrate`: aplica las migraciones `0001`–`0018` en orden.

Comandos locales disponibles:

```bash
npm install
npm test
npm run db:up
npm run db:migrate
npm run db:seed
npm run demo:bot-engine
npm run dev
```

No existe `npm run build` por diseno.
