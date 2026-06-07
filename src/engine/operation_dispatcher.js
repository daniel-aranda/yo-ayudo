import { record_day_start } from "../operations/business_days/business_day_repository.js";
import { record_purchase } from "../operations/purchases/purchase_handler.js";
import { record_sales_update } from "../operations/sales_updates/sales_update_handler.js";
import { record_inventory_snapshot } from "../operations/inventory/inventory_snapshot_handler.js";
import { record_daily_close } from "../operations/daily_closes/daily_close_handler.js";
import { record_daily_note } from "../operations/daily_notes/daily_note_handler.js";
import { generate_daily_report } from "../operations/reports/daily_report_generator.js";

export function review_reply(parsed) {
  if (parsed.missing_fields.includes("total_cost")) {
    return "Me falta un dato para registrarlo bien: ¿cuánto fue el costo total?";
  }

  if (parsed.intent === "purchase") {
    return "No estoy 100% seguro de haber entendido. ¿Me lo puedes mandar así: producto, cantidad, costo y proveedor?";
  }

  return "No estoy 100% seguro de haber entendido. ¿Me lo puedes mandar con un poco más de detalle?";
}

function operation_context(context) {
  if (!context.account) {
    throw new Error("Operational handlers require a resolved account");
  }

  return {
    account_id: context.account.id,
    organization_id: context.organization?.id ?? context.account?.organization_id ?? null,
    operation_date: context.operation_date,
    source_message_id: context.message.id,
  };
}

export async function dispatch_operation(context, parsed) {
  if (parsed.needs_review) {
    return { handled: false, reply_text: review_reply(parsed) };
  }

  const op_context = operation_context(context);

  switch (parsed.intent) {
    case "day_start":
      return { handled: true, metadata: await record_day_start(context.pool, op_context, parsed.data) };
    case "sales_update":
      return { handled: true, metadata: await record_sales_update(context.pool, op_context, parsed.data) };
    case "purchase":
      return { handled: true, metadata: await record_purchase(context.pool, op_context, parsed.data) };
    case "inventory_update":
      return { handled: true, metadata: await record_inventory_snapshot(context.pool, op_context, parsed.data) };
    case "daily_close": {
      const result = await record_daily_close(context.pool, op_context, parsed.data);
      const report = await generate_daily_report(context.pool, op_context);
      return {
        handled: true,
        report_id: report.id,
        metadata: { ...result, summary_text: report.summary_text },
      };
    }
    case "daily_note":
      return { handled: true, metadata: await record_daily_note(context.pool, op_context, parsed.data) };
    case "report_request": {
      const report = await generate_daily_report(context.pool, op_context);
      return {
        handled: true,
        report_id: report.id,
        metadata: {
          summary_text: report.summary_text,
          metrics: report.metrics,
          alerts: report.alerts,
        },
      };
    }
    case "human_help":
      return {
        handled: true,
        reply_text: "Te canalizo con una persona. Mientras tanto, sigo guardando los mensajes operativos.",
      };
    default:
      return {
        handled: false,
        reply_text: "No pude clasificar este mensaje para operación. Lo dejo en revisión.",
      };
  }
}
