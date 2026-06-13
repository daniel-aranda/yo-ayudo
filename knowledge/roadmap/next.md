# Next Roadmap

## Objetivo

Conectar gradualmente el Bot Engine configurable al flujo real sin romper el pipeline actual.

## Prioridades

1. Conectar el Prompt Compiler / seleccion de acciones por AI al inbound real.
   - Hecho: el inbound ya ejecuta operaciones via `execute_action` (auditado) y soporta multi-ejecucion (varias interacciones por mensaje) con NLU deterministico (`classify_intents` + segmentacion). Ver `architecture/bot_engine.md`.
   - Falta: que el inbound use el prompt compilado + seleccion de acciones por AI (hoy decide por keywords, no por modelo).
   - Implementar `classify_intents` en el provider OpenAI para multi-intent con lenguaje libre (hoy hace fallback a un solo intent).
   - Mantener fallback deterministico; empezar con bots opt-in.

2. Implementar mas handlers reales para las actions `stub_*`.
   - Hoy solo `buscar_negocios`, `guardar_nota`, `crear_tarea` y `generar_resumen` son ejecucion interna real.
   - Priorizar el resto sin venderlas como reales hasta tener handler o proveedor.

3. Builder LLM de bots desde lenguaje natural.
   - El editor interno ya permite editar bot configurable, habilitar/deshabilitar actions y editar prompt, reglas y campos.
   - Siguiente paso: generar y ajustar esa configuracion desde una descripcion en lenguaje natural.

4. Crear vista interna de guardrail events/capability gaps.
   - Filtrar por bot/account/action/tipo.
   - Convertir eventos en tareas internas.

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
