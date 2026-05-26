# Glosario

## Engine

Parte común del sistema que recibe mensajes, resuelve tenant, persiste raw payloads, despacha operaciones y registra resultados.

## Solution Template

Paquete operativo reusable. Ejemplo demo: `taqueria_control`.

## Bot Profile

Configuración del bot para un tenant o sucursal.

## Tenant

Negocio cliente. El seed demo crea `Margen Sabroso`.

## Branch

Sucursal de un tenant.

## Contact

Persona que escribe por WhatsApp.

## Conversation

Hilo de conversación por canal/contacto.

## Message

Mensaje inbound u outbound. Siempre conserva raw payload.

## Parsing Result

Resultado de clasificar y extraer estructura desde un mensaje.

## Review Item

Pendiente humano generado por baja confianza, datos faltantes o validación fallida.

## Business Day

Registro central de la operación diaria de una sucursal.
