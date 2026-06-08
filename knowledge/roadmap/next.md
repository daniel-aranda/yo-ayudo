# Next Roadmap

## Objetivo

Conectar gradualmente el Bot Engine configurable al flujo real sin romper el pipeline actual.

## Prioridades

1. Conectar Bot Engine al inbound real de forma incremental.
   - Mantener fallback de `src/agents`.
   - Empezar con bots opt-in.

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
