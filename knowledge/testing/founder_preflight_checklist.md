# Founder Preflight Checklist

## Objetivo

Probar que YoAyudo ya puede operar un bot configurable interno sin WhatsApp real ni integraciones externas.

El caso base es `agente-whatsapp-yoayudo`: un bot configurable para registrar prospectos, crear tareas de seguimiento, generar resúmenes y mostrar guardrails cuando se pide algo que el engine todavía no puede ejecutar.

## Preparacion Local

1. Levantar base local:

```bash
npm run db:up
```

2. Aplicar migraciones y seed:

```bash
npm run db:migrate
npm run db:seed
```

3. Arrancar app:

```bash
npm run dev
```

4. Demo sin Postgres externo:

```bash
npm run demo:bot-engine
```

## Flujo Manual

1. Buscar o crear organization demo.
   - Seed: `YoAyudo Demo`.

2. Buscar o crear account demo.
   - Seed: `YoAyudo Ventas`.

3. Buscar bot configurable.
   - Seed: `agente-whatsapp-yoayudo`.
   - No es clase de código; vive como fila en `bots`.

4. Revisar configuración del bot.
   - `instrucciones_operativas`.
   - `definition_json.interactions`.
   - `acciones_habilitadas_json`.
   - `reglas_guardrail_json`.
   - `reglas_escalamiento_json`.

5. Probar compilación de prompt.
   - Endpoint: `POST /internal/bots/:bot_id/compile-prompt`.

6. Mandar mensaje de prueba.
   - Endpoint: `POST /internal/bots/:bot_id/test-message`.

Payload sugerido:

```json
{
  "organization_id": "<organization_id>",
  "account_id": "<account_id>",
  "modo_test": true,
  "mensaje": "Registra este prospecto: Clínica Dental Sonrisa. Llegó por recomendación. Quiere responder WhatsApp fuera de horario y confirmar citas. Crea una tarea para llamarle mañana y prepara un resumen del posible diagnóstico. También intenta programar una llamada automática."
}
```

7. Revisar respuesta.
   - Debe devolver `respuesta`.
   - Debe devolver `prompt_compilation_id`.
   - Debe devolver `action_requests`.
   - Debe devolver `actions_ejecutadas`.

8. Revisar audit logs.
   - Endpoint: `GET /internal/action-audit-logs?account_id=<account_id>&bot_id=<bot_id>`.
   - Deben aparecer `guardar_nota` y `crear_tarea` con status `executed`.

9. Revisar guardrail events.
   - Endpoint: `GET /internal/guardrail-events?account_id=<account_id>&bot_id=<bot_id>`.
   - Deben aparecer eventos cuando se pide una acción no habilitada, desconocida, sensible, inválida o stub.

10. Ajustar configuración y volver a probar.
   - Habilitar/deshabilitar action:

```http
POST /internal/bots/:bot_id/actions/:action_id
```

```json
{ "enabled": true }
```

## Diagnosticos AI

1. Crear diagnóstico:

```http
POST /internal/diagnosticos-ai
```

2. Actualizar entrevista, problemas y oportunidades:

```http
PATCH /internal/diagnosticos-ai/:diagnostico_id
```

3. Cambiar status:

```http
POST /internal/diagnosticos-ai/:diagnostico_id/status
```

4. Consultar:

```http
GET /internal/diagnosticos-ai/:diagnostico_id
```

## Si Funciona Hoy

- Crear/listar/editar bots configurables por endpoints internos.
- Compilar prompt auditable.
- Probar mensaje sin WhatsApp real.
- Ejecutar `guardar_nota`.
- Ejecutar `crear_tarea`.
- Ejecutar `generar_resumen`.
- Registrar `action_audit_logs`.
- Registrar `bot_guardrail_events`.
- Crear y actualizar `diagnosticos_ai`.

## No Funciona Todavia

- Email real.
- OCR real.
- Lectura real de PDFs o imágenes.
- Llamadas reales.
- Twilio.
- Facturación real.
- Propuestas PDF bonitas.
- UI comercial completa.

## No Probar Aun Como Productivo

- `enviar_email`.
- `extraer_datos_de_imagen`.
- `programar_llamada`.
- `llamar_y_conectar`.
- Cualquier promesa de integración externa.

Estas acciones deben producir confirmaciones, bloqueos o guardrail events; no deben fingir ejecución.
