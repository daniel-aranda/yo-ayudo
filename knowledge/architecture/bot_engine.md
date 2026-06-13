# Bot Engine

## Objetivo

El Bot Engine es el motor generico que convierte configuracion de bot, knowledge, memoria, acciones y guardrails en una conversacion operativa.

YoAyudo no construye agentes comerciales en codigo. El codigo ejecuta un motor comun. Los bots viven como configuracion en DB.

## Que Vive En Codigo

- Carga de bot y contexto.
- Retrieval de business knowledge y conversation memory.
- Compilador de prompt.
- Action Registry.
- Action Executor.
- Validacion de schemas, permisos y riesgo.
- Audit log y guardrail events.
- Adaptadores/stubs para capacidades futuras.

## Que Vive En Configuracion

- Bots.
- Bot templates editables.
- Prompt base.
- Instrucciones operativas.
- Tono.
- Objetivos.
- Knowledge base ids.
- Interacciones (cada una con su prompt; las ejecutables llevan `action_id`).
- Acciones habilitadas (se derivan de las interacciones ejecutables habilitadas).
- Reglas de guardrail.
- Reglas de escalamiento.
- Campos a capturar.
- Memoria habilitada.

Templates como `recepcionista_ai`, `seguimiento_ventas`, `agenda_facil`, `factura_facil`, `documentos_facil` y `cobranza_suave` son datos editables o seeds. No deben tener clases, branches, handlers o `if/else` especiales en runtime.

## Ciclo De Ejecucion

1. Cargar bot.
2. Cargar conversacion.
3. Cargar business knowledge relevante.
4. Cargar conversation memory relevante.
5. Cargar acciones habilitadas para el bot.
6. Compilar prompt final.
7. Pedir respuesta o accion al modelo.
8. Validar que la accion existe.
9. Validar que el bot tiene permiso para usarla.
10. Validar input, riesgo y guardrails.
11. Ejecutar accion, pedir confirmacion o bloquear.
12. Registrar audit log y guardrail events.
13. Responder al usuario o escalar.

## Flujo De Ejecucion (Estado Actual)

El ciclo de arriba es el contrato. Hoy `execute_action` (la cadena unificada y auditada) se dispara desde **tres** lugares:

- `bot_engine_test_service.test_message()`: el tab "Probar bot" y los tests de preflight. Usa el Prompt Compiler + seleccion de acciones por AI.
- `POST /internal/action-executions` (`src/commercial/commercial_routes.js`): ejecucion directa de una accion por API.
- El inbound real de WhatsApp (`webhook -> handle_whatsapp_webhook_payload` en `src/engine/message_processor.js`): ejecuta operaciones a traves de `execute_action` (auditado).

### Inbound real: multi-ejecucion

El inbound corre por `execute_action` (auditado) y soporta **multi-ejecucion** (un mensaje puede disparar mas de una interaccion). La **clasificacion de intenciones puede ser por AI** (opt-in por bot) o deterministica por keywords. Flujo:

1. `observed_provider.normalize_message`.
2. `observed_provider.classify_intents` (multi-intent): detecta cada categoria de operacion presente, deduplica y **segmenta** el texto para que cada extractor solo vea su propia clausula. **AI por default para TODOS los bots** (es el edge del producto; no hay opt-in por bot — el selector de Modelo IA ya implica AI): el `message_processor` siempre pide `use_ai_classification: true`. El `openai_provider.classify_intents` (override) llama al modelo cuando hay API key; si no (mock o sin key), usa el clasificador deterministico por keywords (heredado de `mock_provider`). En **error de AI lanza** y el `message_processor` reintenta con `use_ai_classification: false` (fallback determinístico) — el inbound nunca se rompe y el fallo queda en `ai_calls` (status failed). `use_ai_classification` es un control INTERNO AI/fallback, no config de bot. La **extraccion** de campos por intent sigue siendo deterministica (mock `extract_*`); lo que decide AI es la(s) intencion(es)/accion(es), no los montos.
3. Por cada intent: `message_intent_parser.parse(segmento, intent)` corre el `extract_*` correspondiente.
4. `route_and_dispatch_operations` ejecuta cada operacion via `INTENT_TO_OPERATION_ACTION[intent]` + `execute_action`. Cada ejecucion escribe su propio `action_audit_logs` (lo que alimenta los chips de "interacciones disparadas" del inspector).
5. `build_multi_reply` combina la respuesta de cada operacion en un solo mensaje de WhatsApp.

