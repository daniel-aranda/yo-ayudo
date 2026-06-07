export function date_key_in_timezone(date, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function today_key(timezone) {
  return date_key_in_timezone(new Date(), timezone);
}

export function assert_date_key(date_key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date_key)) {
    throw new Error(`Invalid date key: ${date_key}`);
  }

  return date_key;
}

function to_date(value) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Date-only string: build it in local time so it doesn't shift a day in es-MX.
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(value);
}

// Human date in es-MX, e.g. "7 jun 2026". Safe for null/invalid input (returns "").
export function format_date_es(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const date = to_date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

// Human date + time in es-MX, e.g. "7 jun 2026, 3:58 p.m.".
export function format_datetime_es(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
