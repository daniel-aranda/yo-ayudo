import { ensure_business_day } from "../business_days/business_day_repository.js";

function append_note(previous, next) {
  if (!next) {
    return previous;
  }

  return previous ? `${previous}\n${next}` : next;
}

export async function record_daily_note(pool, context, data) {
  const business_day = await ensure_business_day(pool, context);
  const existing = await pool.query(
    `
      SELECT waste_notes, shortage_notes, surplus_notes, free_comment
      FROM op_business_days
      WHERE id = $1
      LIMIT 1
    `,
    [business_day.id],
  );
  const current = existing.rows[0] ?? {
    waste_notes: null,
    shortage_notes: null,
    surplus_notes: null,
    free_comment: null,
  };

  await pool.query(
    `
      UPDATE op_business_days
      SET
        waste_notes = $2,
        shortage_notes = $3,
        surplus_notes = $4,
        free_comment = $5,
        updated_at = now()
      WHERE id = $1
    `,
    [
      business_day.id,
      append_note(current.waste_notes, data.waste_notes),
      append_note(current.shortage_notes, data.shortage_notes),
      append_note(current.surplus_notes, data.surplus_notes),
      append_note(current.free_comment, data.free_comment),
    ],
  );

  return { business_day_id: business_day.id };
}
