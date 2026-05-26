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
- `GET /dashboard/tenants/:tenant_id`
- `GET /dashboard/tenants/:tenant_id/branches/:branch_id`
- `GET /dashboard/tenants/:tenant_id/branches/:branch_id/days/:date`
- `GET /review`

## Principios UI

- Mostrar operación del día de forma densa y clara.
- Priorizar ventas, compras, caja, inventario, notas, mensajes y review.
- Evitar dashboards decorativos.
- Evitar cards dentro de cards.
- No mostrar raw payloads en dashboard público.
- El texto debe caber en mobile y desktop.

## Seguridad De Vistas

Pug escapa interpolaciones por defecto. Mantener esa propiedad:

- Usar `=` para datos del usuario.
- Evitar `!=` salvo contenido propio y sanitizado.
- No renderizar tokens ni raw payloads completos.
