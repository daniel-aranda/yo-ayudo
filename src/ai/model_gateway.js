/**
 * @typedef {Object} classification_result
 * @property {string} intent
 * @property {number} confidence
 * @property {string} reason
 */

/**
 * Runtime contract for language model providers.
 * Providers interpret language only; Zod schemas and handlers decide whether data is valid.
 */
export class model_provider {
  async normalize_message(_input) {
    throw new Error("normalize_message not implemented");
  }

  async classify_intent(_input) {
    throw new Error("classify_intent not implemented");
  }

  async extract_purchase(_input) {
    throw new Error("extract_purchase not implemented");
  }

  async extract_inventory(_input) {
    throw new Error("extract_inventory not implemented");
  }

  async extract_sales_update(_input) {
    throw new Error("extract_sales_update not implemented");
  }

  async extract_daily_close(_input) {
    throw new Error("extract_daily_close not implemented");
  }

  async extract_day_start(_input) {
    throw new Error("extract_day_start not implemented");
  }

  async extract_daily_note(_input) {
    throw new Error("extract_daily_note not implemented");
  }

  async draft_daily_report(_input) {
    throw new Error("draft_daily_report not implemented");
  }

  async explain_alerts(_input) {
    throw new Error("explain_alerts not implemented");
  }
}
