import { record_day_start } from "../operations/business_days/business_day_repository.js";
import { record_sales_update } from "../operations/sales_updates/sales_update_handler.js";
import { record_purchase } from "../operations/purchases/purchase_handler.js";
import { record_inventory_snapshot } from "../operations/inventory/inventory_snapshot_handler.js";
import { record_daily_close } from "../operations/daily_closes/daily_close_handler.js";
import { record_daily_note } from "../operations/daily_notes/daily_note_handler.js";
import { generate_daily_report } from "../operations/reports/daily_report_generator.js";

// Operational writes (inicio/ventas/compras/inventario/cierre/notas/reporte) are
// real engine actions: the deterministic parser extracts the structured data and
// these handlers wrap the existing src/operations/* handlers. The action's
// input_json IS the operation `data`.

function today_date() {
  return new Date().toISOString().slice(0, 10);
}

function operation_context(context) {
  const input = context.input_json ?? {};
  const operation_date = String(input.operation_date ?? context.operation_date ?? "").trim() || today_date();
  return {
    account_id: context.account_id ?? null,
    organization_id: context.organization_id ?? null,
    source_message_id: context.message_id ?? null,
    operation_date,
  };
}

function executed(output) {
  return { status: "executed", confirmation_required: false, output };
}

async function registrar_inicio_dia(pool, context) {
  const result = await record_day_start(pool, operation_context(context), context.input_json ?? {});
  return executed({ mensaje: "Caja inicial del día registrada.", ...result });
}

async function registrar_venta(pool, context) {
  const result = await record_sales_update(pool, operation_context(context), context.input_json ?? {});
  return executed({ mensaje: "Venta registrada.", ...result });
}

async function registrar_compra(pool, context) {
  const result = await record_purchase(pool, operation_context(context), context.input_json ?? {});
  return executed({ mensaje: "Compra registrada.", ...result });
}

async function registrar_inventario(pool, context) {
  const result = await record_inventory_snapshot(pool, operation_context(context), context.input_json ?? {});
  return executed({ mensaje: "Inventario registrado.", ...result });
}

async function registrar_cierre_dia(pool, context) {
  const op_context = operation_context(context);
  const result = await record_daily_close(pool, op_context, context.input_json ?? {});
  // Closing the day also produces the daily report (same as the legacy flow).
  const report = await generate_daily_report(pool, op_context);
  return executed({
    mensaje: "Cierre del día registrado.",
    ...result,
    report_id: report.id,
    summary_text: report.summary_text,
  });
}

async function registrar_nota_dia(pool, context) {
  const result = await record_daily_note(pool, operation_context(context), context.input_json ?? {});
  return executed({ mensaje: "Nota del día registrada.", ...result });
}

async function generar_reporte_dia(pool, context) {
  const report = await generate_daily_report(pool, operation_context(context));
  return executed({
    mensaje: "Reporte del día generado.",
    report_id: report.id,
    summary_text: report.summary_text,
    metrics: report.metrics,
    alerts: report.alerts,
  });
}

export const operational_action_handlers = {
  registrar_inicio_dia,
  registrar_venta,
  registrar_compra,
  registrar_inventario,
  registrar_cierre_dia,
  registrar_nota_dia,
  generar_reporte_dia,
};
