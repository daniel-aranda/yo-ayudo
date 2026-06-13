import { randomBytes as random_bytes, scryptSync as scrypt_sync, timingSafeEqual as timing_safe_equal } from "node:crypto";

const KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;

// Formato almacenado: "scrypt:<salt hex>:<hash hex>". Sin dependencias: scrypt
// viene en node:crypto y es suficiente para esta etapa.
export function hash_password(plain) {
  const password = String(plain ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    const error = new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    error.code = "password_too_short";
    throw error;
  }

  const salt = random_bytes(16).toString("hex");
  const hash = scrypt_sync(password, salt, KEY_LENGTH).toString("hex");

  return `scrypt:${salt}:${hash}`;
}

export function verify_password(plain, stored) {
  const parts = String(stored ?? "").split(":");

  if (parts.length !== 3 || parts[0] !== "scrypt" || !parts[1] || !parts[2]) {
    return false;
  }

  const expected = Buffer.from(parts[2], "hex");
  const actual = scrypt_sync(String(plain ?? ""), parts[1], expected.length || KEY_LENGTH);

  return expected.length === actual.length && timing_safe_equal(actual, expected);
}
