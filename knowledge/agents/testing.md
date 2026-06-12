# Estrategia De Testing

## Runner

- `npm test` corre Vitest (`vitest run`).
- Hoy son 25 archivos de test / 104 tests, todos en verde.
- Los archivos viven en `tests/unit/` y `tests/integration/`.
- `vitest.config.js` fija `testTimeout`/`hookTimeout` en 20s: la suite es DB-backed (pg-mem) y bajo carga paralela un test lento ocasionalmente pasaba el default de 5s (flaky por timeout, no por lógica).
- `seed_development_data` (lo usa `create_test_pool`) debe ser un **slate limpio y contable**: muchos tests cuentan filas exactas (mensajes, audit logs, conversaciones) tras `simulate`. Data demo de relleno (`seed_demo_conversation` = multi-ejecución; `seed_routed_demo_conversation` = ruteo a agentes) va **solo en el entrypoint dev de `seed.js`**, NO en `seed_development_data`. Si un test la necesita, la invoca explícito.

## Filosofía

Nos gustan los unit tests cuando protegen lógica que realmente puede romperse:

- Reglas de negocio.
- Cálculos determinísticos.
- Parsers con casos borde.
- Validaciones.
- Idempotencia.
- Bugs regresivos.

No queremos tests puramente decorativos:

- Tests que solo mockean todo.
- Tests que duplican implementación.
- Tests que prueban que un mock fue llamado sin validar comportamiento útil.

## Tipos De Prueba

### Unit Tests Valiosos

Usar para:

- reglas operativas
- funciones de parsing no triviales
- cálculo de caja
- margen estimado
- alertas por datos faltantes
- validación de schemas Zod

### Tests Funcionales De Backend

Usar para endpoints y flujos:

- `GET /health`
- `GET /webhooks/whatsapp` verify token
- `POST /webhooks/whatsapp`
- `POST /dev/simulate-whatsapp-message`
- `GET /dashboard`
- `GET /review`

Estos tests deben validar efectos en base de datos, no solo status code.

### Tests De Módulos

Usar cuando una clase o módulo encapsula comportamiento:

- `mock_provider`
- `message_intent_parser`
- handlers operativos

### Integration Tests Con DB

Usar `pg-mem` (un Postgres en memoria) cuando el objetivo sea rapidez local. Los tests de integracion aplican las migraciones reales sobre `pg-mem` antes de correr.

`pg-mem` soporta lo que el schema necesita hoy: `UPDATE ... FROM`, `DROP COLUMN`, `DROP TABLE`, `ALTER ... SET/DROP NOT NULL` e indices unicos parciales.

Limitaciones conocidas con las que choco el equipo:

- No soporta subconsultas correlacionadas dentro de `UPDATE ... SET` (usar `UPDATE ... FROM`).
- No soporta `trim()`.

Usar PostgreSQL real cuando:

- Se prueben features específicas de Postgres.
- Haya migraciones complejas.
- Aparezcan diferencias con `pg-mem`.

## Regla Práctica

Antes de agregar un test, preguntar:

> Si esto falla en producción, ¿el negocio pierde datos, dinero, confianza o tiempo?

Si la respuesta es sí, probablemente vale la pena.
