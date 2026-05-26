# Convenciones De Código

## JavaScript Runtime

- Usar JavaScript moderno con ES Modules.
- No agregar TypeScript, `ts-node`, `tsx` ni build step obligatorio.
- Validar datos externos con Zod en runtime.
- Usar JSDoc solo en fronteras importantes: providers, parsers, handlers y contratos normalizados.
- Nombrar con intención de dominio.
- Usar `snake_case` para identificadores propios del proyecto: archivos, variables, funciones, clases, metodos, propiedades internas, payloads internos, tablas y columnas.
- No introducir identificadores con mayuscula interna en codigo propio.
- Mantener nombres externos tal como los exige la libreria o plataforma cuando no los controlamos, por ejemplo APIs de Node.js, pg, Express, Vitest, Zod, Intl o payloads de proveedores.

## Módulos

Cada archivo debe tener una responsabilidad clara.

Separar:

- HTTP routes.
- Parsing.
- Validación.
- Persistencia.
- Reglas determinísticas.
- Respuestas de WhatsApp.

## Errores

- Evitar `try/catch` enormes.
- Capturar errores cuando haya una decisión local útil.
- No filtrar secretos en logs.
- Preferir errores claros sobre fallos silenciosos.

## Comentarios

Usar comentarios solo cuando el código tenga una decisión no obvia.

Evitar comentarios como:

```js
// Set value
```

Preferir comentarios de intención:

```js
// Keep this idempotent because WhatsApp can retry webhooks.
```

## SQL

- Preferir SQL explícito para migraciones.
- Mantener nombres de columnas en `snake_case`.
- Usar constraints para invariantes importantes.
- Evitar lógica de negocio escondida en SQL complejo si puede vivir mejor en reglas testeables.

## Dependencias

Agregar una dependencia solo si:

- Reduce complejidad real.
- Evita implementar una pieza riesgosa.
- Encaja con el stack actual.

No agregar frameworks frontend pesados en el MVP.

## Package Management

- No versionar `package-lock.json`.
- Mantener `.npmrc` con `package-lock=false`.
- Gestionar estabilidad de dependencias desde `package.json`, rangos conscientes y upgrades revisados.
- Si `npm install` genera un lockfile por accidente, eliminarlo antes de cerrar la tarea.
