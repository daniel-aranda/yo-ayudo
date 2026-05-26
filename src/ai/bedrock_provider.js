export class bedrock_provider {
  not_configured() {
    throw new Error("bedrock_provider is prepared as a stub. Use AI_PROVIDER=mock for MVP local runs.");
  }

  normalize_message() {
    this.not_configured();
  }

  classify_intent() {
    this.not_configured();
  }

  extract_purchase() {
    this.not_configured();
  }

  extract_inventory() {
    this.not_configured();
  }

  extract_sales_update() {
    this.not_configured();
  }

  extract_daily_close() {
    this.not_configured();
  }

  extract_day_start() {
    this.not_configured();
  }

  extract_daily_note() {
    this.not_configured();
  }

  draft_daily_report() {
    this.not_configured();
  }

  explain_alerts() {
    this.not_configured();
  }
}
