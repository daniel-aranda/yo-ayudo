import { createHmac as create_hmac, timingSafeEqual as timing_safe_equal } from "node:crypto";
import { config } from "../app/config.js";

export const SESSION_COOKIE_NAME = "yoayudo_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Token de sesión sin estado: "<user_id>.<expira_ms>.<firma hmac>". No hay
// tabla de sesiones; revocar = cambiar SESSION_SECRET o desactivar el usuario
// (el middleware re-lee el usuario en cada request).
function session_secret() {
  if (config.session_secret) {
    return config.session_secret;
  }

  if (config.node_env === "production") {
    throw new Error("SESSION_SECRET es obligatorio en production cuando AUTH_ENABLED=true.");
  }

  return "yoayudo-dev-session-secret";
}

function sign(payload, secret) {
  return create_hmac("sha256", secret).update(payload).digest("base64url");
}

export function create_session_token(user_id, { now = Date.now(), ttl_ms = SESSION_TTL_MS, secret = session_secret() } = {}) {
  const payload = `${user_id}.${now + ttl_ms}`;

  return `${payload}.${sign(payload, secret)}`;
}

export function verify_session_token(token, { now = Date.now(), secret = session_secret() } = {}) {
  const parts = String(token ?? "").split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [user_id, expires_raw, signature] = parts;
  const expected = sign(`${user_id}.${expires_raw}`, secret);
  const signature_buffer = Buffer.from(signature);
  const expected_buffer = Buffer.from(expected);

  if (signature_buffer.length !== expected_buffer.length || !timing_safe_equal(signature_buffer, expected_buffer)) {
    return null;
  }

  const expires = Number.parseInt(expires_raw, 10);

  if (!Number.isFinite(expires) || expires < now) {
    return null;
  }

  return { user_id, expires };
}

export function read_session_cookie(request) {
  const header = request.headers?.cookie || "";

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");

    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}
