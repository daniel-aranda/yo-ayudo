import { search_business_prospects } from "../prospecting/business_search_service.js";
import { synthesize_voice_reply } from "../voice/elevenlabs_voice_service.js";
import { meta_whatsapp_client } from "../channels/whatsapp/whatsapp_client.js";
import { operational_action_handlers } from "./operational_action_handlers.js";
import { safe_record_integration_event } from "../integrations/integration_event_repository.js";
import { upsert_crm_client } from "../crm/crm_repository.js";

function event_identity(context) {
  return {
    organization_id: context.organization_id ?? null,
    account_id: context.account_id ?? null,
    bot_id: context.bot_id ?? null,
  };
}

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

// Real CRM capability: save a prospect or client. Identity resolution + the
// derived business key (CURP > phone > instagram > email) live in crm_repository.
// When captured mid-conversation and no phone is given, inherit the WhatsApp/IG
// sender's number and link the contact, so the lead is keyed on a real identifier
// even if the message only carried the name.
async function crear_contacto(pool, context) {
  const input = context.input_json ?? {};
  let contact_id = context.contact_id ?? null;
  let conversation_contact = null;

  if (!contact_id && context.conversation_id) {
    const result = await pool.query(
      `
        SELECT c.id, c.whatsapp_phone
        FROM conversations cv
        JOIN contacts c ON c.id = cv.contact_id
        WHERE cv.id = $1
        LIMIT 1
      `,
      [context.conversation_id],
    );
    conversation_contact = result.rows[0] ?? null;
    contact_id = conversation_contact?.id ?? null;
  }

  const client = await upsert_crm_client(pool, {
    ...input,
    organization_id: context.organization_id ?? null,
    account_id: context.account_id ?? null,
    bot_id: context.bot_id ?? null,
    conversation_id: context.conversation_id ?? null,
    contact_id,
    phone: input.phone ?? input.telefono ?? input.numero ?? conversation_contact?.whatsapp_phone ?? null,
    source: input.source ?? input.fuente ?? (context.conversation_id ? "whatsapp" : null),
  });

  const label = client.kind === "cliente" ? "Cliente" : "Prospecto";
  const verb = client.created ? "registrado" : "actualizado";
  const who = client.display_name ?? client.client_key ?? "sin nombre";

  return {
    status: "executed",
    confirmation_required: false,
    output: {
      mensaje: `${label} ${verb}: ${who}.`,
      cliente_id: client.id,
      client_key: client.client_key,
      client_key_type: client.client_key_type,
      kind: client.kind,
      pipeline_status: client.pipeline_status,
      creado: client.created,
    },
  };
}

async function buscar_negocios(pool, context) {
  const started_at = Date.now();
  const result = await search_business_prospects(context.input_json ?? {});
  const latency_ms = Date.now() - started_at;
  const identity = event_identity(context);

  if (result.status === "pending_provider") {
    await safe_record_integration_event(pool, {
      integration_key: "google_places",
      operation: "search",
      status: "not_configured",
      detail: result.message,
      latency_ms,
      ...identity,
    });
  } else {
    for (const provider of result.providers_used ?? []) {
      await safe_record_integration_event(pool, { integration_key: provider, operation: "search", status: "success", latency_ms, ...identity });
    }
    for (const provider_error of result.provider_errors ?? []) {
      await safe_record_integration_event(pool, {
        integration_key: provider_error.provider,
        operation: "search",
        status: "failure",
        detail: provider_error.message,
        latency_ms,
        ...identity,
      });
    }
  }

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
  // Provider config resolution: per-message input (in synthesize_voice_reply) >
  // admin interaction config (model/voice) > env defaults.
  const config = context.interaction_config ?? {};
  const voice_started_at = Date.now();
  const voice = await synthesize_voice_reply(context.input_json ?? {}, {
    voice_id: config.voice_id,
    model_id: config.model_id,
    ...(context.voice_options ?? {}),
  });
  const voice_latency_ms = Date.now() - voice_started_at;

  await safe_record_integration_event(pool, {
    integration_key: "elevenlabs",
    operation: "tts",
    status: voice.status === "executed" ? "success" : voice.status === "pending_provider" ? "not_configured" : "failure",
    detail: voice.message,
    latency_ms: voice_latency_ms,
    ...event_identity(context),
  });

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
  const send_started_at = Date.now();
  const delivery = await client.send_voice_note({ to, buffer: voice.audio, mime_type: voice.content_type });
  const send_latency_ms = Date.now() - send_started_at;
  const sent = delivery.sent === true;
  const pending_credentials = !sent && delivery.reason === "missing_whatsapp_credentials";

  await safe_record_integration_event(pool, {
    integration_key: "whatsapp",
    operation: "send_voice",
    status: sent ? "success" : pending_credentials ? "not_configured" : "failure",
    detail: delivery.reason ?? null,
    latency_ms: send_latency_ms,
    ...event_identity(context),
  });

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
  crear_contacto,
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
