# Arquitectura Database

## Fuente De Verdad

PostgreSQL es la fuente de verdad. AI no escribe hechos operativos directamente sin validación.

## Categorías De Tablas

### Soluciones Y Bots

- `organizations`
- `accounts`
- `bots`
- `solution_templates`
- `bot_profiles`
- `bot_intents`

`solution_templates.key = "taqueria_control"` es el template operativo del demo. No existe como clase runtime.

`bots` conecta organization/account con bot profile y canal. Un `bot` pertenece a un account y a su organization.

`bots.bot_type` distingue:

- `system`: bot predefinido o legacy, normalmente conectado a `bot_profiles`.
- `custom`: bot definido por `definition_json` para un account especifico.

`bots.definition_json` guarda la definicion estructurada inicial del bot custom. En fase 2 no ejecuta routing inteligente todavia; queda disponible para runtime, router y trazabilidad futura.

Desde Fase 5, un bot configurable puede guardar:

- `prompt_base`: instrucción base editable del bot.
- `instrucciones_operativas`: reglas operativas del negocio.
- `tono`: estilo de respuesta.
- `objetivos_json`: objetivos configurables.
- `knowledge_base_ids_json`: knowledge bases asociadas.
- `acciones_habilitadas_json`: acciones que el bot puede solicitar. Se deriva de las interacciones habilitadas que llevan un `action_id`; las acciones reales son `buscar_negocios`, `guardar_nota`, `crear_tarea` y `generar_resumen`.
- `reglas_guardrail_json`: reglas de seguridad.
- `reglas_escalamiento_json`: reglas base de escalamiento.
- `campos_requeridos_json`: campos sugeridos/requeridos.
- `memoria_habilitada`: permite activar/desactivar uso de memoria.

`paquete_id` queda como compatibilidad de Fase 5 inicial y se usa como referencia de `template_id` de origen cuando existe.

En producto/UI una fila de `organizations` es un "Negocio"; el dashboard lista Negocios con su conteo de Cuentas (accounts) y Bots. Un `account` es la unidad operativa ("cuenta") dentro de una organization.

`phone_number_bot_assignments` asigna un bot activo a un numero de WhatsApp. En fase 1 la regla de producto es un bot activo por numero; las asignaciones inactivas conservan historial.

### Core Negocio

- `organizations`
- `accounts`
- `users`
- `contacts`
- `whatsapp_phone_numbers`
- `phone_number_bot_assignments`

### Conversaciones Y Mensajes

- `conversations`
- `messages`

`messages.raw_payload_json` conserva el payload original y se guarda antes de parsear.

`conversations.bot_id` y `messages.bot_id` permiten inspeccionar datos por bot sin inferencias ambiguas.

`messages.reply_to_message_id` vincula respuestas outbound con el inbound que las produjo.

### Parsing Y Observabilidad

- `ai_calls`
- `parsing_results`
- `processing_events`

`processing_events` guarda una timeline tecnica compacta por mensaje y alimenta el Conversation Inspector.

### Review

- `review_items`

### Operación

- `business_settings`
- `catalog_items`
- `suppliers`
- `inventory_items`
- `op_business_days`
- `op_sales_updates`
- `op_purchases`
- `op_inventory_snapshots`
- `op_daily_reports`

### Memory Y Knowledge

- `knowledge_sources`
- `memory_documents`

`memory_documents` mantiene documentos normalizados con `scope`, `document_type`, `source`, `version`, `metadata_json`, ubicación en store y estado de embedding.

`document_family` separa el uso conceptual del documento:

- `business_knowledge`: como opera el negocio. Servicios, precios, reglas, politicas, procesos, FAQs, horarios, sucursales, objeciones, criterios de venta e instrucciones del duenho.
- `conversation_memory`: que ha pasado con este cliente, caso o conversacion. Mensajes relevantes, pendientes, decisiones, documentos, objeciones, datos capturados, estado del proceso y resumen operativo.
- `system_knowledge`: conocimiento global o de solution templates.
- `legacy`: documentos anteriores sin clasificacion explicita.

`knowledge_sources` registra fuentes administrables de business/system knowledge. La memoria conversacional no debe crear `knowledge_sources`.

`organization_id`, `account_id` y `bot_id` en `knowledge_sources` y `memory_documents` permiten retrieval por el modelo organization/account/bot.

### Agents

- `agent_profiles`
- `agent_routing_rules`
- `agent_runs`

`agent_runs` registra decisiones de routing legacy/transicional. Sigue siendo util para auditar el pipeline actual, pero no debe ser la trazabilidad principal de nuevas features del Bot Engine configurable.

