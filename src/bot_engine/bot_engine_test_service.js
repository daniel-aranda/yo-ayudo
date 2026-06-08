import { action_execution_service } from "../actions/action_execution_service.js";
import { create_model_provider } from "../ai/provider_factory.js";
import { bot_configuration_service } from "./bot_configuration_service.js";
import { prompt_compiler } from "./prompt_compiler.js";

function includes_any(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function tomorrow_iso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(15, 0, 0, 0);
  return date.toISOString();
}

function normalize_action_request(request) {
  return {
    action_id: request.action_id,
    input_json: request.input_json ?? request.input ?? {},
  };
}

function infer_business_search_input(message) {
  const text = String(message ?? "");
  const location_match = text.match(/\b(?:en|cerca de|por)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,-]+?)(?:\s+\b(?:para|con|que|y)\b|[.!?]|$)/i);
  const query_match = text.match(/\b(?:busca|buscar|encuentra|encontrar)\s+(?:negocios|prospectos|leads)?\s*(?:de|para|tipo)?\s*([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .,-]+?)(?:\s+\b(?:en|cerca de|por)\b|$)/i);

  return {
    query: (query_match?.[1] ?? "negocios con potencial para YoAyudo").trim(),
    location: (location_match?.[1] ?? "México").trim(),
    max_results: 10,
  };
}

function infer_action_requests_from_message(message) {
  const text = String(message ?? "");
  const requests = [];

  if (includes_any(text, ["registra", "anota", "guarda nota", "hablé", "hable", "interesado", "interesados"])) {
    requests.push({
      action_id: "guardar_nota",
      input_json: {
        nota: text,
      },
    });
  }

  if (includes_any(text, ["crea tarea", "crear tarea", "tarea", "seguimiento", "llamar mañana", "llamar manana"])) {
    requests.push({
      action_id: "crear_tarea",
      input_json: {
        titulo: "Dar seguimiento comercial",
        descripcion: text,
        due_at: includes_any(text, ["mañana", "manana"]) ? tomorrow_iso() : null,
        status: "pendiente",
      },
    });
  }

  if (includes_any(text, ["resumen", "resume", "resúmeme", "resumeme"])) {
    requests.push({
      action_id: "generar_resumen",
      input_json: {
        contexto: { mensaje: text },
        formato: "bullets",
      },
    });
  }

  if (
    includes_any(text, [
      "buscar negocios",
      "busca negocios",
      "encuentra negocios",
      "encontrar negocios",
      "buscar prospectos",
      "busca prospectos",
      "buscar leads",
      "busca leads",
    ])
  ) {
    requests.push({
      action_id: "buscar_negocios",
      input_json: infer_business_search_input(message),
    });
  }

  if (includes_any(text, ["email", "correo"])) {
    requests.push({
      action_id: "enviar_email",
      input_json: {
        to: "",
        subject: "Seguimiento",
        body: text,
      },
    });
  }

  if (includes_any(text, ["imagen", "foto", "captura", "pdf"])) {
    requests.push({
      action_id: "extraer_datos_de_imagen",
      input_json: {
        archivo_id: "archivo_pendiente",
        instrucciones: text,
      },
    });
  }

  if (includes_any(text, ["llamada automática", "llamada automatica", "llama por teléfono", "llama por telefono", "conecta con vendedor"])) {
    requests.push({
      action_id: "programar_llamada",
      input_json: {
        telefono: "",
        motivo: text,
      },
    });
  }

  return requests;
}

function build_reply(message, results) {
  const executed = results.filter((result) => result.status === "executed").map((result) => result.action_id);
  const pending = results.filter((result) => result.status === "pending_confirmation").map((result) => result.action_id);
  const blocked = results
    .filter((result) => ["blocked", "not_implemented", "pending_provider", "failed", "unknown_action"].includes(result.status))
    .map((result) => result.action_id);

  if (!results.length) {
    return "Recibí el mensaje. No detecté una acción interna segura para ejecutar en modo test.";
  }

  const parts = ["Recibí el mensaje y procesé el flujo de prueba."];

  if (executed.length) {
    parts.push(`Ejecuté: ${executed.join(", ")}.`);
  }

  if (pending.length) {
    parts.push(`Quedó pendiente de confirmación: ${pending.join(", ")}.`);
  }

  if (blocked.length) {
    parts.push(`No ejecuté: ${blocked.join(", ")}. Revisar guardrails.`);
  }

  return parts.join(" ");
}

