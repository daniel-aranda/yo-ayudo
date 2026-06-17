# CRM (prospectos y clientes)

Capacidad para guardar prospectos/clientes desde una conversación. Es una **Action real** del engine (modifica el mundo → es acción), configurada en la UI como interacción.

## Modelo de identidad

Tabla `crm_clients` (migración `0018_crm_clients.sql`). Un registro tiene:

- `id` (uuid): id interno **estable**, nunca cambia.
- Identificadores de negocio: `curp`, `phone`, `instagram`, `email`.
- **Clave de negocio derivada**: `client_key` + `client_key_type`, recalculada por **prioridad CURP > teléfono > instagram > email > id interno**. Puede "mutar" (sube de teléfono a CURP cuando llega un identificador de mayor prioridad) mientras el `id` no cambia.
- Lifecycle de leads: `kind` (`prospecto`/`cliente`), `pipeline_status` (`nuevo`, `interesado`, `cerrado_ganado`, …).
- Contexto: `display_name`, `source`, `need`, `notes`, `assigned_to`, links opcionales a `contact_id`/`bot_id`/`conversation_id`.

## Resolución de identidad (dedupe)

En `src/crm/crm_repository.js`, **en JS** (no índices únicos parciales — pg-mem no los soporta de forma confiable; la regla es agregar constraints cuando el dato esté estable, ver `database.md`):

- `normalize_identifiers`: CURP→upper sin espacios; phone→solo dígitos; instagram→sin `@`, lower; email→lower.
- `upsert_crm_client`: busca un cliente existente en la **misma cuenta** que haga match con **cualquier** identificador (orden de prioridad). Si lo encuentra, hace merge (solo los campos provistos sobreescriben; el resto se conserva con COALESCE) y recalcula `client_key`. Si no, inserta. Devuelve `{ ...row, created }`.
- `derive_client_key`: primer identificador presente por prioridad; fallback `internal` = el id.

Misma persona por distintos canales (p. ej. instagram hoy, CURP mañana) → un solo registro, clave que se "actualiza".

## Action `crear_contacto`

- Registry (`action_registry.js`): `nombre` "Guardar prospecto o cliente", categoría `crm`, riesgo `automatico`, `handler: "crear_contacto"` (ya **no** stub). Input acepta llaves en español e inglés (nombre/curp/telefono/phone/instagram/email/kind/status/fuente/nota…).
- Handler (`internal_action_handlers.js`): normaliza, llama `upsert_crm_client`. Si no llega teléfono y hay `conversation_id`, **hereda el teléfono del remitente** (WhatsApp/IG) y enlaza el `contact_id`, así un lead capturado a mitad de conversación queda con un identificador real aunque el mensaje solo traiga el nombre.
- **Pedir el nombre si falta**: la instrucción (prompt) de la interacción indica que, si detecta un prospecto y no conoce su nombre completo, lo pida de forma amable. El handler guarda igual con `display_name` null (clave = teléfono/IG) y un guardado posterior con el nombre actualiza el mismo registro (upsert por identidad). Está en el `instructions_placeholder` del catálogo y en las instrucciones de los bots semilla.

## Captura por inbound (`lead_capture`)

Edge del producto: un WhatsApp/IG puede guardar el prospecto solo.

- Intent `lead_capture` (`src/ai/intents.js`).
- `mock_provider.classify_intents`: detector con keywords **CRM-específicas** (`prospecto`, `nuevo cliente`, `lead`, `curp`, `dar de alta`, `registra a/al`, `guarda el contacto`) — deliberadamente no `cliente`/`registra` a secas para no robar mensajes operativos. `extract_lead_capture` usa `src/crm/lead_text_parser.js` (`parse_lead_fields`: CURP, teléfono, instagram, email, nombre best-effort; quita el CURP antes de buscar teléfono para no leer sus 6 dígitos).
- `lead_capture_schema` (zod, `operation_schemas.js`): laxo, pero `.refine` exige ≥1 identificador o nombre — si no, va a review en vez de crear un registro vacío.
- `message_intent_parser` → caso `lead_capture`. `INTENT_TO_OPERATION_ACTION.lead_capture = "crear_contacto"`. `observed_provider` reenvía `extract_lead_capture`. `response_builder` confirma "Prospecto/Cliente registrado".

