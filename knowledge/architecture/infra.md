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
- `META_VERIFY_TOKEN` / `META_APP_SECRET` (Instagram DM + Messenger; **caen a los de WhatsApp** si no se definen, porque comparten la app de Meta). El token de envío por página/cuenta NO va en env: vive en `instagram_accounts.access_token` / `facebook_pages.access_token`.
- `WHATSAPP_PHONE_NUMBER_ID`
- `AI_PROVIDER` (enum `mock|bedrock|openai|gemini|claude`)
- `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL`
- `GEMINI_API_KEY` / `GEMINI_MODEL` / `GEMINI_BASE_URL`
- `ANTHROPIC_API_KEY` (alias `CLAUDE_API_KEY`) / `ANTHROPIC_MODEL` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_VERSION`
- `AWS_REGION`
- `BEDROCK_MODEL_ID`
- `CONVERSATION_MEDIA_S3_BUCKET` (adjuntos de conversación; **vacío = fallback local**, no S3), `CONVERSATION_MEDIA_S3_PREFIX` (default `yoayudo/conversation-media`), `CONVERSATION_MEDIA_LOCAL_DIR` (default `.storage/conversation-media`), `CONVERSATION_MEDIA_MAX_BYTES` (default 25MB)
- `LOG_LEVEL`
- `AUTH_ENABLED` (default `false`; activa login y la politica owner/usuario-de-negocio)
- `SESSION_SECRET` (obligatorio en production si `AUTH_ENABLED=true`; en dev hay default)
- `YO_AYUDO_BUSINESS_ID` / `YO_AYUDO_ACCOUNT_ID` (opcionales, uuid): negocio/cuenta oficial de YoAyudo donde viven los bots de sistema. El seed los usa como id explícito al crear (estables y distintos por entorno dev/prod); vacío = el seed genera uuid y resuelve por slug `yoayudo-demo`/`yoayudo-ventas`. Una vez creados por slug, el id existente se conserva (el seed no hace churn).

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

Migraciones (aplica las migraciones `0001`–`0016`):

```bash
npm run db:migrate
```

Seed demo:

```bash
npm run db:seed
```

No hay `npm run build` por diseño: no hay paso de compilacion.

## Tests

Tests con Vitest (actualmente 24 archivos / 100 tests):

```bash
npm test
```

Los tests de integracion usan pg-mem en vez de un Postgres real.

## WhatsApp

La app necesita un endpoint público HTTPS para Meta:

- `GET /webhooks/whatsapp`
- `POST /webhooks/whatsapp`
- `GET/POST /webhooks/instagram` (Instagram DM) y `GET/POST /webhooks/messenger` (Facebook Messenger): mismo patrón (verify `hub.challenge` + firma `X-Hub-Signature-256` con `META_APP_SECRET`, ack inmediato + proceso async). Ver `architecture/bot_engine.md`.

El verify token se valida con `WHATSAPP_VERIFY_TOKEN` (WhatsApp) y `META_VERIFY_TOKEN` (IG/Messenger; cae al de WhatsApp).

## AI Providers

`AI_PROVIDER=mock` es el default de desarrollo (env = piso de la resolución por scope). Los valores soportados son `mock`, `bedrock`, `openai`, `gemini` y `claude`. El **provider efectivo se resuelve por scope** (bot > cuenta > global > env; `src/ai/ai_config_resolver.js`) — el env es solo el default global más bajo. Cada provider se activa con su key (`OPENAI_API_KEY`/`GEMINI_API_KEY`/`ANTHROPIC_API_KEY`); **sin key, el factory cae a `mock_provider`** (nunca finge). Adapters: `openai_provider`, `gemini_provider`, `claude_provider` (todos extienden `mock_provider`).

S3 y Bedrock están como stub/opcionales y se activan via `.env`; no deben bloquear el core. Cualquier integración real debe mantener el contrato de `model_provider`.

## Almacenamiento de archivos

Dos almacenes con el mismo patrón **S3-si-hay-bucket / fallback local**, para que el core funcione sin keys AWS:

- **Knowledge** (documentos de conocimiento): `knowledge_s3_uploader` / `local_memory_store`.
- **Adjuntos de conversación** (media inbound de WhatsApp): `src/channels/conversation_media_store.js` (`store_/read_conversation_media`). Con `CONVERSATION_MEDIA_S3_BUCKET` sube a S3 (`PutObjectCommand`); sin él escribe en `CONVERSATION_MEDIA_LOCAL_DIR`. El `s3_client` y `config` son inyectables (tests sin red). El binario se sirve por `GET /inspector/media/:attachment_id`.

## Dependencias

`.npmrc` define `package-lock=false`. No versionar `package-lock.json`.
