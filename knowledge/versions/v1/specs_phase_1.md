# V1 Phase 1: MVP Operativo YoAyudo

## Objetivo

Construir el primer engine funcional para capturar operación de un negocio por WhatsApp y verla en un dashboard simple. El primer template de solución es `taqueria_control`; el cliente demo es `Margen Sabroso` como dato de seed, no como código runtime.

## Alcance

- Servidor Express con `/health`.
- Configuración por env vars.
- PostgreSQL.
- Schema multi-tenant inicial.
- Migraciones.
- Seed demo para cliente `Margen Sabroso`.
- Webhook WhatsApp GET/POST.
- Guardar raw payload antes de procesar.
- AI Gateway con `mock_provider`.
- Solution template `taqueria_control`.
- Intents operativos:
  - `day_start`
  - `sales_update`
  - `purchase`
  - `inventory_update`
  - `daily_close`
  - `daily_note`
  - `report_request`
  - `human_help`
  - `unknown`
- Parsers básicos para texto.
- Handlers para compras, ventas, inventario, inicio y cierre.
- Review queue por baja confianza o datos faltantes.
- Dashboard server-rendered.
- Endpoint dev para simular mensajes.
- Tests mínimos de flujos principales.
- README local.
- JavaScript ES Modules sin TypeScript ni compilación obligatoria.

## Criterios De Aceptación

- `npm install` funciona.
- `npm test` pasa.
- `npm run start` levanta sin compilar.
- `npm run db:migrate` aplica schema.
- `npm run db:seed` crea demo.
- `POST /dev/simulate-whatsapp-message` guarda mensaje y datos operativos.
- Dashboard muestra operación diaria.
- Review queue muestra mensajes incompletos.

## Fuera De Alcance

- Flow builder visual.
- Billing.
- Frontend SPA.
- Integraciones cloud avanzadas.
- POS.
- Analytics predictivo.

## Estado

Implementado como base inicial genérica.
