import { describe, expect, it } from "vitest";
import { run_integration_checks, integration_definitions } from "../../src/integrations/integration_registry.js";

function http_response(status) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return {};
    },
    async text() {
      return "";
    },
  };
}

function find(results, key) {
  return results.find((result) => result.key === key);
}

describe("integration health checks", () => {
  it("postgresql is ok when SELECT 1 succeeds", async () => {
    const pool = { query: async () => ({ rows: [{ ok: 1 }] }) };
    const results = await run_integration_checks({ pool, config: { database_url: "x" } });
    expect(find(results, "postgresql").status).toBe("ok");
  });

  it("postgresql is error when the query throws", async () => {
    const pool = {
      query: async () => {
        throw new Error("connection refused");
      },
    };
    const results = await run_integration_checks({ pool, config: { database_url: "x" } });
    const pg = find(results, "postgresql");
    expect(pg.status).toBe("error");
    expect(pg.detail).toContain("connection refused");
  });

  it("marks integrations not_configured when credentials are missing", async () => {
    const results = await run_integration_checks({ config: {} });
    expect(find(results, "whatsapp").status).toBe("not_configured");
    expect(find(results, "elevenlabs").status).toBe("not_configured");
    expect(find(results, "openai").status).toBe("not_configured");
    expect(find(results, "s3").status).toBe("not_configured");
    expect(find(results, "google_places").status).toBe("not_configured");
  });

  it("whatsapp is ok on 200 and error on non-200 (connect + operate)", async () => {
    const config = { whatsapp_access_token: "t", whatsapp_phone_number_id: "p" };
    const okay = await run_integration_checks({ config, fetcher: async () => http_response(200) });
    expect(find(okay, "whatsapp").status).toBe("ok");

    const bad = await run_integration_checks({ config, fetcher: async () => http_response(401) });
    expect(find(bad, "whatsapp").status).toBe("error");
    expect(find(bad, "whatsapp").detail).toContain("401");
  });

  it("elevenlabs is ok on 200 with an injected fetcher", async () => {
    const results = await run_integration_checks({
      config: { elevenlabs_api_key: "el" },
      fetcher: async () => http_response(200),
    });
    expect(find(results, "elevenlabs").status).toBe("ok");
  });

  it("s3 uses the injected probe when a bucket is configured", async () => {
    const config = { knowledge_s3_bucket: "my-bucket", aws_region: "us-east-1" };
    const okay = await run_integration_checks({ config, s3_probe: async () => {} });
    expect(find(okay, "s3").status).toBe("ok");

    const bad = await run_integration_checks({
      config,
      s3_probe: async () => {
        throw new Error("no credentials");
      },
    });
    expect(find(bad, "s3").status).toBe("error");
  });

  it("runs every defined integration", async () => {
    const results = await run_integration_checks({ config: {} });
    expect(results.map((result) => result.key).sort()).toEqual(integration_definitions.map((d) => d.key).sort());
  });
});
