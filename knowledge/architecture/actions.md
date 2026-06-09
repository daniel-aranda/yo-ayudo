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

- Hoy las interacciones ejecutables reales son `buscar_negocios`, `guardar_nota`, `crear_tarea` y `generar_resumen`. El resto del registry son stubs (`stub_*`) de roadmap.
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
