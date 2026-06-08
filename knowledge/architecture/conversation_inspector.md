# Conversation Inspector

## Objetivo

Conversation Inspector es una herramienta interna para depurar conversaciones de bots. No es un inbox comercial; sirve para responder que mensaje llego, que entendio el sistema, que guardo, que agente se eligio, que memoria se creo, que respuesta salio y que fallo.

## Modelo

El inspector agrega una capa minima sobre el modelo existente:

- `organizations`: negocio de alto nivel. En producto/UI un `organizations` es un "Negocio".
- `accounts`: cuenta dentro de una organization.
- `bots`: instancia operativa conectada a un account, bot profile y canal.

Relaciones actuales:

```text
organization
  -> accounts
    -> bots
      -> bot_profile
      -> conversations
        -> messages
```

`conversations`, `messages`, `agent_runs`, `memory_documents` y `review_items` tienen `bot_id` nullable. El inspector prefiere `bot_id` para evitar magia en queries. El aislamiento de conversacion es por `bot_id + contact_id (+ channel)`.

## Rutas

- `GET /inspector`
- `GET /inspector/organizations`
- `GET /inspector/organizations/:organization_id`
- `GET /inspector/accounts/:account_id`
- `GET /inspector/bots/:bot_id`
- `POST /inspector/bots/:bot_id` (guardado/autosave del editor de bot)
- `POST /inspector/bots/:bot_id/test-message`
- `GET /inspector/bots/:bot_id/conversations`
- `GET /inspector/conversations/:conversation_id`
- `GET /inspector/messages/:message_id`
- `GET` / `POST /inspector/knowledge` (POST con upload a S3)
- `GET` / `POST /inspector/knowledge/:source_id`

Todas son server-rendered con Pug. No hay SPA ni librerias pesadas.

## Editor De Bot

`GET /inspector/bots/:bot_id` renderiza el editor del bot (`src/web/views/inspector/bot.pug`). Es Pug server-rendered con un Tab Navigator (`src/web/public/js/core/Tab_Navigator.js`) y 7 tabs en este orden: Identidad, Conversaciones, Probar, Knowledge, Canales, Interacciones, Restricciones.

- Los tabs usan `data-section` y los paneles `.tab-section[data-parent-tab][data-section]` se muestran u ocultan via `hidden`.
- Hay un sistema de iconos SVG inline con mixins de Pug (`+icon(name)`, `+section_head(icon, title, subtitle)`).
- Autosave: el form se postea a `POST /inspector/bots/:bot_id` en `input`/`change`/`blur` y muestra un timestamp proactivo tipo "Guardado 3:58pm" o "Guardado 5 jun, 4pm" (es-MX 12h). No hay boton "Guardar cambios".
- `Probar` postea a `POST /inspector/bots/:bot_id/test-message`.

Las capacidades ejecutables se configuran como interacciones, cada una con su propio prompt. Los tipos ejecutables cargan un `action_id` (`buscar_negocios`, `guardar_nota`, `crear_tarea`, `generar_resumen` son los handlers reales; el resto son `stub_*`). Al guardar, `acciones_habilitadas_json` se deriva de las interacciones habilitadas que tienen `action_id`.

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
- bot demo conectado al account demo

## Pendiente Para Produccion

- Auth real y control de acceso por organization/account/bot.
- Paginacion fuerte y filtros completos.
- Links internos para descargar/ver documentos S3 cuando haya credenciales.
- Vista dedicada para `bot_guardrail_events` y capability gaps.
- Mejor correlacion de respuestas para outbounds legacy sin `reply_to_message_id`.
