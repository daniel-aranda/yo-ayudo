import { intents as valid_intents } from "./intents.js";

// Prompt + parsing helpers compartidos por los adapters que hablan JSON con un LLM
// (gemini/claude). El adapter de OpenAI mantiene su propia copia equivalente; estos
// helpers existen para no duplicar el glosario/contrato en cada provider nuevo.

const INTENT_GLOSSARY = {
  day_start: "apertura del día / efectivo inicial en caja",
  sales_update: "ventas acumuladas o desglose por método de pago",
  purchase: "compra de insumos o mercancía",
  inventory_update: "conteo o existencia de inventario",
  daily_close: "cierre del día / caja final",
  daily_note: "nota operativa: merma, faltante, sobrante o comentario",
  report_request: "pedir reporte o resumen del día",
  collect_information_start: "pedir iniciar una recolección de información / armar una propuesta (entrevista)",
  collect_information: "responder a la entrevista de recolección en curso",
  generate_document_request: "pedir generar/armar un documento (p. ej. la propuesta) de lo ya recolectado",
  human_help: "pedir ayuda humana / hablar con una persona",
  unknown: "no corresponde a ninguna operación conocida",
};

export { valid_intents };

// Instrucciones (system) para clasificación multi-intent. Mismo contrato JSON que
// usa el engine: {"intents":[{intent,confidence,segment,reason}]}.
export function classification_instructions() {
  return [
    "Eres el clasificador de intenciones de YoAyudo.",
    "Un mensaje de WhatsApp puede contener VARIAS operaciones en una sola frase.",
    "Detecta cada operación presente y devuelve SOLO JSON válido.",
    'Formato exacto: {"intents":[{"intent":"string","confidence":0..1,"segment":"string","reason":"string"}]}',
    `Usa únicamente estos intents: ${valid_intents.join(", ")}.`,
    ...valid_intents.map((intent) => `- ${intent}: ${INTENT_GLOSSARY[intent] ?? ""}`),
    "segment = el fragmento textual del mensaje que corresponde a ESE intent. Si hay una sola operación, segment = mensaje completo.",
    "Ordena los intents según aparecen en el mensaje. No repitas un mismo intent.",
    "Si no reconoces ninguna operación, devuelve un solo intent unknown con segment = mensaje completo.",
  ].join("\n");
}

// Instrucciones (system) para el runtime de prueba del bot. Mismo contrato que
// decide_bot_test_message en el adapter de OpenAI.
export function test_runtime_instructions() {
  return [
    "Eres el runtime de prueba de YoAyudo Bot Engine.",
    "Debes decidir una respuesta y acciones internas para un bot configurable.",
    "Devuelve solo JSON válido.",
    "No digas que ejecutaste acciones. Solo solicita acciones en action_requests.",
    "Usa únicamente action_id incluidos en acciones_disponibles. Si falta una capacidad, explica en reply que debe revisarse por guardrail.",
    'Formato exacto: {"reply":"string","action_requests":[{"action_id":"string","input_json":{}}],"reason":"string"}',
  ].join("\n");
}

// Instrucciones (system) para un turno de la entrevista de "recolectar
// información": entrevista abierta, una pregunta a la vez, derivada de la
// respuesta anterior, que decide sola cuándo tiene suficiente.
export function collection_instructions() {
  return [
    "Eres el entrevistador de YoAyudo. Recolectas información para un objetivo (p. ej. armar una propuesta) haciendo UNA pregunta a la vez.",
    "Recibes: el objetivo, la guía de qué explorar, el avance (findings), la conversación (transcript) y la última respuesta.",
    "Haz 3 cosas: (1) actualiza findings con lo aprendido (objeto estructurado, claves en español); (2) decide si ya tienes suficiente para el objetivo; (3) si no, formula la SIGUIENTE pregunta, natural y derivada de la última respuesta, sin repetir lo ya preguntado.",
    "Una sola pregunta por turno, breve, cálida y de negocio. Acusa brevemente lo dicho antes de preguntar.",
    "Si el usuario pide terminar ('ya', 'con eso', 'genera') cierra con is_complete=true y completion_reason='user_requested'.",
    "Si ya cubriste lo necesario, is_complete=true y completion_reason='llm_ready'.",
    "Devuelve SOLO JSON válido.",
    'Formato exacto: {"findings":{},"is_complete":false,"completion_reason":null,"next_question":"string|null","closing_message":"string|null"}',
  ].join("\n");
}

export function build_collection_user_payload(input) {
  return JSON.stringify({
    objetivo: input.objective ?? null,
    guia: input.guidance ?? null,
    avance: input.findings ?? {},
    conversacion: input.transcript ?? [],
    ultima_respuesta: input.answer ?? "",
    respuestas_contadas: input.answers_count ?? 0,
    tope_preguntas: input.max_turns ?? null,
  });
}

// Normaliza la salida del modelo al contrato del turno de recolección.
export function normalize_collection_output(parsed, prev_findings) {
  const findings = parsed && typeof parsed.findings === "object" && parsed.findings ? parsed.findings : prev_findings ?? {};
  const is_complete = Boolean(parsed?.is_complete);
  const next_question =
    !is_complete && typeof parsed?.next_question === "string" && parsed.next_question.trim()
      ? parsed.next_question.trim()
      : null;
  const closing_message =
    typeof parsed?.closing_message === "string" && parsed.closing_message.trim() ? parsed.closing_message.trim() : null;
  let completion_reason = typeof parsed?.completion_reason === "string" ? parsed.completion_reason : null;
  if (is_complete && !completion_reason) completion_reason = "llm_ready";
  if (!is_complete) completion_reason = null;
  return { findings, is_complete, completion_reason, next_question, closing_message };
}

export function parse_json_output(text) {
  const trimmed = String(text ?? "").trim();
  const without_fence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(without_fence);
}

// Normaliza la lista de intents del modelo al contrato del engine (dedup, clamp de
// confidence, segment por defecto = texto completo).
export function normalize_classified_intents(parsed, text) {
  const known = new Set(valid_intents);
  const seen = new Set();
  const classified = [];
  for (const item of Array.isArray(parsed?.intents) ? parsed.intents : []) {
    const intent = String(item?.intent ?? "").trim();
    if (!known.has(intent) || seen.has(intent)) continue;
    seen.add(intent);
    const confidence = Number(item?.confidence);
    classified.push({
      intent,
      confidence: Number.isFinite(confidence) ? Math.min(Math.max(confidence, 0), 1) : 0.5,
      reason: String(item?.reason ?? "").trim() || "clasificado por AI",
      segment: String(item?.segment ?? "").trim() || text,
    });
  }
  if (!classified.length) {
    classified.push({ intent: "unknown", confidence: 0.3, reason: "sin intents válidos del modelo", segment: text });
  }
  return classified;
}

export function normalize_action_requests(parsed) {
  return Array.isArray(parsed?.action_requests)
    ? parsed.action_requests
        .filter((request) => request?.action_id)
        .map((request) => ({ action_id: request.action_id, input_json: request.input_json ?? request.input ?? {} }))
    : [];
}
