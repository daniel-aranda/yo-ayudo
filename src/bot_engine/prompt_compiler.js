import { list_actions } from "../actions/action_registry.js";

function summarize_documents(documents = []) {
  return documents.map((document) => ({
    id: document.id,
    document_family: document.document_family,
    scope: document.scope,
    document_type: document.document_type,
    title: document.title,
    score: document.score,
  }));
}

function action_metadata(action) {
  return {
    action_id: action.action_id,
    nombre: action.nombre,
    descripcion: action.descripcion,
    categoria: action.categoria,
    nivel_riesgo: action.nivel_riesgo,
    input_schema: action.input_schema,
  };
}

function list_items(items = [], mapper = (item) => item) {
  return items.map((item) => `- ${mapper(item)}`).join("\n");
}

export class prompt_compiler {
  constructor({ pool }) {
    this.pool = pool;
  }

  compile(input) {
    const bot = input.bot;
    const definition = bot.definition_json ?? {};
    const identity = definition.identity ?? {};
    const behavior = definition.behavior ?? {};
    const interactions = Array.isArray(definition.interactions) ? definition.interactions : [];
    const constraints =
      typeof behavior.constraints === "string"
        ? behavior.constraints
        : Array.isArray(behavior.constraints)
          ? behavior.constraints.join("\n")
          : Array.isArray(definition.constraints)
            ? definition.constraints.join("\n")
            : list_items(bot.reglas_guardrail_json ?? []);
    const enabled_actions = new Set(bot.acciones_habilitadas_json ?? bot.enabled_actions_json ?? []);
    const available_actions = list_actions()
      .filter((action) => action.habilitada !== false && enabled_actions.has(action.action_id))
      .map(action_metadata);
    // Executable capabilities are configured as interactions, each with its own
    // prompt. Surface that prompt as the action's guidance so the model follows
    // the operator's intent (e.g. how to prospect, cherry-pick, exclude contacted).
    const action_prompt_by_id = new Map(
      interactions
        .filter((interaction) => interaction && interaction.action_id && interaction.enabled !== false)
        .map((interaction) => [interaction.action_id, String(interaction.instructions ?? "").trim()]),
    );
    const knowledge_summary = summarize_documents(input.business_knowledge ?? []);
    const memory_summary = summarize_documents(input.conversation_memory ?? []);
    const prompt = [
      "# Bot",
      `Nombre: ${identity.name ?? bot.name}`,
      `Descripcion: ${identity.description ?? bot.description ?? ""}`,
      `Objetivo: ${identity.goal ?? definition.goal ?? ""}`,
      `Tono: ${behavior.tone ?? bot.tono ?? "claro y profesional"}`,
      `Idioma: ${behavior.language ?? "es-MX"}`,
      "",
      "# Instrucciones operativas",
      behavior.operating_instructions ?? bot.instrucciones_operativas ?? bot.prompt_base ?? "",
      "",
      "# Objetivos",
      list_items(bot.objetivos_json ?? []),
      "",
      "# Campos a capturar",
      list_items(bot.campos_requeridos_json ?? []),
      "",
      "# Reglas de guardrail",
      constraints,
      "",
      "# Reglas de escalamiento",
      list_items(bot.reglas_escalamiento_json ?? []),
      "",
      "# Interacciones permitidas",
      list_items(
        interactions.filter((interaction) => interaction.enabled !== false),
        (interaction) => `${interaction.label ?? interaction.type}: ${interaction.instructions ?? ""}`,
      ),
      "",
      "# Acciones disponibles",
      available_actions
        .map((action) => `- ${action.action_id}: ${action_prompt_by_id.get(action.action_id) || action.descripcion}`)
        .join("\n"),
      "",
      "# Knowledge relevante",
      knowledge_summary.map((document) => `- ${document.title ?? document.id} (${document.document_type})`).join("\n"),
      "",
      "# Memoria conversacional relevante",
      memory_summary.map((document) => `- ${document.title ?? document.id} (${document.document_type})`).join("\n"),
      "",
      "# Respuesta esperada",
      "Responde al usuario o solicita una acción con JSON estructurado: {\"reply\":\"...\",\"action_request\":{\"action_id\":\"...\",\"input\":{}}}. No inventes ejecuciones.",
    ].join("\n");

    return {
      prompt,
      metadata: {
        bot_id: bot.id,
        prompt_version: bot.definition_version ?? 1,
        action_count: available_actions.length,
        knowledge_count: knowledge_summary.length,
        memory_count: memory_summary.length,
      },
      acciones_disponibles: available_actions,
      knowledge_usado: knowledge_summary,
      conversation_memory_usada: memory_summary,
    };
  }

  async record_compilation(input) {
    const compiled = this.compile(input);
    const result = await this.pool.query(
      `
        INSERT INTO bot_prompt_compilations (
          organization_id,
          account_id,
          bot_id,
          conversation_id,
          prompt_version,
          acciones_disponibles,
          knowledge_usado,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb)
        RETURNING *
      `,
      [
        input.bot.organization_id ?? null,
        input.bot.account_id ?? null,
        input.bot.id,
        input.conversation?.id ?? input.conversation_id ?? null,
        compiled.metadata.prompt_version,
        JSON.stringify(compiled.acciones_disponibles),
        JSON.stringify(compiled.knowledge_usado),
        JSON.stringify({
          ...compiled.metadata,
          prompt_preview: compiled.prompt.slice(0, 1000),
        }),
      ],
    );

    return {
      ...compiled,
      compilation: result.rows[0],
    };
  }
}
