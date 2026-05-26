# Runbook Local

## Setup

```bash
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

PostgreSQL corre en Docker con puerto host `5433`, usuario `yoayudo`, password `yoayudo` y base `yoayudo`.

`npm run dev` ejecuta `src/app/dev_doctor.js` antes de iniciar el servidor. El doctor:

- valida Node.js >=20
- valida variables de entorno base
- falla si `AI_PROVIDER=bedrock` en desarrollo, porque Bedrock es stub
- revisa conexion PostgreSQL
- intenta levantar `docker compose up -d postgres` si la DB local default no responde
- aplica migraciones pendientes
- avisa si no hay tenants sembrados

Para reiniciar la base local desde cero:

```bash
npm run db:reset
npm run db:migrate
npm run db:seed
```

## Verificar

```bash
curl http://localhost:3000/health
```

Dashboard:

```text
http://localhost:3000/dashboard
```

## Simular WhatsApp

```bash
curl -X POST http://localhost:3000/dev/simulate-whatsapp-message \
  -H "Content-Type: application/json" \
  -d '{"text":"abrimos con 1500 en caja"}'
```

```bash
curl -X POST http://localhost:3000/dev/simulate-whatsapp-message \
  -H "Content-Type: application/json" \
  -d '{"text":"compré 12 kg pastor por 1680 con Juan"}'
```

```bash
curl -X POST http://localhost:3000/dev/simulate-whatsapp-message \
  -H "Content-Type: application/json" \
  -d '{"text":"cerramos con 8500 ventas, 3000 efectivo, 4000 tarjeta, 1500 transferencia"}'
```

## Problemas Comunes

### `ECONNREFUSED localhost:5433`

Levantar Postgres:

```bash
npm run db:up
```

### No Se Envía WhatsApp Real

En desarrollo es esperado si `WHATSAPP_ACCESS_TOKEN` no está configurado. El outbound queda registrado como skipped.

### Puerto Ocupado

Usar otro puerto:

```bash
PORT=3001 npm run dev
```
