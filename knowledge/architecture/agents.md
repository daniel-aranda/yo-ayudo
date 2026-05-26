# Arquitectura Agents

## Objetivo

El router decide qué subagente atiende un mensaje. En esta fase los subagentes no son LLM autónomos; son una capa de orquestación delgada sobre handlers existentes.

## Componentes

- `agent_router.js`: decide `agent_key` usando intent, bot profile, solution template, reglas y contexto recuperado.
- `agent_registry.js`: resuelve `agent_key` a función.
- `agent_context_builder.js`: construye request de retrieval.
- `agent_run_repository.js`: registra decisiones en `agent_runs`.
- `subagents/*`: delegan a `dispatch_operation`.

## Routing Inicial

- `purchase` -> `purchases_agent`
- `sales_update` -> `sales_agent`
- `inventory_update` -> `inventory_agent`
- `day_start` -> `operations_agent`
- `daily_close` -> `operations_agent`
- `daily_note` -> `operations_agent`
- `report_request` -> `reports_agent`
- `human_help` -> `human_handoff_agent`
- `unknown` -> `unknown_agent`

Las reglas configurables viven en `agent_routing_rules`. El seed crea perfiles base en `agent_profiles`.

## Contexto

Antes de decidir, el router puede pedir contexto a `memory_retrieval_service`. El retrieval local devuelve pocos documentos relevantes y respeta tenant/scope/type.

## Agent Runs

Cada decisión del router crea un registro en `agent_runs` con:

- `run_type = route`
- `agent_key`
- input normalizado
- contexto recuperado
- output de decisión
- status

Esto permite auditar por qué un mensaje fue al agente elegido.

## Regla De Diseño

Los subagentes no duplican lógica de negocio.

Los cálculos, validaciones y persistencia operacional siguen en `src/operations` y `src/engine/operation_dispatcher.js`.
