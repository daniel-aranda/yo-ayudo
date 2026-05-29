# Founder Trial Checklist

## Objetivo

Validar manualmente que YoAyudo puede usarse internamente para operar ventas, prospectos, tareas, seguimiento y diagnósticos básicos con un Bot Engine configurable.

Regla principal:

```text
El código es el motor. Los bots son configuración. Las actions son capacidades. Los guardrails son radar de seguridad y roadmap.
```

## Preparación

Corre desde la raíz del repo:

```bash
npm install
npm test
npm run db:up
npm run db:migrate
npm run db:seed
npm run demo:bot-engine
npm run dev
```

La app local corre en:

```text
http://localhost:3000
```

Datos demo esperados:

- Organization: `YoAyudo Demo`
- Account: `YoAyudo Ventas`
- Bot configurable: `operador_comercial_yoayudo`
- Actions reales habilitadas: `guardar_nota`, `crear_tarea`, `generar_resumen`, `solicitar_aprobacion_humana`
- Actions futuras/stub visibles pero no productivas: `programar_llamada`, `llamar_y_conectar`, `extraer_datos_de_imagen`, `enviar_email`

## Prueba Rápida Por Script

```bash
npm run demo:bot-engine
```

Debe mostrar:

- Bot `operador_comercial_yoayudo`.
- `prompt_compilation_id`.
- Action requests detectadas.
- `guardar_nota` ejecutada.
- `crear_tarea` ejecutada.
- `generar_resumen` ejecutada.
- `programar_llamada` bloqueada con guardrail.
- `action_audit_logs`.
- `bot_guardrail_events`.

Mensaje usado por la demo:

```text
Registra este prospecto: Clínica Dental Sonrisa. Llegó por recomendación. Quiere responder WhatsApp fuera de horario y confirmar citas. Crea una tarea para llamarle mañana y prepara un resumen del posible diagnóstico. También intenta programar una llamada automática.
```

## Endpoints Internos Relevantes

- `GET /internal/bot-templates`
- `GET /internal/actions`
- `GET /internal/bots`
- `POST /internal/bots`
- `PATCH /internal/bots/:bot_id`
- `POST /internal/bots/:bot_id/actions/:action_id`
- `POST /internal/bots/:bot_id/compile-prompt`
- `POST /internal/bots/:bot_id/test-message`
- `POST /internal/action-executions`
- `GET /internal/action-audit-logs`
- `GET /internal/guardrail-events`
- `POST /internal/diagnosticos-ai`
- `PATCH /internal/diagnosticos-ai/:diagnostico_id`
- `POST /internal/diagnosticos-ai/:diagnostico_id/propuesta-preliminar`

En producción, las rutas internas pueden requerir `x-internal-token` si `INSPECTOR_INTERNAL_TOKEN` está configurado. En desarrollo local no hace falta.

## Flujo Manual

### 1. Ver templates disponibles

```bash
curl http://localhost:3000/internal/bot-templates
```

### 2. Ver actions disponibles

```bash
curl http://localhost:3000/internal/actions
```

### 3. Ver bots y copiar IDs

```bash
curl http://localhost:3000/internal/bots
```

Copia del bot `operador_comercial_yoayudo`:

- `id` como `bot_id`
- `organization_id`
- `account_id`

### 4. Crear bot configurable

Payload listo para copiar:

```bash
curl -X POST http://localhost:3000/internal/bots \
  -H "Content-Type: application/json" \
  -d '{
    "account_id": "<account_id>",
    "template_id": "seguimiento_ventas",
    "nombre": "Operador Comercial Founder Test",
    "slug": "operador-comercial-founder-test",
    "descripcion": "Bot de prueba para operar ventas internas de YoAyudo.",
    "status": "active",
    "prompt_base": "Eres un operador comercial interno de YoAyudo. Registra prospectos, crea tareas, genera resúmenes y no finjas acciones externas.",
    "instrucciones_operativas": "Usa solo actions habilitadas. Si falta una capacidad, registra guardrail y responde de forma segura.",
    "tono": "directo, práctico y comercial",
    "acciones_habilitadas": ["guardar_nota", "crear_tarea", "generar_resumen", "solicitar_aprobacion_humana"],
    "reglas_guardrail": ["No fingir llamadas, emails, OCR ni integraciones externas."],
    "reglas_escalamiento": ["Escalar si piden email real, llamada real, OCR real o descuento no autorizado."],
    "campos_a_capturar": ["negocio_nombre", "contacto", "interes", "siguiente_accion"]
  }'
```

