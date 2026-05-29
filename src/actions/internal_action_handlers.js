function normalize_due_at(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function first_sentence(text) {
  return String(text ?? "")
    .split(/[.!?\n]/)
    .map((part) => part.trim())
    .find(Boolean);
}

async function guardar_nota(pool, context) {
  const input = context.input_json ?? {};
  const result = await pool.query(
    `
      INSERT INTO internal_notes (
        organization_id,
        account_id,
        bot_id,
        conversation_id,
        message_id,
        note,
        entity_id,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *
    `,
    [
      context.organization_id ?? null,
      context.account_id ?? null,
      context.bot_id ?? null,
      context.conversation_id ?? null,
      context.message_id ?? null,
      input.nota,
      input.entidad_id ?? null,
      JSON.stringify({
        source: "bot_engine_action",
        actor_type: context.actor_type ?? "bot",
      }),
    ],
  );

  return {
    status: "executed",
    confirmation_required: false,
    output: {
      nota_id: result.rows[0].id,
      note: result.rows[0].note,
    },
  };
}

async function crear_tarea(pool, context) {
  const input = context.input_json ?? {};
  const due_at = normalize_due_at(input.due_at ?? input.fecha_limite);
  const result = await pool.query(
    `
      INSERT INTO internal_tasks (
        organization_id,
        account_id,
        bot_id,
        conversation_id,
        message_id,
        titulo,
        descripcion,
        responsable_id,
        due_at,
        status,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'pendiente'), $11::jsonb)
      RETURNING *
    `,
    [
      context.organization_id ?? null,
      context.account_id ?? null,
      context.bot_id ?? null,
      context.conversation_id ?? null,
      context.message_id ?? null,
      input.titulo,
      input.descripcion ?? null,
      input.responsable_id ?? input.responsable ?? null,
      due_at,
      input.status ?? "pendiente",
      JSON.stringify({
        source: "bot_engine_action",
        original_due_at: input.due_at ?? input.fecha_limite ?? null,
      }),
    ],
  );

  return {
    status: "executed",
    confirmation_required: false,
    output: {
      tarea_id: result.rows[0].id,
      titulo: result.rows[0].titulo,
      status: result.rows[0].status,
      due_at: result.rows[0].due_at,
    },
  };
}

async function generar_resumen(_pool, context) {
  const input = context.input_json ?? {};
  const source_text =
    input.texto ??
    input.mensaje ??
    input.contexto?.mensaje ??
    input.contexto?.texto ??
    JSON.stringify(input.contexto ?? {});
  const summary = first_sentence(source_text) ?? "Sin contenido suficiente para resumir.";
  const bullets = String(source_text ?? "")
    .split(/[.\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5);

  return {
    status: "executed",
    confirmation_required: false,
    output: {
      resumen: summary,
      bullets,
    },
  };
}

const handlers = {
  guardar_nota,
  crear_tarea,
  generar_resumen,
};

export async function execute_internal_action_handler(pool, action, context) {
  const handler = handlers[action.handler];

  if (!handler) {
    return null;
  }

  return handler(pool, context);
}
