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
- Acciones habilitadas.
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

## Conceptos

### Bot Definition / Config

Define que debe hacer el bot y con que limites: prompt, instrucciones, tono, objetivos, acciones habilitadas, campos a capturar, reglas de guardrail y reglas de escalamiento.

### Business Knowledge

Describe como opera el negocio: servicios, precios, reglas, politicas, procesos, FAQs, horarios, sucursales, objeciones y criterios de venta.

### Conversation Memory

Describe que ha pasado con este contacto, conversacion o caso: mensajes relevantes, pendientes, datos capturados, objeciones, decisiones, estado y resumen operativo.

### Actions

Capacidades ejecutables del engine. Si algo modifica el mundo, debe ser una accion.

### Guardrails

Reglas y eventos que evitan que el bot finja capacidades, ejecute sin permiso o haga algo inseguro. Tambien funcionan como backlog de capacidades faltantes.

## Prompt Compiler

El compilador de prompt recibe:

- prompt base del bot.
- instrucciones del negocio.
- contexto de conversacion.
- business knowledge relevante.
- conversation memory relevante.
- acciones disponibles.
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
- Las acciones son capacidades.
- Los guardrails reportan riesgos o capacidades faltantes.
