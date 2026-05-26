# Guía Para Agentes

Este proyecto construye el engine de YoAyudo para bots operativos de WhatsApp.

La frase guía del producto:

> Tu negocio ya vive en WhatsApp. Nosotros lo convertimos en sistema.

## Prioridades

1. WhatsApp captura operación.
2. PostgreSQL guarda la verdad.
3. AI interpreta lenguaje, no decide hechos críticos.
4. El backend valida, persiste y calcula con reglas determinísticas.
5. Los clientes viven en DB, seed o configuración.
6. El código maneja operaciones genéricas, no marcas de clientes.
7. Memory/knowledge se guarda como documentos con scope, source, version y metadata.

## Cómo Trabajar En Este Repo

- Lee primero `knowledge/architecture/backend.md` y `knowledge/architecture/database.md` antes de cambiar flujo inbound, parsing o persistencia.
- Para cambios de UI, lee `knowledge/architecture/frontend.md`.
- Para pruebas, sigue `knowledge/agents/testing.md`.
- Para memoria y router, lee `knowledge/architecture/memory.md` y `knowledge/architecture/agents.md`.
- No agregues ni versiones `package-lock.json`; este repo usa `.npmrc` con `package-lock=false`.
- No construyas flow builder visual, SPA pesada, billing completo ni integraciones cloud avanzadas hasta que el roadmap lo pida.

## Límites De Diseño

- El engine puede saber que existe un `bot_profile` o `solution_template`, pero no debe tener clases de cliente.
- Los templates de solución viven en DB/configuración.
- Outputs de AI o del `mock_provider` siempre pasan por validación antes de persistirse como datos operativos.
- Raw payloads entrantes y salientes se guardan para trazabilidad.
- No vectorizar basura: saludos, confirmaciones y outbounds automáticos no deben entrar a memoria.
- Los tests deben proteger comportamiento valioso, no mocks decorativos.

## Comandos Base

```bash
npm install
npm test
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

## Estado Del MVP

El MVP inicial ya incluye:

- Express + JavaScript ES Modules.
- PostgreSQL + migración inicial.
- Seed demo con `solution_template.key = "taqueria_control"` y tenant demo `Margen Sabroso`.
- Webhook WhatsApp.
- AI Gateway con `mock_provider`.
- Memory layer local/mock.
- Agent router determinístico con subagentes delgados.
- Módulos operativos genéricos.
- Dashboard server-rendered.
- Review queue.
- Endpoint dev para simular mensajes.
- Tests unitarios de reglas y funcionales del pipeline inbound.
