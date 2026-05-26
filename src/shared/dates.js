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
