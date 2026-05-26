import { describe, expect, it } from "vitest";
import {
  build_daily_summary,
  calculate_daily_metrics,
  detect_daily_alerts,
} from "../../src/operations/reports/operational_rules.js";

describe("operational rules", () => {
  it("calculates sales, purchases, cash difference and gross margin without AI", () => {
    const metrics = calculate_daily_metrics(
      {
        opening_cash: 1500,
        closing_cash: 3000,
        total_sales: 8500,
        cash_sales: 3000,
        card_sales: 4000,
        transfer_sales: 1500,
        cash_payments: 1200,
        cash_withdrawals: 0,
      },
      [{ total_cost: 1680 }, { total_cost: 320 }],
    );

    expect(metrics.total_sales).toBe(8500);
    expect(metrics.total_purchases).toBe(2000);
    expect(metrics.payment_breakdown_total).toBe(8500);
    expect(metrics.estimated_cash_difference).toBe(300);
    expect(metrics.gross_margin_rate).toBeCloseTo(0.7647, 4);
  });

  it("detects missing data and shortage alerts", () => {
    const metrics = calculate_daily_metrics(
      {
        total_sales: 0,
        shortage_notes: "tortilla",
      },
      [],
    );
    const alerts = detect_daily_alerts({ total_sales: 0, shortage_notes: "tortilla" }, metrics);
    const summary = build_daily_summary(metrics, alerts);

    expect(alerts.map((alert) => alert.code)).toContain("missing_opening_cash");
    expect(alerts.map((alert) => alert.code)).toContain("shortage_reported");
    expect(summary).toContain("Ventas");
  });
});
