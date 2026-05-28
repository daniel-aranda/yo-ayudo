# Founder Use Case

## Objetivo Comercial

YoAyudo debe permitir vender bots de WhatsApp a negocios rapidamente.

El caso principal del founder es dar de alta un negocio, conectarle uno o mas numeros de WhatsApp y asignarles bots sin trabajo manual de ingenieria por cliente.

## Modelo Mental

1. `organization`
   - Representa al duenho o grupo empresarial.
   - Para muchos clientes pequenos, la organization sera el mismo negocio.

2. `account`
   - Representa un negocio dentro de la organization.
   - En el caso comun habra una organization con un account.
   - Si el mismo duenho tiene varios negocios, la organization tendra varios accounts.

3. `whatsapp_phone_numbers`
   - Cada account puede tener uno o varios numeros de WhatsApp.
   - Cada numero debe poder resolverse de forma directa desde `phone_number_id`.

4. `bots`
   - A cada numero se le asigna un bot activo.
   - El bot puede ser predefinido del sistema o custom.
   - Un `system` bot es una configuracion predefinida o legacy lista para asignarse.
   - Un `custom` bot pertenece a un account y guarda una definicion estructurada en `definition_json`.

5. `custom bots`
   - Un custom bot debe poder crearse casi con lenguaje humano.
   - El sistema debe convertir esa descripcion en configuracion estructurada en fases posteriores.

## Ruta Critica Para Vender

La ruta inicial para onboarding debe ser:

```text
organization -> account -> whatsapp_phone_number -> active bot assignment -> bot
```

`tenant`, `branch` y `bot_profile` siguen vivos como compatibilidad tecnica del runtime actual, pero no deben ser la ruta mental principal para vender o dar de alta clientes nuevos.

## Regla De Producto Fase 1

Un numero de WhatsApp tiene un solo bot activo asignado.

El modelo conserva historial de asignaciones para poder cambiar el bot de un numero sin perder trazabilidad, pero no implementa multiples bots activos por numero todavia.

## Regla De Producto Fase 2

Un custom bot puede existir como dato estructurado antes de tener builder visual o LLM builder.

La definicion inicial incluye objetivo, intents soportados, campos requeridos, subagentes declarativos, routing declarativo, politica de handoff, necesidades de knowledge, estilo de respuesta y restricciones.

La definicion queda disponible para runtime y trazabilidad, pero el routing inteligente y el uso formal de business knowledge/conversation memory quedan para fases posteriores.

## Regla De Producto Fase 3

La definicion del bot no es knowledge del negocio ni memoria conversacional.

- `bot_definition`: que debe hacer el bot, que campos pide, como escala y que estilo usa.
- `business_knowledge`: como opera el negocio. Servicios, precios, reglas, procesos, politicas, horarios, FAQs e instrucciones del duenho.
- `conversation_memory`: que ha pasado con este cliente o conversacion. Mensajes relevantes, datos capturados, pendientes, objeciones, decisiones y estado.

Esta separacion permite vender custom bots sin hardcodear clientes y prepara el camino para S3, Bedrock Knowledge Bases, embeddings y retrieval semantico sin obligarlos en el MVP.

## Regla De Producto Fase 4

Un bot custom puede definir subagentes en `definition_json.agent_definitions`.

Ejemplos de subagentes:

- `ventas`
- `soporte`
- `documentos`
- `seguimiento`
- `intake`
- `handoff_humano`

El router usa la definicion del bot, `routing_config`, `handoff_policy`, intencion detectada, business knowledge y conversation memory para elegir un subagente. No usa todavia un router LLM; la estrategia actual es heuristica y trazable.

La decision queda en `agent_runs` con:

- agente seleccionado
- candidatos evaluados
- razon
- confianza
- señales usadas
- si se recomienda handoff

Esto habilita vender bots custom configurables sin crear codigo por cliente. Lo pendiente es el builder desde lenguaje natural, router LLM real, Bedrock Knowledge Bases real, S3 productivo y vector DB externa.

## Regla De Producto Fase 5

YoAyudo no se vende como "bots de WhatsApp"; se vende como bots configurables con acciones reales, knowledge, prompts y guardrails.

Templates iniciales editables:

- `recepcionista_ai`
- `seguimiento_ventas`
- `agenda_facil`
- `factura_facil`
- `documentos_facil`
- `cobranza_suave`

Un template define configuración sugerida: prompt base, acciones sugeridas, knowledge sugerido, campos recomendados y reglas. Desde un template se puede crear un bot custom, pero el engine no tiene lógica especial por template.

La capa de acciones separa valor real de conversación:

- acciones automáticas como guardar notas, crear tareas o generar resúmenes.
- acciones con confirmación como enviar email, facturación, pagos u OCR sensible.
- acciones solo humano o futuras como llamadas y conexión telefónica.

Los diagnósticos AI de $400 se guardan como entidad comercial. Permiten registrar entrevista, problemas detectados, oportunidades, bots/templates recomendados, acciones recomendadas y propuesta preliminar. El diagnóstico puede acreditarse al primer mes.

OCR queda como capacidad clave con contrato para fotos, screenshots, PDFs, tickets, constancias y comprobantes. Voz/Twilio queda preparada como proveedor futuro, sin credenciales ni integración real.
