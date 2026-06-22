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

## Eval de conversaciones (golden conversations)

Harness aparte de Vitest para **medir y optimizar el comportamiento de los bots** con conversaciones reales. NO es un gate de CI: corre con `npm run eval` y produce un **reporte de % que pasa** (dashboard de avance). La idea: empezar con un corpus de conversaciones que HOY fallan ("el bot no supo qué hacer") y subir el % a medida que mejoramos.

- **Fixtures** en `eval/conversations/*.json`: `setup` (canal, `from`, overrides al bot: `bot.enable`/`instructions`/`options`), `turns` (cada uno `user` + `expect`), y `expect_final.db`. `status`: `expected_passing` (regresión) o `baseline_failing` (backlog que queremos volver verde).
- **Asserts por turno**: `intents`, `reply_contains`, `reply_matches` (regex), `reply_empty`, `needs_review`, `actions` (`action_id`+`status` desde `action_audit_logs`), `no_action`. **Finales**: `db` (`table`/`where`/`count`/`exists`) medidos como **DELTA** (filas que la conversación agregó — el pool está sembrado, los totales absolutos contaminarían).
- **Corre el pipeline REAL** (`handle_*_webhook_payload`) sobre un pool `pg-mem` fresco por fixture, contra el **proveedor de IA real** configurado (`--provider=`/`--model=` para A/B; sin key avisa y cae a mock). El runner (`eval/eval_runner.js`) es reusable; el CLI (`eval/run_eval.js`) escribe `eval/results/report.html` (dashboard) + `latest.json` + histórico (gitignored).
- Cuando una `baseline_failing` empieza a pasar, el reporte sugiere **promoverla** a `expected_passing`. Ese es el ciclo de mejora.
