# YoAyudo WhatsApp Bot Engine MVP

WhatsApp Bot Engine / Agents Engine para configurar businesses, accounts y bots/agentes conectados a canales como WhatsApp.

El seed principal crea **YoAyudo** como business demo, una cuenta principal y bots/agentes configurables. Los dashboards operativos verticales deben generarse después usando el engine; no viven hardcodeados en el dashboard base.

## Stack

- Node.js + Express
- JavaScript ES Modules
- PostgreSQL
- Pug server-rendered dashboard
- Zod validation
- Mock AI provider local
- Local memory store + mock embeddings
- Deterministic agent router
- WhatsApp Cloud API directo

No hay TypeScript ni build step obligatorio.

## Setup Local

```bash
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run db:up` levanta PostgreSQL en Docker con puerto host `5433`. Si Docker usa Colima y la computadora se reinicio, el script intenta arrancar Colima automaticamente antes de llamar a Compose.

`npm run dev` ejecuta primero un doctor local: valida entorno, revisa Node.js, verifica PostgreSQL, intenta reparar Docker/Colima, intenta levantar `docker compose up -d postgres` si la base local no responde y aplica migraciones pendientes. No siembra datos automáticamente; usa `npm run db:seed` para cargar el cliente demo.

Servidor local:

- Health: `http://localhost:3000/health`
- Dashboard: `http://localhost:3000/dashboard`
- Inspector: `http://localhost:3000/inspector`
- Review: `http://localhost:3000/review`

Verificación rápida:

```bash
curl http://localhost:3000/health
```

Simular un mensaje:

```bash
curl -X POST http://localhost:3000/dev/simulate-whatsapp-message \
  -H "Content-Type: application/json" \
  -d '{"text":"abrimos con 1500 en caja"}'
```

## Variables De Entorno

Ver `.env.example`.

Defaults locales:

```bash
DATABASE_URL=postgres://yoayudo:yoayudo@localhost:5433/yoayudo
AI_PROVIDER=mock
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.2
WHATSAPP_PHONE_NUMBER_ID=demo-phone-number-id
WHATSAPP_VERIFY_TOKEN=dev_verify_token
MEMORY_STORE_PROVIDER=local
KNOWLEDGE_S3_BUCKET=
KNOWLEDGE_S3_PREFIX=yoayudo/knowledge
EMBEDDING_PROVIDER=mock
AGENT_ROUTER_ENABLED=true
MEMORY_INGESTION_ENABLED=true
INSPECTOR_ENABLED=true
```

Si no configuras `WHATSAPP_ACCESS_TOKEN`, el envío real a Meta se omite y queda registrado como outbound skipped.

Para probar el Bot Engine con AI real en el inspector, usa:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
```

Con `AI_PROVIDER=openai`, `npm run dev` falla si falta `OPENAI_API_KEY`; esto evita probar `Probar bot` creyendo que está usando un modelo real cuando sigue en mock.

Además, en desarrollo las rutas de `Probar bot` exigen AI real. Si la app corre con `AI_PROVIDER=mock`, el tester responde con un error pidiendo configurar OpenAI. Los tests automatizados conservan mock para ser determinísticos.

`npm run demo:bot-engine` también exige AI real. Configura OpenAI antes de correrlo.

## Comandos

```bash
npm run dev
npm run start
npm run db:up
npm run db:down
npm run db:reset
npm run db:migrate
npm run db:seed
npm test
```

`npm run db:reset` elimina el volumen local `yoayudo_postgres_data` y recrea la base vacía. Después corre `npm run db:migrate` y `npm run db:seed`.

## Simular Mensajes De WhatsApp

Después de migrar y sembrar datos:

```bash
curl -X POST http://localhost:3000/dev/simulate-whatsapp-message \
  -H "Content-Type: application/json" \
  -d '{"text":"vendimos 3200 hasta ahorita"}'

curl -X POST http://localhost:3000/dev/simulate-whatsapp-message \
  -H "Content-Type: application/json" \
  -d '{"text":"compré 12 kg pastor por 1680 con Juan"}'

curl -X POST http://localhost:3000/dev/simulate-whatsapp-message \
  -H "Content-Type: application/json" \
  -d '{"text":"inventario final: pastor 3 kg, tortilla 20 kg"}'

curl -X POST http://localhost:3000/dev/simulate-whatsapp-message \
  -H "Content-Type: application/json" \
  -d '{"text":"cerramos con 8500 ventas, 3000 efectivo, 4000 tarjeta, 1500 transferencia"}'
```

## WhatsApp Webhook

Verificación:

```bash
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=dev_verify_token&hub.challenge=123
```

Inbound:

```bash
POST /webhooks/whatsapp
```

El pipeline guarda el raw payload en `messages.raw_payload_json` antes de clasificar o parsear.

## Arquitectura

El engine procesa mensajes y despacha operaciones genéricas:

- `src/engine`: procesamiento de mensajes, parsing, dispatch y respuestas.
- `src/agents`: router y subagentes delgados.
- `src/memory`: documentos normalizados, store local/S3 preparado, embeddings mock y retrieval local.
- `src/operations`: handlers de jornadas, compras, ventas, inventario, cierres, notas y reportes.
- `solution_templates` y `bot_profiles`: viven en DB/seed; no hay módulo runtime hasta que exista lógica real.
- `src/channels/whatsapp`: webhook, parsing de payload y cliente WhatsApp.
- `src/ai`: gateway de modelo, provider OpenAI para pruebas reales del Bot Engine, mock provider y stub Bedrock.
- `src/dashboard`: rutas y queries del dashboard business/accounts.
- `src/inspector`: inspector de bots/agentes, trace builder y vistas internas de conversación.
- `src/processing_events`: timeline tecnica del pipeline.
- `src/review`: review queue.

El seed demo se modela como:

- `organizations.name = "YoAyudo"`
- `accounts.name = "Cuenta principal"`
- `bots.name = "Agente WhatsApp YoAyudo"`

## Tests

```bash
npm test
```

Las pruebas de integración usan `pg-mem`, aplican migraciones y corren el seed demo sin requerir PostgreSQL local. Cubren raw payload, resolución desde `phone_number_id`, `mock_provider`, operaciones diarias, memoria local, router, reportes, review queue e Inspector.
