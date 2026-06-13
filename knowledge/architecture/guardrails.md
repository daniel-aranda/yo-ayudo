# Guardrails

## Objetivo

Los guardrails evitan que el Bot Engine prometa, ejecute o finja capacidades que no existen, no estan habilitadas o son riesgosas.

Hay dos familias:

- Guardrails de seguridad: bloquean acciones peligrosas, sensibles o sin confirmacion.
- Guardrails de capacidad faltante: registran lo que el negocio quiere hacer pero el engine todavia no puede ejecutar.

## Tipos Actuales

- `accion_no_disponible`
- `accion_no_habilitada`
- `requiere_confirmacion`
- `riesgo_bloqueado`
- `proveedor_no_configurado`
- `input_invalido`
- `permiso_insuficiente`

## Comportamiento Obligatorio

Cuando ocurre un guardrail, el engine debe:

1. No fingir que ejecuto la accion.
2. No inventar confirmaciones, pagos, llamadas, facturas ni documentos.
3. Responder de forma segura al usuario.
4. Escalar si aplica.
5. Registrar `bot_guardrail_events`.
6. Registrar `action_audit_logs` si hubo intento de accion.

## Capability Gaps

Un capability gap ocurre cuando el bot o modelo intenta usar una capacidad que:

- no existe en el Action Registry.
- existe pero no esta habilitada para ese bot.
- requiere proveedor no configurado.
- requiere permisos o confirmacion.
- no puede validar input.

Las capacidades ejecutables se configuran como interacciones (cada una con su prompt). El `acciones_habilitadas_json` del bot se deriva de las interacciones habilitadas que llevan un `action_id`. Hoy las 4 reales son `buscar_negocios`, `guardar_nota`, `crear_tarea` y `generar_resumen`; las demas siguen como stub.

Estos eventos son backlog de producto. Muestran que capacidades piden los clientes y que deberia construirse despues.

## Ejemplos

- El bot intenta emitir una factura real en SAT: `accion_no_disponible` o `proveedor_no_configurado`.
- El bot intenta llamar por telefono: `proveedor_no_configurado` o `riesgo_bloqueado`.
- El bot intenta registrar un pago sin confirmacion: `requiere_confirmacion`.
- El bot intenta enviar documento sensible sin permiso: `permiso_insuficiente`.
- El bot manda input incompleto para OCR: `input_invalido`.

## Vista Interna (Admin)

`GET /admin/guardrails` (`admin_guardrails_service.js` + `admin/guardrails.pug`) es la contraparte de observabilidad de lo que audita el Action Executor: lista `bot_guardrail_events` filtrable por cuenta/bot/tipo/action/status (selects con auto-submit) y un **rollup de capability gaps por acción** (qué acciones pidieron los bots y no se pudieron ejecutar = prioridad de backlog). `POST /admin/guardrails/:event_id/task` convierte un evento en **tarea interna** (`internal_tasks`, `metadata_json.source = guardrail_event`) y marca el evento `status = en_tarea`. Está en el sub-nav de admin.

## Regla De Producto

Un guardrail no es un fallo silencioso. Es una señal operacional y de producto.

Debe ayudar a:

- proteger al negocio.
- explicar por que no se ejecuto algo.
- priorizar nuevas acciones o proveedores.
- mejorar templates y prompts.
