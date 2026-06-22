import {
  advance_collection_session,
  complete_collection_session,
  consume_collection_session,
  create_collection_session,
  get_active_collection_session,
  get_latest_ready_collection_session,
} from "./collection_session_repository.js";

// Orquesta la entrevista de "recolectar información". Vive en el engine (no en un
// action handler) porque necesita el provider de IA + la sesión viva: IA interpreta
// (qué preguntar / si ya basta), backend persiste (memoria viva). Cada turno es
// idempotente respecto al mensaje (el engine ya deduplica por external_message_id).

const DEFAULT_MAX_TURNS = 8;

// Config por bot: lo único que persiste por bot es `instructions` (la guía en prosa)
// y `options` (checkboxes). Modo A (auto-generar al terminar) = un checkbox.
export function get_collection_config(bot) {
  const interactions = Array.isArray(bot?.definition_json?.interactions) ? bot.definition_json.interactions : [];
  const entry =
    interactions.find((i) => i?.action_id === "recolectar_informacion" || i?.type === "recolectar_informacion") ?? {};
  const guidance = String(entry.instructions ?? "").trim();
  const objective = guidance
    ? guidance.split("\n")[0].slice(0, 200)
    : "Recolectar la información necesaria para una propuesta.";
  return {
    guidance,
    objective,
    max_turns: DEFAULT_MAX_TURNS,
    // Modo A: dispara generar_documento al cerrar. Modo B (default): deja en cola.
    follow_up_action: entry.options?.generar_documento_al_terminar ? "generar_documento" : null,
  };
}

function summarize_findings(findings) {
  if (!findings || typeof findings !== "object") return "";
  const notes = Array.isArray(findings.notes) ? findings.notes : [];
  const structured = Object.entries(findings).filter(([key]) => key !== "notes");
  const lines = [];
  for (const [key, value] of structured) {
    lines.push(`• ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  for (const note of notes) {
    lines.push(`• ${note}`);
  }
  if (!lines.length) return "";
  return `Esto es lo que tengo:\n${lines.join("\n")}`;
}

// Un turno de la entrevista. Si no hay sesión activa, la crea (START) y hace la
// primera pregunta; si la hay, trata el mensaje como respuesta (ADVANCE). Al cerrar
// deja la sesión `ready` (en cola, reutilizable).
export async function start_or_advance_collection({ pool, provider, processing_context, answer_text }) {
  const conversation_id = processing_context.conversation.id;
  const config = get_collection_config(processing_context.bot);
  let session = await get_active_collection_session(pool, conversation_id);
  const started = !session;

  if (!session) {
    session = await create_collection_session(pool, {
      organization_id: processing_context.organization?.id ?? processing_context.bot?.organization_id ?? null,
      account_id: processing_context.account?.id ?? processing_context.bot?.account_id ?? null,
      bot_id: processing_context.bot?.id ?? null,
      conversation_id,
      contact_id: processing_context.contact?.id ?? null,
      objective: config.objective,
      guidance: config.guidance,
      max_turns: config.max_turns,
      follow_up_action: config.follow_up_action,
    });
  }

  const transcript = Array.isArray(session.transcript_json) ? session.transcript_json : [];
  const findings = session.findings_json && typeof session.findings_json === "object" ? session.findings_json : {};

  // En START el mensaje dispara la entrevista (contexto, no respuesta a una pregunta).
  // En ADVANCE el mensaje responde la última pregunta pendiente.
  const is_answer = !started && Boolean(session.last_question);
  const new_transcript = is_answer ? [...transcript, { q: session.last_question, a: answer_text }] : transcript;
  const answers_count = new_transcript.length;

  const turn = await provider.advance_information_collection({
    objective: session.objective,
    guidance: session.guidance,
    findings,
    transcript: new_transcript,
    answer: answer_text ?? "",
    answers_count,
    max_turns: session.max_turns ?? config.max_turns,
  });

  // Seguridad: si el modelo no cierra pero tampoco da pregunta, cerramos con gracia.
  const is_complete = turn.is_complete || !turn.next_question;
  const next_findings = turn.findings && typeof turn.findings === "object" ? turn.findings : findings;

  if (is_complete) {
    const completion_reason = turn.completion_reason ?? (turn.is_complete ? "llm_ready" : "no_next_question");
    const completed = await complete_collection_session(pool, session.id, {
      findings_json: next_findings,
      transcript_json: new_transcript,
      turn_count: answers_count,
      completion_reason,
    });
    const summary = summarize_findings(completed.findings_json);
    const closing = turn.closing_message || "Listo, ya tengo lo necesario para la propuesta.";
    return {
      session: completed,
      is_complete: true,
      completion_reason,
      follow_up_action: completed.follow_up_action ?? null,
      findings: completed.findings_json,
      reply: summary ? `${closing}\n\n${summary}` : closing,
      started,
    };
  }

  const advanced = await advance_collection_session(pool, session.id, {
    findings_json: next_findings,
    transcript_json: new_transcript,
    last_question: turn.next_question,
    turn_count: answers_count,
  });
  return { session: advanced, is_complete: false, reply: turn.next_question, started };
}

// Consumo on-demand (Modo B): toma el último resultado `ready` de la conversación,
// lo marca `completed` y lo devuelve para que la generación lo use. null si no hay.
export async function consume_ready_collection({ pool, conversation_id }) {
  const ready = await get_latest_ready_collection_session(pool, conversation_id);
  if (!ready) {
    return null;
  }
  await consume_collection_session(pool, ready.id);
  return ready;
}
