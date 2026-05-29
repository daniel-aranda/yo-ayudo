# Guia Para Agentes

Este repo construye YoAyudo como Bot Engine configurable para negocios.

La frase guia:

```text
El codigo es el motor.
Los bots son configuracion.
Las acciones son capacidades.
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
- `knowledge/agents/testing.md` para pruebas.

## Reglas Duras

- No crear clases por bot comercial.
- No meter `if/else` por template.
- No hardcodear `recepcionista_ai`, `factura_facil`, `seguimiento_ventas`, `agenda_facil`, `documentos_facil` o `cobranza_suave` en runtime.
- Templates viven en DB/configuracion.
- Bots viven en DB/configuracion.
- Actions si pueden y deben vivir en codigo.
- Si una capacidad modifica el mundo, debe ser Action.
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
