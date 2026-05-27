import { memory_document_service } from "../memory/memory_document_service.js";
import { memory_retrieval_service } from "../memory/memory_retrieval_service.js";

const business_scopes = new Set(["organization", "account", "bot"]);

export class business_knowledge_service {
  constructor({
    pool,
    document_service = new memory_document_service({ pool }),
    retrieval_service = new memory_retrieval_service({ pool }),
  }) {
    this.pool = pool;
    this.document_service = document_service;
    this.retrieval_service = retrieval_service;
  }

  async register_source(input) {
    if (!business_scopes.has(input.scope)) {
      throw new Error(`Invalid business knowledge scope: ${input.scope}`);
    }

    const result = await this.pool.query(
      `
        INSERT INTO knowledge_sources (
          organization_id,
          account_id,
          bot_id,
          tenant_id,
          branch_id,
          solution_template_id,
          bot_profile_id,
          source_family,
          scope,
          source_type,
          name,
          description,
          origin,
          metadata_json,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'business_knowledge', $8, $9, $10, $11, $12, $13::jsonb, COALESCE($14, 'active'))
        RETURNING *
      `,
      [
        input.organization_id ?? null,
        input.account_id ?? null,
        input.bot_id ?? null,
        input.tenant_id ?? null,
        input.branch_id ?? null,
        input.solution_template_id ?? null,
        input.bot_profile_id ?? null,
        input.scope,
        input.source_type,
        input.name,
        input.description ?? null,
        input.origin ?? "manual",
        JSON.stringify(input.metadata_json ?? {}),
        input.status ?? "active",
      ],
    );

    return result.rows[0];
  }

  async create_document(input) {
    const source =
      input.source_id
        ? { id: input.source_id }
        : await this.register_source({
            organization_id: input.organization_id,
            account_id: input.account_id,
            bot_id: input.bot_id,
            tenant_id: input.tenant_id,
            branch_id: input.branch_id,
            solution_template_id: input.solution_template_id,
            bot_profile_id: input.bot_profile_id,
            scope: input.scope,
            source_type: input.source_type ?? "manual",
            name: input.source_name ?? input.title,
            description: input.source_description ?? null,
            origin: input.origin ?? "manual",
            metadata_json: input.source_metadata_json ?? {},
          });

    return this.document_service.create_document({
      organization_id: input.organization_id ?? null,
      account_id: input.account_id ?? null,
      tenant_id: input.tenant_id ?? null,
      branch_id: input.branch_id ?? null,
      bot_id: input.bot_id ?? null,
      solution_template_id: input.solution_template_id ?? null,
      bot_profile_id: input.bot_profile_id ?? null,
      document_family: "business_knowledge",
      scope: input.scope,
      document_type: input.document_type,
      title: input.title,
      content: input.content,
      source_table: "knowledge_sources",
      source_id: source.id,
      metadata_json: {
        ...(input.metadata_json ?? {}),
        document_family: "business_knowledge",
        source_family: "business_knowledge",
      },
      visibility: input.visibility ?? "private",
      version: input.version ?? 1,
    });
  }

  async retrieve_relevant_knowledge(input) {
    return this.retrieval_service.retrieve_context({
      organization_id: input.organization_id ?? null,
      account_id: input.account_id ?? null,
      tenant_id: input.tenant_id ?? null,
      bot_id: input.bot_id ?? null,
      query: input.query ?? "",
      document_family: "business_knowledge",
      scopes: input.scopes ?? ["organization", "account", "bot"],
      document_types:
        input.document_types ?? [
          "business_service",
          "business_price",
          "business_policy",
          "business_process",
          "business_faq",
          "business_rule",
          "business_document",
          "business_hours",
          "sales_criteria",
          "owner_instruction",
          "client_knowledge",
        ],
      limit: input.limit ?? 5,
    });
  }
}