Ejemplo: "abrimos con 1500, vendimos 3200 y compre 5 kg pastor por 600" -> `registrar_inicio_dia` + `registrar_venta` + `registrar_compra` (3 interacciones, una respuesta combinada). Un mensaje de una sola operacion produce un segmento = texto completo, identico al comportamiento anterior.

Hecho: el inbound ya selecciona intenciones/acciones por AI (opt-in por bot, fallback deterministico). Pendiente: usar el **Prompt Compiler completo** en el inbound (hoy solo `test_message` compila prompt) y extraccion de campos por AI (hoy determinista).

### Como se deciden las acciones (en `test_message`)

- Con AI real (`provider.decide_bot_test_message`, ej. OpenAI): el modelo lee el prompt compilado + `acciones_disponibles` y devuelve `{ reply, action_requests: [{ action_id, input }] }`.
- Con `AI_PROVIDER=mock` o sin provider: heuristica por keywords (`infer_action_requests_from_message`) que mapea el texto a acciones (ej. "buscar negocios" -> `buscar_negocios`).
- El caller tambien puede pasar `action_requests` explicitos.

### Cadena de validacion

Cada `action_request`/operacion pasa por `action_execution_service.execute_action`, que aplica la cadena en orden: existe en el registry -> habilitada en el registry -> **habilitada a nivel sistema** (`interaction_settings`; deshabilitada = `blocked` + guardrail `interaccion_deshabilitada`) -> habilitada para el bot (via `acciones_habilitadas_json`) -> permisos -> `input_schema` -> riesgo/confirmacion. Luego corre el handler real (`execute_internal_action_handler`, que recibe la config de la interaccion en `context.interaction_config`) o un stub seguro. Siempre escribe `action_audit_logs` y, cuando aplica, `bot_guardrail_events`. Las tres capas de configuracion: catalogo estatico (codigo) -> `interaction_settings` (system-level: admin) -> `definition_json.interactions` (por bot).

## Conceptos

### Bot Definition / Config

Define que debe hacer el bot y con que limites: prompt, instrucciones, tono, objetivos, acciones habilitadas, campos a capturar, reglas de guardrail y reglas de escalamiento.

### Business Knowledge

Describe como opera el negocio: servicios, precios, reglas, politicas, procesos, FAQs, horarios, sucursales, objeciones y criterios de venta.

### Conversation Memory

Describe que ha pasado con este contacto, conversacion o caso: mensajes relevantes, pendientes, datos capturados, objeciones, decisiones, estado y resumen operativo.

### Interacciones

Superficie de configuracion del bot: lo que puede hacer y como, cada interaccion con su propio prompt. Las de comportamiento cubren recibir/enviar WhatsApp y consultar humano; las ejecutables llevan un `action_id` que las conecta con una Action del engine. Ya no hay una lista separada de "Acciones del bot": `acciones_habilitadas_json` se deriva de las interacciones ejecutables habilitadas.

### Actions

Capacidades ejecutables del engine. Si algo modifica el mundo, debe ser una accion. En la UI se habilitan configurando la interaccion ejecutable correspondiente.

### Guardrails

Reglas y eventos que evitan que el bot finja capacidades, ejecute sin permiso o haga algo inseguro. Tambien funcionan como backlog de capacidades faltantes.

## Prompt Compiler

El compilador de prompt recibe:

- prompt base del bot.
- instrucciones del negocio.
- contexto de conversacion.
- business knowledge relevante.
- conversation memory relevante.
- interacciones habilitadas (cada una con su prompt).
- acciones disponibles (con el prompt de su interaccion, no una descripcion estatica).
- reglas de seguridad.
- formato esperado de respuesta/accion.

Devuelve:

- prompt final.
- metadata de compilacion.
- acciones disponibles para esta ejecucion.
- resumen de knowledge usado.

Debe ser auditable y evitar guardar informacion sensible innecesaria. Guardar metadata y previews compactos es preferible a guardar prompts enormes.

## Regla Principal

- El codigo es el motor.
- Los bots son configuracion.
- Las interacciones son la superficie de configuracion (cada una con su prompt).
- Las acciones son capacidades ejecutables; las interacciones ejecutables las conectan via `action_id`.
- Los guardrails reportan riesgos o capacidades faltantes.
