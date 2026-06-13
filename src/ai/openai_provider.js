import { config } from "../app/config.js";
import { mock_provider } from "./mock_provider.js";
import { intents as valid_intents } from "./intents.js";

// Glosa compacta de cada intent para que el modelo mapee lenguaje libre a la
// categoría operativa correcta. Es prompt, no lógica: el routing real vive en
// INTENT_TO_OPERATION_ACTION del engine.
const INTENT_GLOSSARY = {
  day_start: "apertura del día / efectivo inicial en caja",
  sales_update: "ventas acumuladas o desglose por método de pago",
  purchase: "compra de insumos o mercancía",
  inventory_update: "conteo o existencia de inventario",
  daily_close: "cierre del día / caja final",
  daily_note: "nota operativa: merma, faltante, sobrante o comentario",
  report_request: "pedir reporte o resumen del día",
  human_help: "pedir ayuda humana / hablar con una persona",
  unknown: "no corresponde a ninguna operación conocida",
};

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

  // Clasificación de intenciones multi-intent por AI para el inbound real.
  // Opt-in: solo llama al modelo cuando el caller lo pide (input.use_ai_classification)
  // y hay API key; si no, degrada al clasificador determinístico por keywords
  // (heredado de mock_provider). En error de AI LANZA — el caller decide degradar
  // (así ai_calls registra el fallo en vez de ocultarlo).
  async classify_intents(input) {
    if (!input?.use_ai_classification || !this.api_key) {
      return super.classify_intents(input);
    }

    const text = String(input.text ?? "");
    const response = await fetch(`${this.base_url}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        instructions: [
          "Eres el clasificador de intenciones de YoAyudo.",
          "Un mensaje de WhatsApp puede contener VARIAS operaciones en una sola frase.",
          "Detecta cada operación presente y devuelve SOLO JSON válido.",
          'Formato exacto: {"intents":[{"intent":"string","confidence":0..1,"segment":"string","reason":"string"}]}',
          `Usa únicamente estos intents: ${valid_intents.join(", ")}.`,
          ...valid_intents.map((intent) => `- ${intent}: ${INTENT_GLOSSARY[intent] ?? ""}`),
          "segment = el fragmento textual del mensaje que corresponde a ESE intent, para que cada extractor solo vea su cláusula. Si hay una sola operación, segment = mensaje completo.",
          "Ordena los intents según aparecen en el mensaje. No repitas un mismo intent.",
          "Si no reconoces ninguna operación, devuelve un solo intent unknown con segment = mensaje completo.",
        ].join("\n"),
        input: [{ role: "user", content: JSON.stringify({ mensaje: text }) }],
        text: { format: { type: "json_object" } },
      }),
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = body.error?.message ?? `OpenAI request failed with status ${response.status}`;
      const error = new Error(message);
      error.code = body.error?.code ? `openai_${body.error.code}` : "openai_request_failed";
      error.status = response.status;
      throw error;
    }

    let parsed;
    try {
      parsed = parse_json_output(extract_output_text(body));
    } catch (error) {
      const parse_error = new Error(`OpenAI returned invalid JSON for intent classification: ${error.message}`);
      parse_error.code = "openai_invalid_json";
      throw parse_error;
    }

    const known = new Set(valid_intents);
    const seen = new Set();
    const classified = [];
    for (const item of Array.isArray(parsed.intents) ? parsed.intents : []) {
      const intent = String(item?.intent ?? "").trim();
      if (!known.has(intent) || seen.has(intent)) {
        continue;
      }
      seen.add(intent);
      const confidence = Number(item?.confidence);
      const segment = String(item?.segment ?? "").trim() || text;
      classified.push({
        intent,
        confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.5,
        reason: String(item?.reason ?? "").trim() || "clasificado por AI",
        segment,
      });
    }

    if (!classified.length) {
      classified.push({ intent: "unknown", confidence: 0.3, reason: "sin intents válidos del modelo", segment: text });
    }

    return { intents: classified, provider: "openai", model: this.model, response_id: body.id };
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
      error.code = body.error?.code ? `openai_${body.error.code}` : "openai_request_failed";
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
