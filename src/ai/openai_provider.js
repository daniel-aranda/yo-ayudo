import { config } from "../app/config.js";
import { mock_provider } from "./mock_provider.js";

function extract_output_text(response_body) {
  if (typeof response_body.output_text === "string") {
    return response_body.output_text;
  }

  return (response_body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .filter(Boolean)
    .join("\n");
}

function parse_json_output(text) {
  const trimmed = String(text ?? "").trim();
  const without_fence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(without_fence);
}

function normalize_action_request(request) {
  return {
    action_id: request.action_id,
    input_json: request.input_json ?? request.input ?? {},
  };
}

export class openai_provider extends mock_provider {
  constructor(options = {}) {
    super();
    this.api_key = options.api_key ?? config.openai_api_key;
    this.model = options.model ?? config.openai_model;
    this.base_url = options.base_url ?? config.openai_base_url;
  }

  assert_configured() {
    if (!this.api_key) {
      const error = new Error("OPENAI_API_KEY is required when AI_PROVIDER=openai.");
      error.code = "openai_api_key_required";
      throw error;
    }
  }

  async decide_bot_test_message(input) {
    this.assert_configured();

    const response = await fetch(`${this.base_url}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        instructions: [
          "Eres el runtime de prueba de YoAyudo Bot Engine.",
          "Debes decidir una respuesta y acciones internas para un bot configurable.",
          "Devuelve solo JSON válido.",
          "No digas que ejecutaste acciones. Solo solicita acciones en action_requests.",
          "Usa únicamente action_id incluidos en acciones_disponibles. Si falta una capacidad, explica en reply que debe revisarse por guardrail.",
          "Formato exacto: {\"reply\":\"string\",\"action_requests\":[{\"action_id\":\"string\",\"input_json\":{}}],\"reason\":\"string\"}",
        ].join("\n"),
        input: [
          {
            role: "developer",
            content: input.prompt,
          },
          {
            role: "user",
            content: JSON.stringify({
              mensaje: input.mensaje,
              acciones_disponibles: input.acciones_disponibles.map((action) => ({
                action_id: action.action_id,
                descripcion: action.descripcion,
                input_schema: action.input_schema,
                nivel_riesgo: action.nivel_riesgo,
              })),
            }),
          },
        ],
        text: {
          format: { type: "json_object" },
        },
      }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = body.error?.message ?? `OpenAI request failed with status ${response.status}`;
      const error = new Error(message);
      error.code = "openai_request_failed";
      error.status = response.status;
      throw error;
    }

    const output_text = extract_output_text(body);
    let parsed;

    try {
      parsed = parse_json_output(output_text);
    } catch (error) {
      const parse_error = new Error(`OpenAI returned invalid JSON for bot test decision: ${error.message}`);
      parse_error.code = "openai_invalid_json";
      throw parse_error;
    }

    return {
      provider: "openai",
      model: this.model,
      response_id: body.id,
      reply: String(parsed.reply ?? ""),
      reason: String(parsed.reason ?? ""),
      action_requests: Array.isArray(parsed.action_requests)
        ? parsed.action_requests.filter((request) => request?.action_id).map(normalize_action_request)
        : [],
    };
  }
}
