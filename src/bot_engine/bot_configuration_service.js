import { get_account_by_id } from "../accounts/account_repository.js";
import { get_bot_by_id, list_bots_by_account, update_bot_configuration, upsert_bot } from "../bots/bot_repository.js";
import { get_bot_template } from "./bot_template_repository.js";

function slug_from_name(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function definition_from_config(config) {
  const operating_instructions = config.instrucciones_operativas ?? config.prompt_base ?? "";
  const constraints = (config.reglas_guardrail ?? []).join("\n");
  const interactions = config.interactions ?? [
    {
      key: "receive_whatsapp_message",
      type: "receive_whatsapp_message",
      label: "Recibir mensajes de WhatsApp",
      enabled: true,
      instructions: "Atiende mensajes entrantes relacionados con el objetivo del agente y pide contexto cuando haga falta.",
    },
    {
      key: "send_whatsapp_message",
      type: "send_whatsapp_message",
      label: "Enviar mensaje de WhatsApp",
      enabled: true,
      instructions: "Envía respuestas claras, útiles y alineadas con las instrucciones operativas.",
    },
    {
      key: "consult_human",
      type: "consult_human",
      label: "Consultar humano",
      enabled: true,
      instructions: "Consulta a un humano cuando falte knowledge, exista riesgo o el cliente pida algo fuera de alcance.",
      human_group_ids: [],
    },
  ];

  return {
    identity: {
      name: config.nombre,
      description: config.descripcion ?? "",
      goal: (config.objetivos ?? []).join("\n") || operating_instructions,
      status: "active",
      type: "custom",
    },
    behavior: {
      language: "es-MX",
      tone: config.tono ?? "professional",
      operating_instructions,
      constraints,
    },
    knowledge_source_ids: config.knowledge_base_ids ?? [],
    interactions,
  };
}

function template_to_config(template, input) {
  return {
    nombre: input.nombre ?? template.nombre,
    descripcion: input.descripcion ?? template.descripcion,
    instrucciones_operativas: input.instrucciones_operativas ?? template.prompt_base ?? "",
    tono: input.tono ?? "claro y profesional",
    objetivos: input.objetivos ?? [template.descripcion].filter(Boolean),
    knowledge_base_ids: input.knowledge_base_ids ?? [],
    acciones_habilitadas: input.acciones_habilitadas ?? template.acciones_sugeridas,
    reglas_guardrail: input.reglas_guardrail ?? template.reglas_guardrail_sugeridas,
    reglas_escalamiento: input.reglas_escalamiento ?? template.reglas_escalamiento_sugeridas,
    campos_a_capturar: input.campos_a_capturar ?? template.campos_sugeridos,
    memoria_habilitada: input.memoria_habilitada ?? true,
  };
}

export class bot_configuration_service {
  constructor({ pool }) {
    this.pool = pool;
  }

  async list_bots(input = {}) {
    if (input.account_id) {
      return list_bots_by_account(this.pool, input.account_id);
    }

    const result = await this.pool.query(
      `
        SELECT *
        FROM bots
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [input.limit ?? 100],
    );

    return result.rows;
  }

  async get_bot(bot_id) {
    return get_bot_by_id(this.pool, bot_id);
  }

  async create_configurable_bot(input) {
    const account = await get_account_by_id(this.pool, input.account_id);

    if (!account) {
      throw new Error(`Account no encontrado: ${input.account_id}`);
    }

    let config = input;
    let template = null;

    if (input.template_id) {
      template = await get_bot_template(this.pool, input.template_id);

      if (!template) {
        throw new Error(`Template no encontrado: ${input.template_id}`);
      }

      config = template_to_config(template, input);
    }

    const definition_json = input.definition_json ?? definition_from_config(config);
    const bot = await upsert_bot(this.pool, {
      organization_id: account.organization_id,
      account_id: account.id,
      name: config.nombre,
      slug: input.slug ?? slug_from_name(config.nombre),
      channel: "whatsapp",
      bot_type: "custom",
      status: input.status ?? "draft",
      description: config.descripcion ?? null,
      definition_json,
      definition_version: 1,
      paquete_id: input.template_id ?? null,
      prompt_base: null,
      instrucciones_operativas: config.instrucciones_operativas,
      tono: config.tono,
      objetivos_json: config.objetivos ?? [],
      knowledge_base_ids_json: config.knowledge_base_ids ?? [],
      acciones_habilitadas_json: config.acciones_habilitadas ?? [],
      enabled_actions_json: config.acciones_habilitadas ?? [],
      reglas_guardrail_json: config.reglas_guardrail ?? [],
      reglas_escalamiento_json: config.reglas_escalamiento ?? [],
      campos_requeridos_json: config.campos_a_capturar ?? [],
      memoria_habilitada: config.memoria_habilitada ?? true,
      settings_json: {
        template_id: input.template_id ?? null,
        template_version: template?.version ?? null,
      },
    });

    return { bot, template };
  }

  async update_configurable_bot(bot_id, patch) {
    return update_bot_configuration(this.pool, bot_id, patch);
  }

  async set_action_enabled(bot_id, action_id, enabled) {
    const bot = await get_bot_by_id(this.pool, bot_id);

    if (!bot) {
      return null;
    }

    const current = bot.acciones_habilitadas_json ?? bot.enabled_actions_json ?? [];
    const next_actions = enabled
      ? [...new Set([...current, action_id])]
      : current.filter((candidate) => candidate !== action_id);

    return update_bot_configuration(this.pool, bot_id, {
      acciones_habilitadas_json: next_actions,
      enabled_actions_json: next_actions,
    });
  }
}
