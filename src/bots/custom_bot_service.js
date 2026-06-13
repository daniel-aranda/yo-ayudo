import { get_account_by_id } from "../accounts/account_repository.js";
import { bot_status_schema, parse_custom_bot_definition } from "./bot_definition_schemas.js";
import { list_bots_by_account, update_bot_status, upsert_bot } from "./bot_repository.js";

function slug_for_name(name) {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Definici\u00f3n m\u00ednima v\u00e1lida para un bot reci\u00e9n creado desde la UI: el founder
// la completa en el editor (que autosavea). Los textos son starters, no copy.
export function minimal_draft_definition(name) {
  return {
    identity: {
      name,
      description: "",
      goal: "Define el objetivo de este agente.",
      status: "draft",
      type: "custom",
    },
    behavior: {
      language: "es-MX",
      tone: "professional",
      operating_instructions: "Describe c\u00f3mo debe operar este agente, qu\u00e9 debe priorizar y cu\u00e1ndo debe consultar humanos.",
    },
  };
}

export class custom_bot_service {
  constructor({ pool }) {
    this.pool = pool;
  }

  // El repo hace upsert por (account_id, slug): un nombre repetido pisar\u00eda el
  // bot existente, as\u00ed que el slug se desambigua antes de crear.
  async unique_slug_for(account_id, name) {
    const base_slug = slug_for_name(String(name ?? "")) || "bot";
    const existing = await this.pool.query("SELECT slug FROM bots WHERE account_id = $1", [account_id]);
    const taken = new Set(existing.rows.map((row) => row.slug));
    let slug = base_slug;

    for (let suffix = 2; taken.has(slug); suffix += 1) {
      slug = `${base_slug}-${suffix}`;
    }

    return slug;
  }

  // Clona cualquier bot como bot custom en draft para una cuenta (system \u2192
  // preconfigurado instalado; custom \u2192 duplicado). Va por upsert_bot directo
  // (sin el zod estricto de create_custom_bot) porque las definiciones pueden
  // traer tipos de interacci\u00f3n ricos. Lo que es de la cuenta origen NO viaja:
  // knowledge_source_ids y human_group_ids.
  async clone_bot({ account_id, source_bot, name }) {
    const account = await get_account_by_id(this.pool, account_id);

    if (!account) {
      throw new Error(`Account not found: ${account_id}`);
    }

    const bot_name = String(name ?? "").trim() || source_bot.name;
    const source_definition = source_bot.definition_json ?? {};
    const definition = {
      ...source_definition,
      identity: {
        ...(source_definition.identity ?? {}),
        name: bot_name,
        description: source_definition.identity?.description ?? source_bot.description ?? "",
        goal: source_definition.identity?.goal || "Define el objetivo de este agente.",
        status: "draft",
        type: "custom",
      },
      knowledge_source_ids: [],
      interactions: (source_definition.interactions ?? []).map((interaction) => ({
        ...interaction,
        human_group_ids: [],
      })),
    };

    return upsert_bot(this.pool, {
      organization_id: account.organization_id,
      account_id: account.id,
      name: bot_name,
      slug: await this.unique_slug_for(account.id, bot_name),
      channel: source_bot.channel ?? "whatsapp",
      bot_type: "custom",
      status: "draft",
      description: definition.identity.description,
      settings_json: { source: "bot_clone", cloned_from_bot_id: source_bot.id, cloned_from_bot_type: source_bot.bot_type },
      definition_json: definition,
      definition_version: 1,
      instrucciones_operativas: definition.behavior?.operating_instructions ?? null,
      tono: definition.behavior?.tone ?? null,
      knowledge_base_ids_json: [],
      acciones_habilitadas_json: source_bot.acciones_habilitadas_json ?? [],
      enabled_actions_json: source_bot.enabled_actions_json ?? [],
      reglas_guardrail_json: source_bot.reglas_guardrail_json ?? [],
    });
  }

  async create_custom_bot(input) {
    const account = await get_account_by_id(this.pool, input.account_id);

    if (!account) {
      throw new Error(`Account not found: ${input.account_id}`);
    }

    const definition = parse_custom_bot_definition(input.definition_json);
    const status = bot_status_schema.parse(input.status ?? "draft");
    const name = input.name ?? definition.identity.name;
    const slug = input.slug ?? slug_for_name(name);

    if (!slug) {
      throw new Error("Bot slug could not be generated");
    }

    return upsert_bot(this.pool, {
      organization_id: account.organization_id,
      account_id: account.id,
      bot_profile_id: input.bot_profile_id ?? null,
      name,
      slug,
      channel: input.channel ?? "whatsapp",
      bot_type: "custom",
      status,
      description: input.description ?? definition.identity.description ?? "",
      settings_json: input.settings_json ?? {},
      definition_json: definition,
      definition_version: input.definition_version ?? 1,
      created_by_user_id: input.created_by_user_id ?? null,
      instrucciones_operativas: definition.behavior.operating_instructions,
      tono: definition.behavior.tone,
      knowledge_base_ids_json: definition.knowledge_source_ids,
      reglas_guardrail_json: definition.behavior.constraints ? definition.behavior.constraints.split("\n") : [],
    });
  }

  async list_bots_by_account(account_id) {
    return list_bots_by_account(this.pool, account_id);
  }

  async set_status(bot_id, status) {
    return update_bot_status(this.pool, {
      bot_id,
      status: bot_status_schema.parse(status),
    });
  }
}
