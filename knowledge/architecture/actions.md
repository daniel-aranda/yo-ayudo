# Actions

## Objetivo

Una Action es una capacidad ejecutable del Bot Engine. Vive en codigo porque representa algo que el sistema sabe validar, auditar y ejecutar o bloquear.

## Que Es Una Action

Una accion puede:

- crear o actualizar datos.
- mandar o preparar comunicacion.
- crear tareas o recordatorios.
- registrar solicitudes internas.
- extraer datos de archivos mediante un proveedor.
- pedir confirmacion humana.
- preparar capacidades futuras mediante stubs seguros.

## Que No Debe Ser Una Action

No todo texto o razonamiento debe ser accion.

- Redactar una respuesta simple puede vivir en prompt.
- Razonar sobre una pregunta puede vivir en prompt.
- Elegir tono o estructura del mensaje puede vivir en prompt.
- Un caso comercial como `factura_facil` o `recepcionista_ai` no es una accion; es configuracion de bot/template.

## Cuando Crear Una Action

Crear una accion cuando la capacidad:

- modifica datos.
- crea trabajo para humanos.
- llama a un proveedor.
- manda informacion fuera del chat.
- toca documentos, archivos, pagos, facturacion o llamadas.
- necesita permisos, auditoria o confirmacion.

Regla corta:

- Si modifica el mundo, debe ser accion.
- Si solo razona o redacta, puede ser prompt.
- Si el engine no puede hacerlo, debe registrar guardrail event.

## Contrato Minimo

Cada accion debe declarar:

- `action_id`
- `nombre`
- `descripcion`
- `categoria`
- `input_schema`
- `output_schema`
- `nivel_riesgo`
- `permisos_requeridos`
- `handler`
- `version`

En runtime tambien puede declarar si esta habilitada globalmente. El bot ademas debe tener la accion en sus acciones habilitadas.

## Acciones E Interacciones (Superficie De Configuracion)

A nivel engine las Actions siguen igual: registry en codigo, handler, validacion, riesgo, audit y guardrails. Lo que cambio es como se configuran.

En el editor de bots ya no existe una lista separada de "Acciones del bot". Todo se configura como **interacciones**, y cada interaccion tiene su propio prompt. Una interaccion ejecutable lleva un `action_id` que la conecta con una Action del engine.

- Hoy las interacciones ejecutables reales son `buscar_negocios`, `crear_contacto` (CRM: guardar prospecto/cliente, ver `crm.md`), `guardar_nota`, `crear_tarea` y `generar_resumen`, más las operativas (`registrar_*`/`generar_reporte_dia`). El resto del registry son stubs (`stub_*`) de roadmap.
- **Generación** (`generar_imagen`, `generar_documento`, `generar_excel`): contratos honestos con interacción en el editor + provider requirements. Hoy todos son stubs sin proveedor real → **guardrail**, nunca fingen: `generar_imagen`/`generar_documento` devuelven `pending_provider` y `generar_excel` `not_implemented` (`PENDING_PROVIDER_STUBS` en `action_execution_service.js`). `generar_imagen` exige un proveedor de IA (OpenAI/Gemini/Claude).
  - **Decisión (founder):** `generar_documento` y `generar_excel` se entregan como **Google Doc / Google Sheet** — compartibles por link en WhatsApp; el usuario exporta a Word/Excel desde ahí si lo necesita. **v1 = service account de YoAyudo**: la cuenta de servicio es **dueña** del archivo (en un **Shared Drive** de Google Workspace) y **le da acceso al usuario** (compartir por link / con su correo). **OAuth por negocio = v2** (el doc viviría en el Drive del propio dueño). Doc = Google Docs API (contenedor) + IA (contenido); Excel = Google Sheets API (datos→hoja, **sin IA**). Es un **proveedor externo** → al cablear, ambos pasan a `pending_provider` dependientes del proveedor Google (mover `generar_excel` al set), y cada llamada se registra en `integration_events` con latencia. Prerequisitos del founder: **service account JSON + Shared Drive** (en consumer Drive el SA no hospeda bien). Ver `roadmap/next.md`.
- `crear_tarea` escribe en `internal_tasks` (con `conversation_id`/`message_id`); esas tareas se ven y se resuelven en `GET /admin/tasks` (bandeja de tareas) y aparecen en el panel "Tareas" del visor de conversación. `guardar_nota` escribe en `internal_notes`.
- Al guardar el bot, `acciones_habilitadas_json` se **deriva** de las interacciones habilitadas que tienen `action_id` (en `src/inspector/inspector_repository.js`). Ese campo sigue siendo la puerta de ejecucion del engine.
- El prompt compiler inyecta el prompt (instrucciones) de cada interaccion ejecutable en la seccion "# Acciones disponibles" del prompt final, en lugar de una descripcion estatica. Asi la accion lleva el prompt del operador (por ejemplo, como prospectar, hacer cherry-pick o excluir contactados en `buscar_negocios`).

Para el cableado runtime (quien dispara `execute_action`, decision mock-vs-AI y que falta conectar del inbound real), ver `bot_engine.md` -> "Flujo De Ejecucion (Estado Actual)".

## Niveles De Riesgo

### automatico

Puede ejecutarse sin humano si el bot tiene permiso y el input valida.

Ejemplos: guardar nota, crear tarea simple, generar resumen.

### requiere_confirmacion

Debe crear `pending_confirmation` antes de ejecutar si no hay confirmacion humana.

Ejemplos: enviar email, registrar pago, crear solicitud de facturacion, extraer datos sensibles.

### solo_humano

El bot no ejecuta. Solo sugiere o escala.

Ejemplos: llamadas sensibles, acciones legales, operaciones sin proveedor o de alto riesgo.

## Action Audit Logs

`action_audit_logs` registra:

- `action_id`
- status
- input
- output
- error
- actor type
- confirmacion requerida
- quien confirmo
- timestamp

El audit log responde: que intento hacer el engine y que paso.

## Guardrail Events

Cuando una accion no existe, no esta habilitada, no tiene proveedor o falla validacion de riesgo, tambien se registra `bot_guardrail_events`.

El guardrail responde: por que el engine no pudo o no debio hacerlo.

## Acciones Stub O Futuras

Una accion futura puede existir como metadata y stub seguro si:

- el producto la quiere ofrecer despues.
- necesitamos que el engine detecte la intencion.
- queremos registrar demanda real como capability gap.

El stub no debe fingir ejecucion. Debe devolver `not_implemented`, `pending_provider`, `blocked` o `pending_confirmation` segun aplique.

## Observabilidad De APIs Externas (registrar y medir todo)

Las llamadas externas (AI y proveedores) son criticas, asi que **toda** llamada se registra y se mide. Tres streams:

- `action_audit_logs` (arriba): exito/error por ejecucion de accion.
- `integration_events`: cada llamada a un proveedor externo (`whatsapp`, `google_places`, `elevenlabs`, `s3`, ...) con `status` y **`latency_ms`**. Registrar via `safe_record_integration_event`; al integrar un proveedor nuevo, mide la latencia (`Date.now()` alrededor de la llamada) y registra el evento.
- `ai_calls`: cada llamada al modelo (provider, function_name, status, `latency_ms`) via `observed_model_provider`.

Agregados en el admin de interacciones (`/admin/interactions`): catalogo + uso (OK/error/ultimo) + APIs externas (AI + proveedores con latencia) + logs recientes. Salud/conexion en `/admin/integrations`.
