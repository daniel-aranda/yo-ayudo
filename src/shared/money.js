export function money_to_database(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return null;
  }

  return Number(value).toFixed(2);
}

export function quantity_to_database(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return null;
  }

  return Number(value).toFixed(3);
}

export function to_number(value) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }

  return 0;
}

export function format_money(value) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(to_number(value));
}