### 5. Actualizar prompt o acciones del bot

```bash
curl -X PATCH http://localhost:3000/internal/bots/<bot_id> \
  -H "Content-Type: application/json" \
  -d '{
    "prompt_base": "Eres el operador comercial interno de YoAyudo. Tu prioridad es registrar contexto comercial accionable y crear seguimiento.",
    "instrucciones_operativas": "Responde breve. Ejecuta solo actions habilitadas. No prometas integraciones no conectadas.",
    "acciones_habilitadas_json": ["guardar_nota", "crear_tarea", "generar_resumen", "solicitar_aprobacion_humana"]
  }'
```

### 6. Habilitar o deshabilitar action

```bash
curl -X POST http://localhost:3000/internal/bots/<bot_id>/actions/enviar_email \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true }'
```

Para deshabilitar:

```bash
curl -X POST http://localhost:3000/internal/bots/<bot_id>/actions/enviar_email \
  -H "Content-Type: application/json" \
  -d '{ "enabled": false }'
```

### 7. Compilar prompt

```bash
curl -X POST http://localhost:3000/internal/bots/<bot_id>/compile-prompt \
  -H "Content-Type: application/json" \
  -d '{
    "business_knowledge": [
      {
        "id": "kb-demo-ventas",
        "title": "Oferta YoAyudo",
        "document_family": "business_knowledge",
        "document_type": "sales_notes",
        "score": 1
      }
    ],
    "conversation_memory": [
      {
        "id": "mem-demo-prospecto",
        "title": "Prospecto quiere seguimiento por WhatsApp",
        "document_family": "conversation_memory",
        "document_type": "summary",
        "score": 1
      }
    ]
  }'
```

### 8. Mandar test message

```bash
curl -X POST http://localhost:3000/internal/bots/<bot_id>/test-message \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "<organization_id>",
    "account_id": "<account_id>",
    "modo_test": true,
    "mensaje": "Registra este prospecto: Clínica Dental Sonrisa. Llegó por recomendación. Quiere responder WhatsApp fuera de horario y confirmar citas. Crea una tarea para llamarle mañana y prepara un resumen del posible diagnóstico. También intenta programar una llamada automática."
  }'
```

Resultado esperado:

- `prompt_compilation_id` existe.
- `action_requests` contiene `guardar_nota`, `crear_tarea`, `generar_resumen`, `programar_llamada`.
- `actions_ejecutadas` contiene `guardar_nota`, `crear_tarea`, `generar_resumen`.
- `guardrail_events_generados` contiene `programar_llamada`.
- La respuesta no afirma que la llamada ocurrió.

### 9. Ejecutar action directa en modo test

```bash
curl -X POST http://localhost:3000/internal/action-executions \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "<organization_id>",
    "account_id": "<account_id>",
    "bot_id": "<bot_id>",
    "action_id": "guardar_nota",
    "actor_type": "bot",
    "input_json": {
      "nota": "Founder habló con Clínica Dental Sonrisa. Interés: responder WhatsApp fuera de horario y confirmar citas."
    }
  }'
```

### 10. Revisar audit logs

```bash
curl "http://localhost:3000/internal/action-audit-logs?account_id=<account_id>&bot_id=<bot_id>"
```

Debes ver:

- `guardar_nota` con `status=executed`.
- `crear_tarea` con `status=executed`.
- `generar_resumen` con `status=executed`.
- acciones bloqueadas o pendientes cuando aplique.

### 11. Revisar guardrail events

```bash
curl "http://localhost:3000/internal/guardrail-events?account_id=<account_id>&bot_id=<bot_id>"
```

Casos esperados:

- `accion_no_habilitada`: action existe pero el bot no la tiene habilitada.
- `accion_no_disponible`: action desconocida o stub sin handler productivo.
- `requiere_confirmacion`: action sensible que necesita humano.
- `riesgo_bloqueado`: action `solo_humano`.
- `input_invalido`: payload incompleto.
- `permiso_insuficiente`: faltan permisos explícitos si se mandan `permisos_disponibles`.

