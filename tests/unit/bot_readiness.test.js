import { describe, it, expect } from "vitest";
import { compute_bot_readiness } from "../../src/bots/bot_readiness.js";

const full_config = { openai_api_key: "k", google_places_api_key: "g", elevenlabs_api_key: "e" };
const bot = (over = {}) => ({ status: "active", acciones_habilitadas_json: [], ...over });
const has_blocker = (r, re) => r.warnings.some((w) => w.severity === "blocker" && re.test(w.title));

describe("compute_bot_readiness", () => {
  it("listo: activo, con canal, IA y proveedores configurados", () => {
    const r = compute_bot_readiness(bot({ acciones_habilitadas_json: ["buscar_negocios", "crear_tarea"] }), {
      whatsapp_channels: [{ id: "1" }],
      config: full_config,
    });
    expect(r.ready).toBe(true);
    expect(r.blockers).toBe(0);
  });

  it("blocker: sin canal conectado", () => {
    const r = compute_bot_readiness(bot(), { whatsapp_channels: [], instagram_channels: [], config: full_config });
    expect(has_blocker(r, /canal/i)).toBe(true);
  });

  it("blocker: bot en borrador (no activo)", () => {
    const r = compute_bot_readiness(bot({ status: "draft" }), { whatsapp_channels: [{ id: "1" }], config: full_config });
    expect(has_blocker(r, /activo/i)).toBe(true);
  });

  it("blocker: sin OpenAI (IA real)", () => {
    const r = compute_bot_readiness(bot(), { whatsapp_channels: [{ id: "1" }], config: { google_places_api_key: "g" } });
    expect(has_blocker(r, /OpenAI/i)).toBe(true);
  });

  it("blocker: buscar_negocios sin proveedor de búsqueda configurado", () => {
    const r = compute_bot_readiness(bot({ acciones_habilitadas_json: ["buscar_negocios"] }), {
      whatsapp_channels: [{ id: "1" }],
      config: { openai_api_key: "k" }, // sin places/yelp/serpapi
    });
    expect(has_blocker(r, /Buscar negocios/i)).toBe(true);
  });

  it("acciones internas (crear_tarea/guardar_nota/crear_contacto) NO exigen proveedor", () => {
    const r = compute_bot_readiness(bot({ acciones_habilitadas_json: ["crear_tarea", "guardar_nota", "crear_contacto", "generar_resumen"] }), {
      whatsapp_channels: [{ id: "1" }],
      config: full_config,
    });
    expect(r.ready).toBe(true);
  });

  it("warning (no blocker): action stub aún no implementada", () => {
    const r = compute_bot_readiness(bot({ acciones_habilitadas_json: ["actualizar_contacto"] }), {
      whatsapp_channels: [{ id: "1" }],
      config: full_config,
    });
    expect(r.warnings.some((w) => w.severity === "warning" && /implementada/i.test(w.title))).toBe(true);
    expect(r.blockers).toBe(0);
  });

  it("blocker: provider resuelto Gemini sin key (nombra el provider)", () => {
    const r = compute_bot_readiness(bot(), {
      whatsapp_channels: [{ id: "1" }],
      config: { openai_api_key: "k" }, // openai presente pero el resuelto es gemini
      resolved_ai: { provider: "gemini", model: "gemini-2.5-flash" },
    });
    expect(has_blocker(r, /Gemini/i)).toBe(true);
  });

  it("listo: provider resuelto Claude con su key", () => {
    const r = compute_bot_readiness(bot(), {
      whatsapp_channels: [{ id: "1" }],
      config: { anthropic_api_key: "a" },
      resolved_ai: { provider: "claude", model: "claude-opus-4-8" },
    });
    expect(r.ready).toBe(true);
  });

  it("blocker: provider resuelto mock = sin IA real", () => {
    const r = compute_bot_readiness(bot(), {
      whatsapp_channels: [{ id: "1" }],
      config: full_config,
      resolved_ai: { provider: "mock" },
    });
    expect(has_blocker(r, /IA real/i)).toBe(true);
  });
});
