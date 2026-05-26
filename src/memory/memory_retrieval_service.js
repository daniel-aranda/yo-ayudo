import { retrieve_context_schema } from "./memory_schemas.js";

function words_for_query(query) {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9_]+/)
    .filter((word) => word.length > 2);
}

function document_type_weight(document_type) {
  if (document_type === "daily_summary" || document_type === "conversation_summary") {
    return 3;
  }

  if (document_type.endsWith("_knowledge")) {
    return 2;
  }

  return 1;
}

function score_document(document, input) {
  const words = words_for_query(input.query);
  const content = `${document.title ?? ""} ${document.content}`.toLowerCase();
  const word_score = words.reduce((score, word) => score + (content.includes(word) ? 2 : 0), 0);
  const scope_score = input.scopes.includes(document.scope) ? 2 : 0;
  const type_score = document_type_weight(document.document_type);
  const intent_score =
    document.metadata_json?.intent && input.query.includes(document.metadata_json.intent) ? 2 : 0;

  return word_score + scope_score + type_score + intent_score;
}

function add_filter(filters, values, sql, value) {
  values.push(value);
  filters.push(sql.replace("?", `$${values.length}`));
}

function add_list_filter(filters, values, column, list) {
  if (!list.length) {
    return;
  }

  const placeholders = list.map((value) => {
    values.push(value);
    return `$${values.length}`;
  });
  filters.push(`${column} IN (${placeholders.join(", ")})`);
}

export class memory_retrieval_service {
  constructor({ pool }) {
    this.pool = pool;
  }

  async retrieve_context(raw_input) {
    const input = retrieve_context_schema.parse(raw_input);
    const filters = ["status = 'stored'"];
    const values = [];

    if (input.tenant_id) {
      add_filter(filters, values, "(tenant_id = ? OR tenant_id IS NULL)", input.tenant_id);
    } else {
      filters.push("tenant_id IS NULL");
    }

    if (input.branch_id) {
      add_filter(filters, values, "(branch_id = ? OR branch_id IS NULL)", input.branch_id);
    }

    if (input.contact_id) {
      add_filter(filters, values, "(contact_id = ? OR contact_id IS NULL)", input.contact_id);
    }

    if (input.conversation_id) {
      add_filter(filters, values, "(conversation_id = ? OR conversation_id IS NULL)", input.conversation_id);
    }

    if (input.solution_template_id) {
      add_filter(
        filters,
        values,
        "(solution_template_id = ? OR solution_template_id IS NULL)",
        input.solution_template_id,
      );
    }

    add_list_filter(filters, values, "scope", input.scopes);
    add_list_filter(filters, values, "document_type", input.document_types);

    values.push(input.limit * 5);
    const result = await this.pool.query(
      `
        SELECT *
        FROM memory_documents
        WHERE ${filters.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT $${values.length}
      `,
      values,
    );
    const documents = result.rows
      .map((document) => ({
        id: document.id,
        scope: document.scope,
        document_type: document.document_type,
        title: document.title,
        content: document.content,
        metadata: document.metadata_json,
        score: score_document(document, input),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit);

    return { documents };
  }
}
