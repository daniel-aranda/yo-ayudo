# Next Roadmap

## Objetivo

Conectar gradualmente el Bot Engine configurable al flujo real sin romper el pipeline actual.

## Prioridades

1. Conectar Bot Engine al inbound real de forma incremental.
   - Mantener fallback de `src/agents`.
   - Empezar con bots opt-in.

2. Implementar 2-3 actions internas reales antes de integraciones externas.
   - `guardar_nota`
   - `crear_tarea`
   - `crear_solicitud_facturacion`

3. Crear UI minima de builder interno.
   - Crear/editar bot configurable.
   - Habilitar/deshabilitar actions.
   - Editar prompt, reglas y campos.

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
