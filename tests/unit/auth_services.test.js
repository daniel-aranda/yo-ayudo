import { describe, expect, it } from "vitest";
import { hash_password, verify_password } from "../../src/auth/password_service.js";
import { create_session_token, verify_session_token } from "../../src/auth/session_service.js";

describe("password_service", () => {
  it("hashes with scrypt and verifies the round trip, rejecting wrong/short/malformed input", () => {
    const stored = hash_password("supersegura");

    expect(stored.startsWith("scrypt:")).toBe(true);
    expect(verify_password("supersegura", stored)).toBe(true);
    expect(verify_password("otra-cosa", stored)).toBe(false);
    expect(verify_password("supersegura", "basura-sin-formato")).toBe(false);
    expect(verify_password("supersegura", null)).toBe(false);
    expect(() => hash_password("corta")).toThrowError(/8 caracteres/);
  });
});

describe("session_service", () => {
  it("signs and verifies tokens, rejecting expiry, tampering and wrong secrets", () => {
    const token = create_session_token("user-1", { now: 1_000, ttl_ms: 5_000, secret: "secreto" });

    expect(verify_session_token(token, { now: 2_000, secret: "secreto" })).toMatchObject({ user_id: "user-1" });
    // Expirado.
    expect(verify_session_token(token, { now: 7_000, secret: "secreto" })).toBeNull();
    // Otra llave.
    expect(verify_session_token(token, { now: 2_000, secret: "otra" })).toBeNull();
    // Firma alterada.
    expect(verify_session_token(`${token}x`, { now: 2_000, secret: "secreto" })).toBeNull();
    // user_id alterado sin re-firmar.
    expect(verify_session_token(token.replace("user-1", "user-2"), { now: 2_000, secret: "secreto" })).toBeNull();
    // Basura.
    expect(verify_session_token("nada", { now: 2_000, secret: "secreto" })).toBeNull();
  });
});
