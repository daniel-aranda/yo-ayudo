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
      return `Inicio del día registrado con ${format_money(parsed.data.opening_cash)} en caja.`;
    case "daily_close":
      return "Cierre registrado. Estoy preparando el resumen del día.";
    case "inventory_update":
      return "Inventario registrado.";
    case "daily_note":
      return "Nota del día registrada.";
    case "report_request":
      return typeof result.metadata?.summary_text === "string"
        ? result.metadata.summary_text
        : "Reporte generado.";
    default:
      return null;
  }
}
