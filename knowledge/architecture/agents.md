# Arquitectura Agents

## Objetivo

El router decide qué subagente atiende un mensaje. En esta fase los subagentes no son LLM autónomos; son una capa de orquestación delgada sobre handlers existentes y definiciones declarativas del bot.

## Componentes

- `agent_router.js`: recupera business knowledge/conversation memory, arma contexto y registra la decision.
- `agent_registry.js`: resuelve agentes de sistema, fallback, handoff y handler ejecutable.
- `agent_context_builder.js`: construye request de retrieval y contexto separado para routing.
- `heuristic_agent_routing_strategy.js`: decide subagente con reglas heuristicas, sin router LLM.
- `routing_schemas.js`: valida candidatos y decision estructurada.
- `agent_run_repository.js`: registra decisiones en `agent_runs`.
- `subagents/*`: delegan a `dispatch_operation`.

## Routing Inicial Legacy

- `purchase` -> `purchases_agent`
- `sales_update` -> `sales_agent`
- `inventory_update` -> `inventory_agent`
- `day_start` -> `operations_agent`
- `daily_close` -> `operations_agent`
- `daily_note` -> `operations_agent`
- `report_request` -> `reports_agent`
- `human_help` -> `human_handoff_agent`
- `unknown` -> `unknown_agent`

Las reglas configurables legacy viven en `agent_routing_rules`. El seed crea perfiles base en `agent_profiles`.

## Routing Por Bot Definition

Para bots custom, el router prioriza `bot.definition_json`:

- `supported_intents`: intenciones que el bot acepta.
- `agent_definitions`: subagentes declarativos, por ejemplo `ventas`, `documentos` o `handoff_humano`.
- `routing_config.intent_routes`: mapeo explícito intent -> subagente.
- `routing_config.default_agent_key`: fallback del bot.
- `handoff_policy`: triggers para recomendar humano.

El subagente seleccionado puede ser declarativo. `selected_agent_id` guarda ese id; `agent_key` guarda el handler ejecutable de sistema que procesa el mensaje mientras no existan agentes LLM autónomos.

## Contexto

Antes de decidir, el router recupera dos bloques separados:

- `business_knowledge`: como opera el negocio.
- `conversation_memory`: que ha pasado con este contacto/conversacion.

El contexto de routing incluye mensaje actual, organization, account, bot, `bot_definition`, contact, conversation, ambos bloques de contexto, estado operacional y canal.

## Agent Runs

Cada decisión del router crea un registro en `agent_runs` con:

- `run_type = route`
- `agent_key`
- `selected_agent_id`
- `selected_agent_name`
- `selected_agent_type`
- `routing_reason`
- `routing_confidence`
- `routing_candidates_json`
- `used_context_summary_json`
- `handoff_recommended`
- `handoff_reason`
- input normalizado
- contexto recuperado
- output de decisión
- status

Esto permite auditar por qué un mensaje fue al agente elegido.

## Regla De Diseño

Los subagentes no duplican lógica de negocio.

Los cálculos, validaciones y persistencia operacional siguen en `src/operations` y `src/engine/operation_dispatcher.js`.
