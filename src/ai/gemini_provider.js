import { config } from "../app/config.js";
import { mock_provider } from "./mock_provider.js";
import {
  classification_instructions,
  test_runtime_instructions,
  parse_json_output,
  normalize_classified_intents,
  normalize_action_requests,
} from "./ai_prompts.js";

// Adapter de Gemini (Google Generative Language API, generateContent). Extiende
// mock_provider y solo sobreescribe los métodos LLM, igual que openai/claude.
// Sin key: el factory devuelve mock_provider; assert_configured es defensa extra.
export class gemini_provider extends mock_provider {
  constructor(options = {}) {
    super();
    this.api_key = options.api_key ?? config.gemini_api_key;
    this.model = options.model ?? config.gemini_model;
    this.base_url = options.base_url ?? config.gemini_base_url;
  }

  assert_configured() {
    if (!this.api_key) {
      const error = new Error("GEMINI_API_KEY is required when AI provider is gemini.");
      error.code = "gemini_api_key_required";
      throw error;
    }
  }

  // POST /models/{model}:generateContent?key=… con responseMimeType JSON.
  // Respuesta: {candidates:[{content:{parts:[{text}]}}]}.
  async generate({ system, user, max_tokens }) {
    const url = `${this.base_url}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.api_key)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: max_tokens },
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.error?.message ?? `Gemini request failed with status ${response.status}`;
      const error = new Error(message);
      error.code = body.error?.status ? `gemini_${body.error.status}` : "gemini_request_failed";
      error.status = response.status;
      throw error;
    }

    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
    return { text, id: body.responseId };
  }

  async classify_intents(input) {
    if (!input?.use_ai_classification || !this.api_key) {
      return super.classify_intents(input);
    }
    const text = String(input.text ?? "");
    const { text: output, id } = await this.generate({
      system: classification_instructions(),
      user: JSON.stringify({ mensaje: text }),
      max_tokens: 1024,
    });

    let parsed;
    try {
      parsed = parse_json_output(output);
    } catch (error) {
      const parse_error = new Error(`Gemini returned invalid JSON for intent classification: ${error.message}`);
      parse_error.code = "gemini_invalid_json";
      throw parse_error;
    }
    return { intents: normalize_classified_intents(parsed, text), provider: "gemini", model: this.model, response_id: id };
  }

  async decide_bot_test_message(input) {
    this.assert_configured();
    const { text: output, id } = await this.generate({
      system: test_runtime_instructions(),
      user: JSON.stringify({
        prompt: input.prompt,
        mensaje: input.mensaje,
        acciones_disponibles: input.acciones_disponibles.map((action) => ({
          action_id: action.action_id,
          descripcion: action.descripcion,
          input_schema: action.input_schema,
          nivel_riesgo: action.nivel_riesgo,
        })),
      }),
      max_tokens: 2048,
    });

    let parsed;
    try {
      parsed = parse_json_output(output);
    } catch (error) {
      const parse_error = new Error(`Gemini returned invalid JSON for bot test decision: ${error.message}`);
      parse_error.code = "gemini_invalid_json";
      throw parse_error;
    }
    return {
      provider: "gemini",
      model: this.model,
      response_id: id,
      reply: String(parsed.reply ?? ""),
      reason: String(parsed.reason ?? ""),
      action_requests: normalize_action_requests(parsed),
    };
  }
}
