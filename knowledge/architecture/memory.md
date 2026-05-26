# Arquitectura Memory

## Separación De Responsabilidades

PostgreSQL guarda la verdad operacional: mensajes, parsing, operaciones, reportes, review y trazabilidad.

El memory store guarda documentos normalizados para consulta contextual. En local se usa `.storage/memory`; en futuro puede usarse S3 detrás de `s3_memory_store`.

El vector index es una abstracción. Hoy el embedding es mock y determinístico; no hay dependencia obligatoria con AWS, pgvector, OpenSearch ni Bedrock Knowledge Base.

## Scopes

- `global`
- `solution_template`
- `tenant`
- `branch`
- `contact`
- `conversation`
- `operational_day`

Los scopes evitan mezclar conocimiento global, conocimiento de solución, conocimiento de cliente y memoria conversacional.

## Document Types

- `message`
- `conversation_summary`
- `daily_summary`
- `client_knowledge`
- `solution_knowledge`
- `global_knowledge`
- `operational_fact`
- `router_decision`
- `agent_observation`

Todo documento debe tener `scope`, `document_type`, `source_table`, `source_id`, `version` y `metadata_json` cuando aplique.

## Ingesta

No se vectoriza todo.

Se ignoran mensajes vacíos, saludos simples, confirmaciones como `ok`, `gracias` o `va`, y outbounds automáticos.

Se aceptan mensajes inbound con intención operacional: compras, ventas, inventario, inicio de día, cierre, notas y report requests.

La ingesta ocurre después de guardar `parsing_results` y después de ejecutar el handler operativo. Si falla el memory store o embedding, el webhook sigue funcionando y el documento queda como `failed`.

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

`memory_retrieval_service` busca en `memory_documents`, filtra por tenant/scope/type y rankea de forma simple:

- match de palabras del query
- prioridad de `document_type`
- match de scope
- metadata de intent
- recencia por query SQL

La regla crítica: no exponer memoria de otro tenant.

## Futuro

Bedrock Knowledge Base, pgvector, OpenSearch o reranking avanzado deben entrar detrás de interfaces, sin reemplazar Postgres como verdad operacional.
