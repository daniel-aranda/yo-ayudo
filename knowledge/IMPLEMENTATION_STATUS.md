# Implementation Status

Fecha de auditoria: 2026-05-26.

## Resumen

El proyecto corre como JavaScript ES Modules, sin TypeScript, sin `tsconfig.json`, sin `dist/` y sin build step obligatorio.

El runtime ya no tiene codigo de cliente/vertical especifico. `Margen Sabroso` existe solo como tenant/bot profile de seed demo y en documentacion. El comportamiento operativo vive en modulos genericos de jornadas, compras, ventas, inventario, cierres, notas y reportes.

Convencion activa: todos los identificadores propios del proyecto usan `snake_case`, incluyendo clases como `mock_provider`, `message_intent_parser`, `observed_model_provider` y `meta_whatsapp_client`. Las excepciones son nombres impuestos por librerias o plataformas externas.

## Implementado Realmente

- Servidor Express con `GET /health`.
- Configuracion por variables de entorno con defaults locales y validacion Zod.
- Bootstrap local con Docker Compose para PostgreSQL en `localhost:5433`.
- Doctor local en `npm run dev` que valida entorno, revisa PostgreSQL, intenta levantar Docker Compose si aplica y corre migraciones.
- Conexion PostgreSQL con `pg`.
- Migracion inicial SQL explicita.
- Seed demo con:
  - `solution_templates.key = "taqueria_control"`
  - tenant demo `Margen Sabroso`
  - branch `Sucursal Centro`
  - contacto demo
  - numero WhatsApp demo
  - catalogo, inventario y proveedores demo
- Webhook WhatsApp:
  - verification GET
  - inbound POST
  - guardado de raw payload antes de parsear
- Endpoint dev para simular mensajes.
- AI Gateway con interfaz documentada y `mock_provider`.
- Memory layer con `memory_documents`, `knowledge_sources`, store local, S3 stub, embedding mock y retrieval local.
- Agent router determinístico con `agent_profiles`, `agent_routing_rules` y `agent_runs`.
- Conversation Inspector interno con organizations, accounts, bots, conversaciones, message trace y timeline tecnica.
- `processing_events` para registrar hitos del pipeline sin depender solo de JSON crudo.
- `bot_id` en conversaciones, mensajes, agent runs, memory docs y review items.
- `reply_to_message_id` en mensajes outbound generados como respuesta.
- Intents genericos:
  - `day_start`
  - `sales_update`
  - `purchase`
  - `inventory_update`
  - `daily_close`
  - `daily_note`
  - `report_request`
  - `human_help`
  - `unknown`
- Parsers basicos con regex para mensajes simples.
- Validacion runtime con Zod para outputs operativos.
- Handlers genericos que guardan:
  - inicio de dia
  - ventas acumuladas
  - compras
  - inventario
  - cierres
  - notas
- Review queue cuando faltan datos criticos o la confianza es baja.
- Reporte diario deterministico con ventas, compras, alertas y margen estimado simple.
- Dashboard server-rendered con Pug.
- Tests unitarios de reglas operativas.
- Tests de integracion del pipeline inbound con DB en memoria.
- Tests unitarios de memory ingestion, local store, document service, retrieval y router.
- Tests de integracion del Conversation Inspector, trace builder y rutas server-rendered.

## Stubs, Placeholders O Parcial

- `bedrock_provider` existe como stub y no hace llamadas reales.
- Envio real de WhatsApp no fue probado con Meta; si falta token, el cliente registra outbound como `skipped`.
- `send_template` es placeholder.
- Middleware de auth del dashboard es dev/pass-through.
- Jobs existen como funciones invocables, sin scheduler.
- `solution_templates`, `bot_profiles` y `bot_intents` estan modelados en DB, pero no tienen UI ni repositorios runtime dedicados.
- `s3_memory_store` y `bedrock_embedding_provider` existen como adapters/stubs; local no requiere AWS.
- `agent_router` es deterministico; no hay agentes LLM autónomos.
- Conversation Inspector usa auth interna minima por env; no reemplaza auth productiva.
- Processing events cubren puntos clave del pipeline, no cada operacion interna posible.
- `POST /review/:review_item_id/resolve` marca resolucion, pero no re-ejecuta handlers ni corrige datos operativos.
- Parser mock es intencionalmente basico; no soporta bien multiples compras en un solo mensaje ni todas las variantes de lenguaje natural.

