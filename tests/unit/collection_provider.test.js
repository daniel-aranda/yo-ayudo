import { describe, it, expect } from "vitest";
import { mock_provider, COLLECTION_DEFAULT_QUESTIONS } from "../../src/ai/mock_provider.js";

describe("mock advance_information_collection (piso determinístico)", () => {
  const provider = new mock_provider();

  it("START: sin respuestas → primera pregunta, no completo", async () => {
    const turn = await provider.advance_information_collection({ findings: {}, transcript: [], answer: "", answers_count: 0, max_turns: 8 });
    expect(turn.is_complete).toBe(false);
    expect(turn.next_question).toBe(COLLECTION_DEFAULT_QUESTIONS[0]);
  });

  it("ADVANCE: acumula la respuesta en findings y pasa a la siguiente pregunta", async () => {
    const turn = await provider.advance_information_collection({
      findings: { notes: [] },
      transcript: [{ q: COLLECTION_DEFAULT_QUESTIONS[0], a: "me duele perder clientes" }],
      answer: "me duele perder clientes",
      answers_count: 1,
      max_turns: 8,
    });
    expect(turn.is_complete).toBe(false);
    expect(turn.next_question).toBe(COLLECTION_DEFAULT_QUESTIONS[1]);
    expect(turn.findings.notes).toContain("me duele perder clientes");
  });

  it("cierra cuando el usuario lo pide (user_requested)", async () => {
    const turn = await provider.advance_information_collection({ findings: {}, transcript: [], answer: "ya con eso basta", answers_count: 2, max_turns: 8 });
    expect(turn.is_complete).toBe(true);
    expect(turn.completion_reason).toBe("user_requested");
    expect(turn.next_question).toBeNull();
  });

  it("cierra al llegar al tope de turnos (max_turns)", async () => {
    const turn = await provider.advance_information_collection({ findings: {}, transcript: [], answer: "otro dato", answers_count: 3, max_turns: 3 });
    expect(turn.is_complete).toBe(true);
    expect(turn.completion_reason).toBe("max_turns");
  });

  it("cierra al agotar el banco de preguntas (llm_ready)", async () => {
    const turn = await provider.advance_information_collection({
      findings: {},
      transcript: [],
      answer: "dato final",
      answers_count: COLLECTION_DEFAULT_QUESTIONS.length,
      max_turns: 99,
    });
    expect(turn.is_complete).toBe(true);
    expect(turn.completion_reason).toBe("llm_ready");
  });
});
