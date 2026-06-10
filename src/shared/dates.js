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

// Relative time in es-MX, e.g. "justo ahora", "hace 5 min", "hace 3 h", "hace 2 d".
// Older than a week falls back to the absolute date. Safe for null/invalid input.
export function relative_time_es(value) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) {
    return "justo ahora";
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `hace ${days} d`;
  }

  return format_date_es(date);
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
