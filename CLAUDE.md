# CLAUDE.md

Todos los agentes (Claude, Codex y cualquier otro) siguen el mismo manual. El protocolo de conocimiento (leer `knowledge/` antes de la tarea, actualizarlo al final, mantenerlo al 100%) y el indice del folder estan en:

@AGENTS.md

## Design Context

Para cualquier trabajo de UI/frontend, lee primero `PRODUCT.md` (estrategia) y `DESIGN.md` (sistema visual) en la raiz. Resumen:

- **Register:** `product` — una cabina de control para el operador, pero la superficie que se vende (la del dueño de negocio) debe ser **simple, no un tablero de avion**.
- **Principios:** (1) el dueno primero; (2) simple, no cabina; (3) lenguaje de negocio, no de maquina; (4) estados honestos, nunca fingidos; (5) confianza por la traza.
- **Identidad visual (no reinventar):** paper calido `#f6f4ee`, tinta `#1a1a16`, acento esmeralda/petroleo `#0f6a5a`, Inter, sombras suaves. Usa los tokens de `:root` en `dashboard.css`.
- Accesibilidad no es prioridad por decision del founder (sin gate WCAG).
