import { action_execution_service } from "../actions/action_execution_service.js";
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

export class bot_engine_test_service {
  constructor({ pool }) {
    this.pool = pool;
    this.bot_service = new bot_configuration_service({ pool });
    this.compiler = new prompt_compiler({ pool });
    this.actions = new action_execution_service({ pool });
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
    const compiled = await this.compiler.record_compilation({
      bot,
      conversation_id: input.conversation_id ?? null,
      business_knowledge: input.business_knowledge ?? [],
      conversation_memory: input.conversation_memory ?? [],
    });
    const action_requests = (input.action_requests ?? infer_action_requests_from_message(input.mensaje ?? input.current_message))
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

    return {
      respuesta: build_reply(input.mensaje ?? input.current_message, action_results),
      prompt_compilation_id: compiled.compilation.id,
      acciones_disponibles: compiled.acciones_disponibles,
      action_requests,
      actions_ejecutadas: action_results.filter((result) => result.status === "executed"),
      actions_pendientes_confirmacion: action_results.filter((result) => result.status === "pending_confirmation"),
      guardrail_events_generados: action_results.flatMap((result) => result.guardrail_events ?? []),
      action_results,
      errores: action_results
        .filter((result) => result.audit_log?.error)
        .map((result) => ({ action_id: result.action_id, error: result.audit_log.error })),
    };
  }
}
