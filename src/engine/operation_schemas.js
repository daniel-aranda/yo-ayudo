import { z } from "zod";

export const day_start_schema = z.object({
  opening_cash: z.number().nonnegative(),
  free_comment: z.string().optional(),
});

export const sales_update_schema = z.object({
  accumulated_sales: z.number().nonnegative(),
  cash_sales: z.number().nonnegative().optional(),
  card_sales: z.number().nonnegative().optional(),
  transfer_sales: z.number().nonnegative().optional(),
  delivery_app_sales: z.number().nonnegative().optional(),
  note: z.string().optional(),
});

export const purchase_schema = z.object({
  item_name: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  total_cost: z.number().nonnegative(),
  supplier_name_raw: z.string().optional(),
});

export const inventory_snapshot_schema = z.object({
  snapshot_type: z.enum(["opening", "closing"]),
  items: z
    .array(
      z.object({
        item_name: z.string().min(1),
        quantity: z.number().nonnegative(),
        unit: z.string().min(1),
      }),
    )
    .min(1),
});

export const daily_close_schema = z.object({
  total_sales: z.number().nonnegative(),
  cash_sales: z.number().nonnegative().optional(),
  card_sales: z.number().nonnegative().optional(),
  transfer_sales: z.number().nonnegative().optional(),
  delivery_app_sales: z.number().nonnegative().optional(),
  closing_cash: z.number().nonnegative().optional(),
  cash_withdrawals: z.number().nonnegative().optional(),
  cash_payments: z.number().nonnegative().optional(),
  comps_amount: z.number().nonnegative().optional(),
  internal_consumption_amount: z.number().nonnegative().optional(),
  credit_sales_amount: z.number().nonnegative().optional(),
  cancellations_amount: z.number().nonnegative().optional(),
  waste_notes: z.string().optional(),
  shortage_notes: z.string().optional(),
  surplus_notes: z.string().optional(),
  free_comment: z.string().optional(),
});

export const daily_note_schema = z.object({
  waste_notes: z.string().optional(),
  shortage_notes: z.string().optional(),
  surplus_notes: z.string().optional(),
  free_comment: z.string().optional(),
});

// Lead/prospect capture. Loose by design (CRM data trickles in), but it must
// carry at least one identifier or a name — otherwise there is nothing to save
// and the message goes to review instead of creating an empty record.
export const lead_capture_schema = z
  .object({
    display_name: z.string().optional(),
    curp: z.string().optional(),
    phone: z.string().optional(),
    instagram: z.string().optional(),
    email: z.string().optional(),
    kind: z.string().optional(),
    pipeline_status: z.string().optional(),
    source: z.string().optional(),
    need: z.string().optional(),
    free_comment: z.string().optional(),
  })
  .refine((data) => Boolean(data.display_name || data.curp || data.phone || data.instagram || data.email), {
    message: "Sin identificador ni nombre del prospecto.",
  });
