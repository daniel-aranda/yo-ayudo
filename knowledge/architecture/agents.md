# Routing Y Orquestacion Legacy

## Objetivo

Este archivo documenta la capa `src/agents` existente. Es una capa real del codigo actual, pero es transicional: no representa el norte conceptual para nuevas features.

El norte actual es:

```text
Bot Engine + Actions + Prompt Compiler + Guardrails
```

## Que Hace Hoy

El router decide que handler operativo atiende un mensaje y registra trazabilidad en `agent_runs`.

Componentes actuales:

- `agent_router.js`: recupera contexto, decide ruta y registra `agent_runs`.
- `agent_registry.js`: resuelve `agent_key` a handler ejecutable.
- `agent_context_builder.js`: arma contexto para routing.
- `heuristic_agent_routing_strategy.js`: estrategia heuristica sin router LLM.
- `routing_schemas.js`: valida candidatos y decision.
- `agent_run_repository.js`: persiste decisiones.
- `subagents/*`: wrappers delgados que delegan a handlers existentes.

## Que No Es

Esta capa no es un framework para crear agentes comerciales hardcodeados.

No crear:

- `RecepcionistaAI`.
- `FacturaFacil`.
- `SeguimientoVentas`.
- clases por vertical.
- if/else por `template_id`.
- handlers por nombre comercial.

Templates como `recepcionista_ai`, `seguimiento_ventas`, `agenda_facil`, `factura_facil`, `documentos_facil` y `cobranza_suave` viven como configuracion en DB.

## Uso Correcto

Para nuevas capacidades, preferir:

1. Agregar o ajustar una Action si modifica el mundo.
2. Habilitar la accion en el bot configurable.
3. Ajustar prompt, guardrails o template en DB/configuracion.
4. Registrar capability gaps cuando el engine no pueda ejecutar.

Usar `src/agents` solo para mantener compatibilidad del pipeline actual o routing operativo existente.

## Subagentes Actuales

Los subagentes actuales son wrappers delgados. No deben duplicar reglas de negocio.

La persistencia, validacion y calculos operativos siguen en:

- `src/operations`
- `src/engine/operation_dispatcher.js`
- servicios/repositorios especificos

## Agent Runs

`agent_runs` sigue siendo util para trazabilidad de routing legacy:

- agente seleccionado.
- razon de routing.
- confianza.
- candidatos.
- contexto recuperado.
- handoff recomendado.

Para el Bot Engine nuevo, la trazabilidad principal debe complementarse con:

- `bot_prompt_compilations`
- `action_audit_logs`
- `bot_guardrail_events`

## Regla

`src/agents` puede seguir existiendo mientras el pipeline lo use, pero no debe guiar la arquitectura de producto nueva.
