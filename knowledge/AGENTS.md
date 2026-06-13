# Guia Para Agentes

> Protocolo de trabajo (leer `knowledge/` antes de la tarea, actualizarlo al final, mantenerlo al 100%) e indice del folder: ver `/AGENTS.md` en la raiz. Este archivo es la guia profunda de arquitectura y reglas.

Este repo construye YoAyudo como Bot Engine configurable para negocios.

La frase guia:

```text
El codigo es el motor.
Los bots son configuracion.
Las interacciones son la superficie de configuracion (cada una con su prompt).
Las acciones son capacidades ejecutables en codigo; las interacciones ejecutables las conectan via action_id.
Los guardrails son el radar de seguridad y roadmap.
```

## Lectura Obligatoria

Antes de cambiar arquitectura, runtime de bots, acciones, memoria o persistencia, lee:

1. `knowledge/architecture/bot_engine.md`
2. `knowledge/architecture/actions.md`
3. `knowledge/architecture/guardrails.md`
4. `knowledge/architecture/database.md`
5. `knowledge/architecture/memory.md`

Tambien utiles:

- `knowledge/architecture/backend.md`
- `knowledge/architecture/agents.md` para entender routing legacy/transicional.
- `knowledge/roadmap/next.md` para prioridades inmediatas.
- `knowledge/testing/founder_preflight_checklist.md` para validar el primer flujo interno.
- `knowledge/testing/founder_trial_checklist.md` para la prueba manual founder de punta a punta.
- `knowledge/agents/testing.md` para pruebas.

## Al Terminar (Actualizar)

Antes de cerrar o hacer commit de una tarea, deja el folder al 100%:

- Actualiza el doc de arquitectura del area que tocaste.
- Actualiza `knowledge/IMPLEMENTATION_STATUS.md` (que se implemento, endpoints nuevos, conteo de tests) y `knowledge/roadmap/next.md` si cambiaron prioridades.
- Si el codigo contradecia un doc, el codigo gana: corrige el doc.
- Se conciso y edita en su lugar: el folder existe para que el siguiente agente gaste menos tokens, no mas.

## Reglas Duras

- No crear clases por bot comercial.
- No meter `if/else` por template.
- No hardcodear `recepcionista_ai`, `factura_facil`, `seguimiento_ventas`, `agenda_facil`, `documentos_facil` o `cobranza_suave` en runtime.
- Templates viven en DB/configuracion.
- Bots viven en DB/configuracion.
- Actions si pueden y deben vivir en codigo.
- Si una capacidad modifica el mundo, debe ser Action.
- En la UI no hay lista separada de "Acciones del bot": todo se configura como interacciones con prompt; las ejecutables llevan `action_id` y de ahi se deriva `acciones_habilitadas_json`.
- No usar `tenant` ni `branch`: el modelo es organization (negocio) -> account (cuenta) -> bot.
- `bot_type` (`system`/`custom`) es PROCEDENCIA, no capacidad: `system` = lo crea/mantiene la plataforma; `custom` = lo creo un usuario (default). Prohibido branchear runtime por `bot_type`; el motor ejecuta ambos igual.
- Si una accion no existe, no esta habilitada, no tiene proveedor o no puede ejecutarse, registrar guardrail event.
- No fingir ejecuciones de AI.
- No duplicar reglas de negocio dentro de subagentes.

## Prioridades Tecnicas

1. PostgreSQL guarda la verdad.
2. WhatsApp es un canal, no el centro del dominio.
3. AI interpreta lenguaje, pero el backend valida y audita.
4. Business knowledge y conversation memory se mantienen separados.
5. Bot Engine compila prompts desde configuracion y contexto.
6. Action Executor valida permisos, riesgo e input antes de ejecutar.
7. Guardrails protegen al negocio y muestran roadmap.

## Estado Del Runtime

Existe una capa `src/agents` con `agent_router`, `agent_runs` y subagentes. Es real, pero transicional. Sirve para routing actual y compatibilidad.

Para nuevas features, preferir:

```text
Bot Engine + Actions + Prompt Compiler + Guardrails
```

## Comandos Base

```bash
npm install
npm test
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

No agregar ni versionar `package-lock.json`; este repo usa `.npmrc` con `package-lock=false`.
