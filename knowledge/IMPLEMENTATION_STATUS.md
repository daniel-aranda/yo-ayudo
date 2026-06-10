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
- Actions con handler real: `buscar_negocios` (prospeccion via Google Places), `guardar_nota`, `crear_tarea`, `generar_resumen`. El resto del registry son stubs `stub_*` de roadmap.
- Capacidades unificadas como interacciones: el editor ya no tiene una lista separada de "Acciones del bot". Todo se configura como interacciones con prompt; las ejecutables llevan `action_id` y de ahi se deriva `acciones_habilitadas_json`. El prompt compiler inyecta el prompt de cada interaccion en "# Acciones disponibles".
- Multi-ejecucion en el inbound real: un mensaje de WhatsApp puede disparar varias interacciones. `mock_provider.classify_intents` detecta multiples categorias de operacion y segmenta el texto por keyword; `route_and_dispatch_operations` (en `message_processor.js`) ejecuta cada una via `execute_action` (auditada) y `build_multi_reply` combina la respuesta. Mensajes de una sola operacion se comportan igual que antes. Ver `architecture/bot_engine.md`.
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
- Admin de bots global (`/admin/bots`, `admin_bots_service.js`): todos los bots de la plataforma (JOIN a accounts/organizations) con conteos operativos por bot —mensajes, conversaciones, errores (`action_audit_logs` failed/blocked/... + `bot_guardrail_events`) y ultima actividad— y totales arriba; filtro de periodo (24h/7d/30d). El nombre enlaza a `/inspector/bots/:id`. Sub-nav comun entre `/admin/integrations`, `/admin/interactions` y `/admin/bots`.
- Interaction settings (capa system-level, migracion `0013`, tabla `interaction_settings`, `src/interactions/interaction_settings_repository.js`): habilitar/deshabilitar una interaccion a nivel plataforma y configurar su proveedor (ej. `responder_voz` -> modelo/voz de ElevenLabs). El `action_execution_service` **bloquea** (con guardrail `interaccion_deshabilitada`) cualquier accion cuya interaccion este deshabilitada, sin importar la config por bot; la config fluye al handler (`context.interaction_config`). Es la tercera capa: catalogo estatico (codigo) -> settings system-level -> config por bot (`definition_json.interactions`).
- Dashboard server-rendered. El panel operativo de cuenta es capability-driven (deriva en vivo de `acciones_habilitadas_json` de los bots; sin cache), single-day scoped (todo el panel y la tabla de compras al mismo `business_day_id`) y state-driven (sin cards $0: "Caja final" solo si cerrado, desglose solo si hay datos). Ver `architecture/frontend.md`.
- Review queue.
- Tests unitarios e integracion del pipeline, router, memory, inspector y Bot Engine comercial.

## Migraciones

Migraciones SQL explicitas aplicadas en orden por `npm run db:migrate` (registradas en `schema_migrations`):

- `0001_initial.sql`: esquema base (modelo operativo legacy, SaaS base, memory/knowledge, routing transicional, Bot Engine configurable, diagnosticos, action audit, guardrails, templates, notas y tareas internas).
- `0002_repair_business_account_schema.sql`, `0003_repair_bot_engine_schema.sql`: reparaciones de esquema.
- `0004_message_idempotency.sql`: idempotencia inbound (dedupe por id externo de mensaje).
- `0005`–`0011`: patron expand-migrate-contract para retirar `tenant`/`branch` y unificar en organization/account (`0005_unify_operational_account`, `0006_account_prep`, `0007_account_lookup_tables`, `0008_loosen_remaining_tenant`, `0009_account_remaining_tables`, `0010_drop_tenant_branch` borra fisicamente tenant/branch, `0011_sync_bot_organization` alinea `bots.organization_id` con su account).
- `0012_integration_events.sql`: eventos de integraciones (llamadas a proveedores externos) con status y latencia.
- `0013_interaction_settings.sql`: settings system-level por interaccion (`enabled` + `config_json`, con `action_id` denormalizado).

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
- `GET /dashboard/business/:business_id/accounts/:account_id`
- `GET /review`
- `POST /review/:review_item_id/resolve`
- `GET /inspector`
- `GET /inspector/organizations`
- `GET /inspector/organizations/:organization_id`
- `GET /inspector/accounts/:account_id`
- `GET /inspector/bots/:bot_id`
- `POST /inspector/bots/:bot_id` (guardado del builder / autosave)
- `POST /inspector/bots/:bot_id/test-message`
- `GET /inspector/knowledge`
- `POST /inspector/knowledge` (texto, URL o upload a S3)
- `GET /inspector/knowledge/:source_id`
- `POST /inspector/knowledge/:source_id`
- `GET /inspector/bots/:bot_id/conversations`
- `GET /inspector/conversations/:conversation_id`
- `GET /inspector/messages/:message_id`

Admin:

- `GET /admin` (redirige a `/admin/integrations`)
- `GET /admin/integrations` (salud + eventos por integracion)
- `GET /admin/interactions` (catalogo de interacciones + uso + APIs externas + logs; `?since_hours=` y `?tab=config`)
- `GET /admin/bots` (bots globales con conteos de mensajes/conversaciones/errores y ultima actividad; `?since_hours=`)
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
- Router LLM real.
- OCR real.
- Voz/Twilio real.
- Bedrock Knowledge Bases real.
- S3 productivo probado sin credenciales reales.
- Vector DB real.
- Generacion PDF de propuesta.
- Handlers reales para la mayoria de actions; hoy solo `buscar_negocios`, `guardar_nota`, `crear_tarea` y `generar_resumen` tienen ejecución real. El resto son stubs.

## Riesgos Tecnicos

- Las rutas internas usan proteccion minima por token en produccion; necesitan auth/roles antes de pilotos reales.
- `pg-mem` puede diferir de PostgreSQL real.
- Parser mock sigue siendo basico.
- Retrieval local es heuristico, no semantico real.
- Las acciones stub no deben venderse como ejecucion real hasta tener handler/proveedor.
- El folder `src/agents` puede confundir si se usa como base para nuevas features; leer `bot_engine.md` primero.

## Comandos Verificados

- `npm test`: OK, 23 archivos, 85 tests (Vitest).
- `npm run db:migrate`: aplica las migraciones `0001`–`0011` en orden.

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
