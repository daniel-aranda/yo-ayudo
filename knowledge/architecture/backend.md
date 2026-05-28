# Arquitectura Backend

## Objetivo

El backend recibe mensajes de WhatsApp, resuelve numero/account/organization/bot asignado y conserva compatibilidad con tenant/sucursal/bot profile. Despues guarda raw payloads, clasifica intención, valida datos parseados, enruta a un subagente delgado, ejecuta handlers operativos, genera memoria normalizada y responde de forma corta.

## Capas

### App

Ubicación: `src/app`

- `server.js`: crea Express, registra rutas y maneja errores.
- `config.js`: carga variables de entorno con Zod.
- `dev_doctor.js`: valida sandbox local antes de `npm run dev`.

### DB

Ubicación: `src/db`

- `client.js`: pool PostgreSQL.
- `migrations/`: SQL aplicado por `npm run db:migrate`.
- `migrate.js`: runner de migraciones.
- `seed.js`: datos demo.

### Engine Común

Ubicación: `src/engine`

- `message_processor.js`: pipeline inbound.
- `message_intent_parser.js`: parsing validado por intent.
- `operation_dispatcher.js`: despacha a handlers operativos.
- `response_builder.js`: respuestas cortas.
- `operation_schemas.js`: Zod schemas de frontera.

### Operaciones

Ubicación: `src/operations`

- `business_days`
- `purchases`
- `sales_updates`
- `inventory`
- `daily_closes`
- `daily_notes`
- `reports`

Estas piezas no deben conocer marcas de clientes.

### Canales

Ubicación: `src/channels/whatsapp`

- webhook routes
- parsing de payload WhatsApp
- cliente WhatsApp
- resolver de identidad por `phone_number_id`

El resolver nuevo prioriza `phone_number_bot_assignments`:

```text
phone_number_id -> whatsapp_phone_numbers -> active assignment -> bot -> account -> organization -> tenant
```

Si un numero todavia no tiene assignment activo, el resolver conserva fallback legacy por `tenant`, `branch`, `bot_profile` y `bot` para no romper datos existentes.

### AI

Ubicación: `src/ai`

- `model_gateway.js`
- `mock_provider.js`
- `bedrock_provider.js` como stub
- `observed_provider.js`

### Memory

Ubicación: `src/memory`

- `memory_document_service.js`: crea documentos normalizados, hash, store y embedding.
- `conversation_memory_service.js`: registra y recupera memoria conversacional con `document_family = conversation_memory`.
- `local_memory_store.js`: escribe documentos en `.storage/memory`.
- `s3_memory_store.js`: adapter preparado para S3 sin ser requerido localmente.
- `memory_retrieval_service.js`: retrieval local/mock con ranking simple.
- `mock_embedding_provider.js`: embedding determinístico para pruebas/desarrollo.

### Knowledge

Ubicación: `src/knowledge`

- `business_knowledge_service.js`: registra `knowledge_sources`, crea documentos de negocio y recupera knowledge relevante por organization/account/bot.

Business knowledge responde como opera el negocio. Conversation memory responde que ha pasado en una conversacion/contacto/caso. Ambos reutilizan `memory_document_service` y `memory_retrieval_service`, pero no comparten contrato de servicio ni `document_family`.

### Agents

Ubicación: `src/agents`

- `agent_router.js`: decide subagente y registra `agent_runs`.
- `agent_registry.js`: registra agentes de sistema, fallback, handoff y mapea el handler ejecutable para agentes declarativos.
- `agent_context_builder.js`: arma contexto separado para mensaje, bot definition, business knowledge y conversation memory.
- `heuristic_agent_routing_strategy.js`: estrategia deterministica extensible para elegir subagente sin router LLM.
- `routing_schemas.js`: contrato Zod de candidatos y decision de routing.
- `subagents/*`: wrappers que delegan a handlers operativos existentes.

El router sigue siendo deterministico, pero ya no es solo `intent -> agente`. La decision usa:

- `bot.definition_json.supported_intents`
- `bot.definition_json.agent_definitions`
- `bot.definition_json.routing_config`
- `bot.definition_json.handoff_policy`
- intencion parseada y texto actual
- `business_knowledge` recuperado
- `conversation_memory` recuperada
- fallback legacy de `agent_routing_rules`

El resultado de routing incluye `selected_agent_id`, `selected_agent_name`, `selected_agent_type`, `confidence`, `reason`, `candidates`, `handoff_recommended`, `handoff_reason` y `used_signals`. `agent_runs.retrieved_context_json` conserva `business_knowledge` y `conversation_memory` por separado.

### Processing Events

Ubicación: `src/processing_events`

- `processing_event_repository.js`: inserta eventos tecnicos del pipeline.
- `processing_event_service.js`: helper seguro para registrar eventos sin romper el flujo principal.

Estos eventos alimentan el Conversation Inspector.

### Inspector

Ubicación: `src/inspector`

