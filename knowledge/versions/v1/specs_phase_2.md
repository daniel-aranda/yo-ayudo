# V1 Phase 2: Robustez Operativa

## Objetivo

Hacer que el template `taqueria_control` sea más confiable con datos reales, mensajes ambiguos y operación diaria repetida. El cliente demo `Margen Sabroso` debe seguir siendo solo seed/configuración.

## Alcance Propuesto

- Idempotencia de mensajes por `external_message_id`.
- Mejor parsing de compras con múltiples items.
- Mejor parsing de cierres incompletos.
- Review resolve con aplicación de corrección estructurada.
- Filtros por fecha en dashboard.
- Página de detalle de mensaje.
- Tests funcionales de endpoints HTTP con `supertest`.
- Tests específicos del webhook verification.
- Validar ventana de atención de 24 horas para respuestas libres.
- Mejor manejo de contactos y roles.

## Tests Prioritarios

- WhatsApp retry no duplica compra.
- Compra con dos productos crea dos rows o manda a review, según decisión.
- Cierre sin método de pago genera alerta pero guarda ventas si es válido.
- Resolver review actualiza mensaje y status.
- Dashboard muestra ventas/compras después de simulaciones.

## Decisiones Pendientes

- ¿Las correcciones de review deben re-ejecutar handlers o solo almacenar resolución?
- ¿El parser debe aceptar varios registros en un solo mensaje?
- ¿Cuál es el umbral real de confianza para mandar a review?
- ¿Cuándo se considera cerrado un día si llega nueva información?
