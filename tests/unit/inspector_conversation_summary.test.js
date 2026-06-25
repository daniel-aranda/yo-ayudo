import { describe, expect, it } from "vitest";
import {
  format_phone,
  present_conversation_summary,
  present_conversation_turns,
} from "../../src/inspector/inspector_presenter.js";

const at = new Date().toISOString();
const inbound = (text, summary) => ({ message: { id: "in", text_body: text, created_at: at }, compact_trace_summary: summary });
const outbound = (text) => ({ message: { id: "out", text_body: text, created_at: at }, compact_trace_summary: {} });

describe("format_phone", () => {
  it("formats Mexican numbers readably (área + 4 + 4), keeping the +52 / 1 móvil", () => {
    expect(format_phone("5215550000000")).toBe("+52 1 55 5000 0000");
    expect(format_phone("+52 1 555 000 0000")).toBe("+52 1 55 5000 0000");
    expect(format_phone("525555777777")).toBe("+52 55 5577 7777");
    expect(format_phone("")).toBe("");
    expect(format_phone(null)).toBe("");
  });
});

describe("present_conversation_summary", () => {
  const base = {
    id: "b32cd232-1a6b-49f5-b7e9-7d38755e400c",
    display_name: "Operador Demo",
    whatsapp_phone: "5215550000000",
    status: "open",
    human_handoff_status: "none",
    last_message: "abrimos con 1500 en caja",
    last_intent: "day_start",
    messages_count: 8,
    last_message_at: new Date().toISOString(),
  };

  it("titles by contact name and keeps the phone as subtitle — never the raw id", () => {
    const summary = present_conversation_summary(base);
    expect(summary.title).toBe("Operador Demo");
    expect(summary.subtitle).toBe("+52 1 55 5000 0000");
    expect(summary.title).not.toContain(base.id);
    expect(summary.preview).toBe("abrimos con 1500 en caja");
    expect(summary.status_label).toBe("Abierta");
    expect(summary.status_tone).toBe("ok");
    expect(summary.needs_human).toBe(false);
  });

  it("falls back to the formatted phone when there is no display name", () => {
    const summary = present_conversation_summary({ ...base, display_name: "" });
    expect(summary.title).toBe("+52 1 55 5000 0000");
    expect(summary.subtitle).toBeNull();
  });

  it("never surfaces the id: graceful title when neither name nor phone exist", () => {
    const summary = present_conversation_summary({ ...base, display_name: null, whatsapp_phone: null });
    expect(summary.title).toBe("Conversación de WhatsApp");
  });

  it("uses a human intent label as preview when there is no message text", () => {
    const summary = present_conversation_summary({ ...base, last_message: null, last_intent: "daily_close" });
    expect(summary.preview).toBe("Cierre del día");
  });

  it("falls back to a neutral preview when there is neither text nor known intent", () => {
    const summary = present_conversation_summary({ ...base, last_message: null, last_intent: null });
    expect(summary.preview).toBe("Sin mensajes todavía");
  });

  it("flags conversations waiting on a human", () => {
    const summary = present_conversation_summary({ ...base, human_handoff_status: "pending" });
    expect(summary.needs_human).toBe(true);
  });
});

