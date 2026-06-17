// Shared, deterministic extraction of CRM identifiers from free text. Used by
// BOTH the mock provider (inbound lead_capture intent) and the bot tester
// (infer_action_requests_from_message) so the two paths stay in sync.
//
// AI interpreta lenguaje; aqui solo hacemos extraccion deterministica de los
// identificadores fuertes (CURP, telefono, instagram, email) que el backend
// valida y persiste. El nombre es best-effort.

// CURP: 4 letras + 6 digitos (fecha) + H/M + 5 letras + 1 alfanumerico + 1 digito.
const CURP_PATTERN = /\b([a-z]{4}\d{6}[hm][a-z]{5}[a-z0-9]\d)\b/i;
const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const INSTAGRAM_PATTERN = /@([a-z0-9._]{2,})/i;
const PHONE_PATTERN = /(\+?\d[\d\s().-]{7,}\d)/;
// Capture up to 4 word tokens after a CRM trigger. The capture naturally stops at
// punctuation (a comma is not a name char); clean_name then trims at the first
// connector/stopword, so "prospecto Juan Pérez, su curp es ..." -> "Juan Pérez".
const NAME_PATTERN =
  /(?:prospecto|prospecta|cliente|clienta|lead|contacto|se llama|llamad[oa])\s*:?\s+([a-záéíóúüñ]+(?:\s+[a-záéíóúüñ]+){0,3})/i;

// Words that are never part of a captured name: articles/prepositions plus the
// field-label connectors that introduce an identifier ("su curp es ...").
const NAME_STOPWORDS = new Set([
  "de", "del", "el", "la", "los", "las", "al", "un", "una", "es", "ya", "y", "o",
  "nuevo", "nueva", "este", "esta", "ese", "esa", "su", "sus", "que", "con",
  "curp", "tel", "telefono", "celular", "cel", "numero", "instagram", "ig",
  "email", "correo", "whatsapp", "wa", "quiere", "necesita", "busca", "pide",
]);

function title_case(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function clean_name(raw) {
  if (!raw) {
    return null;
  }

  const collected = [];
  for (const word of raw.trim().replace(/[.,;]+$/g, "").split(/\s+/).filter(Boolean)) {
    if (NAME_STOPWORDS.has(word.toLowerCase())) {
      if (collected.length) {
        break; // a connector after the name ends it ("Juan su curp" -> "Juan")
      }
      continue; // skip leading articles ("al prospecto Juan" -> trigger handles "al")
    }
    collected.push(word);
    if (collected.length >= 4) {
      break;
    }
  }

  return collected.length ? title_case(collected.join(" ")) : null;
}

export function parse_lead_fields(raw) {
  const text = String(raw ?? "");

  const curp = text.match(CURP_PATTERN)?.[1]?.toUpperCase() ?? null;
  // Strip the CURP token first so its embedded 6 digits never read as a phone.
  const without_curp = curp ? text.replace(new RegExp(curp, "i"), " ") : text;
  const email = without_curp.match(EMAIL_PATTERN)?.[0]?.toLowerCase() ?? null;
  // Strip trailing dots/underscores (e.g. "@juanperez." at a sentence end) — an
  // Instagram handle can't end with one.
  const instagram = without_curp.match(INSTAGRAM_PATTERN)?.[1]?.toLowerCase().replace(/[._]+$/, "") ?? null;
  // Drop @handles and emails before phone matching so their digits don't leak in.
  const phone_source = without_curp
    .replace(INSTAGRAM_PATTERN, " ")
    .replace(EMAIL_PATTERN, " ");
  const phone_match = phone_source.match(PHONE_PATTERN);
  const phone_digits = phone_match ? phone_match[1].replace(/[^\d]/g, "") : "";
  const phone = phone_digits.length >= 10 ? phone_digits : null;

  return {
    display_name: clean_name(text.match(NAME_PATTERN)?.[1]),
    curp,
    phone,
    instagram,
    email,
  };
}