function build_fallback_reply(message, results) {
  if (results.length) {
    return build_reply(message, results);
  }

  const text = String(message ?? "").toLowerCase();

  if (text.includes("dentista") || text.includes("dental") || text.includes("clínica") || text.includes("clinica")) {
    return [
      "Para un dentista, ofrece YoAyudo como un agente de WhatsApp para no perder pacientes potenciales.",
      "Puede responder dudas frecuentes, capturar nombre/teléfono/motivo, registrar notas del prospecto, crear tareas de seguimiento y escalar a recepción cuando haga falta confirmar agenda, precios o tratamientos.",
      "No prometas integraciones clínicas o agenda automática si no están configuradas; véndelo primero como orden, seguimiento y visibilidad para ventas por WhatsApp.",
    ].join(" ");
  }

  return [
    "Puedes ofrecer YoAyudo como una capa inteligente sobre WhatsApp para ordenar conversaciones, capturar datos, crear seguimientos, guardar notas, consultar knowledge y escalar a humanos cuando falte contexto.",
    "Si el prospecto pregunta por integraciones, pricing o capacidades custom, valida el alcance antes de prometerlo.",
  ].join(" ");
}

function enabled_interactions_for_bot(bot) {
  return new Map(
    (bot.definition_json?.interactions ?? [])
      .filter((interaction) => interaction.enabled !== false)
      .map((interaction) => [interaction.type, interaction]),
  );
}

function should_consult_human(message, action_results) {
  const text = String(message ?? "");
  return (
    includes_any(text, ["humano", "persona", "consulta", "custom", "riesgo", "aprobación", "aprobacion", "no sé", "no se"]) ||
    action_results.some((result) => ["blocked", "pending_confirmation", "pending_provider", "not_implemented"].includes(result.status))
  );
}

function build_interaction_trace(bot, message, reply, action_results) {
  const interactions = enabled_interactions_for_bot(bot);
  const trace = [];

  if (interactions.has("receive_whatsapp_message")) {
    trace.push({
      interaction_type: "receive_whatsapp_message",
      label: interactions.get("receive_whatsapp_message").label,
      status: "mock_received",
      reason: "Modo test simuló un mensaje entrante de WhatsApp.",
      input: { message },
      output: { channel: "whatsapp_mock", received: true },
    });
  } else {
    trace.push({
      interaction_type: "receive_whatsapp_message",
      status: "ignored",
      reason: "El agente no tiene habilitada la interacción para recibir WhatsApp.",
    });
  }

  if (should_consult_human(message, action_results)) {
    if (interactions.has("consult_human")) {
      trace.push({
        interaction_type: "consult_human",
        label: interactions.get("consult_human").label,
        status: "mock_requested_and_answered",
        reason: "El mensaje o los resultados requieren criterio humano en modo test.",
        input: {
          question: message,
          context_summary: action_results.map((result) => `${result.action_id}:${result.status}`).join(", "),
        },
        output: {
          human_group_ids: interactions.get("consult_human").human_group_ids ?? [],
          response: "Mock humano: valida el contexto, responde con cautela y no prometas integraciones no configuradas.",
        },
      });
    } else {
      trace.push({
        interaction_type: "consult_human",
        status: "ignored",
        reason: "El bot quiso consultar a humano, pero la interacción no está habilitada.",
      });
    }
  }

  if (interactions.has("send_whatsapp_message")) {
    trace.push({
      interaction_type: "send_whatsapp_message",
      label: interactions.get("send_whatsapp_message").label,
      status: "mock_sent",
      reason: "Modo test simuló el envío de respuesta por WhatsApp.",
      input: { reply },
      output: { channel: "whatsapp_mock", sent: true, external_message_id: "mock-whatsapp-message" },
    });
  } else {
    trace.push({
      interaction_type: "send_whatsapp_message",
      status: "ignored",
      reason: "El agente no tiene habilitada la interacción para enviar WhatsApp.",
      input: { reply },
    });
  }

  return trace;
}