El mismo `parse_lead_fields` lo reusa `bot_engine_test_service.infer_action_requests_from_message` (keywords substring, sin `prospecta` que es substring de "prospectar"), así "Probar bot" también dispara la interacción.

## UI

- Interacción en el catálogo del editor (`available_agent_interactions`, `inspector_repository.js`) con `action_id: "crear_contacto"`, icono `id_card` (`bot.pug`). Se deriva a `acciones_habilitadas_json` como cualquier interacción ejecutable; el prompt compiler la inyecta sin código extra.
- Visor de conversación: `Valor capturado` lista cada prospecto/cliente capturado (`value_summary.crm`, vía `list_crm_clients_for_conversation`) como **fila clickeable** (nombre + tipo de clave) y el chip del turno `crear_contacto` es un **combo con "Ver prospecto"** (el presenter matchea el chip a su cliente por `output_json.cliente_id`, igual que "Ver tarea" por `tarea_id`). Ambos abren el **detalle en popup iframe** (`GET /inspector/crm/:client_id` → `crm_client_detail.pug`: clave de negocio, identificadores, necesidad, etapa, origen, bot/cuenta + link "Ver conversación relevante"). Reusa el chrome `.task-modal*` y el auto-ajuste de altura por `postMessage` (tipo `yoayudo:crm-height`) — mismo patrón que el detalle de tarea, solo lectura (no recarga al cerrar).

## Seeds

El bot comercial (`agente-whatsapp-yoayudo`) y el de prospectos lo traen habilitado. Demos dev-only (entrypoint, idempotentes):
- `seed_crm_demo_conversation`: clientes de ejemplo (clave CURP/instagram) + una conversación donde un operador registra al prospecto Carlos (clave CURP).
- `seed_inbound_lead_conversation`: el **remitente es el lead** — llega por una "Campaña Instagram" preguntando por el servicio (clínica dental Mariana Lozano); el bot la guarda como prospecto (clave teléfono, el del remitente) y, al pedir una llamada, deja una tarea de seguimiento. Es el flujo realista de captura inbound.
- `seed_lead_without_name_conversation`: el lead llega por "Campaña Facebook" **sin dar su nombre**; el bot lo guarda como prospecto (clave teléfono, `display_name` null) y **pregunta el nombre**; cuando responde ("Soy Daniela Ruiz"), un segundo guardado actualiza el MISMO registro con el nombre. Prueba la guía "si no sabes el nombre completo, pídelo" (el contacto queda sin `display_name`, así el título muestra el teléfono — lead anónimo).
- `seed_prospeccion_venta_conversation`: **prospección para VENDER YoAyudo**. Un vendedor pide prospectos con zona ("restaurantes en Roma Norte") → el bot busca (`buscar_negocios`) y propone **3 opciones** → al elegir a cuál llamar, el bot guarda ESE negocio como prospecto (`crear_contacto`, fuente "Prospección YoAyudo") y deja una tarea (`crear_tarea`). Demuestra que el flujo "buscar → top 3 → al elegir, guardar" es **orquestación por prompt** de dos interacciones existentes (no una Action nueva), y que la **zona vive en el prompt** (del mensaje o las zonas configuradas en las instrucciones de `buscar_negocios`; si falta, el bot la pregunta).

## Pendiente / futuro

- Vista de lista CRM por cuenta (hoy solo se ve por conversación; `list_crm_clients_for_account` ya existe).
- `actualizar_contacto` sigue siendo stub (el upsert de `crear_contacto` ya cubre crear/actualizar/cambiar etapa).
- Constraints únicos en DB cuando el dato esté estable; extracción de campos por AI (hoy determinista).