- `inspector_routes.js`: rutas internas server-rendered.
- `inspector_repository.js`: queries para organizations, accounts, bots y conversaciones.
- `trace_builder.js`: arma el trace completo de un mensaje.
- `inspector_presenter.js`: helpers compactos para UI.

El inspector lee datos existentes y no decide lógica de negocio.

### Bots

Ubicación: `src/bots`

- `bot_repository.js`: crea, obtiene y lista bots por account.
- `custom_bot_service.js`: valida `definition_json` y crea bots custom.
- `bot_definition_schemas.js`: contrato Zod para definiciones custom.

Tipos:

- `system`: bot predefinido o legacy. Puede usar `bot_profile_id` y flujo operativo existente.
- `custom`: bot de un account con `definition_json` validado. Sus `agent_definitions` describen subagentes declarativos; el router los puede seleccionar sin crear clases por bot.

### Bot Engine

Ubicación: `src/bot_engine`

- `bot_configuration_service.js`: crea/lista/actualiza bots configurables desde input directo o `bot_templates`.
- `bot_template_repository.js`: lee templates editables desde DB.
- `prompt_compiler.js`: compila prompt final desde bot config, knowledge, memoria y acciones disponibles.
- `bot_guardrail_event_repository.js`: registra capability gaps y bloqueos de guardrail.
- `discovery_question_repository.js`: lee entrevista de descubrimiento versionada desde DB.

El código es motor genérico. Los bots y templates viven como configuración en DB. No hay clases ni branches por `recepcionista_ai`, `factura_facil` u otros nombres comerciales.

### Commercial Diagnostics

Ubicación: `src/commercial`

- `diagnostico_ai_service.js`: crea, actualiza y genera propuesta preliminar para diagnósticos AI.
- `commercial_routes.js`: endpoints internos JSON para bots configurables, templates, diagnósticos, acciones, auditoría, entrevista, prompt compile y guardrail events.

### Actions

Ubicación: `src/actions`

- `action_registry.js`: catálogo de acciones con metadata, schemas, permisos, nivel de riesgo y defaults.
- `action_execution_service.js`: ejecutor genérico; valida registry, schema, acciones habilitadas por bot, riesgo y registra auditoría/guardrails.
- `action_audit_repository.js`: persiste `action_audit_logs`.

Niveles de riesgo:

- `automatico`: puede ejecutarse sin humano.
- `requiere_confirmacion`: genera `pending_confirmation` si no hay confirmación.
- `solo_humano`: el bot solo sugiere; no ejecuta.

OCR y voz están modelados como capacidades. `extraer_datos_de_imagen` tiene contrato para fotos, screenshots, PDFs, tickets, constancias y comprobantes. Las acciones de voz existen como metadata y stubs; no hay proveedor real todavía.

### Voice

Ubicación: `src/voice`

- `proveedor_voz_stub.js`: contrato inicial para iniciar, programar, conectar y consultar llamadas. Devuelve `pending_provider`.

## Flujo Inbound

1. `POST /webhooks/whatsapp`.
2. Resolver `whatsapp_phone_number`, assignment activo, `bot`, `account`, `organization`, `tenant`, `branch` y `bot_profile` desde `phone_number_id`.
3. Upsert de `contact`.
4. Upsert de `conversation` con `bot_id`.
5. Guardar `message` inbound con `raw_payload_json` y `bot_id`.
6. Normalizar texto con provider.
7. Clasificar intención.
8. Parsear y validar con Zod.
9. Guardar `parsing_results`.
10. Si hay baja confianza o datos faltantes, crear `review_items`.
11. Recuperar `business_knowledge` y `conversation_memory` como bloques separados para el router.
12. Ejecutar `agent_router` si `AGENT_ROUTER_ENABLED=true`.
13. Elegir subagente declarativo o de sistema y guardar decision/candidatos en `agent_runs`.
14. Ejecutar el handler de sistema asociado al subagente elegido.
15. Crear conversation memory si `MEMORY_INGESTION_ENABLED=true` y el mensaje vale la pena.
16. Generar respuesta.
17. Enviar por WhatsApp si hay credenciales.
18. Guardar mensaje outbound.
19. Registrar eventos tecnicos en `processing_events` para inspeccion.

## Rutas Internas Comerciales

- `GET /internal/actions`
- `GET /internal/actions/:action_id`
- `POST /internal/action-executions`
- `GET /internal/action-audit-logs`
- `GET /internal/guardrail-events`
- `GET /internal/discovery-interview`
- `GET /internal/bot-templates`
- `GET /internal/bot-templates/:template_id`
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

## Reglas De Diseño

- No crear carpetas por cliente.
- No crear clases por marca.
- Soluciones como `taqueria_control` viven en `solution_templates`.
- Configuración de bot vive en `bot_profiles` y `bot_intents`.
- Las reglas críticas viven en JavaScript y tests, no en prompts.
- Postgres conserva la verdad operacional; memory store conserva documentos normalizados.
- Fallas de memoria/embedding no deben romper el webhook.
