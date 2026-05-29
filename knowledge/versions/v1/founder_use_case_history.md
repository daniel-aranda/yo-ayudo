# Founder Use Case History

Este archivo conserva la historia de decisiones Fase 1-4. No es el norte actual para nuevas features.

La direccion vigente vive en:

- `knowledge/product/founder_use_case.md`
- `knowledge/architecture/bot_engine.md`
- `knowledge/architecture/actions.md`
- `knowledge/architecture/guardrails.md`

## Fase 1

Ruta inicial de onboarding:

```text
organization -> account -> whatsapp_phone_number -> active bot assignment -> bot
```

Un numero de WhatsApp tiene un solo bot activo asignado. El modelo conserva historial de asignaciones para cambiar el bot de un numero sin perder trazabilidad.

## Fase 2

Un custom bot puede existir como dato estructurado antes de tener builder visual o LLM builder.

La definicion inicial incluyo objetivo, intents soportados, campos requeridos, subagentes declarativos, routing declarativo, politica de handoff, necesidades de knowledge, estilo de respuesta y restricciones.

## Fase 3

Se separo:

- `bot_definition`: que debe hacer el bot.
- `business_knowledge`: como opera el negocio.
- `conversation_memory`: que ha pasado con este cliente o conversacion.

## Fase 4

Se implemento routing multi-agent heuristico usando `definition_json.agent_definitions`, `routing_config`, business knowledge y conversation memory.

Esta capa sigue existiendo para routing actual, pero es transicional. No debe guiar nuevas features comerciales.