describe("present_conversation_turns", () => {
  it("builds a full turn: user message, understanding, agent reply, status", () => {
    const [turn] = present_conversation_turns([
      {
        id: "in",
        incoming: inbound("abrimos con 1500 en caja", {
          intent: "day_start",
          confidence: 0.92,
          interactions: [{ action_id: "registrar_inicio_dia", label: "Registrar caja inicial del día", status: "executed" }],
          memory_status: "stored",
          embedding_status: "completed",
        }),
        responses: [outbound("Caja inicial del día registrada: $1,500.")],
      },
    ]);

    expect(turn.status_tone).toBe("ok");
    expect(turn.awaiting_response).toBe(false);
    expect(turn.user.text).toBe("abrimos con 1500 en caja");
    expect(turn.understanding.has_action).toBe(true);
    expect(turn.understanding.actions[0]).toMatchObject({ label: "Registrar caja inicial del día", tone: "ok" });
    expect(turn.understanding.intent_human).toBe("Caja inicial del día");
    expect(turn.understanding.confidence_pct).toBe(92);
    expect(turn.understanding.confidence_tone).toBe("ok");
    // The minimal view shows only labels; intent code, memory and embedding are gone.
    expect(turn.understanding).not.toHaveProperty("intent_raw");
    expect(turn.understanding).not.toHaveProperty("memory_label");
    expect(turn.understanding).not.toHaveProperty("embedding_label");
    expect(turn.responses).toHaveLength(1);
    expect(turn.trace_id).toBe("in");
  });

  it("flags low confidence as a warn turn and renders the percentage", () => {
    const [turn] = present_conversation_turns([
      {
        id: "in",
        incoming: inbound("vendimos algo", {
          intent: "sales_update",
          confidence: 0.5,
          interactions: [{ action_id: "registrar_venta", label: "Registrar venta", status: "executed" }],
        }),
        responses: [outbound("ok")],
      },
    ]);
    expect(turn.status_tone).toBe("warn");
    expect(turn.understanding.confidence_pct).toBe(50);
    expect(turn.understanding.confidence_tone).toBe("low");
  });

  it("surfaces the routing decision in the turn detail model", () => {
    const [turn] = present_conversation_turns([
      {
        id: "in",
        incoming: inbound("ya vendimos 2500 y compré 600 de fruta", {
          intent: "sales_update",
          confidence: 0.91,
          interactions: [
            { action_id: "registrar_venta", label: "Registrar venta", status: "executed" },
            { action_id: "registrar_compra", label: "Registrar compra", status: "executed" },
          ],
          routing_decision: {
            mode: "ai_requested",
            provider: "openai",
            model: "gpt-test",
            fallback_used: false,
            effective_intents: [{ intent: "sales_update", confidence: 0.91, reason: "ventas acumuladas" }],
            operations: [
              { intent: "sales_update", segment: "ya vendimos 2500" },
              { intent: "purchase", segment: "compré 600 de fruta" },
            ],
          },
        }),
        responses: [outbound("ok")],
      },
    ]);

    expect(turn.understanding.route).toMatchObject({
      mode_label: "Clasificación con AI",
      provider_label: "openai/gpt-test",
      reason: "ventas acumuladas",
    });
    expect(turn.understanding.route.segments).toEqual([
      { intent: "Actualización de ventas", segment: "ya vendimos 2500" },
      { intent: "Compra registrada", segment: "compré 600 de fruta" },
    ]);
  });

  it("links a task-producing action to the derived task", () => {
    const [turn] = present_conversation_turns(
      [
        {
          id: "in",
          incoming: inbound("necesito que me llame una persona", {
            intent: "human_help",
            confidence: 0.88,
            interactions: [
              {
                action_id: "crear_tarea",
                label: "Crear tarea",
                status: "executed",
                output_json: { tarea_id: "task-1" },
              },
            ],
          }),
          responses: [outbound("Dejé una tarea para seguimiento.")],
        },
      ],
      {
        tasks: [
          {
            id: "task-1",
            message_id: "in",
            titulo: "Llamar al cliente",
            status: "pendiente",
            status_label: "Pendiente",
            metadata_json: { source: "bot_engine_action" },
          },
        ],
      },
    );

    expect(turn.understanding.actions[0].task).toMatchObject({
      id: "task-1",
      titulo: "Llamar al cliente",
      status_label: "Pendiente",
    });
    expect(turn.understanding.actions[0].label).toBe("Consultar humano");
  });

  it("marks errored and action-less and awaiting turns distinctly", () => {
    const errored = present_conversation_turns([
      { id: "in", incoming: inbound("x", { has_error: true, interactions: [] }), responses: [outbound("y")] },
    ])[0];
    expect(errored.status_tone).toBe("error");

    const noAction = present_conversation_turns([
      { id: "in", incoming: inbound("hola", { intent: "unknown", interactions: [] }), responses: [outbound("hey")] },
    ])[0];
    expect(noAction.status_tone).toBe("none");
    expect(noAction.understanding.has_action).toBe(false);
    expect(noAction.understanding.intent_human).toBe("unknown");

    const awaiting = present_conversation_turns([
      { id: "in", incoming: inbound("¿siguen abiertos?", { intent: "day_start", interactions: [] }), responses: [] },
    ])[0];
    expect(awaiting.awaiting_response).toBe(true);
    expect(awaiting.status_tone).toBe("pending");
  });

  it("handles an orphan outbound (no incoming) without inventing understanding", () => {
    const [turn] = present_conversation_turns([
      { id: "out", incoming: null, responses: [outbound("mensaje del agente")] },
    ]);
    expect(turn.user).toBeNull();
    expect(turn.understanding).toBeNull();
    expect(turn.trace_id).toBe("out");
  });
});
