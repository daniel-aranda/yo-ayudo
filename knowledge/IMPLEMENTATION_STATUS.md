# Implementation Status

Fecha de auditoria: 2026-05-27.

## Resumen Actual

YoAyudo corre como JavaScript ES Modules sobre Node.js, Express, PostgreSQL, Pug y Zod. No hay TypeScript, build step ni ORM.

La direccion actual es Bot Engine configurable:

- El codigo es el motor.
- Los bots son configuracion.
- Las acciones son capacidades.
- Los guardrails registran riesgos y capability gaps.

`src/agents` sigue existiendo por routing actual y compatibilidad, pero no es el centro conceptual para nuevas features.

## Implementado

- Express con `GET /health`.
- Configuracion por env vars con Zod.
- PostgreSQL con migraciones SQL explicitas.
- Seed demo local.
- Webhook WhatsApp con verificacion e inbound.
- Resolver por `phone_number_id`:
  - `whatsapp_phone_numbers`
  - active `phone_number_bot_assignments`
  - bot
  - account
  - organization
  - tenant legacy
- Fallback legacy por tenant/branch/bot_profile.
- Modelo SaaS base:
  - `organizations`
  - `accounts`
  - `whatsapp_phone_numbers`
  - `bots`
  - `phone_number_bot_assignments`
- Bots `system` y `custom`.
- Bot config:
  - `prompt_base`
  - `instrucciones_operativas`
  - `tono`
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
- `action_audit_logs`.
- `bot_guardrail_events`.
- `diagnosticos_ai` con `bots_recomendados`.
- `discovery_questions` versionadas.
- BusinessKnowledgeService y ConversationMemoryService separados por `document_family`.
- Memory local/mock, S3 stub, Bedrock embedding stub.
- Conversation Inspector interno.
- Processing events.
- Dashboard server-rendered.
- Review queue.
- Tests unitarios e integracion del pipeline, router, memory, inspector y Bot Engine comercial.

## Migraciones

El runner aplica migraciones en `src/db/migrations`:

- `0001_initial.sql`: modelo operativo inicial, WhatsApp, mensajes, operaciones, review.
- `0002_memory_agents.sql`: knowledge, memory, agent profiles/rules/runs.
- `0003_conversation_inspector.sql`: organizations, accounts, bots, processing events y `bot_id`.
- `0004_account_phone_bot_assignments.sql`: account/number links y assignments numero -> bot.
- `0005_bot_definitions.sql`: bot type, description, `definition_json`, version y creator.
- `0006_memory_knowledge_families.sql`: `document_family`, org/account/bot scopes para knowledge/memory.
- `0007_agent_routing_decisions.sql`: trazabilidad estructurada de routing legacy.
- `0008_commercial_agent_platform.sql`: base inicial de diagnósticos/action audit y columnas de acciones en bots.
- `0009_bot_engine_config.sql`: Bot Engine configurable, `bot_templates`, `discovery_questions`, prompt compilations y guardrail events.

## Endpoints Actuales

Core:

- `GET /health`
- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`
- `POST /dev/seed`
- `POST /dev/simulate-whatsapp-message`

Dashboard/review/inspector:

- `GET /dashboard`
- `GET /dashboard/tenants/:tenant_id`
- `GET /dashboard/tenants/:tenant_id/branches/:branch_id`
- `GET /dashboard/tenants/:tenant_id/branches/:branch_id/days/:date`
- `GET /review`
- `POST /review/:review_item_id/resolve`
- `GET /inspector`
- `GET /inspector/organizations`
- `GET /inspector/organizations/:organization_id`
- `GET /inspector/accounts/:account_id`
- `GET /inspector/bots/:bot_id`
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

- `solution_templates`: compatibilidad/demo legacy. `taqueria_control` sigue en seed.
- `bot_profiles` y `bot_intents`: runtime legacy.
- `src/agents`, `agent_router`, `agent_runs`, `subagents`: routing/orquestacion actual, no centro del futuro.
- `agent_routing_rules`: fallback legacy.
- `tenant` y `branch`: boundary tecnico legacy; `accounts.tenant_id` mantiene compatibilidad.

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
- S3 productivo probado.
- Vector DB real.
- Generacion PDF de propuesta.
- Handlers reales para la mayoria de actions; hoy muchos son stubs seguros.
- Idempotencia robusta por `external_message_id`.
- Aislamiento de conversation por numero/bot; hoy sigue basado en tenant/contact/channel.

## Riesgos Tecnicos

- Las rutas internas usan proteccion minima por token en produccion; necesitan auth/roles antes de pilotos reales.
- `pg-mem` puede diferir de PostgreSQL real.
- Parser mock sigue siendo basico.
- Retrieval local es heuristico, no semantico real.
- Las acciones stub no deben venderse como ejecucion real hasta tener handler/proveedor.
- El folder `src/agents` puede confundir si se usa como base para nuevas features; leer `bot_engine.md` primero.

## Comandos Verificados

- `npm test`: OK, 14 archivos, 38 tests.
- `npm run db:migrate`: aplica migraciones `0001` a `0009`.

Comandos locales disponibles:

```bash
npm install
npm test
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

No existe `npm run build` por diseno.
