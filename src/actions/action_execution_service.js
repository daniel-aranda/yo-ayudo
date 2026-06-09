import { create_action_audit_log } from "./action_audit_repository.js";
import { execute_internal_action_handler } from "./internal_action_handlers.js";
import { get_action } from "./action_registry.js";
import { get_bot_by_id } from "../bots/bot_repository.js";
import { create_bot_guardrail_event } from "../bot_engine/bot_guardrail_event_repository.js";

function schema_type_matches(schema, value) {
  if (!schema?.type) {
    return true;
  }

  if (schema.type === "array") {
    return Array.isArray(value);
  }

  if (schema.type === "object") {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  return typeof value === schema.type;
}

function validate_input_schema(schema, input) {
  const errors = [];
  const value = input ?? {};

  if (!schema_type_matches(schema, value)) {
    return [`Input debe ser ${schema.type}.`];
  }

  for (const required_key of schema.required ?? []) {
    if (value[required_key] === undefined || value[required_key] === null || value[required_key] === "") {
      errors.push(`Falta campo requerido: ${required_key}`);
    }
  }

  for (const [key, property_schema] of Object.entries(schema.properties ?? {})) {
    if (value[key] !== undefined && value[key] !== null && !schema_type_matches(property_schema, value[key])) {
      errors.push(`Campo ${key} debe ser ${property_schema.type}.`);
    }
  }

  return errors;
}

function enabled_actions_for_bot(bot) {
  return new Set(bot?.acciones_habilitadas_json ?? bot?.enabled_actions_json ?? []);
}

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
    status: "blocked",
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
      const guardrail_event = await this.create_guardrail(input, {
        tipo: "accion_no_disponible",
        descripcion: output.message,
        severidad: "media",
      });
      const audit_log = await create_action_audit_log(this.pool, {
        ...input,
        status: "unknown_action",
        input_json: input.input_json ?? {},
        output_json: output,
        error: output.message,
        confirmation_required: false,
      });

      return { status: "unknown_action", action_id: input.action_id, output, audit_log, guardrail_events: [guardrail_event] };
    }

    if (action.habilitada === false) {
      return this.block_with_guardrail(input, action, {
        tipo: "accion_no_disponible",
        status: "blocked",
        descripcion: `La acción ${action.action_id} está deshabilitada en el registry.`,
        severidad: "alta",
      });
    }

    const bot = input.bot_id ? await get_bot_by_id(this.pool, input.bot_id) : null;

    // System-invoked actions (e.g. operational writes routed from the deterministic
    // parser) bypass the per-bot enablement toggle: operations are a platform
    // capability, not a per-bot configured interaction. Still audited with bot_id.
    if (bot && !input.bypass_bot_enablement && !enabled_actions_for_bot(bot).has(action.action_id)) {
      return this.block_with_guardrail(input, action, {
        tipo: "accion_no_habilitada",
        status: "blocked",
        descripcion: `El bot no tiene habilitada la acción ${action.action_id}.`,
        severidad: "media",
      });
    }

    if (Array.isArray(input.permisos_disponibles)) {
      const missing_permissions = (action.permisos_requeridos ?? []).filter(
        (permission) => !input.permisos_disponibles.includes(permission),
      );

      if (missing_permissions.length) {
        return this.block_with_guardrail(input, action, {
          tipo: "permiso_insuficiente",
          status: "blocked",
          descripcion: `Faltan permisos para ${action.action_id}: ${missing_permissions.join(", ")}.`,
          severidad: "alta",
        });
      }
    }

    const schema_errors = validate_input_schema(action.input_schema, input.input_json ?? {});

    if (schema_errors.length) {
      return this.block_with_guardrail(input, action, {
        tipo: "input_invalido",
        status: "failed",
        descripcion: schema_errors.join("; "),
        severidad: "media",
      });
    }

    let result;
    const guardrail_events = [];

    if (action.nivel_riesgo === "solo_humano") {
      guardrail_events.push(await this.create_guardrail(input, {
        tipo: "riesgo_bloqueado",
        action_id: action.action_id,
        descripcion: `La acción ${action.action_id} está marcada como solo_humano.`,
        severidad: "alta",
      }));
      result = human_only_result(action);
    } else if (action.nivel_riesgo === "requiere_confirmacion" && !input.confirmed_by) {
      guardrail_events.push(await this.create_guardrail(input, {
        tipo: "requiere_confirmacion",
        action_id: action.action_id,
        descripcion: `La acción ${action.action_id} requiere confirmación humana.`,
        severidad: "media",
      }));
      result = pending_confirmation_result(action, input.input_json ?? {});
    } else {
      result = await execute_internal_action_handler(this.pool, action, input);
      result ??= stub_result(action);
      result.action_id ??= action.action_id;

      if (result.status === "pending_provider") {
        guardrail_events.push(await this.create_guardrail(input, {
          tipo: "proveedor_no_configurado",
          action_id: action.action_id,
          descripcion: `La acción ${action.action_id} requiere un proveedor no configurado.`,
          severidad: "media",
        }));
      } else if (result.status === "not_implemented") {
        guardrail_events.push(await this.create_guardrail(input, {
          tipo: "accion_no_disponible",
          action_id: action.action_id,
          descripcion: `La acción ${action.action_id} existe como contrato, pero aún no tiene handler productivo.`,
          severidad: "media",
        }));
      }
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

    return { ...result, audit_log, guardrail_events };
  }

  async block_with_guardrail(input, action, event) {
    const guardrail_event = await this.create_guardrail(input, {
      ...event,
      action_id: action?.action_id ?? input.action_id,
    });
    const output = { message: event.descripcion };
    const audit_log = await create_action_audit_log(this.pool, {
      organization_id: input.organization_id,
      account_id: input.account_id,
      bot_id: input.bot_id,
      conversation_id: input.conversation_id,
      message_id: input.message_id,
      action_id: action?.action_id ?? input.action_id,
      status: event.status,
      input_json: input.input_json ?? {},
      output_json: output,
      error: event.descripcion,
      actor_type: input.actor_type ?? "system",
      actor_id: input.actor_id ?? null,
      confirmation_required: false,
      metadata_json: {
        guardrail_tipo: event.tipo,
      },
    });

    return {
      status: event.status,
      action_id: action?.action_id ?? input.action_id,
      output,
      audit_log,
      guardrail_events: [guardrail_event],
    };
  }

  async create_guardrail(input, event) {
    return create_bot_guardrail_event(this.pool, {
      organization_id: input.organization_id,
      account_id: input.account_id,
      bot_id: input.bot_id,
      conversation_id: input.conversation_id,
      tipo: event.tipo,
      action_id: event.action_id ?? input.action_id ?? null,
      accion_sugerida: input.accion_sugerida ?? null,
      descripcion: event.descripcion,
      prompt_fragment: input.prompt_fragment ?? null,
      input_intentado: input.input_json ?? {},
      severidad: event.severidad ?? "media",
    });
  }
}
