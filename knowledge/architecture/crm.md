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
- Visor de conversación: `Valor capturado` lista cada prospecto/cliente capturado (`value_summary.crm`, vía `list_crm_clients_for_conversation`) como **fila clickeable** (nombre + tipo de clave) y el chip del turno `crear_contacto` es un **combo con "Ver prospecto"** (el presenter matchea el chip a su cliente por `output_json.cliente_id`, igual que "Ver tarea" por `tarea_id`). Ambos abren el **detalle en popup iframe** (`GET /inspector/crm/:client_id` → `crm_client_detail.pug`: clave de negocio, identificadores, necesidad, etapa, origen, bot/cuenta + link "Ver conversación relevante"). Reusa el chrome `.task-modal*` en **una sola columna** (cabecera + **tira de datos `.task-facts`** con tipo/etapa/origen/responsable/bot/fechas, y debajo identificadores `.task-facts--plain`/necesidad/notas — mismo patrón que el detalle de tarea) y el auto-ajuste de altura por `postMessage` (tipo `yoayudo:crm-height`), solo lectura (no recarga al cerrar). Fechas en formato compacto ("16 jun 2026, 7:23").
- **Página CRM por cuenta** (`GET /dashboard/accounts/:account_id/crm` → `dashboard/crm.pug`): la lista consolidada de prospectos/clientes en un **tablero de 4 columnas** (las etapas base; lectura, base del futuro kanban). Datos de `get_account_crm_view` (ver "Etapas": columnas base + categorías custom plegadas bajo Interesado con su `custom_categories` para el dropdown) + rollup (total/prospectos/clientes). Cada tarjeta (avatar con iniciales + nombre + clave + fuente + chip de sub-categoría custom si aplica) abre el detalle scopeado al dashboard (`GET /dashboard/accounts/:account_id/crm/:client_id`, reusa `crm_client_detail.pug` con breadcrumb de volver). El dropdown de Interesado filtra client-side por `data-subcat`. Entrada desde la métrica **"Prospectos"** del dashboard (`stats.prospects_count`). CSS `.crm-board`/`.crm-col*`/`.crm-card*`/`.crm-col__select` en `dashboard.css`. **Temperatura por etapa** (asimétrica, racionada según la regla de marca verde=bueno): Nuevo e Interesado quedan neutrales; **Ganado** lleva columna en menta (`--accent-soft`), anillo esmeralda tenue, trofeo (`trophy_svg` en `.crm-col__title`, solo si `column.key === "ganado"`), label en `--accent-dark`, count pill esmeralda relleno y tarjetas con borde esmeralda + pulso `crm-win-pop` (`.just-won`, 620ms, lo añade el drop handler al soltar en ganado; con guard `prefers-reduced-motion`); **Perdido** se repliega a `opacity:.6` (vuelve a 1 en hover/focus/drop) con label muted y avatar neutralizado.

## Seeds

El bot comercial (`agente-whatsapp-yoayudo`) y el de prospectos lo traen habilitado. Demos dev-only (entrypoint, idempotentes):
- `seed_crm_demo_conversation`: clientes de ejemplo (clave CURP/instagram) + una conversación donde un operador registra al prospecto Carlos (clave CURP).
- `seed_inbound_lead_conversation`: el **remitente es el lead** — llega por una "Campaña Instagram" preguntando por el servicio (clínica dental Mariana Lozano); el bot la guarda como prospecto (clave teléfono, el del remitente) y, al pedir una llamada, deja una tarea de seguimiento. Es el flujo realista de captura inbound.
- `seed_lead_without_name_conversation`: el lead llega por "Campaña Facebook" **sin dar su nombre**; el bot lo guarda como prospecto (clave teléfono, `display_name` null) y **pregunta el nombre**; cuando responde ("Soy Daniela Ruiz"), un segundo guardado actualiza el MISMO registro con el nombre. Prueba la guía "si no sabes el nombre completo, pídelo" (el contacto queda sin `display_name`, así el título muestra el teléfono — lead anónimo).
- `seed_prospeccion_venta_conversation`: **prospección para VENDER YoAyudo**. Un vendedor pide prospectos con zona ("restaurantes en Roma Norte") → el bot busca (`buscar_negocios`) y propone **3 opciones** → al elegir a cuál llamar, el bot guarda ESE negocio como prospecto (`crear_contacto`, fuente "Prospección YoAyudo") y deja una tarea (`crear_tarea`). Demuestra que el flujo "buscar → top 3 → al elegir, guardar" es **orquestación por prompt** de dos interacciones existentes (no una Action nueva), y que la **zona vive en el prompt** (del mensaje o las zonas configuradas en las instrucciones de `buscar_negocios`; si falta, el bot la pregunta).