export class bot_engine_test_service {
  constructor({ pool, provider } = {}) {
    this.pool = pool;
    this.bot_service = new bot_configuration_service({ pool });
    this.compiler = new prompt_compiler({ pool });
    this.actions = new action_execution_service({ pool });
    this.provider = provider ?? create_model_provider();
    this.provider_was_injected = Boolean(provider);
  }

  provider_for_test(input, bot) {
    if (this.provider_was_injected) {
      return this.provider;
    }

    const ai_config = bot?.definition_json?.ai ?? {};
    const provider = ai_config.provider ?? "mock";
    const model = ai_config.model;

    if (input.require_real_ai === true) {
      return create_model_provider({
        provider,
        model,
        prefer_openai_when_configured: true,
      });
    }

    return this.provider;
  }

  async test_message(input) {
    if (input.modo_test !== true) {
      throw new Error("Este endpoint solo acepta modo_test=true.");
    }

    const bot = await this.bot_service.get_bot(input.bot_id);

    if (!bot) {
      throw new Error(`Bot no encontrado: ${input.bot_id}`);
    }

    const organization_id = input.organization_id ?? bot.organization_id ?? null;
    const account_id = input.account_id ?? bot.account_id ?? null;
    const provider = this.provider_for_test(input, bot);

    if (input.require_real_ai === true && typeof provider.decide_bot_test_message !== "function") {
      const error = new Error("Probar bot requiere AI real. Configura AI_PROVIDER=openai y OPENAI_API_KEY.");
      error.code = "bot_test_real_ai_required";
      throw error;
    }

    const compiled = await this.compiler.record_compilation({
      bot,
      conversation_id: input.conversation_id ?? null,
      business_knowledge: input.business_knowledge ?? [],
      conversation_memory: input.conversation_memory ?? [],
    });

    let model_decision = null;
    let model_error = null;

    if (!input.action_requests && typeof provider.decide_bot_test_message === "function") {
      try {
        model_decision = await provider.decide_bot_test_message({
          prompt: compiled.prompt,
          mensaje: input.mensaje ?? input.current_message,
          acciones_disponibles: compiled.acciones_disponibles,
          bot,
        });
      } catch (error) {
        model_error = {
          code: error.code ?? "model_provider_error",
          status: error.status ?? null,
          message: error.message ?? "Model provider failed.",
        };
      }
    }

    const action_requests = (input.action_requests ?? model_decision?.action_requests ?? infer_action_requests_from_message(input.mensaje ?? input.current_message))
      .map(normalize_action_request)
      .filter((request) => request.action_id);
    const action_results = [];

    for (const request of action_requests) {
      action_results.push(await this.actions.execute_action({
        organization_id,
        account_id,
        bot_id: bot.id,
        conversation_id: input.conversation_id ?? null,
        message_id: input.message_id ?? null,
        action_id: request.action_id,
        input_json: request.input_json,
        actor_type: "bot",
        prompt_fragment: String(input.mensaje ?? input.current_message ?? "").slice(0, 500),
      }));
    }

    const respuesta = model_decision?.reply || build_fallback_reply(input.mensaje ?? input.current_message, action_results);
    const interaction_trace = build_interaction_trace(bot, input.mensaje ?? input.current_message, respuesta, action_results);

    return {
      respuesta,
      respuesta_operativa: build_reply(input.mensaje ?? input.current_message, action_results),
      model_decision,
      model_error,
      prompt_compilation_id: compiled.compilation.id,
      acciones_disponibles: compiled.acciones_disponibles,
      action_requests,
      actions_ejecutadas: action_results.filter((result) => result.status === "executed"),
      actions_pendientes_confirmacion: action_results.filter((result) => result.status === "pending_confirmation"),
      guardrail_events_generados: action_results.flatMap((result) => result.guardrail_events ?? []),
      interaction_trace,
      action_results,
      errores: action_results
        .filter((result) => result.audit_log?.error)
        .map((result) => ({ action_id: result.action_id, error: result.audit_log.error })),
    };
  }
}
