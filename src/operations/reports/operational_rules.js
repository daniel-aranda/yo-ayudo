import { format_money, to_number } from "../../shared/money.js";

export function calculate_daily_metrics(operation, purchases) {
  const total_sales = to_number(operation.total_sales);
  const cash_sales = to_number(operation.cash_sales);
  const card_sales = to_number(operation.card_sales);
  const transfer_sales = to_number(operation.transfer_sales);
  const delivery_app_sales = to_number(operation.delivery_app_sales);
  const total_purchases = purchases.reduce((sum, purchase) => sum + to_number(purchase.total_cost), 0);
  const payment_breakdown_total = cash_sales + card_sales + transfer_sales + delivery_app_sales;
  const has_cash_data = operation.opening_cash != null && operation.closing_cash != null;
  const estimated_cash_difference = has_cash_data
    ? to_number(operation.opening_cash) +
      cash_sales -
      to_number(operation.cash_payments) -
      to_number(operation.cash_withdrawals) -
      to_number(operation.closing_cash)
    : null;
  const gross_margin_amount = total_sales > 0 ? total_sales - total_purchases : null;
  const gross_margin_rate = gross_margin_amount !== null && total_sales > 0 ? gross_margin_amount / total_sales : null;

  return {
    total_sales,
    total_purchases,
    payment_breakdown_total,
    estimated_cash_difference,
    gross_margin_amount,
    gross_margin_rate,
  };
}

export function detect_daily_alerts(operation, metrics) {
  const alerts = [];

  if (operation.opening_cash === null || operation.opening_cash === undefined) {
    alerts.push({
      code: "missing_opening_cash",
      severity: "warning",
      message: "Falta registrar la caja inicial.",
    });
  }

  if (operation.closing_cash === null || operation.closing_cash === undefined) {
    alerts.push({
      code: "missing_closing_cash",
      severity: "warning",
      message: "Falta registrar la caja final.",
    });
  }

  if (metrics.total_sales <= 0) {
    alerts.push({
      code: "missing_total_sales",
      severity: "warning",
      message: "No hay ventas totales registradas.",
    });
  }

  if (metrics.total_sales > 0 && metrics.payment_breakdown_total > 0) {
    const difference = Math.abs(metrics.total_sales - metrics.payment_breakdown_total);

    if (difference > 1) {
      alerts.push({
        code: "payment_breakdown_mismatch",
        severity: "warning",
        message: `La suma por método de pago difiere de ventas por ${format_money(difference)}.`,
      });
    }
  }

  if (metrics.estimated_cash_difference !== null && Math.abs(metrics.estimated_cash_difference) > 20) {
    alerts.push({
      code: "cash_difference",
      severity: "critical",
      message: `La caja estimada difiere por ${format_money(metrics.estimated_cash_difference)}.`,
    });
  }

  if (operation.shortage_notes) {
    alerts.push({
      code: "shortage_reported",
      severity: "warning",
      message: `Faltante reportado: ${operation.shortage_notes}.`,
    });
  }

  if (operation.surplus_notes) {
    alerts.push({
      code: "surplus_reported",
      severity: "info",
      message: `Sobrante reportado: ${operation.surplus_notes}.`,
    });
  }

  if (operation.waste_notes) {
    alerts.push({
      code: "waste_reported",
      severity: "warning",
      message: `Merma reportada: ${operation.waste_notes}.`,
    });
  }

  return alerts;
}

export function build_daily_summary(metrics, alerts) {
  const margin_text =
    metrics.gross_margin_rate === null
      ? "margen no disponible"
      : `margen bruto estimado ${(metrics.gross_margin_rate * 100).toFixed(1)}%`;

  return [
    `Ventas: ${format_money(metrics.total_sales)}.`,
    `Compras: ${format_money(metrics.total_purchases)}.`,
    margin_text,
    `Alertas: ${alerts.length}.`,
  ].join(" ");
}
