import { createHash } from "node:crypto";
import { config } from "../app/config.js";
import { logger } from "../shared/logger.js";
import { embedding_gateway } from "./embedding_gateway.js";
import { create_memory_store } from "./memory_store.js";
import { memory_document_input_schema } from "./memory_schemas.js";
import {
  mark_memory_document_embedded,
  mark_memory_document_failed,
  mark_memory_document_stored,
  upsert_memory_document,
} from "./memory_document_repository.js";

export function content_hash_for_text(text) {
  return createHash("sha256").update(text).digest("hex");
}

export class memory_document_service {
  constructor({ pool, store = create_memory_store(), embedding = new embedding_gateway() }) {
    this.pool = pool;
    this.store = store;
    this.embedding = embedding;
  }

  async create_document(input) {
    const parsed = memory_document_input_schema.parse(input);
    const content_hash = content_hash_for_text(parsed.content);
    const document = await upsert_memory_document(this.pool, {
      ...parsed,
      content_hash,
    });

    try {
      const store_result = await this.store.put_document({
        document_id: document.id,
        content: parsed.content,
        metadata: {
          ...parsed.metadata_json,
          document_family: parsed.document_family,
          scope: parsed.scope,
          document_type: parsed.document_type,
          organization_id: parsed.organization_id ?? null,
          account_id: parsed.account_id ?? null,
          tenant_id: parsed.tenant_id ?? null,
          bot_id: parsed.bot_id ?? null,
        },
      });
      const stored_document = await mark_memory_document_stored(this.pool, {
        document_id: document.id,
        s3_bucket: store_result.s3_bucket,
        s3_key: store_result.s3_key,
        local_path: store_result.local_path,
      });
      const embedding_result = await this.embedding.embed_text({
        text: parsed.content,
        metadata: parsed.metadata_json,
      });

      return mark_memory_document_embedded(this.pool, {
        document_id: stored_document.id,
        embedding_provider: embedding_result.provider,
        embedding_model: embedding_result.model,
        embedding_vector_id: embedding_result.vector_id,
        embedding_index_name: config.vector_index_name,
      });
    } catch (error) {
      const error_message = error instanceof Error ? error.message : "memory document failure";
      logger.error({ err: error, document_id: document.id }, "memory document failed");
      await mark_memory_document_failed(this.pool, {
        document_id: document.id,
        error_message,
      });
      throw error;
    }
  }
}
