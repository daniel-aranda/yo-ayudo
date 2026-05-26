export class s3_memory_store {
  constructor({ bucket, prefix }) {
    this.bucket = bucket;
    this.prefix = prefix;
  }

  async put_document() {
    if (!this.bucket) {
      throw new Error("MEMORY_S3_BUCKET is required when MEMORY_STORE_PROVIDER=s3");
    }

    throw new Error("s3_memory_store adapter is prepared but not implemented in this MVP");
  }

  async get_document() {
    throw new Error("s3_memory_store adapter is prepared but not implemented in this MVP");
  }

  async delete_document() {
    throw new Error("s3_memory_store adapter is prepared but not implemented in this MVP");
  }
}
