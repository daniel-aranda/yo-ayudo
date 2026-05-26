# V1 Phase 3: Preparación Para Pilotos

## Objetivo

Preparar el sistema para operar con negocios piloto reales sin construir todavía una plataforma self-service completa.

## Alcance Propuesto

- Auth mínima para dashboard.
- Configuración interna de tenants y números WhatsApp.
- Deploy cloud inicial.
- Logs operativos con request ids.
- Backups de PostgreSQL.
- Alertas básicas de errores.
- Export CSV de reportes diarios.
- Mejor report request por WhatsApp.
- Plantillas WhatsApp para mensajes fuera de ventana.
- Runbook de soporte.

## Tests Prioritarios

- Auth bloquea dashboard en production.
- Tenant A no ve datos de Tenant B.
- Webhook con `phone_number_id` desconocido falla sin guardar datos inconsistentes.
- Reporte diario usa solo datos de tenant/sucursal/día.
- Export CSV respeta filtros.

## Fuera De Alcance

- Marketplace de templates.
- Billing completo.
- Self-service onboarding.
- Automatizaciones avanzadas.
- Marketplace público de solution templates.
