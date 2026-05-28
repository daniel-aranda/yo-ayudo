import { create_action_audit_log } from "./action_audit_repository.js";
import { get_action } from "./action_registry.js";

function pending_confirmation_result(action, input) {
  return {
    status: "pending_confirmation",
    action_id: action.action_id,
    confirmation_required: true,
    output: {
      message: "La acción requiere confirmación humana antes de ejecutarse.",
      requested_action: action.action_id,
      requested_input: input,
    },
  };
}

function human_only_result(action) {
  return {
    status: "solo_humano",
    action_id: action.action_id,
    confirmation_required: true,
    output: {
      message: "La acción solo puede ejecutarla una persona autorizada.",
      requested_action: action.action_id,
    },
  };
}

function stub_result(action) {
  if (action.categoria === "voz") {
    return {
      status: "pending_provider",
      action_id: action.action_id,
      confirmation_required: false,
      output: {
        provider: "voice_provider_stub",
        message: "Proveedor de voz no configurado todavía.",
      },
    };
  }

  return {
    status: "not_implemented",
    action_id: action.action_id,
    confirmation_required: false,
    output: {
      message: "Contrato registrado; handler productivo pendiente.",
    },
  };
}

export class action_execution_service {
  constructor({ pool }) {
    this.pool = pool;
  }

  async execute_action(input) {
    const action = get_action(input.action_id);

    if (!action) {
      const output = { message: `Acción desconocida: ${input.action_id}` };
      const audit_log = await create_action_audit_log(this.pool, {
        ...input,
        status: "unknown_action",
        input_json: input.input_json ?? {},
        output_json: output,
        error: output.message,
        confirmation_required: false,
      });

      return { status: "unknown_action", action_id: input.action_id, output, audit_log };
    }

    let result;

    if (action.nivel_riesgo === "solo_humano") {
      result = human_only_result(action);
    } else if (action.nivel_riesgo === "requiere_confirmacion" && !input.confirmed_by) {
      result = pending_confirmation_result(action, input.input_json ?? {});
    } else {
      result = stub_result(action);
    }

    const audit_log = await create_action_audit_log(this.pool, {
      organization_id: input.organization_id,
      account_id: input.account_id,
      bot_id: input.bot_id,
      conversation_id: input.conversation_id,
      message_id: input.message_id,
      action_id: action.action_id,
      status: result.status,
      input_json: input.input_json ?? {},
      output_json: result.output,
      actor_type: input.actor_type ?? "system",
      actor_id: input.actor_id ?? null,
      confirmation_required: result.confirmation_required,
      confirmed_by: input.confirmed_by ?? null,
      confirmed_at: input.confirmed_by ? new Date().toISOString() : null,
      metadata_json: {
        nivel_riesgo: action.nivel_riesgo,
        categoria: action.categoria,
      },
    });

    return { ...result, audit_log };
  }
}
