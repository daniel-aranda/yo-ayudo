# Arquitectura Infra

## Estado Actual

El proyecto es cloud-agnostic y corre localmente con Node.js y PostgreSQL en Docker.

Deploy objetivo futuro:

- Google Cloud Run.
- AWS ECS/App Runner.
- PostgreSQL administrado.

## Variables De Entorno

Variables actuales:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `APP_BASE_URL`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `AI_PROVIDER`
- `AWS_REGION`
- `BEDROCK_MODEL_ID`
- `LOG_LEVEL`

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

Migraciones:

```bash
npm run db:migrate
```

Seed demo:

```bash
npm run db:seed
```

## WhatsApp

La app necesita un endpoint público HTTPS para Meta:

- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`

El verify token se valida con `WHATSAPP_VERIFY_TOKEN`.

## AI Providers

`AI_PROVIDER=mock` es el default de desarrollo.

Bedrock está preparado como stub, pero no debe bloquear el core. Cualquier integración real debe mantener el contrato de `model_provider`.
