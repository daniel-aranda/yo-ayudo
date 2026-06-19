// Rango de fechas del dashboard de cuenta. Las ventas/compras se acumulan sobre
// el rango elegido; caja inicial/final solo aplican a un día ("Hoy"). Toda la
// matemática de fechas vive aquí (JS), no en SQL: las queries solo comparan con
// params ya resueltos (pg-mem-safe, sin window funcs ni interval en SQL).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// YYYY-MM-DD en hora local (sin desfase de zona como toISOString daría).
function to_local_date_key(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shift_days(date_key, days) {
  const [year, month, day] = date_key.split("-").map(Number);
  const shifted = new Date(year, month - 1, day + days);
  return to_local_date_key(shifted);
}

const PRESET_LABELS = {
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
};

// Resuelve el rango a partir de la query string. Devuelve límites listos para
// SQL: from_iso/to_excl_iso (timestamps, semiabiertos para created_at) y
// from_date/to_date (YYYY-MM-DD, inclusivos para operation_date).
export function resolve_dashboard_range(query = {}) {
  const today = to_local_date_key(new Date());

  let preset = "hoy";
  let from_date = today;
  let to_date = today;

  const from = typeof query.from === "string" ? query.from : "";
  const to = typeof query.to === "string" ? query.to : "";

  if (DATE_PATTERN.test(from) && DATE_PATTERN.test(to)) {
    preset = "custom";
    // Si el usuario invierte el orden, lo corregimos en vez de devolver vacío.
    from_date = from <= to ? from : to;
    to_date = from <= to ? to : from;
  } else {
    const range = typeof query.range === "string" ? query.range : "hoy";
    if (range === "7d") {
      preset = "7d";
      from_date = shift_days(today, -6);
      to_date = today;
    } else if (range === "30d") {
      preset = "30d";
      from_date = shift_days(today, -29);
      to_date = today;
    } else {
      preset = "hoy";
      from_date = today;
      to_date = today;
    }
  }

  const is_today = preset === "hoy";
  const label = PRESET_LABELS[preset] ?? `${from_date} – ${to_date}`;

  return {
    preset,
    from_date,
    to_date,
    from_iso: `${from_date}T00:00:00`,
    to_excl_iso: `${shift_days(to_date, 1)}T00:00:00`,
    is_today,
    label,
  };
}
