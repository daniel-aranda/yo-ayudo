import {
  daily_close_schema,
  daily_note_schema,
  day_start_schema,
  inventory_snapshot_schema,
  lead_capture_schema,
  purchase_schema,
  sales_update_schema,
} from "./operation_schemas.js";

const low_confidence_threshold = 0.72;

function validation_errors(error) {
  return error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }));
}

function validate_extraction(extraction, schema) {
  const parsed = schema.safeParse(extraction.data);
  const errors = parsed.success ? [] : validation_errors(parsed.error);

  return {
    parser_name: "message_intent_parser",
    intent: extraction.intent,
    data: parsed.success ? parsed.data : extraction.data,
    confidence: extraction.confidence,
    needs_review:
      extraction.needs_review || extraction.confidence < low_confidence_threshold || errors.length > 0,
    missing_fields: extraction.missing_fields,
    validation_errors: errors,
  };
}

export class message_intent_parser {
  constructor(provider) {
    this.provider = provider;
  }

  async parse(text, classification) {
    switch (classification.intent) {
      case "day_start":
        return validate_extraction(await this.provider.extract_day_start({ text }), day_start_schema);
      case "sales_update":
        return validate_extraction(await this.provider.extract_sales_update({ text }), sales_update_schema);
      case "purchase":
        return validate_extraction(await this.provider.extract_purchase({ text }), purchase_schema);
      case "inventory_update":
        return validate_extraction(await this.provider.extract_inventory({ text }), inventory_snapshot_schema);
      case "daily_close":
        return validate_extraction(await this.provider.extract_daily_close({ text }), daily_close_schema);
      case "daily_note":
        return validate_extraction(await this.provider.extract_daily_note({ text }), daily_note_schema);
      case "lead_capture":
        return validate_extraction(await this.provider.extract_lead_capture({ text }), lead_capture_schema);
      case "report_request":
      case "human_help":
      // La recolección y la generación no extraen campos deterministas: el turno
      // de entrevista (IA + sesión) y el consumo viven en el engine/collection_service.
      case "collect_information_start":
      case "collect_information":
      case "generate_document_request":
        return {
          parser_name: "message_intent_parser",
          intent: classification.intent,
          data: { text },
          confidence: classification.confidence,
          needs_review: false,
          missing_fields: [],
          validation_errors: [],
        };
      case "unknown":
      default:
        return {
          parser_name: "message_intent_parser",
          intent: "unknown",
          data: { text },
          confidence: classification.confidence,
          needs_review: true,
          missing_fields: [],
          validation_errors: [{ message: "Unknown intent" }],
        };
    }
  }
}
