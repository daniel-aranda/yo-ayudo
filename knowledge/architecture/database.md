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

`bots` conecta organization/account con tenant, bot profile y canal.

### Core Multi-Tenant

- `tenants`
- `branches`
- `users`
- `contacts`
- `whatsapp_phone_numbers`

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

### Agents

- `agent_profiles`
- `agent_routing_rules`
- `agent_runs`

`agent_runs` registra decisiones de routing y futuras ejecuciones de subagentes.

## Business Day

`op_business_days` tiene una fila por tenant/sucursal/día.

Constraint clave:

```text
tenant_id + branch_id + operation_date
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

El runner registra archivos aplicados en `schema_migrations`.

## Cambios Futuros

Al agregar columnas:

- Preferir nullable o default seguro al principio.
- Backfill en migración separada si hay datos reales.
- Agregar constraints cuando el dato ya esté estable.
