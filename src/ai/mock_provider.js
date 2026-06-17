import { parse_lead_fields } from "../crm/lead_text_parser.js";

function normalize_text(text) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parse_amount(raw) {
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function first_amount_after(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[^0-9$]*(?:\\$\\s*)?([0-9][0-9,.]*)`, "i");
    const parsed = parse_amount(text.match(pattern)?.[1]);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function first_amount_before(text, labels) {
  for (const label of labels) {
    const pattern = new RegExp(`([0-9][0-9,.]*)\\s*(?:de\\s+)?${label}`, "i");
    const parsed = parse_amount(text.match(pattern)?.[1]);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function payment_amount(text, labels) {
  return first_amount_before(text, labels) ?? first_amount_after(text, labels);
}

function confidence_for_missing(base_confidence, missing_fields) {
  return missing_fields.length ? Math.min(base_confidence, 0.58) : base_confidence;
}

export class mock_provider {
  async normalize_message(input) {
    return { normalized_text: normalize_text(input.text) };
  }

  async classify_intent(input) {
    const text = normalize_text(input.text);

    if (/ayuda|humano|persona|soporte/.test(text)) {
      return { intent: "human_help", confidence: 0.92, reason: "human help keyword" };
    }

    if (/reporte|resumen|como vamos|como salio/.test(text)) {
      return { intent: "report_request", confidence: 0.9, reason: "report keyword" };
    }

    if (/abrimos|inicio del dia|empezamos/.test(text)) {
      return { intent: "day_start", confidence: 0.93, reason: "day start keyword" };
    }

    if (/cerramos|cierre|cerrar dia/.test(text)) {
      return { intent: "daily_close", confidence: 0.94, reason: "daily close keyword" };
    }

    if (/compre|compramos|compra/.test(text)) {
      return { intent: "purchase", confidence: 0.92, reason: "purchase keyword" };
    }

    if (/vendimos|venta acumulada|ventas hasta|hasta ahorita|hasta ahora/.test(text)) {
      return { intent: "sales_update", confidence: 0.91, reason: "sales update keyword" };
    }

    if (/inventario|existencia|conteo/.test(text)) {
      return { intent: "inventory_update", confidence: 0.86, reason: "inventory keyword" };
    }

    if (/sobro|sobrante|falto|faltante|merma|nota/.test(text)) {
      return { intent: "daily_note", confidence: 0.86, reason: "daily note keyword" };
    }

    return { intent: "unknown", confidence: 0.32, reason: "no known pattern matched" };
  }

  // Multi-interaction routing: a single message can carry several operations
  // (e.g. "abrimos con 1500, vendimos 3200 y compré 5 kg pastor por 600").
  // We locate every category by its trigger keyword, dedupe (a single operation
  // never double-fires), then SEGMENT the text at those keyword boundaries so
  // each extractor only sees its own clause — otherwise one operation's numbers
  // (e.g. the sales total) would leak into another (e.g. the opening cash).
  async classify_intents(input) {
    const text = normalize_text(input.text);
    const detectors = [
      { intent: "day_start", confidence: 0.93, pattern: /abrimos|inicio del dia|empezamos/, reason: "day start keyword" },
      { intent: "purchase", confidence: 0.92, pattern: /compre|compramos|compra/, reason: "purchase keyword" },
      { intent: "sales_update", confidence: 0.91, pattern: /vendimos|venta acumulada|ventas hasta|hasta ahorita|hasta ahora/, reason: "sales update keyword" },
      { intent: "inventory_update", confidence: 0.86, pattern: /inventario|existencia|conteo/, reason: "inventory keyword" },
      { intent: "daily_note", confidence: 0.86, pattern: /sobro|sobrante|falto|faltante|merma|nota/, reason: "daily note keyword" },
      { intent: "daily_close", confidence: 0.94, pattern: /cerramos|cierre|cerrar dia/, reason: "daily close keyword" },
      { intent: "report_request", confidence: 0.9, pattern: /reporte|resumen|como vamos|como salio/, reason: "report keyword" },
      // CRM lead/prospect capture. Keywords are deliberately CRM-specific (not a
      // bare "registra"/"cliente") so they don't steal operational messages.
      {
        intent: "lead_capture",
        confidence: 0.9,
        pattern: /\bprospecto\b|\bprospecta\b|nuevo cliente|nueva clienta|\blead\b|\bcurp\b|dar de alta|registra(?:r)?\s+a(?:l)?\s|guarda(?:r)?\s+(?:el|al)\s+contacto/,
        reason: "crm lead keyword",
      },
      { intent: "human_help", confidence: 0.92, pattern: /ayuda|humano|persona|soporte/, reason: "human help keyword" },
    ];

    const matches = [];
    for (const detector of detectors) {
      const match = text.match(detector.pattern);
      if (match && !matches.some((entry) => entry.intent === detector.intent)) {
        matches.push({ ...detector, index: match.index });
      }
    }

    if (!matches.length) {
      return { intents: [{ intent: "unknown", confidence: 0.32, reason: "no known pattern matched", segment: text }] };
    }

    // Order by where each operation appears, then bound each to [its keyword,
    // next keyword). A single-operation message yields one segment = full text,
    // so single-op extraction is byte-for-byte identical to before.
    matches.sort((a, b) => a.index - b.index);
    return {
      intents: matches.map((match, position) => {
        const end = position + 1 < matches.length ? matches[position + 1].index : text.length;
        return {
          intent: match.intent,
          confidence: match.confidence,
          reason: match.reason,
          segment: text.slice(match.index, end).trim(),
        };
      }),
    };
  }

  async extract_day_start(input) {
    const text = normalize_text(input.text);
    const opening_cash =
      first_amount_after(text, ["caja", "con", "abrimos con", "empezamos con"]) ??
      parse_amount(text.match(/([0-9][0-9,.]*)/)?.[1]);
    const missing_fields = opening_cash === undefined ? ["opening_cash"] : [];

    return {
      intent: "day_start",
      data: { opening_cash, free_comment: input.text },
      confidence: confidence_for_missing(0.92, missing_fields),
      needs_review: missing_fields.length > 0,
      missing_fields,
    };
  }

  async extract_sales_update(input) {
    const text = normalize_text(input.text);
    const accumulated_sales =
      first_amount_after(text, ["vendimos", "venta acumulada", "ventas", "va", "llevamos"]) ??
      parse_amount(text.match(/([0-9][0-9,.]*)/)?.[1]);
    const missing_fields = accumulated_sales === undefined ? ["accumulated_sales"] : [];

    return {
      intent: "sales_update",
      data: {
        accumulated_sales,
        cash_sales: payment_amount(text, ["efectivo"]),
        card_sales: payment_amount(text, ["tarjeta"]),
        transfer_sales: payment_amount(text, ["transferencia", "transfer"]),
        delivery_app_sales: payment_amount(text, ["app", "delivery"]),
        note: input.text,
      },
      confidence: confidence_for_missing(0.9, missing_fields),
      needs_review: missing_fields.length > 0,
      missing_fields,
    };
  }

  async extract_purchase(input) {
    const text = normalize_text(input.text);
    const pattern =
      /(?:compre|compramos|compra)\s+([0-9][0-9,.]*)\s*(kg|kilo|kilos|piezas|pieza|pzas|pza|litros|litro|l)\s+(.+?)(?:\s+por\s+\$?\s*([0-9][0-9,.]*))?(?:\s+con\s+(.+))?$/i;
    const match = text.match(pattern);
    const quantity = parse_amount(match?.[1]);
    const unit = match?.[2]
      ?.replace("kilos", "kg")
      .replace("kilo", "kg")
      .replace("pzas", "pieza")
      .replace("pza", "pieza");
    const item_name = match?.[3]?.trim();
    const total_cost = parse_amount(match?.[4]) ?? first_amount_after(text, ["por", "costo"]);
    const supplier_name_raw = match?.[5]?.trim();
    const missing_fields = [
      ["item_name", item_name],
      ["quantity", quantity],
      ["unit", unit],
      ["total_cost", total_cost],
    ]
      .filter(([, value]) => value === undefined || value === "")
      .map(([field]) => field);

    return {
      intent: "purchase",
      data: {
        item_name,
        quantity,
        unit,
        total_cost,
        supplier_name_raw,
      },
      confidence: confidence_for_missing(0.9, missing_fields),
      needs_review: missing_fields.length > 0,
      missing_fields,
    };
  }

  async extract_inventory(input) {
    const text = normalize_text(input.text);
    const snapshot_type = /inicial|abrimos/.test(text) ? "opening" : "closing";
    const items = text
      .replace(/inventario|inicial|final|cierre|abrimos|con/g, "")
      .split(/,|;/)
      .map((part) => part.trim())
      .map((part) => {
        const match = part.match(/(.+?)\s+([0-9][0-9,.]*)\s*(kg|kilo|kilos|piezas|pieza|pzas|pza|litros|litro|l)$/);
        const quantity = parse_amount(match?.[2]);

        if (!match || quantity === undefined) {
          return null;
        }

        return {
          item_name: match[1].trim(),
          quantity,
          unit: match[3]
            .replace("kilos", "kg")
            .replace("kilo", "kg")
            .replace("pzas", "pieza")
            .replace("pza", "pieza"),
        };
      })
      .filter(Boolean);
    const missing_fields = items.length ? [] : ["items"];

    return {
      intent: "inventory_update",
      data: { snapshot_type, items },
      confidence: confidence_for_missing(0.82, missing_fields),
      needs_review: missing_fields.length > 0,
      missing_fields,
    };
  }

  async extract_daily_close(input) {
    const text = normalize_text(input.text);
    const total_sales =
      first_amount_before(text, ["ventas", "venta"]) ??
      first_amount_after(text, ["ventas", "total"]) ??
      parse_amount(text.match(/([0-9][0-9,.]*)/)?.[1]);
    const missing_fields = total_sales === undefined ? ["total_sales"] : [];

    return {
      intent: "daily_close",
      data: {
        total_sales,
        cash_sales: payment_amount(text, ["efectivo"]),
        card_sales: payment_amount(text, ["tarjeta"]),
        transfer_sales: payment_amount(text, ["transferencia", "transfer"]),
        delivery_app_sales: payment_amount(text, ["app", "delivery"]),
        closing_cash: first_amount_after(text, ["caja final", "cerramos caja", "caja"]),
        cash_withdrawals: first_amount_after(text, ["retiro", "retiros"]),
        cash_payments: first_amount_after(text, ["pagos en efectivo", "pagos"]),
        comps_amount: first_amount_after(text, ["cortesias", "cortesia"]),
        internal_consumption_amount: first_amount_after(text, ["consumo interno"]),
        credit_sales_amount: first_amount_after(text, ["credito"]),
        cancellations_amount: first_amount_after(text, ["cancelaciones", "cancelado"]),
        free_comment: input.text,
      },
      confidence: confidence_for_missing(0.91, missing_fields),
      needs_review: missing_fields.length > 0,
      missing_fields,
    };
  }

  async extract_daily_note(input) {
    const text = normalize_text(input.text);
    const shortage_match = text.match(/(?:falto|faltante)\s+(.+?)(?:\s+y\s+|$)/);
    const surplus_match = text.match(/(?:sobro|sobrante)\s+(.+?)(?:\s+y\s+|$)/);
    const waste_match = text.match(/(?:merma|se tiro)\s+(.+?)(?:\s+y\s+|$)/);

    return {
      intent: "daily_note",
      data: {
        shortage_notes: shortage_match?.[1]?.trim(),
        surplus_notes: surplus_match?.[1]?.trim(),
        waste_notes: waste_match?.[1]?.trim(),
        free_comment: input.text,
      },
      confidence: 0.84,
      needs_review: false,
      missing_fields: [],
    };
  }

  async extract_lead_capture(input) {
    const fields = parse_lead_fields(input.text);
    const has_identifier = Boolean(
      fields.curp || fields.phone || fields.instagram || fields.email || fields.display_name,
    );
    const kind = /\bcliente\b|\bclienta\b/.test(normalize_text(input.text)) ? "cliente" : "prospecto";

    return {
      intent: "lead_capture",
      data: {
        display_name: fields.display_name ?? undefined,
        curp: fields.curp ?? undefined,
        phone: fields.phone ?? undefined,
        instagram: fields.instagram ?? undefined,
        email: fields.email ?? undefined,
        kind,
        source: "whatsapp",
        free_comment: input.text,
      },
      confidence: has_identifier ? 0.9 : 0.4,
      needs_review: !has_identifier,
      missing_fields: has_identifier ? [] : ["identificador"],
    };
  }

  async draft_daily_report(input) {
    return {
      summary_text: `Resumen del día: ventas ${input.metrics.total_sales ?? 0}, compras ${input.metrics.total_purchases ?? 0}, alertas ${input.alerts.length}.`,
      recommendations: input.alerts.length
        ? [{ type: "follow_up", message: "Revisar alertas antes de cerrar operación." }]
        : [{ type: "routine", message: "Mantener captura de ventas y compras durante el día." }],
    };
  }

  async explain_alerts(input) {
    return {
      explanations: input.alerts.map((alert) => ({
        alert_code: String(alert.code ?? "alert"),
        message: String(alert.message ?? "Revisar este punto."),
      })),
    };
  }
}
