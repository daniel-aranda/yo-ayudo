# Next Roadmap

## Objetivo

Conectar gradualmente el Bot Engine configurable al flujo real sin romper el pipeline actual.

## Prioridades

1. Conectar el Prompt Compiler / seleccion de acciones por AI al inbound real.
   - Hecho: el inbound ejecuta operaciones via `execute_action` (auditado), multi-ejecucion, y ya **selecciona intenciones/acciones por AI** — `openai_provider.classify_intents` (multi-intent lenguaje libre), **opt-in por bot** (`definition_json.ai.use_ai_intents`, checkbox en el editor), con **fallback deterministico** en error (registrado en `ai_calls`). Ver `architecture/bot_engine.md`.
   - Falta: usar el **Prompt Compiler completo** en el inbound (hoy solo `test_message` compila prompt) y **extraccion de campos por AI** (hoy los `extract_*` son deterministicos; AI decide la intencion, no los montos).

2. Implementar mas handlers reales para las actions `stub_*`.
   - Hoy solo `buscar_negocios`, `guardar_nota`, `crear_tarea` y `generar_resumen` son ejecucion interna real.
   - Priorizar el resto sin venderlas como reales hasta tener handler o proveedor.

3. Builder LLM de bots desde lenguaje natural.
   - El editor interno ya permite editar bot configurable, habilitar/deshabilitar actions y editar prompt, reglas y campos.
   - Siguiente paso: generar y ajustar esa configuracion desde una descripcion en lenguaje natural.

4. ~~Crear vista interna de guardrail events/capability gaps.~~ HECHO.
   - `GET /admin/guardrails`: filtra por account/bot/action/tipo/status + rollup de gaps por accion; `POST /admin/guardrails/:id/task` convierte un evento en tarea interna. Ver `architecture/guardrails.md`.
   - Auto-aprendizaje: resolver un `review_item` con "Guardar como conocimiento" crea business_knowledge reusable (ver `architecture/memory.md`).

5. Conectar diagnostico -> template -> bot configurable.
   - Usar `bots_recomendados`.
   - Crear bot desde template editable.
   - Generar checklist de knowledge faltante.

6. Dejar OCR real y voz/Twilio para fases posteriores.
   - Mantener contratos y stubs.
   - No prometer ejecucion real hasta tener provider productivo.

## Direccion de producto (decisiones del founder, 2026-06-12)

- **Auth por negocio**: IMPLEMENTADO detras de `AUTH_ENABLED` (default off). Owner de plataforma ve todo; usuarios de negocio loguean en `/login` y solo ven `/dashboard/business/:su_negocio`. Falta para produccion: reset de password, invitaciones, rate-limit de login y roles mas finos (hoy owner/member). Detalle en `IMPLEMENTATION_STATUS.md` seccion Auth.
- **Marketplace de bots usuario-a-usuario** (futuro, aun sin disenar): usuarios podran publicar/compartir bots. Refuerza la regla de oro: los bots son configuracion (filas/JSON portables), no codigo. Cualquier decision sobre `bot_type` system/custom debe mantener la definicion serializable y separada de capacidades ejecutables (actions con guardrails).
