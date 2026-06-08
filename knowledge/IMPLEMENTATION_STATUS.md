# Implementation Status

Fecha de auditoria: 2026-06-08.

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
- Dashboard server-rendered.
- Review queue.
- Tests unitarios e integracion del pipeline, router, memory, inspector y Bot Engine comercial.

## Migraciones

Migraciones SQL explicitas aplicadas en orden por `npm run db:migrate` (registradas en `schema_migrations`):

- `0001_initial.sql`: esquema base (modelo operativo legacy, SaaS base, memory/knowledge, routing transicional, Bot Engine configurable, diagnosticos, action audit, guardrails, templates, notas y tareas internas).
- `0002_repair_business_account_schema.sql`, `0003_repair_bot_engine_schema.sql`: reparaciones de esquema.
- `0004_message_idempotency.sql`: idempotencia inbound (dedupe por id externo de mensaje).
- `0005`–`0011`: patron expand-migrate-contract para retirar `tenant`/`branch` y unificar en organization/account (`0005_unify_operational_account`, `0006_account_prep`, `0007_account_lookup_tables`, `0008_loosen_remaining_tenant`, `0009_account_remaining_tables`, `0010_drop_tenant_branch` borra fisicamente tenant/branch, `0011_sync_bot_organization` alinea `bots.organization_id` con su account).

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

- `npm test`: OK, 17 archivos, 57 tests (Vitest).
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
