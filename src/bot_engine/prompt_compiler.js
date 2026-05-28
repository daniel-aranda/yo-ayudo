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

export class prompt_compiler {
  constructor({ pool }) {
    this.pool = pool;
  }

  compile(input) {
    const bot = input.bot;
    const enabled_actions = new Set(bot.acciones_habilitadas_json ?? bot.enabled_actions_json ?? []);
    const available_actions = list_actions()
      .filter((action) => action.habilitada !== false && enabled_actions.has(action.action_id))
      .map(action_metadata);
    const knowledge_summary = summarize_documents(input.business_knowledge ?? []);
    const memory_summary = summarize_documents(input.conversation_memory ?? []);
    const prompt = [
      "# Bot",
      `Nombre: ${bot.name}`,
      `Descripcion: ${bot.description ?? ""}`,
      `Tono: ${bot.tono ?? "claro y profesional"}`,
      "",
      "# Prompt base",
      bot.prompt_base ?? bot.definition_json?.goal ?? "Atiende al usuario con claridad y seguridad.",
      "",
      "# Instrucciones operativas",
      bot.instrucciones_operativas ?? "",
      "",
      "# Objetivos",
      (bot.objetivos_json ?? []).map((objetivo) => `- ${objetivo}`).join("\n"),
      "",
      "# Campos a capturar",
      (bot.campos_requeridos_json ?? []).map((campo) => `- ${campo}`).join("\n"),
      "",
      "# Reglas de guardrail",
      (bot.reglas_guardrail_json ?? []).map((regla) => `- ${regla}`).join("\n"),
      "",
      "# Reglas de escalamiento",
      (bot.reglas_escalamiento_json ?? []).map((regla) => `- ${regla}`).join("\n"),
      "",
      "# Acciones disponibles",
      available_actions.map((action) => `- ${action.action_id}: ${action.descripcion}`).join("\n"),
      "",
      "# Knowledge relevante",
      knowledge_summary.map((document) => `- ${document.title ?? document.id} (${document.document_type})`).join("\n"),
      "",
      "# Memoria conversacional relevante",
      memory_summary.map((document) => `- ${document.title ?? document.id} (${document.document_type})`).join("\n"),
      "",
      "# Formato esperado",
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