Desde Fase 4, `agent_runs` tambien guarda trazabilidad estructurada de routing:

- `selected_agent_id`: subagente seleccionado. Puede venir de `agent_profiles` o de `bot.definition_json.agent_definitions`.
- `selected_agent_name`: nombre visible del subagente seleccionado.
- `selected_agent_type`: `system`, `custom`, `fallback` u otro tipo declarativo.
- `routing_reason`: explicacion corta de la decision.
- `routing_confidence`: confianza heuristica normalizada.
- `routing_candidates_json`: candidatos evaluados con score, origen y señales.
- `used_context_summary_json`: resumen sin prompts gigantes de business knowledge y conversation memory usadas.
- `handoff_recommended` y `handoff_reason`: soporte basico de escalamiento humano.

El `agent_key` existente sigue representando el handler ejecutable. Esto mantiene compatibilidad con `src/agents`.

Para Bot Engine configurable, la trazabilidad principal debe vivir en:

- `bot_prompt_compilations`
- `action_audit_logs`
- `bot_guardrail_events`

### Commercial

- `diagnosticos_ai`
- `action_audit_logs`
- `bot_templates`
- `discovery_questions`
- `bot_prompt_compilations`
- `bot_guardrail_events`
- `internal_notes`
- `internal_tasks`

`diagnosticos_ai` guarda diagnósticos vendidos a prospectos o clientes:

- negocio, giro y contacto.
- vendedor.
- precio del diagnóstico, moneda, pago y si es acreditable.
- status comercial.
- respuestas de entrevista.
- problemas detectados.
- oportunidades AI.
- bots/templates recomendados y acciones recomendadas.
- precio mensual sugerido.
- propuesta preliminar estructurada.

`action_audit_logs` registra intentos de ejecución o sugerencia de acciones:

- `action_id`
- `status`
- input/output/error
- `actor_type`
- si requiere confirmación
- quién confirmó y cuándo
- metadata compacta

Las acciones futuras de voz y OCR real no escriben proveedores externos todavía; quedan como contratos y auditoría.

`bot_templates` guarda ejemplos editables como `recepcionista_ai`, `seguimiento_ventas`, `agenda_facil`, `factura_facil`, `documentos_facil` y `cobranza_suave`. Son datos, no lógica de código.

`discovery_questions` guarda la entrevista de diagnóstico como configuración versionada.

`bot_prompt_compilations` guarda metadata auditable del prompt compilado: bot, conversación, versión, acciones disponibles y knowledge usado. No guarda prompts gigantes completos.

`bot_guardrail_events` registra capability gaps:

- acción no disponible.
- acción no habilitada.
- requiere confirmación.
- riesgo bloqueado.
- proveedor no configurado.
- input inválido.
- permiso insuficiente.

`internal_notes` e `internal_tasks` son almacenamiento interno mínimo para preflight founder. Permiten que `guardar_nota` y `crear_tarea` sean acciones reales sin depender todavía de CRM, email, OCR, Twilio u otra integración externa.

## Business Day

`op_business_days` tiene una fila por account/día.

Constraint clave:

```text
account_id + operation_date
```

Esto permite que varios mensajes actualicen el mismo día sin duplicarlo.

## Reglas De Persistencia

- Guardar raw payload antes de cualquier parsing.
- Guardar parsing result aunque el mensaje acabe en review.
- No insertar compras/ventas/cierres si el parsed output no valida.
- No recalcular con AI.
- Los cálculos de reporte salen de tablas operativas.
- La memoria puede fallar sin impedir que se guarde la operación.

## Migraciones

Las migraciones son SQL explícito en:

```text
src/db/migrations
```

`npm run db:migrate` aplica en orden las once migraciones actuales:

```text
0001_initial
0002_repair_business_account_schema
0003_repair_bot_engine_schema
0004_message_idempotency
0005_unify_operational_account
0006_account_prep
0007_account_lookup_tables
0008_loosen_remaining_tenant
0009_account_remaining_tables
0010_drop_tenant_branch
0011_sync_bot_organization
```

Las migraciones 0005 a 0011 siguen un enfoque expand-migrate-contract: agregan `account_id`/`organization_id`, migran los datos y finalmente eliminan tenant/branch (`0010_drop_tenant_branch` elimina fisicamente las tablas y columnas) hasta unificar todo en organization/account. El runner registra archivos aplicados en `schema_migrations`.

## Cambios Futuros

Al agregar columnas:

- Preferir nullable o default seguro al principio.
- Backfill en migración separada si hay datos reales.
- Agregar constraints cuando el dato ya esté estable.
