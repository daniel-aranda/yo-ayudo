import { describe, it, expect } from "vitest";
import { meta_whatsapp_client } from "../../src/channels/whatsapp/whatsapp_client.js";

describe("whatsapp download_media", () => {
  const client = new meta_whatsapp_client();

  it("sin access_token → downloaded:false (no lanza, no rompe inbound)", async () => {
    const r = await client.download_media("m1", {
      access_token: "",
      fetcher: async () => {
        throw new Error("no debe llamar fetch");
      },
    });
    expect(r).toMatchObject({ downloaded: false, reason: "missing_whatsapp_credentials" });
  });

  it("happy path: pide la url del media y descarga el binario", async () => {
    let call = 0;
    const fetcher = async () => {
      call += 1;
      if (call === 1) {
        return { ok: true, json: async () => ({ url: "https://media/abc", mime_type: "image/png", file_size: 3 }) };
      }
      return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, headers: { get: () => "image/png" } };
    };
    const r = await client.download_media("m1", { access_token: "tok", fetcher });
    expect(r.downloaded).toBe(true);
    expect(Array.from(r.buffer)).toEqual([1, 2, 3]);
    expect(r.mime_type).toBe("image/png");
    expect(r.source_media_id).toBe("m1");
  });

  it("media sin url → downloaded:false (media_url_unavailable)", async () => {
    const fetcher = async () => ({ ok: true, json: async () => ({}) });
    const r = await client.download_media("m1", { access_token: "tok", fetcher });
    expect(r).toMatchObject({ downloaded: false, reason: "media_url_unavailable" });
  });
});
