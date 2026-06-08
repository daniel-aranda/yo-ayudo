# Founder Use Case

## Objetivo Comercial

YoAyudo debe permitir vender y operar bots configurables para negocios sin trabajo manual de ingenieria por cliente.

El producto no debe vender "agentes hardcodeados". Debe vender un Bot Engine configurable que convierte:

```text
prompts + business knowledge + conversation memory + actions + guardrails
```

en bots operativos capaces de atender, vender, dar seguimiento, organizar trabajo y ejecutar acciones seguras.

## Direccion Actual

- El codigo es el motor.
- Los bots son configuracion.
- Las acciones son capacidades.
- Los guardrails son el radar de seguridad y roadmap.
- WhatsApp es un canal importante, no el centro del dominio.

## Modelo Mental De Venta

1. `organization`
   - Representa al duenho o grupo empresarial.
   - Para muchos clientes pequenos, la organization sera el mismo negocio.

2. `account`
   - Representa un negocio dentro de la organization.
   - En el caso comun habra una organization con un account.
   - Si el mismo duenho tiene varios negocios, la organization tendra varios accounts.

3. `whatsapp_phone_numbers`
   - Cada account puede tener uno o varios numeros de WhatsApp.
   - Cada numero debe resolverse de forma directa desde `phone_number_id`.

4. `bot`
   - Configuracion operativa asociada a un account.
   - Puede partir de un `bot_template`, pero no depende de codigo especial por template.
   - Define prompt, knowledge, memoria, acciones habilitadas, reglas y guardrails.

5. `bot_template`
   - Punto de partida editable para crear bots.
   - Vive en DB/configuracion.
   - Ejemplos: `recepcionista_ai`, `seguimiento_ventas`, `agenda_facil`, `factura_facil`, `documentos_facil`, `cobranza_suave`.

## Ruta Critica Para Vender

```text
organization -> account -> whatsapp_phone_number -> active bot assignment -> bot configurable
```

`bot_profile`, `solution_template` y `src/agents` siguen vivos como compatibilidad tecnica/transicional, pero no deben ser la ruta mental principal para vender ni para construir nuevas features.

## Que Debe Poder Definir Un Bot

- nombre y descripcion.
- prompt base.
- instrucciones operativas.
- tono.
- objetivos.
- business knowledge asociado.
- conversation memory habilitada o no.
- acciones habilitadas.
- reglas de guardrail.
- reglas de escalamiento.
- campos a capturar.
- status.

## Acciones Como Valor Real

La capa de acciones separa conversacion de ejecucion real.

Ejemplos:

- crear tarea.
- guardar nota.
- crear recordatorio.
- cambiar estatus.
- enviar email con confirmacion.
- crear solicitud de facturacion.
- validar datos fiscales.
- revisar documentos requeridos.
- extraer datos de imagen/PDF como capacidad futura real.
- preparar llamadas como capacidad premium futura.

Si algo modifica el mundo, debe ser Action. Si el bot intenta hacer algo que no existe o no esta habilitado, debe registrarse guardrail event.

## Guardrails Como Roadmap

Los guardrails protegen al negocio y tambien muestran demanda real.

Ejemplos:

- accion no disponible.
- accion no habilitada para el bot.
- requiere confirmacion humana.
- riesgo bloqueado.
- proveedor no configurado.
- input invalido.
- permiso insuficiente.

El engine no debe fingir que ejecuto una accion. Debe responder de forma segura, escalar si aplica y registrar el evento.

## Diagnostico Comercial

Los diagnosticos AI de $400 se guardan como entidad comercial. Permiten registrar:

- entrevista.
- problemas detectados.
- oportunidades AI.
- bots/templates recomendados.
- acciones recomendadas.
- precio mensual sugerido.
- propuesta preliminar.

El diagnostico puede acreditarse al primer mes. Su salida debe ayudar a crear/configurar bots desde la app sin tocar codigo.

## Compatibilidad Transicional

`definition_json.agent_definitions`, subagentes, `agent_router` y `agent_runs` existen porque el pipeline actual los usa. Son utiles para trazabilidad y routing legacy/transicional.

No son el futuro conceptual del producto.

Para nuevas features, preferir:

```text
Bot Engine + Actions + Prompt Compiler + Guardrails
```

La historia de Fase 1-4 esta en `knowledge/versions/v1/founder_use_case_history.md`.
