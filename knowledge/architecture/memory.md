# Arquitectura Memory

## Separación De Responsabilidades

PostgreSQL guarda la verdad operacional: mensajes, parsing, operaciones, reportes, review y trazabilidad.

El memory store guarda documentos normalizados para consulta contextual. En local se usa `.storage/memory`; en futuro puede usarse S3 detrás de `s3_memory_store`.

El vector index es una abstracción. Hoy el embedding es mock y determinístico; no hay dependencia obligatoria con AWS, pgvector, OpenSearch ni Bedrock Knowledge Base.

## Document Families

- `business_knowledge`: como opera el negocio. Se gestiona mediante `business_knowledge_service`.
- `conversation_memory`: que ha pasado con este cliente/caso/conversacion. Se gestiona mediante `conversation_memory_service`.
- `system_knowledge`: conocimiento global o de solution templates.
- `legacy`: documentos previos sin clasificacion explicita.

Business knowledge y conversation memory pueden vivir en `memory_documents`, pero no comparten contrato de servicio ni retrieval request.

## Scopes

- `global`
- `solution_template`
- `organization`
- `account`
- `bot`
- `tenant`
- `branch`
- `contact`
- `conversation`
- `operational_day`

Los scopes evitan mezclar conocimiento global, conocimiento de solución, conocimiento de negocio y memoria conversacional.

## Document Types

- `message`
- `conversation_message`
- `conversation_summary`
- `customer_fact`
- `case_state`
- `pending_action`
- `handoff_note`
- `captured_field`
- `customer_objection`
- `daily_summary`
- `client_knowledge`
- `business_service`
- `business_price`
- `business_policy`
- `business_process`
- `business_faq`
- `business_rule`
- `business_document`
- `business_hours`
- `sales_criteria`
- `owner_instruction`
- `solution_knowledge`
- `global_knowledge`
- `operational_fact`
- `router_decision`
- `agent_observation`

Todo documento nuevo debe tener `document_family`, `scope`, `document_type`, `source_table`, `source_id`, `version` y `metadata_json` cuando aplique.

## Ingesta

No se vectoriza todo.

Se ignoran mensajes vacíos, saludos simples, confirmaciones como `ok`, `gracias` o `va`, y outbounds automáticos.

Se aceptan mensajes inbound con intención operacional: compras, ventas, inventario, inicio de día, cierre, notas y report requests.

La ingesta de conversacion ocurre mediante `conversation_memory_service` después de guardar `parsing_results` y después de ejecutar el handler operativo. Si falla el memory store o embedding, el webhook sigue funcionando y el documento queda como `failed`.

## Store Local Vs S3

Local:

```text
.storage/memory/{tenant_id}/{document_id}.json
```

S3:

```text
MEMORY_STORE_PROVIDER=s3
MEMORY_S3_BUCKET=...
MEMORY_S3_PREFIX=yoayudo/memory
```

El adapter S3 está preparado, pero no es requerido para desarrollo local.

## Retrieval

`memory_retrieval_service` busca en `memory_documents`, filtra por `document_family`, organization/account/tenant/bot/scope/type y rankea de forma simple:

- match de palabras del query
- prioridad de `document_type`
- match de scope
- metadata de intent
- recencia por query SQL

La regla crítica: no exponer knowledge o memoria de otro account/tenant/conversation.

## Futuro

Bedrock Knowledge Base, pgvector, OpenSearch o reranking avanzado deben entrar detrás de interfaces, sin reemplazar Postgres como verdad operacional.
