# Glosario

## Bot

Configuracion operativa que pertenece a un account. Define prompt, instrucciones, tono, objetivos, knowledge, memoria, acciones habilitadas, reglas de guardrail, reglas de escalamiento y status.

Un bot no debe requerir una clase de codigo propia.

## Bot Engine

Motor generico que carga configuracion de bot, compila prompts, recupera knowledge/memoria, valida acciones, ejecuta o bloquea capacidades y registra auditoria/guardrails.

Es el producto tecnico nuevo. No es un conjunto de agentes hardcodeados.

## Bot Template

Configuracion editable usada como punto de partida para crear bots. Vive en DB/configuracion.

Ejemplos: `recepcionista_ai`, `seguimiento_ventas`, `agenda_facil`, `factura_facil`, `documentos_facil`, `cobranza_suave`.

Un template no debe tener clases, handlers ni if/else en runtime.

## Action

Capacidad ejecutable del Bot Engine. Vive en codigo porque requiere validacion, permisos, riesgo, handler y auditoria.

Si modifica el mundo, debe ser Action.

## Action Registry

Catalogo de acciones disponibles en codigo. Declara metadata, schemas, permisos, nivel de riesgo, handler y version.

## Guardrail Event

Evento registrado cuando una accion no existe, no esta habilitada, requiere confirmacion, esta bloqueada por riesgo, no tiene proveedor, tiene input invalido o permisos insuficientes.

## Capability Gap

Capacidad que el bot o cliente intenta usar pero el engine no puede ejecutar todavia. Se registra como guardrail event y alimenta roadmap.

## Business Knowledge

Knowledge del negocio: servicios, precios, reglas, politicas, procesos, FAQs, horarios, sucursales, criterios de venta e instrucciones del duenho.

Responde: como opera este negocio.

## Conversation Memory

Memoria de una conversacion/contacto/caso: mensajes relevantes, decisiones, pendientes, objeciones, datos capturados, preferencias y estado operativo.

Responde: que ha pasado con este cliente o caso.

## Agent / Subagent

Termino interno legacy para routing y orquestacion actual en `src/agents`. No es el nombre del producto tecnico nuevo.

No crear agentes comerciales hardcodeados. Para nuevas features, usar Bot Engine + Actions + Guardrails.

## Solution Template

Compatibilidad/demo legacy del runtime anterior. Ejemplo: `taqueria_control`.

No debe ser el centro del futuro. Para configuracion editable actual, usar `bot_templates` y bots configurables.

## Tenant

Boundary tecnico legacy del runtime actual. `accounts.tenant_id` mantiene compatibilidad.

## Organization

Duenho o grupo empresarial.

## Account

Negocio dentro de una organization.

## WhatsApp Phone Number

Numero de WhatsApp asociado a un account. El flujo actual resuelve `phone_number_id` hacia numero, assignment, bot, account y organization.

## Contact

Persona que escribe por WhatsApp.

## Conversation

Hilo de conversacion por canal/contacto.

## Message

Mensaje inbound u outbound. Siempre conserva raw payload.

## Review Item

Pendiente humano generado por baja confianza, datos faltantes o validacion fallida.
