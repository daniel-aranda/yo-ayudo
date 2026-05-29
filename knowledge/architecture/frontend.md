# Arquitectura Frontend

## Enfoque MVP

El dashboard es server-rendered con Pug, CSS propio y JavaScript mínimo. No se usa React/Vue/Svelte en el MVP.

La UI debe ser una cabina de control, no una landing page.

## Ubicación

```text
src/web/views
src/web/public/css
src/dashboard
```

## Rutas Actuales

- `GET /dashboard`
- `GET /dashboard/business/:business_id`
- `GET /dashboard/business/:business_id/accounts/:account_id`
- `GET /inspector`
- `GET /review`

## Principios UI

- Mostrar business, accounts, canales, bots, conversaciones y eventos del engine.
- No hardcodear métricas verticales como ventas, compras, caja o inventario en el dashboard base.
- Evitar dashboards decorativos.
- Evitar cards dentro de cards.
- No mostrar raw payloads en dashboard público.
- El texto debe caber en mobile y desktop.

## Seguridad De Vistas

Pug escapa interpolaciones por defecto. Mantener esa propiedad:

- Usar `=` para datos del usuario.
- Evitar `!=` salvo contenido propio y sanitizado.
- No renderizar tokens ni raw payloads completos.
