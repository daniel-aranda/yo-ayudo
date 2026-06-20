# Next Roadmap

## Objetivo

Conectar gradualmente el Bot Engine configurable al flujo real sin romper el pipeline actual.

## Prioridades

1. Conectar el Prompt Compiler / seleccion de acciones por AI al inbound real.
   - Hecho: el inbound ejecuta operaciones via `execute_action` (auditado), multi-ejecucion, y ya **selecciona intenciones/acciones por AI** — `openai_provider.classify_intents` (multi-intent lenguaje libre), **on por default para todos los bots** (no opt-in; AI es el edge), con **fallback deterministico** en error (registrado en `ai_calls`). Ver `architecture/bot_engine.md`.
   - Falta: usar el **Prompt Compiler completo** en el inbound (hoy solo `test_message` compila prompt) y **extraccion de campos por AI** (hoy los `extract_*` son deterministicos; AI decide la intencion, no los montos).

2. Implementar mas handlers reales para las actions `stub_*`.
   - Hoy `buscar_negocios`, `crear_contacto` (CRM), `guardar_nota`, `crear_tarea`, `generar_resumen` y las operativas son ejecucion interna real.
   - Hecho: **CRM (prospectos/clientes)** — `crear_contacto` real con resolucion de identidad y clave de negocio derivada (CURP > tel > IG), captura por inbound (`lead_capture`), panel "Valor capturado" y **página CRM por cuenta** (`/dashboard/accounts/:id/crm`, tablero por etapa). Ver `architecture/crm.md`. El tablero usa **4 etapas base** (`CRM_BASE_STAGES`: nuevo/interesado/ganado/perdido), pliega las **categorías custom** bajo Interesado con dropdown (derivadas de los datos) y es **drag & drop** (mover columna persiste `pipeline_status`). Siguiente: **gestión de etapas por cuenta** persistente (agregar custom vacías / ocultar bases); páginas especializadas equivalentes para otras capacidades (Ventas, etc.).
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
   - Hecho (prerequisito): **los adjuntos inbound ya se persisten** (S3 si hay bucket, si no local) en `message_attachments` y se ven/sirven en el visor — base para OCR/transcripción sobre el binario guardado. Aplica a los tres canales con inbound (WhatsApp, Instagram, Messenger). Falta: keys S3 reales (hoy corre en fallback local).
   - Hecho: **inbound completo de Instagram DM y Facebook Messenger** (paridad con WhatsApp: webhook + identidad + pipeline + respuesta por Send API). Falta: tokens de página reales por cuenta (hoy sin token el envío queda `not_configured`, honesto) y lookup de perfil para el nombre del remitente (hoy null si el webhook no lo trae).

## Direccion de producto (decisiones del founder, 2026-06-12)

- **Auth por negocio**: IMPLEMENTADO detras de `AUTH_ENABLED` (default off). Owner de plataforma ve todo; usuarios de negocio loguean en `/login` y solo ven `/dashboard/business/:su_negocio`. Falta para produccion: reset de password, invitaciones, rate-limit de login y roles mas finos (hoy owner/member). Detalle en `IMPLEMENTATION_STATUS.md` seccion Auth.
- **Marketplace de bots usuario-a-usuario** (futuro, aun sin disenar): usuarios podran publicar/compartir bots. Refuerza la regla de oro: los bots son configuracion (filas/JSON portables), no codigo. Cualquier decision sobre `bot_type` system/custom debe mantener la definicion serializable y separada de capacidades ejecutables (actions con guardrails).
