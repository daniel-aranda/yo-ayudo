# AGENTS.md — Manual para agentes (Claude, Codex y cualquier otro)

YoAyudo es un **Bot Engine configurable** para negocios: el codigo es el motor, los bots son configuracion. (Detalle y filosofia: `knowledge/AGENTS.md`.)

Este archivo es el contrato de trabajo para todos los agentes. La regla de oro: **el folder `knowledge/` es la memoria del proyecto. Manten el folder al 100% y trabaja desde el, no re-explores el codigo a ciegas.** Asi cada tarea cuesta menos tokens.

## Protocolo de conocimiento (OBLIGATORIO)

**1. Antes de la tarea — LEER.**
- Lee `knowledge/AGENTS.md` y los docs del area que vas a tocar (usa el Indice de abajo para ir directo, no escanees `src/` a ciegas).
- El folder ya tiene el mapa: rutas, contratos, decisiones y "que no funciona todavia". Empieza ahi.

**2. Durante la tarea.**
- Si el codigo contradice un doc, **el codigo gana**: anota el desfase para corregirlo al final.
- No dupliques reglas de negocio ni informacion entre docs; cada cosa vive en un solo lugar.

**3. Al terminar la tarea — ACTUALIZAR (antes de cerrar/commit).**
- Actualiza los docs que tu cambio afecto: el doc de arquitectura del area, `knowledge/IMPLEMENTATION_STATUS.md` (que se implemento, conteo de tests, endpoints) y `knowledge/roadmap/next.md` si cambiaron prioridades.
- Si agregaste o cambiaste comportamiento, debe quedar reflejado. El criterio de "terminado" incluye el folder al 100%.
- Edita en su lugar y se conciso: el folder existe para **reducir** tokens del siguiente agente, no para inflarlos. Borra lo obsoleto.

**Meta:** que el siguiente agente entienda el proyecto leyendo `knowledge/`, sin re-descubrir el codigo.

## Indice de `knowledge/`

Entrada y estado:
- `knowledge/AGENTS.md` — guia profunda: filosofia, lectura obligatoria por area, reglas duras, estado del runtime.
- `knowledge/IMPLEMENTATION_STATUS.md` — que esta implementado, migraciones, endpoints, que NO funciona aun, riesgos, conteo de tests.

Arquitectura (`knowledge/architecture/`):
- `bot_engine.md` — motor de bots: ciclo de ejecucion, pipeline inbound real (multi-ejecucion) vs `test_message`, prompt compiler.
- `actions.md` — Action Registry + Action Executor (validacion, riesgo, audit, guardrails).
- `conversation_inspector.md` — inspector interno: rutas, trace de mensaje, interacciones disparadas, processing events.
- `frontend.md` — UI server-rendered (Pug + CSS + JS minimo): editor de bot, componentes core (`Popup`, `Tab_Navigator`), autosave.
- `database.md` — esquema y migraciones (organization -> account -> bot; sin tenant/branch).
- `memory.md` — business knowledge vs conversation memory (separados por `document_family`).
- `guardrails.md` — guardrails: seguridad y backlog de capacidades.
- `backend.md` — estructura backend, capas y convenciones runtime.
- `agents.md` — routing legacy/transicional en `src/agents`.
- `infra.md` — infra, env vars y despliegue.

Producto, pruebas y procesos:
- `product/founder_use_case.md`, `product/glossary.md` — caso de uso founder y glosario de dominio.
- `agents/code_conventions.md`, `agents/testing.md`, `agents/release_strategies.md` — convenciones de codigo, pruebas y release.
- `runbooks/local_development.md` — correr el proyecto en local.
- `testing/founder_preflight_checklist.md`, `testing/founder_trial_checklist.md` — checklists manuales.
- `roadmap/next.md` — prioridades inmediatas.
- `versions/v1/*` — specs e historia de la fase 1 (referencia historica).

## Reglas duras (resumen; lista completa en `knowledge/AGENTS.md`)

- El codigo es el motor; los bots y templates viven en DB/configuracion. Sin clases/`if/else` por template o por bot.
- Capacidades que modifican el mundo = Actions (en codigo). En la UI todo se configura como interacciones con prompt; las ejecutables llevan `action_id` y de ahi se deriva `acciones_habilitadas_json`.
- Modelo: organization (negocio) -> account (cuenta) -> bot. No usar `tenant` ni `branch`.
- Si una accion no existe / no esta habilitada / no tiene proveedor, registrar guardrail event. No fingir ejecuciones de AI.
- PostgreSQL guarda la verdad; AI interpreta, el backend valida y audita.

## Comandos base

```bash
npm install
npm test            # Vitest, DB en memoria (pg-mem), sin Postgres externo
npm run db:up       # Postgres local via Docker
npm run db:migrate
npm run db:seed
npm run dev         # arranca el server (default :4000)
```

No versionar `package-lock.json` (`.npmrc` con `package-lock=false`). No hay `npm run build` por diseno.
