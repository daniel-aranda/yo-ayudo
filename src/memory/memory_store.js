import { config } from "../app/config.js";
import { local_memory_store } from "./local_memory_store.js";
import { s3_memory_store } from "./s3_memory_store.js";

export class memory_store {
  async put_document() {
    throw new Error("put_document not implemented");
  }

  async get_document() {
    throw new Error("get_document not implemented");
  }

  async delete_document() {
    throw new Error("delete_document not implemented");
  }
}

export function create_memory_store() {
  if (config.memory_store_provider === "s3") {
    return new s3_memory_store({
      bucket: config.memory_s3_bucket,
      prefix: config.memory_s3_prefix,
    });
  }

  return new local_memory_store({ base_dir: config.memory_local_dir });
}
