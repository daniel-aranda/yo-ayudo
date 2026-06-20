import express from "express";
import request from "supertest";
import { describe, it, expect } from "vitest";
import { register_instagram_routes, register_messenger_routes } from "../../src/channels/meta_webhook_routes.js";
import { config } from "../../src/app/config.js";

function build_app() {
  const app = express();
  const router = express.Router();
  app.use(express.json());
  register_instagram_routes(router);
  register_messenger_routes(router);
  app.use(router);
  return app;
}

describe("Meta webhook routes (verificación de suscripción)", () => {
  const app = build_app();

  for (const path of ["/webhooks/instagram", "/webhooks/messenger"]) {
    it(`GET ${path} devuelve el challenge con el verify token correcto`, async () => {
      const response = await request(app).get(path).query({
        "hub.mode": "subscribe",
        "hub.verify_token": config.meta_verify_token,
        "hub.challenge": "challenge-123",
      });
      expect(response.status).toBe(200);
      expect(response.text).toBe("challenge-123");
    });

    it(`GET ${path} rechaza (403) con verify token incorrecto`, async () => {
      const response = await request(app).get(path).query({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge-123",
      });
      expect(response.status).toBe(403);
    });
  }
});
