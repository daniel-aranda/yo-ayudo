import { search_business_prospects } from "../prospecting/business_search_service.js";
import { synthesize_voice_reply } from "../voice/elevenlabs_voice_service.js";
import { meta_whatsapp_client } from "../channels/whatsapp/whatsapp_client.js";
import { operational_action_handlers } from "./operational_action_handlers.js";

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

async function buscar_negocios(_pool, context) {
  const result = await search_business_prospects(context.input_json ?? {});

  return {
    status: result.status,
    confirmation_required: false,
    output: {
      mensaje: result.message,
      proveedores_usados: result.providers_used,
      errores_proveedor: result.provider_errors,
      negocios: result.businesses,
    },
  };
}

async function resolve_recipient_phone(pool, context) {
  const explicit = String(
    context.input_json?.to ?? context.input_json?.telefono ?? context.input_json?.numero ?? "",
  ).trim();
  if (explicit) {
    return explicit;
  }

  if (!pool || !context.conversation_id) {
    return "";
  }

  try {
    const result = await pool.query(
      `
        SELECT c.whatsapp_phone
        FROM conversations cv
        JOIN contacts c ON c.id = cv.contact_id
        WHERE cv.id = $1
        LIMIT 1
      `,
      [context.conversation_id],
    );
    return String(result.rows[0]?.whatsapp_phone ?? "").trim();
  } catch {
    return "";
  }
}

async function responder_con_voz(pool, context) {
  const voice = await synthesize_voice_reply(context.input_json ?? {}, context.voice_options ?? {});

  // No audio generated (no key, no text, or provider error): surface as-is.
  if (voice.status !== "executed" || !voice.audio) {
    return {
      status: voice.status,
      confirmation_required: false,
      output: {
        mensaje: voice.message,
        proveedor: voice.provider,
        voice_id: voice.voice_id ?? null,
      },
    };
  }

  const to = await resolve_recipient_phone(pool, context);
  if (!to) {
    return {
      status: "failed",
      confirmation_required: false,
      output: {
        mensaje: "Audio generado, pero falta el número de destino (envía `to` o usa una conversación con contacto).",
        proveedor: voice.provider,
        voice_id: voice.voice_id ?? null,
        audio_bytes: voice.audio_bytes ?? null,
      },
    };
  }

  const client = context.whatsapp_client ?? new meta_whatsapp_client();
  const delivery = await client.send_voice_note({ to, buffer: voice.audio, mime_type: voice.content_type });
  const sent = delivery.sent === true;
  const pending_credentials = !sent && delivery.reason === "missing_whatsapp_credentials";

  return {
    status: sent ? "executed" : pending_credentials ? "pending_provider" : "failed",
    confirmation_required: false,
    output: {
      mensaje: sent
        ? "Mensaje de voz enviado por WhatsApp."
        : pending_credentials
          ? "Audio generado; configura WHATSAPP_ACCESS_TOKEN para enviarlo por WhatsApp."
          : `Audio generado, pero el envío por WhatsApp falló (${delivery.reason ?? "desconocido"}).`,
      proveedor: voice.provider,
      voice_id: voice.voice_id ?? null,
      to,
      caracteres: voice.characters ?? null,
      audio_bytes: voice.audio_bytes ?? null,
      enviado: sent,
      external_message_id: delivery.external_message_id ?? null,
      media_id: delivery.media_id ?? null,
    },
  };
}

const handlers = {
  guardar_nota,
  crear_tarea,
  generar_resumen,
  buscar_negocios,
  responder_con_voz,
  ...operational_action_handlers,
};

export async function execute_internal_action_handler(pool, action, context) {
  const handler = handlers[action.handler];

  if (!handler) {
    return null;
  }

  return handler(pool, context);
}
