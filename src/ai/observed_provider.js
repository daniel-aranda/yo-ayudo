export class observed_model_provider {
  constructor(provider, context) {
    this.provider = provider;
    this.context = context;
  }

  async observe(function_name, input, operation) {
    const started_at = Date.now();

    try {
      const output = await operation();
      await this.context.pool.query(
        `
          INSERT INTO ai_calls (
            account_id,
            organization_id,
            message_id,
            provider,
            model,
            function_name,
            input_json,
            output_json,
            latency_ms,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, 'completed')
        `,
        [
          this.context.account_id,
          this.context.organization_id,
          this.context.message_id,
          this.context.provider_name,
          this.context.model,
          function_name,
          JSON.stringify(input),
          JSON.stringify(output),
          Date.now() - started_at,
        ],
      );
      return output;
    } catch (error) {
      await this.context.pool.query(
        `
          INSERT INTO ai_calls (
            account_id,
            organization_id,
            message_id,
            provider,
            model,
            function_name,
            input_json,
            latency_ms,
            status,
            error_message
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'failed', $9)
        `,
        [
          this.context.account_id,
          this.context.organization_id,
          this.context.message_id,
          this.context.provider_name,
          this.context.model,
          function_name,
          JSON.stringify(input),
          Date.now() - started_at,
          error instanceof Error ? error.message : "Unknown AI provider error",
        ],
      );
      throw error;
    }
  }

  normalize_message(input) {
    return this.observe("normalize_message", input, () => this.provider.normalize_message(input));
  }

  classify_intent(input) {
    return this.observe("classify_intent", input, () => this.provider.classify_intent(input));
  }

  extract_purchase(input) {
    return this.observe("extract_purchase", input, () => this.provider.extract_purchase(input));
  }

  extract_inventory(input) {
    return this.observe("extract_inventory", input, () => this.provider.extract_inventory(input));
  }

  extract_sales_update(input) {
    return this.observe("extract_sales_update", input, () => this.provider.extract_sales_update(input));
  }

  extract_daily_close(input) {
    return this.observe("extract_daily_close", input, () => this.provider.extract_daily_close(input));
  }

  extract_day_start(input) {
    return this.observe("extract_day_start", input, () => this.provider.extract_day_start(input));
  }

  extract_daily_note(input) {
    return this.observe("extract_daily_note", input, () => this.provider.extract_daily_note(input));
  }

  draft_daily_report(input) {
    return this.observe("draft_daily_report", input, () => this.provider.draft_daily_report(input));
  }

  explain_alerts(input) {
    return this.observe("explain_alerts", input, () => this.provider.explain_alerts(input));
  }
}
