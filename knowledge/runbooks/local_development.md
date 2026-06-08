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
- intenta reparar Docker local si Colima no esta corriendo
- intenta levantar `docker compose up -d postgres` si la DB local default no responde
- aplica migraciones pendientes
- avisa si no hay organizations sembradas

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

### `ECONNREFUSED 127.0.0.1:5433`

Levantar Postgres:

```bash
npm run db:up
```

### `ECONNREFUSED ::1:5433`

Pasa cuando `DATABASE_URL` usa `localhost`. Node 18+ resuelve `localhost` a IPv6 (`::1`) primero, pero el Postgres de Docker escucha en IPv4 `127.0.0.1:5433`. El default ya usa `127.0.0.1`; si un `.env` define `DATABASE_URL`, usar tambien `127.0.0.1` en lugar de `localhost`.

Si la computadora se reinicio y Docker usa Colima, `npm run dev`, `npm run db:up`, `npm run db:down` y `npm run db:reset` intentan ejecutar `colima start` automaticamente antes de llamar a `docker compose`.

### No Se Envía WhatsApp Real

En desarrollo es esperado si `WHATSAPP_ACCESS_TOKEN` no está configurado. El outbound queda registrado como skipped.

### Puerto Ocupado

Usar otro puerto:

```bash
PORT=3001 npm run dev
```
