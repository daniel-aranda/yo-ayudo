# Arquitectura Infra

## Estado Actual

El proyecto es cloud-agnostic y corre localmente con Node.js y PostgreSQL en Docker.

Stack:

- Node.js con ES Modules.
- Express + Pug para web/inspector.
- PostgreSQL local via Docker en `127.0.0.1:5433`.
- Zod para validacion y config.

No hay TypeScript, no hay build step, no hay ORM.

Deploy objetivo futuro:

- Google Cloud Run.
- AWS ECS/App Runner.
- PostgreSQL administrado.

## Variables De Entorno

La config se valida con Zod en `src/app/config.js`. Cada variable tiene default, asi que el proyecto arranca en local sin `.env`.

Variables actuales:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `APP_BASE_URL`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `AI_PROVIDER`
- `AWS_REGION`
- `BEDROCK_MODEL_ID`
- `LOG_LEVEL`

El default de `DATABASE_URL` usa `127.0.0.1:5433`, no `localhost`. Node 18+ resuelve `localhost` a IPv6 (`::1`) primero, pero el Postgres local de Docker escucha en IPv4 `127.0.0.1:5433`, asi que `localhost` daria `ECONNREFUSED`.

## Procesos

Servidor HTTP:

```bash
npm run start
```

Desarrollo con doctor local:

```bash
npm run dev
```

PostgreSQL local:

```bash
npm run db:up
npm run db:down
npm run db:reset
```

Migraciones (aplica las 11 migraciones `0001`–`0011`):

```bash
npm run db:migrate
```

Seed demo:

```bash
npm run db:seed
```

No hay `npm run build` por diseño: no hay paso de compilacion.

## Tests

Tests con Vitest (actualmente 23 archivos / 84 tests):

```bash
npm test
```

Los tests de integracion usan pg-mem en vez de un Postgres real.

## WhatsApp

La app necesita un endpoint público HTTPS para Meta:

- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`

El verify token se valida con `WHATSAPP_VERIFY_TOKEN`.

## AI Providers

`AI_PROVIDER=mock` es el default de desarrollo. Los otros valores soportados son `bedrock` y `openai`.

S3 y Bedrock están como stub/opcionales y se activan via `.env`; no deben bloquear el core. Cualquier integración real debe mantener el contrato de `model_provider`.

## Dependencias

`.npmrc` define `package-lock=false`. No versionar `package-lock.json`.
