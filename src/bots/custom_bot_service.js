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

export class custom_bot_service {
  constructor({ pool }) {
    this.pool = pool;
  }

  async create_custom_bot(input) {
    const account = await get_account_by_id(this.pool, input.account_id);

    if (!account) {
      throw new Error(`Account not found: ${input.account_id}`);
    }

    if (!account.tenant_id) {
      throw new Error(`Account ${input.account_id} must be linked to a tenant before creating bots`);
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
      tenant_id: account.tenant_id,
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