### 12. Crear diagnóstico AI

```bash
curl -X POST http://localhost:3000/internal/diagnosticos-ai \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "<organization_id>",
    "account_id": "<account_id>",
    "negocio_nombre": "Clínica Dental Sonrisa",
    "giro": "clínica dental",
    "contacto_nombre": "Dra. Ana",
    "contacto_telefono": "5551234567",
    "contacto_email": "ana@example.com",
    "vendedor_id": "founder",
    "precio_diagnostico": 400,
    "moneda": "MXN",
    "pagado": true,
    "acreditable": true,
    "respuestas_entrevista": {
      "llegada_clientes": "Recomendaciones y WhatsApp.",
      "ventas": "Confirman citas manualmente.",
      "tareas_repetitivas": "Responder fuera de horario y recordar citas."
    }
  }'
```

### 13. Actualizar diagnóstico

```bash
curl -X PATCH http://localhost:3000/internal/diagnosticos-ai/<diagnostico_id> \
  -H "Content-Type: application/json" \
  -d '{
    "problemas_detectados": [
      "Pierden prospectos fuera de horario.",
      "Confirmación de citas depende de seguimiento manual."
    ],
    "oportunidades_ai": [
      "Bot configurable para recepción y seguimiento.",
      "Tareas automáticas para llamadas de seguimiento."
    ],
    "bots_recomendados": ["recepcionista_ai", "agenda_facil", "seguimiento_ventas"],
    "acciones_recomendadas": ["guardar_nota", "crear_tarea", "generar_resumen"],
    "precio_mensual_sugerido": 2000,
    "status": "analisis"
  }'
```

### 14. Generar propuesta preliminar estructurada

```bash
curl -X POST http://localhost:3000/internal/diagnosticos-ai/<diagnostico_id>/propuesta-preliminar \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 15. Ver inspector si aplica

```text
http://localhost:3000/inspector
```

Úsalo para revisar conversaciones, bots, mensajes y trazas del pipeline actual cuando estés probando WhatsApp/dev simulation.

## Errores Y Estados Que Deben Ser Legibles

- Bot no existe: `404`, `bot_not_found`.
- `modo_test` faltante o falso: `400`, `modo_test_required`.
- Action no existe: result `unknown_action` y guardrail `accion_no_disponible`.
- Action no habilitada: result `blocked` y guardrail `accion_no_habilitada`.
- Action requiere confirmación: result `pending_confirmation` y audit log con `confirmation_required=true`.
- Action `solo_humano`: result `blocked` y guardrail `riesgo_bloqueado`.
- Input inválido: result `failed` y guardrail `input_invalido`.
- Stub/no implementada: result `not_implemented` o bloqueo seguro y guardrail.
- Proveedor no configurado: result `pending_provider` o bloqueo seguro y guardrail.

## Sí Funciona Para Prueba Founder

- Crear bots configurables.
- Editar prompt e instrucciones.
- Habilitar/deshabilitar actions.
- Compilar prompt.
- Probar mensaje sin WhatsApp real.
- Ejecutar `guardar_nota`.
- Ejecutar `crear_tarea`.
- Ejecutar `generar_resumen`.
- Ver `action_audit_logs`.
- Ver `bot_guardrail_events`.
- Crear y editar diagnósticos AI.
- Generar propuesta preliminar estructurada.
- Usar `bot_templates` editables como base.

## No Funciona Todavía

- WhatsApp Cloud API real end-to-end con Meta.
- Auth productiva y roles.
- UI comercial avanzada.
- Alta completa organization/account/número/bot por UI.
- Builder LLM desde lenguaje natural.
- Router LLM real.
- OCR real.
- Twilio/voz real.
- Email real.
- Bedrock Knowledge Bases real.
- S3 productivo probado.
- Vector DB real.
- Generación PDF de propuesta.
- Mayoría de actions reales.
- Idempotencia robusta.
- Aislamiento perfecto de conversación por número/bot.

## Regla De Prueba

Si el bot dice que ejecutó una llamada, envió un email, leyó una imagen/PDF o conectó una integración externa, eso es bug. Hoy debe registrar guardrail o pedir confirmación, no fingir ejecución.
