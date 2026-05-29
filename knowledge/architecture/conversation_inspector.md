# Conversation Inspector

## Objetivo

Conversation Inspector es una herramienta interna para depurar conversaciones de bots. No es un inbox comercial; sirve para responder que mensaje llego, que entendio el sistema, que guardo, que agente se eligio, que memoria se creo, que respuesta salio y que fallo.

## Modelo

El inspector agrega una capa minima sobre el modelo existente:

- `organizations`: agrupacion interna o cliente de alto nivel.
- `accounts`: cuenta dentro de una organization.
- `bots`: instancia operativa conectada a un tenant, bot profile y canal.

Relaciones actuales:

```text
organization
  -> accounts
    -> bots
      -> tenant
      -> bot_profile
      -> conversations
        -> messages
```

`conversations`, `messages`, `agent_runs`, `memory_documents` y `review_items` tienen `bot_id` nullable. Los registros legacy pueden resolverse por tenant, pero el inspector prefiere `bot_id` para evitar magia en queries.

## Rutas

- `GET /inspector`
- `GET /inspector/organizations`
- `GET /inspector/organizations/:organization_id`
- `GET /inspector/accounts/:account_id`
- `GET /inspector/bots/:bot_id`
- `GET /inspector/bots/:bot_id/conversations`
- `GET /inspector/conversations/:conversation_id`
- `GET /inspector/messages/:message_id`

Todas son server-rendered con Pug. No hay SPA ni librerias pesadas.

## Trace De Mensaje

`trace_builder.js` arma el trace con estas fuentes:

- `messages`: mensaje, raw payload y respuesta vinculada por `reply_to_message_id`.
- `parsing_results`: intent, confianza, JSON extraido y errores de validacion.
- `agent_runs`: decision del router y ejecuciones de agentes.
- `memory_documents`: status de store local/S3, embedding y metadata.
- `ai_calls`: llamadas al provider observado.
- `op_purchases`, `op_sales_updates`, `op_inventory_snapshots`, `op_business_days`, `op_daily_reports`: escrituras operativas.
- `review_items`: pendientes de revision.
- `processing_events`: timeline tecnica compacta.

Si una seccion no existe, la UI muestra un estado vacio claro en vez de fallar.

## Processing Events

`processing_events` captura eventos tecnicos del pipeline:

- webhook recibido
- mensaje guardado
- parsing completado
- routing
- agente completado
- escritura operativa
- memory document creado
- outbound creado
- review creado
- errores de pipeline cuando aplique

Estos eventos complementan las tablas especificas y facilitan leer el flujo sin inspeccionar JSON crudo.

## Seguridad

Variables:

```env
INSPECTOR_ENABLED=true
INSPECTOR_INTERNAL_TOKEN=
```

En development puede estar abierto. En production, si `INSPECTOR_INTERNAL_TOKEN` tiene valor, las rutas requieren header `x-internal-token`. Esto no sustituye auth productiva.

## Uso Local

1. Correr `npm run db:up`.
2. Correr `npm run db:migrate`.
3. Correr `npm run db:seed`.
4. Correr `npm run dev`.
5. Simular un mensaje con `/dev/simulate-whatsapp-message`.
6. Abrir `/inspector`.

Seed crea:

- organization `YoAyudo Demo`
- account `YoAyudo Ventas`
- bot demo conectado al tenant demo

## Pendiente Para Produccion

- Auth real y control de acceso por organization/account/bot.
- Paginacion fuerte y filtros completos.
- Links internos para descargar/ver documentos S3 cuando haya credenciales.
- Vista dedicada para `bot_guardrail_events` y capability gaps.
- Mejor correlacion de respuestas para outbounds legacy sin `reply_to_message_id`.
