import { compact_trace_for_message, build_message_trace } from "./trace_builder.js";
import { get_action } from "../actions/action_registry.js";
import { assign_bot_to_whatsapp_phone_number } from "../bots/bot_assignment_repository.js";
import { get_bot_by_id, get_bot_with_definition, update_bot_configuration } from "../bots/bot_repository.js";
import { upsert_whatsapp_phone_number } from "../channels/whatsapp/whatsapp_number_repository.js";
import {
  assign_bot_to_instagram_account,
  upsert_instagram_account,
} from "../channels/instagram/instagram_account_repository.js";
import { list_knowledge_sources } from "../knowledge/knowledge_center_repository.js";
import { present_conversation_summary } from "./inspector_presenter.js";

function as_array(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function compact_strings(value, remove_indexes = new Set()) {
  return as_array(value)
    .map((item, index) => ({ item: String(item ?? "").trim(), index }))
    .filter((entry) => entry.item && !remove_indexes.has(String(entry.index)))
    .map((entry) => entry.item);
}

function checked_indexes(value) {
  return new Set(compact_strings(value));
}

function row_objects(keys, body, prefix) {
  const rows = as_array(body[`${prefix}_${keys[0]}`]);

  return rows.map((_, index) => {
    const row = {};

    for (const key of keys) {
      row[key] = as_array(body[`${prefix}_${key}`])[index];
    }

    return row;
  });
}

export const available_agent_interactions = [
  {
    type: "send_whatsapp_message",
    key: "send_whatsapp_message",
    label: "Enviar mensaje de WhatsApp",
    description: "Permite que el agente envíe mensajes por WhatsApp.",
    instructions_placeholder:
      "Describe qué tipo de mensajes puede enviar este agente, cuándo debe enviarlos y qué no debe enviar.",
  },
  {
    type: "receive_whatsapp_message",
    key: "receive_whatsapp_message",
    label: "Recibir mensajes de WhatsApp",
    description: "Permite que el agente reciba y evalúe mensajes entrantes de WhatsApp.",
    instructions_placeholder:
      "Describe qué mensajes debe atender este agente, qué mensajes debe ignorar y cuándo debe pedir más contexto.",
    options: [
      {
        key: "read_attachments",
        label: "Entender adjuntos",
        description: "Procesa imágenes, archivos y otros adjuntos del mensaje, no solo el texto.",
      },
    ],
  },
  {
    type: "consult_human",
    key: "consult_human",
    label: "Consultar humano",
    description:
      "Permite que el agente consulte a humanos cuando tenga dudas, falte knowledge o se requiera criterio humano.",
    instructions_placeholder:
      "Describe cuándo debe consultar a un humano, qué información debe incluir y qué casos no debe escalar.",
  },
  {
    type: "buscar_negocios",
    key: "buscar_negocios",
    label: "Buscar negocios",
    description: "Permite que el agente busque negocios reales con proveedores externos (Google Places y otros).",
    instructions_placeholder:
      "Describe para qué y cómo buscar negocios. Ej: prospección de clientes, cómo elegir los mejores (cherry-pick), y cómo guardar o excluir los que ya contactaste.",
    action_id: "buscar_negocios",
    settings_schema: [
      { key: "max_results", label: "Máx. resultados por búsqueda", placeholder: "10" },
    ],
  },
  {
    type: "guardar_nota",
    key: "guardar_nota",
    label: "Guardar nota",
    description: "Permite que el agente guarde una nota interna asociada al contacto o a la conversación.",
    instructions_placeholder:
      "Describe qué información vale la pena guardar como nota y en qué momento de la conversación hacerlo.",
    action_id: "guardar_nota",
  },
  {
    type: "crear_tarea",
    key: "crear_tarea",
    label: "Crear tarea",
    description: "Permite que el agente cree una tarea interna de seguimiento.",
    instructions_placeholder:
      "Describe cuándo crear una tarea de seguimiento y qué debe incluir (responsable, fecha límite, contexto).",
    action_id: "crear_tarea",
  },
  {
    type: "generar_resumen",
    key: "generar_resumen",
    label: "Generar resumen",
    description: "Permite que el agente genere un resumen operativo o comercial de la conversación.",
    instructions_placeholder:
      "Describe cuándo generar un resumen y qué debe contener (puntos clave, próximos pasos, datos del prospecto).",
    action_id: "generar_resumen",
  },
  {
    type: "responder_voz",
    key: "responder_voz",
    label: "Responder con voz",
    description: "Responde por WhatsApp con un mensaje de voz generado con ElevenLabs.",
    instructions_placeholder:
      "Describe cuándo responder con voz en lugar de texto (p. ej. saludos, explicaciones largas o seguimiento), y el tono que debe usar.",
    action_id: "responder_con_voz",
    settings_schema: [
      { key: "model_id", label: "Modelo (ElevenLabs)", placeholder: "eleven_multilingual_v2" },
      { key: "voice_id", label: "Voice ID", placeholder: "21m00Tcm4TlvDq8ikWAM" },
    ],
  },
  {
    type: "registrar_inicio_dia",
    key: "registrar_inicio_dia",
    label: "Registrar inicio del día",
    description: "Abre el día operativo con el efectivo inicial en caja.",
    instructions_placeholder:
      "Describe cómo el negocio reporta la apertura (p. ej. \"abrimos con $X en caja\") y qué confirmar.",
    action_id: "registrar_inicio_dia",
  },
  {
    type: "registrar_venta",
    key: "registrar_venta",
    label: "Registrar ventas",
    description: "Registra las ventas del día (acumulado, efectivo, tarjeta, transferencia, apps).",
    instructions_placeholder:
      "Describe cómo el negocio reporta ventas y cómo desglosarlas (efectivo, tarjeta, transferencia, apps de delivery).",
    action_id: "registrar_venta",
  },
  {
    type: "registrar_compra",
    key: "registrar_compra",
    label: "Registrar compras",
    description: "Registra compras de insumos/inventario (artículo, cantidad, costo, proveedor).",
    instructions_placeholder:
      "Describe cómo el negocio reporta compras y qué capturar (artículo, cantidad, costo, proveedor).",
    action_id: "registrar_compra",
  },
  {
    type: "registrar_inventario",
    key: "registrar_inventario",
    label: "Registrar inventario",
    description: "Registra un conteo de inventario (artículos, cantidades, unidades).",
    instructions_placeholder:
      "Describe cuándo tomar inventario y qué artículos seguir.",
    action_id: "registrar_inventario",
  },
  {
    type: "registrar_cierre_dia",
    key: "registrar_cierre_dia",
    label: "Cerrar el día",
    description: "Cierra el día con totales, efectivo en caja y notas de merma/faltante/sobrante.",
    instructions_placeholder:
      "Describe cómo el negocio reporta el cierre y qué validar antes de cerrar (totales, caja, mermas).",
    action_id: "registrar_cierre_dia",
  },
  {
    type: "registrar_nota_dia",
    key: "registrar_nota_dia",
    label: "Registrar notas del día",
    description: "Agrega notas operativas del día (merma, faltante, sobrante o comentario libre).",
    instructions_placeholder:
      "Describe qué notas operativas capturar durante el día.",
    action_id: "registrar_nota_dia",
  },
  {
    type: "generar_reporte_dia",
    key: "generar_reporte_dia",
    label: "Generar reporte del día",
    description: "Genera el reporte operativo del día (totales, métricas y alertas).",
    instructions_placeholder:
      "Describe cuándo generar el reporte del día y qué resaltar.",
    action_id: "generar_reporte_dia",
  },
];

export const supported_bot_channels = [
  {
    channel: "whatsapp",
    label: "WhatsApp",
    status: "supported",
  },
  {
    channel: "instagram",
    label: "Instagram",
    status: "supported",
  },
];

export const supported_ai_model_options = [
  {
    id: "openai:gpt-5.5",
    provider: "openai",
    provider_label: "OpenAI",
    model: "gpt-5.5",
    label: "OpenAI -> GPT 5.5",
  },
  {
    id: "openai:gpt-5.2",
    provider: "openai",
    provider_label: "OpenAI",
    model: "gpt-5.2",
    label: "OpenAI -> GPT 5.2 económico",
  },
];

export const supported_human_groups = [
  {
    id: "founder",
    label: "Founder",
    description: "Decisiones de alcance, pricing, excepciones y criterio de producto.",
  },
  {
    id: "ventas",
    label: "Ventas",
    description: "Seguimiento comercial, demos, propuesta y cierre.",
  },
  {
    id: "soporte",
    label: "Soporte",
    description: "Dudas operativas, configuración y problemas de uso.",
  },
  {
    id: "operaciones",
    label: "Operaciones",
    description: "Procesos internos, handoffs y coordinación del servicio.",
  },
];

function available_interaction_by_type(type) {
  return available_agent_interactions.find((interaction) => interaction.type === type) ?? null;
}

function supported_human_group_by_id(id) {
  return supported_human_groups.find((group) => group.id === id) ?? null;
}

function supported_ai_model_by_id(id) {
  return supported_ai_model_options.find((item) => item.id === id) ?? null;
}

function supported_ai_model_by_provider_model(provider, model) {
  return supported_ai_model_options.find((item) => item.provider === provider && item.model === model) ?? null;
}

function resolve_ai_model_selection(body, current_ai) {
  const requested_selection = String(body.ai_model_selection ?? "").trim();
  const selected_option = requested_selection ? supported_ai_model_by_id(requested_selection) : null;

  if (selected_option) {
    return selected_option;
  }

  const requested_provider = String(body.ai_provider ?? current_ai.provider ?? supported_ai_model_options[0].provider).trim();
  const requested_model = String(body.ai_model ?? current_ai.model ?? supported_ai_model_options[0].model).trim();

  return supported_ai_model_by_provider_model(requested_provider, requested_model) ?? supported_ai_model_options[0];
}

function normalize_whatsapp_number(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  const digits = raw.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : raw;
}

function normalize_whatsapp_phone_number_id(value, fallback_display_number) {
  const raw = String(value ?? "").trim();
  if (raw) {
    return raw.replace(/[^\dA-Za-z_-]/g, "");
  }

  return String(fallback_display_number ?? "").replace(/[^\d]/g, "");
}

function parse_human_group_ids(value) {
  const by_id = new Map();

  for (const id of compact_strings(
    as_array(value)
      .flatMap((item) => String(item ?? "").split(","))
      .map((item) => item.trim()),
  )) {
    const group = supported_human_group_by_id(id);
    if (group && !by_id.has(group.id)) {
      by_id.set(group.id, group.id);
    }
  }

  return [...by_id.values()];
}

function parse_interactions(current_interactions, body) {
  // When the editor renders the interactions section it always posts
  // `interactions_present`. Its presence means "this form fully describes the
  // interactions" — so an absent interaction_type means the user removed them
  // all and we persist an empty list (instead of keeping the previous set).
  if (body.interactions_present === undefined && body.interaction_type === undefined && !body.new_interaction_type) {
    return Array.isArray(current_interactions) ? current_interactions : [];
  }

  const enabled_indexes = checked_indexes(body.interaction_enabled);
  // Per-interaction sub-options (e.g. "read_attachments") are posted as
  // `interaction_option_<key>` checkboxes whose value is the card index, mirroring
  // how `interaction_enabled` works. Cache the checked-index set per option key.
  const option_index_cache = {};
  const option_checked = (key, index) => {
    if (!(key in option_index_cache)) option_index_cache[key] = checked_indexes(body[`interaction_option_${key}`]);
    return option_index_cache[key].has(String(index));
  };
  const build_options = (type, resolver) => {
    const available = available_interaction_by_type(type);
    const options = {};
    for (const option of available?.options ?? []) options[option.key] = resolver(option.key);
    return options;
  };

  const rows = row_objects(["type", "instructions", "human_group_ids"], body, "interaction")
    .map((row, index) => {
      const type = String(row.type ?? "").trim();
      return {
        type,
        instructions: String(row.instructions ?? "").trim(),
        human_group_ids: parse_human_group_ids(row.human_group_ids),
        enabled: enabled_indexes.has(String(index)),
        options: build_options(type, (key) => option_checked(key, index)),
      };
    })
    .filter((row) => available_interaction_by_type(row.type));

  const new_type = String(body.new_interaction_type ?? "").trim();
  if (new_type && available_interaction_by_type(new_type)) {
    rows.push({
      type: new_type,
      instructions: String(body.new_interaction_instructions ?? "").trim(),
      human_group_ids: parse_human_group_ids(body.new_interaction_human_group_ids),
      enabled: true,
      options: build_options(new_type, () => false),
    });
  }

  const by_type = new Map();
  for (const row of rows) {
    if (!by_type.has(row.type)) {
      const available = available_interaction_by_type(row.type);
      by_type.set(row.type, {
        key: available.key,
        type: available.type,
        label: available.label,
        enabled: row.enabled,
        instructions: row.instructions,
        ...(available.action_id ? { action_id: available.action_id } : {}),
        ...(row.options && Object.keys(row.options).length ? { options: row.options } : {}),
        ...(row.type === "consult_human" ? { human_group_ids: row.human_group_ids } : {}),
      });
    }
  }

  return [...by_type.values()];
}

// Executable capabilities are now modeled as interactions (each with its own
// prompt). The engine still gates execution on `acciones_habilitadas_json`, so
// we derive it from the enabled interactions that carry an `action_id`.
function enabled_action_ids_from_interactions(interactions) {
  const ids = (Array.isArray(interactions) ? interactions : [])
    .filter((interaction) => interaction && interaction.enabled !== false && interaction.action_id)
    .map((interaction) => interaction.action_id);
  return [...new Set(ids)];
}

function builder_definition_from_body(current_definition, body) {
  const identity = current_definition.identity ?? {};
  const behavior = current_definition.behavior ?? {};
  const ai = current_definition.ai ?? {};
  const operating_instructions = String(
    body.instrucciones_operativas ?? behavior.operating_instructions ?? current_definition.prompt_base ?? "",
  ).trim();
  const constraints_text = String(
    body.constraints_text ?? (Array.isArray(behavior.constraints) ? behavior.constraints.join("\n") : behavior.constraints ?? ""),
  ).trim();

  const selected_ai_model = resolve_ai_model_selection(body, ai);

  return {
    identity: {
      name: String(body.name ?? identity.name ?? current_definition.name ?? "").trim(),
      description: String(body.description ?? identity.description ?? current_definition.description ?? "").trim(),
      goal: String(body.goal ?? identity.goal ?? current_definition.goal ?? "").trim(),
      status: body.status ?? identity.status ?? current_definition.status ?? "active",
      type: body.bot_type ?? identity.type ?? current_definition.type ?? "custom",
    },
    behavior: {
      language: String(body.behavior_language ?? behavior.language ?? "es-MX").trim() || "es-MX",
      tone: String(body.behavior_tone ?? behavior.tone ?? "professional").trim(),
      operating_instructions,
      constraints: constraints_text,
    },
    ai: {
      provider: selected_ai_model.provider,
      model: selected_ai_model.model,
    },
    knowledge_source_ids: compact_strings(body.knowledge_source_ids),
    // Bots de sistema no asignan fuentes de cuenta; declaran el knowledge que un
    // negocio debería proveer al instalarlos. Nota libre, persistida siempre.
    expected_knowledge: String(body.expected_knowledge ?? current_definition.expected_knowledge ?? "").trim(),
    interactions: parse_interactions(current_definition.interactions, body),
  };
}

async function get_bot_whatsapp_channels(pool, bot_id) {
  const result = await pool.query(
    `
      SELECT
        whatsapp_phone_numbers.*,
        phone_number_bot_assignments.id AS assignment_id,
        phone_number_bot_assignments.assignment_type,
        phone_number_bot_assignments.assigned_at
      FROM phone_number_bot_assignments
      JOIN whatsapp_phone_numbers
        ON whatsapp_phone_numbers.id = phone_number_bot_assignments.whatsapp_phone_number_id
      WHERE phone_number_bot_assignments.bot_id = $1
        AND phone_number_bot_assignments.status = 'active'
        AND phone_number_bot_assignments.active_key = 'active'
        AND whatsapp_phone_numbers.status = 'active'
      ORDER BY phone_number_bot_assignments.assigned_at DESC
    `,
    [bot_id],
  );

  return result.rows;
}

async function get_bot_instagram_channels(pool, bot_id) {
  const result = await pool.query(
    `
      SELECT
        instagram_accounts.*,
        instagram_account_bot_assignments.id AS assignment_id,
        instagram_account_bot_assignments.assignment_type,
        instagram_account_bot_assignments.assigned_at
      FROM instagram_account_bot_assignments
      JOIN instagram_accounts
        ON instagram_accounts.id = instagram_account_bot_assignments.instagram_account_id
      WHERE instagram_account_bot_assignments.bot_id = $1
        AND instagram_account_bot_assignments.status = 'active'
        AND instagram_account_bot_assignments.active_key = 'active'
        AND instagram_accounts.status = 'active'
      ORDER BY instagram_account_bot_assignments.assigned_at DESC
    `,
    [bot_id],
  );

  return result.rows;
}

async function sync_whatsapp_channel_from_body(pool, bot, body) {
  const display_phone_number = normalize_whatsapp_number(body.whatsapp_display_phone_number);
  const phone_number_id = normalize_whatsapp_phone_number_id(body.whatsapp_phone_number_id, display_phone_number);

  if (!display_phone_number && !phone_number_id) {
    return null;
  }

  const whatsapp_phone_number = await upsert_whatsapp_phone_number(pool, {
    organization_id: bot.organization_id,
    account_id: bot.account_id,
    phone_number_id,
    display_phone_number: display_phone_number || phone_number_id,
    status: "active",
  });

  await assign_bot_to_whatsapp_phone_number(pool, {
    organization_id: bot.organization_id,
    account_id: bot.account_id,
    whatsapp_phone_number_id: whatsapp_phone_number.id,
    bot_id: bot.id,
    assignment_type: "primary",
    metadata_json: {
      configured_from: "inspector_bot_builder",
    },
  });

  return whatsapp_phone_number;
}

async function sync_instagram_channel_from_body(pool, bot, body) {
  const username = String(body.instagram_username ?? "").trim().replace(/^@/, "");
  const external_account_id = String(body.instagram_account_id ?? "").trim() || username;

  if (!username && !external_account_id) {
    return null;
  }

  const instagram_account = await upsert_instagram_account(pool, {
    organization_id: bot.organization_id,
    account_id: bot.account_id,
    external_account_id,
    username: username || null,
    status: "active",
  });

  await assign_bot_to_instagram_account(pool, {
    organization_id: bot.organization_id,
    account_id: bot.account_id,
    instagram_account_id: instagram_account.id,
    bot_id: bot.id,
    assignment_type: "primary",
    metadata_json: {
      configured_from: "inspector_bot_builder",
    },
  });

  return instagram_account;
}

export async function get_inspector_home(pool, options = {}) {
  const account_id = options.account_id ?? null;

  // Account-scoped: only that account's bots, plus the account/business for the header.
  if (account_id) {
    const [account_row, bots] = await Promise.all([
      pool.query(
        `
          SELECT accounts.id, accounts.name, accounts.organization_id, organizations.name AS organization_name
          FROM accounts
          JOIN organizations ON organizations.id = accounts.organization_id
          WHERE accounts.id = $1
          LIMIT 1
        `,
        [account_id],
      ),
      pool.query(
        `
          SELECT bots.*, accounts.name AS account_name, organizations.name AS organization_name
          FROM bots
          JOIN accounts ON accounts.id = bots.account_id
          JOIN organizations ON organizations.id = accounts.organization_id
          WHERE bots.account_id = $1 AND bots.status = 'active'
          ORDER BY bots.updated_at DESC
        `,
        [account_id],
      ),
    ]);
    const account = account_row.rows[0] ?? null;
    return {
      business: account ? { id: account.organization_id, name: account.organization_name } : null,
      account,
      bots: bots.rows,
    };
  }

  const [business, bots] = await Promise.all([
    pool.query("SELECT * FROM organizations WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"),
    pool.query(`
      SELECT
        bots.*,
        accounts.name AS account_name,
        organizations.name AS organization_name
      FROM bots
      JOIN accounts ON accounts.id = bots.account_id
      JOIN organizations ON organizations.id = accounts.organization_id
      WHERE organizations.status = 'active'
        AND accounts.status = 'active'
        AND bots.status = 'active'
      ORDER BY bots.updated_at DESC
    `),
  ]);

  return {
    business: business.rows[0] ?? null,
    account: null,
    bots: bots.rows,
  };
}

export async function get_organization_view(pool, organization_id) {
  const organization = await pool.query("SELECT * FROM organizations WHERE id = $1", [organization_id]);
  const accounts = await pool.query("SELECT * FROM accounts WHERE organization_id = $1 AND status = 'active' ORDER BY name", [
    organization_id,
  ]);
  const bots = await pool.query("SELECT * FROM bots WHERE organization_id = $1 AND status = 'active' ORDER BY name", [
    organization_id,
  ]);

  return {
    organization: organization.rows[0],
    accounts: accounts.rows,
    bots: bots.rows,
  };
}

export async function get_account_view(pool, account_id) {
  const account = await pool.query(
    `
      SELECT accounts.*, organizations.name AS organization_name
      FROM accounts
      JOIN organizations ON organizations.id = accounts.organization_id
      WHERE accounts.id = $1
      LIMIT 1
    `,
    [account_id],
  );
  const bots = await pool.query("SELECT * FROM bots WHERE account_id = $1 AND status = 'active' ORDER BY name", [
    account_id,
  ]);

  return {
    account: account.rows[0],
    bots: bots.rows,
  };
}

export async function get_bot_view(pool, bot_id) {
  const bot = await pool.query(
    `
      SELECT
        bots.*,
        bot_profiles.name AS bot_profile_name,
        accounts.name AS account_name,
        organizations.name AS organization_name
      FROM bots
      LEFT JOIN bot_profiles ON bot_profiles.id = bots.bot_profile_id
      JOIN accounts ON accounts.id = bots.account_id
      JOIN organizations ON organizations.id = bots.organization_id
      WHERE bots.id = $1
      LIMIT 1
    `,
    [bot_id],
  );
  const bot_row = bot.rows[0] ?? null;
  const knowledge_source_ids = compact_strings(bot_row?.definition_json?.knowledge_source_ids ?? bot_row?.knowledge_base_ids_json ?? []);
  let knowledge_sources = [];
  let available_knowledge_sources = [];

  if (knowledge_source_ids.length) {
    const placeholders = knowledge_source_ids.map((_, index) => `$${index + 1}`).join(", ");
    const result = await pool.query(
      `
        SELECT *
        FROM knowledge_sources
        WHERE id IN (${placeholders})
        ORDER BY name
      `,
      knowledge_source_ids,
    );
    knowledge_sources = result.rows;
  }

  if (bot_row) {
    available_knowledge_sources = await list_knowledge_sources(pool, {
      organization_id: bot_row.organization_id,
      account_id: bot_row.account_id,
      limit: 200,
    });
  }

  const conversations = await get_bot_conversations(pool, { bot_id, limit: 10 });
  const stats = await pool.query(
    `
      SELECT
        (SELECT count(*)::int FROM conversations WHERE bot_id = $1) AS conversations_count,
        (SELECT count(DISTINCT contact_id)::int FROM conversations WHERE bot_id = $1) AS senders_count,
        (SELECT count(*)::int FROM messages WHERE bot_id = $1 AND created_at >= now() - interval '24 hours') AS messages_24h,
        (SELECT count(*)::int FROM agent_runs WHERE bot_id = $1) AS agent_runs_count,
        (SELECT count(*)::int FROM memory_documents WHERE bot_id = $1) AS memory_docs_count,
        (SELECT count(*)::int FROM review_items WHERE bot_id = $1 AND status IN ('pending', 'open')) AS pending_review_count
    `,
    [bot_id],
  );
  const agent_runs = await pool.query("SELECT * FROM agent_runs WHERE bot_id = $1 ORDER BY created_at DESC LIMIT 10", [
    bot_id,
  ]);
  const memory_documents = await pool.query(
    "SELECT * FROM memory_documents WHERE bot_id = $1 ORDER BY created_at DESC LIMIT 10",
    [bot_id],
  );
  const review_items = await pool.query("SELECT * FROM review_items WHERE bot_id = $1 ORDER BY created_at DESC LIMIT 10", [
    bot_id,
  ]);

  return {
    bot: bot_row,
    stats: stats.rows[0],
    knowledge_sources,
    available_knowledge_sources,
    supported_channels: supported_bot_channels,
    whatsapp_channels: bot_row ? await get_bot_whatsapp_channels(pool, bot_id) : [],
    instagram_channels: bot_row ? await get_bot_instagram_channels(pool, bot_id) : [],
    ai_models: supported_ai_model_options,
    human_groups: supported_human_groups,
    available_interactions: available_agent_interactions,
    conversations: conversations.conversations,
    agent_runs: agent_runs.rows,
    memory_documents: memory_documents.rows,
    review_items: review_items.rows,
  };
}

// Activity / status view: per-bot log of action executions (from action_audit_logs)
// + guardrail events, so operators can see when interactions work or fail
// (incl. external API failures like ElevenLabs/Places/WhatsApp not configured).
export async function get_bot_activity_view(pool, bot_id) {
  // get_bot_with_definition adds account_name/organization_name for the breadcrumb.
  const bot = (await get_bot_with_definition(pool, bot_id)) ?? (await get_bot_by_id(pool, bot_id));
  if (!bot) {
    return null;
  }

  const audit = await pool.query(
    `
      SELECT action_id, status, output_json, error, actor_type, confirmation_required, created_at
      FROM action_audit_logs
      WHERE bot_id = $1
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [bot_id],
  );
  const guardrails = await pool.query(
    `
      SELECT tipo, action_id, descripcion, severidad, created_at
      FROM bot_guardrail_events
      WHERE bot_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `,
    [bot_id],
  );

  const activity = audit.rows.map((row) => {
    const action = get_action(row.action_id);
    const output = row.output_json ?? {};
    return {
      action_id: row.action_id,
      label: action?.nombre ?? row.action_id,
      status: row.status,
      message: row.error || output.mensaje || output.message || "",
      actor_type: row.actor_type,
      confirmation_required: row.confirmation_required,
      created_at: row.created_at,
    };
  });

  const summary = activity.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return { bot, activity, guardrails: guardrails.rows, summary };
}

export async function update_bot_builder_view(pool, bot_id, body) {
  const bot = await get_bot_by_id(pool, bot_id);

  if (!bot) {
    return null;
  }

  const definition_json = builder_definition_from_body(bot.definition_json ?? {}, body);
  await sync_whatsapp_channel_from_body(pool, bot, body);
  await sync_instagram_channel_from_body(pool, bot, body);

  return update_bot_configuration(pool, bot_id, {
    name: definition_json.identity?.name || bot.name,
    description: definition_json.identity?.description || null,
    status: body.status ?? bot.status,
    prompt_base: definition_json.behavior?.operating_instructions ?? bot.prompt_base,
    instrucciones_operativas: definition_json.behavior?.operating_instructions ?? bot.instrucciones_operativas,
    tono: definition_json.behavior?.tone ?? bot.tono,
    knowledge_base_ids_json: definition_json.knowledge_source_ids ?? bot.knowledge_base_ids_json ?? [],
    acciones_habilitadas_json: enabled_action_ids_from_interactions(definition_json.interactions),
    definition_json,
  });
}

export async function get_bot_conversations(pool, input) {
  const filters = ["c.bot_id = $1"];
  const values = [input.bot_id];

  if (input.status) {
    values.push(input.status);
    filters.push(`c.status = $${values.length}`);
  }

  if (input.search) {
    values.push(`%${input.search.toLowerCase()}%`);
    filters.push(`(lower(contacts.display_name) LIKE $${values.length} OR contacts.whatsapp_phone LIKE $${values.length})`);
  }

  values.push(input.limit ?? 50);
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.bot_id,
        c.contact_id,
        c.channel,
        c.status,
        c.last_message_at,
        c.human_handoff_status,
        c.created_at,
        c.updated_at,
        contacts.display_name,
        contacts.whatsapp_phone
      FROM conversations c
      JOIN contacts ON contacts.id = c.contact_id
      WHERE ${filters.join(" AND ")}
      ORDER BY c.last_message_at DESC
      LIMIT $${values.length}
    `,
    values,
  );

  const conversations = [];

  for (const conversation of result.rows) {
    const [message_counts, last_message, last_agent, pending_review] = await Promise.all([
      pool.query(
        "SELECT count(*)::int AS messages_count, max(created_at) AS last_activity FROM messages WHERE conversation_id = $1",
        [conversation.id],
      ),
      pool.query(
        `
          SELECT parsed_intent, text_body
          FROM messages
          WHERE conversation_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [conversation.id],
      ),
      pool.query(
        `
          SELECT agent_key
          FROM agent_runs
          WHERE conversation_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [conversation.id],
      ),
      pool.query(
        `
          SELECT count(*)::int AS pending_review_count
          FROM review_items
          JOIN messages ON messages.id = review_items.message_id
          WHERE messages.conversation_id = $1
            AND review_items.status IN ('pending', 'open')
        `,
        [conversation.id],
      ),
    ]);

    const enriched = {
      ...conversation,
      last_activity: message_counts.rows[0]?.last_activity ?? conversation.last_message_at,
      messages_count: message_counts.rows[0]?.messages_count ?? 0,
      pending_review_count: pending_review.rows[0]?.pending_review_count ?? 0,
      last_intent: last_message.rows[0]?.parsed_intent ?? null,
      last_agent: last_agent.rows[0]?.agent_key ?? null,
      last_message: last_message.rows[0]?.text_body ?? null,
    };
    enriched.summary = present_conversation_summary(enriched);
    conversations.push(enriched);
  }

  const bot = await get_bot_with_definition(pool, input.bot_id);

  return { conversations, bot, search: input.search ?? "" };
}

export async function get_conversation_view(pool, conversation_id) {
  const conversation = await pool.query(
    `
      SELECT
        conversations.*,
        contacts.display_name,
        contacts.whatsapp_phone,
        bots.name AS bot_name,
        bots.id AS bot_id,
        accounts.name AS account_name,
        accounts.id AS resolved_account_id,
        organizations.name AS organization_name,
        organizations.id AS resolved_organization_id
      FROM conversations
      JOIN contacts ON contacts.id = conversations.contact_id
      LEFT JOIN bots ON bots.id = conversations.bot_id
      LEFT JOIN accounts ON accounts.id = COALESCE(conversations.account_id, bots.account_id)
      LEFT JOIN organizations ON organizations.id = COALESCE(conversations.organization_id, bots.organization_id)
      WHERE conversations.id = $1
      LIMIT 1
    `,
    [conversation_id],
  );
  const conversation_row = conversation.rows[0] ?? null;
  const messages = await pool.query(
    "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
    [conversation_id],
  );
  const messages_with_trace = [];

  for (const message of messages.rows) {
    messages_with_trace.push({
      message,
      compact_trace_summary: await compact_trace_for_message(pool, message),
    });
  }

  // Group each inbound message with the outbound message(s) that replied to it
  // (via reply_to_message_id) so the UI can render conversation "turns" instead
  // of flat alternating cards. `messages` is kept as-is for callers/tests that
  // consume the flat list.
  const turns = [];
  const turn_by_message_id = new Map();
  for (const item of messages_with_trace) {
    if (item.message.direction === "inbound") {
      const turn = { id: item.message.id, incoming: item, responses: [] };
      turns.push(turn);
      turn_by_message_id.set(item.message.id, turn);
    } else {
      const parent = item.message.reply_to_message_id
        ? turn_by_message_id.get(item.message.reply_to_message_id)
        : null;
      if (parent) {
        parent.responses.push(item);
      } else {
        turns.push({ id: item.message.id, incoming: null, responses: [item] });
      }
    }
  }

  // Account-level operational day for the sidebar "Estado del día" (best-effort;
  // the section is hidden in the view when this is null — never invented).
  const account_id = conversation_row?.resolved_account_id ?? conversation_row?.account_id ?? null;
  let operational_day = null;
  if (account_id) {
    const day = await pool.query(
      `
        SELECT operation_date, status, opening_cash, total_sales, updated_at
        FROM op_business_days
        WHERE account_id = $1
        ORDER BY operation_date DESC, updated_at DESC
        LIMIT 1
      `,
      [account_id],
    );
    operational_day = day.rows[0] ?? null;
  }

  return {
    conversation: conversation_row,
    messages: messages_with_trace,
    turns,
    operational_day,
  };
}

export async function get_message_trace_view(pool, message_id) {
  return build_message_trace(pool, { message_id });
}
