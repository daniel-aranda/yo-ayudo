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
- `local_memory_store.js`: escribe documentos en `.storage/memory`.
- `s3_memory_store.js`: adapter preparado para S3 sin ser requerido localmente.
- `memory_retrieval_service.js`: retrieval local/mock con ranking simple.
- `mock_embedding_provider.js`: embedding determinístico para pruebas/desarrollo.

### Agents

Ubicación: `src/agents`

- `agent_router.js`: decide subagente y registra `agent_runs`.
- `agent_registry.js`: mapea `agent_key` a handler delgado.
- `subagents/*`: wrappers que delegan a handlers operativos existentes.

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
11. Ejecutar `agent_router` si `AGENT_ROUTER_ENABLED=true`.
12. Ejecutar subagente elegido, que delega a handlers operativos.
13. Crear `memory_documents` si `MEMORY_INGESTION_ENABLED=true` y el mensaje vale la pena.
14. Generar respuesta.
15. Enviar por WhatsApp si hay credenciales.
16. Guardar mensaje outbound.
17. Registrar eventos tecnicos en `processing_events` para inspeccion.

## Reglas De Diseño

- No crear carpetas por cliente.
- No crear clases por marca.
- Soluciones como `taqueria_control` viven en `solution_templates`.
- Configuración de bot vive en `bot_profiles` y `bot_intents`.
- Las reglas críticas viven en JavaScript y tests, no en prompts.
- Postgres conserva la verdad operacional; memory store conserva documentos normalizados.
- Fallas de memoria/embedding no deben romper el webhook.
