import { format_money } from "../shared/money.js";
import { review_reply } from "./operation_dispatcher.js";

export function build_reply(parsed, result) {
  if (result.reply_text) {
    return result.reply_text;
  }

  if (parsed.needs_review) {
    return review_reply(parsed);
  }

  switch (parsed.intent) {
    case "purchase":
      return `Compra registrada: ${parsed.data.quantity} ${parsed.data.unit} de ${parsed.data.item_name} por ${format_money(parsed.data.total_cost)}.`;
    case "sales_update":
      return `Venta acumulada registrada: ${format_money(parsed.data.accumulated_sales)}.`;
    case "day_start":
      return `Caja inicial del día registrada: ${format_money(parsed.data.opening_cash)}.`;
    case "daily_close":
      return "Cierre registrado. Estoy preparando el resumen del día.";
    case "inventory_update":
      return "Inventario registrado.";
    case "daily_note":
      return "Nota del día registrada.";
    case "lead_capture":
      return typeof result.metadata?.mensaje === "string"
        ? result.metadata.mensaje
        : `${parsed.data?.kind === "cliente" ? "Cliente" : "Prospecto"} registrado.`;
    case "report_request":
      return typeof result.metadata?.summary_text === "string"
        ? result.metadata.summary_text
        : "Reporte generado.";
    default:
      return null;
  }
}

// Combine the replies of every operation the router fired into one WhatsApp
// message, one line per operation. Distinct lines only, so repeated phrasing
// (e.g. two review prompts) collapses instead of spamming the user.
export function build_multi_reply(operation_results) {
  const seen = new Set();
  const lines = [];

  for (const result of operation_results ?? []) {
    const reply = build_reply(result.parsed ?? {}, result);
    if (!reply || seen.has(reply)) {
      continue;
    }
    seen.add(reply);
    lines.push(reply);
  }

  return lines.length ? lines.join("\n") : null;
}
