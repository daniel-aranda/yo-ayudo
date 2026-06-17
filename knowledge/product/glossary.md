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

En la UI no se habilita una Action por separado: se configura la **interaccion ejecutable** correspondiente, que ademas le da su prompt. `acciones_habilitadas_json` se deriva de las interacciones habilitadas que tienen `action_id`.

## Action Registry

Catalogo de acciones disponibles en codigo. Declara metadata, schemas, permisos, nivel de riesgo, handler y version.

## Interaction

Lo que un bot puede hacer, configurado en el editor. Es la superficie de configuracion unica del bot: ya no existe una lista separada de "Acciones del bot". Cada interaccion tiene su propio prompt (instrucciones). Hay dos tipos:

- De comportamiento: recibir mensajes de WhatsApp, enviar mensajes de WhatsApp, consultar humano.
- Ejecutables: llevan un `action_id` y conectan con una Action del engine. Hoy las reales son `buscar_negocios`, `crear_contacto` (CRM: guardar prospecto/cliente), `guardar_nota`, `crear_tarea` y `generar_resumen`, más las operativas (`registrar_*`/`generar_reporte_dia`).

Al guardar, `acciones_habilitadas_json` se deriva de las interacciones habilitadas con `action_id`, y el prompt compiler inyecta el prompt de cada interaccion en el prompt final.

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

## Tenant / Branch (retirado)

Vocabulario tecnico legacy ya eliminado. La migracion `0010_drop_tenant_branch.sql` borro las tablas/columnas de tenant y branch; `accounts.tenant_id` ya no existe. El boundary tecnico actual es organization/account. No usar tenant ni branch en codigo nuevo.

## Organization (Negocio)

El negocio del cliente. En la DB es la tabla `organizations`; en la UI se muestra como "Negocio". El dashboard lista los negocios con su numero de cuentas y bots.

## Account (Cuenta)

Unidad operativa ("cuenta") dentro de un negocio/organization. Un bot pertenece a una account y a su organization. El aislamiento de conversaciones es por bot y contacto, no por tenant.

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
