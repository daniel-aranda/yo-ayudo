# Estrategia De Testing

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

Usar `pg-mem` cuando el objetivo sea rapidez local.

Usar PostgreSQL real cuando:

- Se prueben features específicas de Postgres.
- Haya migraciones complejas.
- Aparezcan diferencias con `pg-mem`.

## Regla Práctica

Antes de agregar un test, preguntar:

> Si esto falla en producción, ¿el negocio pierde datos, dinero, confianza o tiempo?

Si la respuesta es sí, probablemente vale la pena.
