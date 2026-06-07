import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { memory_store_document_schema } from "./memory_schemas.js";

function safe_scope_dir(metadata) {
  return metadata.account_id ?? metadata.scope ?? "global";
}

export class local_memory_store {
  constructor({ base_dir }) {
    this.base_dir = base_dir;
  }

  document_path(document_id, metadata = {}) {
    return path.join(process.cwd(), this.base_dir, safe_scope_dir(metadata), `${document_id}.json`);
  }

  async put_document(input) {
    const parsed = memory_store_document_schema.parse(input);
    const local_path = this.document_path(parsed.document_id, parsed.metadata);

    await mkdir(path.dirname(local_path), { recursive: true });
    await writeFile(
      local_path,
      JSON.stringify(
        {
          document_id: parsed.document_id,
          content: parsed.content,
          metadata: parsed.metadata,
        },
        null,
        2,
      ),
    );

    return { provider: "local", local_path };
  }

  async get_document(input) {
    const local_path = input.location?.local_path ?? this.document_path(input.document_id, input.metadata ?? {});
    return JSON.parse(await readFile(local_path, "utf8"));
  }

  async delete_document(input) {
    const local_path = input.location?.local_path ?? this.document_path(input.document_id, input.metadata ?? {});
    await rm(local_path, { force: true });
    return { deleted: true };
  }
}