## Endpoints Actuales

- `GET /health`
- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`
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
- `POST /dev/seed`
- `POST /dev/simulate-whatsapp-message`
- `GET /public/*` para assets estaticos

## Tablas En Migracion Inicial

- `solution_templates`
- `tenants`
- `branches`
- `users`
- `bot_profiles`
- `bot_intents`
- `contacts`
- `conversations`
- `messages`
- `ai_calls`
- `parsing_results`
- `whatsapp_phone_numbers`
- `business_settings`
- `catalog_items`
- `suppliers`
- `inventory_items`
- `op_business_days`
- `op_sales_updates`
- `op_purchases`
- `op_inventory_snapshots`
- `op_daily_reports`
- `review_items`

## Tablas En Migracion 0002

- `knowledge_sources`
- `memory_documents`
- `agent_profiles`
- `agent_routing_rules`
- `agent_runs`

## Tablas En Migracion 0003

- `organizations`
- `accounts`
- `bots`
- `processing_events`

La migracion tambien agrega:

- `bot_id` a `conversations`
- `bot_id` a `messages`
- `reply_to_message_id` a `messages`
- `bot_id` a `agent_runs`
- `bot_id` a `memory_documents`
- `bot_id` a `review_items`

Ademas, el runner crea `schema_migrations`.

## Comandos Verificados

- `npm install`: OK. No genero `package-lock.json`.
- `npm test`: OK. 8 archivos, 21 tests.
- `npm run db:up`: OK. Levanta `yoayudo_postgres`.
- `npm run db:down`: OK.
- `npm run db:reset`: OK. Recrea volumen local.
- `npm run db:migrate`: OK. Aplica `0001_initial.sql`, `0002_memory_agents.sql` y `0003_conversation_inspector.sql`.
- `npm run db:seed`: OK. Crea demo, agent profiles/rules y knowledge documents.
- `npm run start`: OK. Levanta sin compilar.
- `npm run dev`: OK. Corre doctor y levanta sin compilar.
- `GET /health`: OK, responde 200.

`npm run build` ya no existe por diseno: el proyecto no requiere compilacion.

## Flujo End-To-End Que Funciona Hoy

Con PostgreSQL local levantado, migrado y sembrado:

1. `POST /dev/simulate-whatsapp-message` recibe mensajes demo.
2. El pipeline guarda el inbound raw payload en `messages.raw_payload_json`.
3. El `mock_provider` clasifica intent.
4. El parser valida con Zod.
5. El router registra `agent_runs` con `run_type = route`.
6. El subagente elegido delega al handler operativo generico.
7. Se guardan datos en tablas `op_*`.
8. Se crea `memory_documents` para mensajes útiles.
9. `local_memory_store` escribe documentos en `.storage/memory`.
10. Se registra outbound corto en `messages`.
11. Se vincula outbound con inbound por `reply_to_message_id`.
12. Se crean `processing_events` para inspeccion.
13. El cierre genera reporte diario.
14. El dashboard de dia renderiza operacion y reporte.
15. `/inspector` muestra bots/conversaciones y `/inspector/messages/:message_id` muestra parsing, router, agente, memoria, AI calls, escrituras operativas, review y respuesta.

Mensajes verificados:

- `abrimos con 1500 en caja` -> `day_start`
- `compré 12 kg pastor por 1680 con Juan` -> `purchase`
- `vendimos 3200 hasta ahorita` -> `sales_update`
- `cerramos con 8500 ventas, 3000 efectivo, 4000 tarjeta, 1500 transferencia` -> `daily_close`

Verificacion de DB despues del flujo:

- `op_business_days`: 1 fila.
- `op_purchases`: 1 fila.
- `op_sales_updates`: 1 fila.
- `op_daily_reports`: 1 fila.
- `agent_runs`: contiene decisiones de routing.
- `memory_documents`: contiene mensajes útiles y knowledge seed.
- `processing_events`: contiene timeline tecnica por mensaje.
- Metodos de pago del cierre: efectivo 3000, tarjeta 4000, transferencia 1500.
- Dashboard de dia: 200 y muestra reporte/metodos de pago.

## Flujo Que No Funciona Todavia

- WhatsApp Cloud API real end-to-end con Meta.
- Mensajes con media o tipos interactivos mas alla de metadata basica.
- Ventana real de atencion de 24 horas.
- Templates reales fuera de ventana.
- Auth productiva.
- Correccion de review que reprocese datos operativos.
- Scheduler cloud para jobs.
- Edicion self-service de `bot_profiles` o `bot_intents`.
- Bedrock Knowledge Base real.
- S3 real probado con AWS SDK.
- Vector DB real, pgvector, OpenSearch o reranking avanzado.
- UI de knowledge management.
- Agentes autónomos con tool calling complejo.
- Multi-item purchase robusto.
- Tests HTTP con `supertest` para todos los endpoints principales.
- Filtros avanzados del inspector por intent/agente/fecha; hay ruta base y estructura, pero no UI completa de filtros.

## Riesgos Tecnicos Actuales

- El parser mock depende de regex y puede fallar con lenguaje natural ligeramente distinto.
- La cobertura de endpoints HTTP todavia es menor que la cobertura del pipeline interno.
- `pg-mem` acelera tests, pero puede diferir de PostgreSQL real en detalles SQL.
- `npm audit` reporta 5 vulnerabilidades moderadas en dev dependencies de Vitest/Vite; `npm audit --omit=dev` esta limpio.
- El dashboard no tiene auth real; solo debe usarse en modo local/dev.
- El inspector es interno y su auth por token es minima; no debe exponerse publicamente.
- Las listas del inspector usan queries simples por conversacion para mantener claridad; si crece el volumen, requeriran paginacion y optimizacion.
- Review resolve guarda resolucion, pero todavia no actualiza hechos operativos.
- Retrieval local es ranking heurístico, no semántico real.
- `agent_routing_rules` cubre routing determinístico inicial, no condiciones avanzadas.

## Bugs O Deuda Priorizada

1. Completar tests funcionales HTTP para `/health`, webhook verification, dev simulate, dashboard y review.
2. Definir idempotencia de memory ingestion y webhook por `external_message_id` bajo retries reales.
3. Mejorar parser de montos por metodo de pago y compras con mas fixtures reales.
4. Implementar re-procesamiento controlado al resolver review items.
5. Agregar paginacion/filtros reales al Conversation Inspector antes de operar con volumen.

## Siguientes 5 Cambios Recomendados

1. Completar suite funcional de endpoints restantes con `supertest` y asserts de DB.
2. Agregar fixtures de mensajes reales para parser mock, memory ingestion, router e inspector.
3. Implementar idempotencia del webhook por `external_message_id`.
4. Endurecer review queue para aplicar correcciones operativas.
5. Agregar auth real para dashboard e inspector antes de cualquier piloto fuera de local.

## Busquedas De Limpieza

Ejecutadas y limpias en runtime:

- antigua clase especifica del cliente: sin resultados runtime.
- antiguo identificador snake_case del cliente: sin resultados runtime.
- prefijo operativo anterior en `src tests`: sin resultados.
- referencias `.ts` en `src tests`: sin resultados.

Notas:

- `Margen Sabroso` aparece solo como seed/config demo, test de tenant demo y documentacion.
- No hay archivos `.ts` en `src` o `tests`.
- No hay TypeScript como dependencia necesaria.
- No hay `package-lock.json`.
- Los nombres propios nuevos del runtime quedan en `snake_case`; cualquier mayuscula interna restante corresponde a APIs externas de Node.js/librerias o nombres de marca/documentacion.
