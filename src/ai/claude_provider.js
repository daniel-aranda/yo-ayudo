import { config } from "../app/config.js";
import { mock_provider } from "./mock_provider.js";
import {
  classification_instructions,
  test_runtime_instructions,
  parse_json_output,
  normalize_classified_intents,
  normalize_action_requests,
} from "./ai_prompts.js";

// Adapter de Claude (Anthropic Messages API). Extiende mock_provider, así que
// hereda los extractores determinísticos y solo sobreescribe los dos métodos que
// dependen del LLM. Mismo contrato de salida que openai_provider.
// Sin key: el factory devuelve mock_provider, así que este adapter solo se
// instancia con key; assert_configured queda como defensa en profundidad.
export class claude_provider extends mock_provider {
  constructor(options = {}) {
    super();
    this.api_key = options.api_key ?? config.anthropic_api_key;
    this.model = options.model ?? config.anthropic_model;
    this.base_url = options.base_url ?? config.anthropic_base_url;
    this.version = options.version ?? config.anthropic_version;
  }

  assert_configured() {
    if (!this.api_key) {
      const error = new Error("ANTHROPIC_API_KEY is required when AI provider is claude.");
      error.code = "anthropic_api_key_required";
      throw error;
    }
  }

  // POST /v1/messages → {content:[{type:"text",text}], id, stop_reason}.
  // Sin thinking (off por defecto en los modelos actuales) ni sampling params
  // (temperature/top_p/top_k harían 400). JSON por instrucción + parseo.
  async messages_request({ system, user, max_tokens }) {
    const response = await fetch(`${this.base_url}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.api_key,
        "anthropic-version": this.version,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = body.error?.message ?? `Anthropic request failed with status ${response.status}`;
      const error = new Error(message);
      error.code = body.error?.type ? `anthropic_${body.error.type}` : "anthropic_request_failed";
      error.status = response.status;
      throw error;
    }

    const text = (body.content ?? [])
      .filter((block) => block?.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    return { text, id: body.id };
  }

  async classify_intents(input) {
    if (!input?.use_ai_classification || !this.api_key) {
      return super.classify_intents(input);
    }
    const text = String(input.text ?? "");
    const { text: output, id } = await this.messages_request({
      system: classification_instructions(),
      user: JSON.stringify({ mensaje: text }),
      max_tokens: 1024,
    });

    let parsed;
    try {
      parsed = parse_json_output(output);
    } catch (error) {
      const parse_error = new Error(`Claude returned invalid JSON for intent classification: ${error.message}`);
      parse_error.code = "anthropic_invalid_json";
      throw parse_error;
    }
    return { intents: normalize_classified_intents(parsed, text), provider: "claude", model: this.model, response_id: id };
  }

  async decide_bot_test_message(input) {
    this.assert_configured();
    const { text: output, id } = await this.messages_request({
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
      const parse_error = new Error(`Claude returned invalid JSON for bot test decision: ${error.message}`);
      parse_error.code = "anthropic_invalid_json";
      throw parse_error;
    }
    return {
      provider: "claude",
      model: this.model,
      response_id: id,
      reply: String(parsed.reply ?? ""),
      reason: String(parsed.reason ?? ""),
      action_requests: normalize_action_requests(parsed),
    };
  }
}