## Etapas (pipeline)

**4 etapas base** (`CRM_BASE_STAGES` en `crm_repository.js`): `nuevo`, `interesado`, `ganado`, `perdido`. Cada cliente guarda su etapa en `pipeline_status` (lo setea el upsert desde `status`/`estatus`/`etapa`). Valores legacy/sinónimos se mapean a una base (`CRM_STAGE_ALIASES`: `cerrado_ganado`→`ganado`, `cerrado_perdido`→`perdido`, …).

**Categorías custom**: cualquier `pipeline_status` que NO sea una etapa base se trata como **categoría custom** que vive DENTRO de "Interesado" (no como columna aparte). En el tablero, la columna Interesado muestra un **dropdown** (Ver todos / cada categoría con su conteo) que filtra sus tarjetas; **solo aparece si la cuenta tiene categorías custom** (`get_account_crm_view` las deriva de los valores no-base presentes, con label humanizado, y las expone en `columns[interesado].custom_categories`; cada cliente custom lleva `sub_category`/`sub_category_label`). Así no hace falta una tabla de config para que el mecanismo funcione: una categoría custom "existe" en cuanto un cliente la usa.

El tablero es **drag & drop** (`dashboard/crm.pug`, HTML5 DnD vanilla) con **dos gestos**: (1) mover a otra columna (cambia la etapa) y (2) **reordenar dentro de una columna**. Ambos posicionan la tarjeta ENTRE sus vecinos y persisten vía `POST /dashboard/accounts/:account_id/crm/:client_id/move` (body `stage`, `before_id`, `after_id`) → `move_crm_client`, que le asigna un **rank intermedio**. El orden manual vive en `crm_clients.pipeline_rank` (text, migración 0019, LexoRank-style): dentro de cada columna los prospectos se ordenan por ese string ascendente; `get_account_crm_view` ordena cada columna por rank (fallback `created_at` para filas aún sin rank). El rank se genera en `src/crm/lexorank.js` → `rank_between(prev, next)` (algoritmo **midstring**; `''` = extremo abierto; correcto al insertar repetidamente en el mismo hueco porque extiende la longitud, p. ej. entre `n` y `o` → `nn`). **Lazy**: las filas viejas no tienen rank; al primer reorder de una columna `backfill_column_ranks` materializa sus ranks en el orden visible (una vez), luego el reorder solo toca la tarjeta movida — sin renumerar al resto. El handler de arrastre inserta en vivo, **revierte** si se suelta fuera, y recarga si el POST falla. Alternativa **accesible** (no-drag): el `<select>` de etapa del detalle postea a `.../stage` → `update_crm_client_stage`, que cambia la columna y deja la tarjeta **al final** (rank después del último). Mover a una etapa base limpia la sub-categoría custom.

## Pendiente / futuro

- ~~Vista de lista CRM por cuenta~~ HECHO: `GET /dashboard/accounts/:id/crm` (tablero de 4 etapas base + custom bajo Interesado con dropdown).
- ~~Kanban con arrastre~~ HECHO: drag & drop entre columnas (cambia `pipeline_status`) y **reordenar dentro de la columna** con orden manual persistente (LexoRank `pipeline_rank`, `src/crm/lexorank.js`); + select de etapa accesible en el detalle.
- Gestión de etapas por cuenta (agregar custom vacías / ocultar bases) con persistencia; hoy las 4 bases siempre se muestran y las custom se derivan de los datos.
- Páginas especializadas equivalentes para otras capacidades (Ventas, etc.).
- `actualizar_contacto` sigue siendo stub (el upsert de `crear_contacto` ya cubre crear/actualizar/cambiar etapa).
- Constraints únicos en DB cuando el dato esté estable; extracción de campos por AI (hoy determinista).
