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
  it("normalizes to a single leading + and strips non-digits", () => {
    expect(format_phone("5215550000000")).toBe("+5215550000000");
    expect(format_phone("+52 1 555 000 0000")).toBe("+5215550000000");
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
    expect(summary.subtitle).toBe("+5215550000000");
    expect(summary.title).not.toContain(base.id);
    expect(summary.preview).toBe("abrimos con 1500 en caja");
    expect(summary.status_label).toBe("Abierta");
    expect(summary.status_tone).toBe("ok");
    expect(summary.needs_human).toBe(false);
  });

  it("falls back to the formatted phone when there is no display name", () => {
    const summary = present_conversation_summary({ ...base, display_name: "" });
    expect(summary.title).toBe("+5215550000000");
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
          interactions: [{ action_id: "registrar_inicio_dia", label: "Registrar inicio del día", status: "executed" }],
          memory_status: "stored",
          embedding_status: "completed",
        }),
        responses: [outbound("Inicio del día registrado con $1,500 en caja.")],
      },
    ]);

    expect(turn.status_tone).toBe("ok");
    expect(turn.awaiting_response).toBe(false);
    expect(turn.user.text).toBe("abrimos con 1500 en caja");
    expect(turn.understanding.has_action).toBe(true);
    expect(turn.understanding.actions[0]).toMatchObject({ label: "Registrar inicio del día", tone: "ok" });
    expect(turn.understanding.intent_human).toBe("Inicio del día");
    expect(turn.understanding.intent_raw).toBe("day_start");
    expect(turn.understanding.confidence_pct).toBe(92);
    expect(turn.understanding.confidence_tone).toBe("ok");
    expect(turn.understanding.memory_label).toBe("Memoria guardada");
    expect(turn.understanding.embedding_label).toBe("Embedding completado");
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
