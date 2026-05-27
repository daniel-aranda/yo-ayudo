import pg from "pg";
import { config } from "../app/config.js";
import { upsert_account as upsert_account_record } from "../accounts/account_repository.js";
import { assign_bot_to_whatsapp_phone_number } from "../bots/bot_assignment_repository.js";
import { upsert_bot as upsert_bot_record } from "../bots/bot_repository.js";
import { upsert_whatsapp_phone_number } from "../channels/whatsapp/whatsapp_number_repository.js";
import { logger } from "../shared/logger.js";
import { is_entrypoint } from "../shared/entrypoint.js";
import { memory_document_service } from "../memory/memory_document_service.js";

async function upsert_solution_template(pool) {
  const result = await pool.query(
    `
      INSERT INTO solution_templates (
        key,
        name,
        description,
        default_intents_json,
        default_fields_json,
        default_reports_json,
        default_messages_json,
        status
      )
      VALUES (
        'taqueria_control',
        'Control operativo para taquerias',
        'Captura de ventas, compras, inventario, caja y cierre diario para taquerias.',
        $1::jsonb,
        $2::jsonb,
        $3::jsonb,
        $4::jsonb,
        'active'
      )
      ON CONFLICT (key)
      DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        default_intents_json = EXCLUDED.default_intents_json,
        default_fields_json = EXCLUDED.default_fields_json,
        default_reports_json = EXCLUDED.default_reports_json,
        default_messages_json = EXCLUDED.default_messages_json,
        updated_at = now()
      RETURNING id
    `,
    [
      JSON.stringify([
        "day_start",
        "sales_update",
        "purchase",
        "inventory_update",
        "daily_close",
        "daily_note",
        "report_request",
        "human_help",
      ]),
      JSON.stringify({
        purchase: ["item_name", "quantity", "unit", "total_cost", "supplier_name_raw"],
        daily_close: ["total_sales", "cash_sales", "card_sales", "transfer_sales"],
      }),
      JSON.stringify(["daily_operation_summary"]),
      JSON.stringify({
        purchase: "Compra registrada: {{quantity}} {{unit}} de {{item_name}} por {{total_cost}}.",
      }),
    ],
  );

  return result.rows[0].id;
}

async function upsert_tenant(pool) {
  const result = await pool.query(
    `
      INSERT INTO tenants (name, slug, status, timezone)
      VALUES ('Margen Sabroso', 'margen-sabroso', 'active', 'America/Mexico_City')
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        timezone = EXCLUDED.timezone,
        updated_at = now()
      RETURNING id
    `,
  );

  return result.rows[0].id;
}

async function get_or_create_branch(pool, tenant_id) {
  const existing = await pool.query(
    "SELECT id FROM branches WHERE tenant_id = $1 AND name = 'Sucursal Centro' LIMIT 1",
    [tenant_id],
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `
      INSERT INTO branches (tenant_id, name, address, phone, timezone, status)
      VALUES ($1, 'Sucursal Centro', 'Centro', '+525555000000', 'America/Mexico_City', 'active')
      RETURNING id
    `,
    [tenant_id],
  );

  return inserted.rows[0].id;
}

async function upsert_bot_profile(pool, tenant_id, branch_id, solution_template_id) {
  const existing = await pool.query(
    "SELECT id FROM bot_profiles WHERE tenant_id = $1 AND branch_id = $2 AND name = 'Margen Sabroso' LIMIT 1",
    [tenant_id, branch_id],
  );

  let bot_profile_id = existing.rows[0]?.id;

  if (!bot_profile_id) {
    const inserted = await pool.query(
      `
        INSERT INTO bot_profiles (
          tenant_id,
          branch_id,
          name,
          solution_template_id,
          language,
          timezone,
          settings_json,
          status
        )
        VALUES ($1, $2, 'Margen Sabroso', $3, 'es-MX', 'America/Mexico_City', '{}'::jsonb, 'active')
        RETURNING id
      `,
      [tenant_id, branch_id, solution_template_id],
    );
    bot_profile_id = inserted.rows[0].id;
  }

  for (const intent_key of [
    "day_start",
    "sales_update",
    "purchase",
    "inventory_update",
    "daily_close",
    "daily_note",
    "report_request",
    "human_help",
    "unknown",
  ]) {
    await pool.query(
      `
        INSERT INTO bot_intents (
          bot_profile_id,
          intent_key,
          enabled,
          extraction_schema_json,
          examples_json,
          response_templates_json
        )
        VALUES ($1, $2, true, '{}'::jsonb, '[]'::jsonb, '{}'::jsonb)
        ON CONFLICT (bot_profile_id, intent_key)
        DO UPDATE SET enabled = true, updated_at = now()
      `,
      [bot_profile_id, intent_key],
    );
  }

  return bot_profile_id;
}

async function upsert_organization(pool) {
  const result = await pool.query(
    `
      INSERT INTO organizations (name, slug, status)
      VALUES ('YoAyudo Demo', 'yoayudo-demo', 'active')
      ON CONFLICT (slug)
      DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()
      RETURNING id
    `,
  );

  return result.rows[0].id;
}

async function upsert_account(pool, organization_id, tenant_id) {
  const account = await upsert_account_record(pool, {
    organization_id,
    tenant_id,
    name: "Demo Account",
    slug: "demo-account",
    status: "active",
  });

  return account.id;
}

async function upsert_bot(pool, input) {
  const bot = await upsert_bot_record(pool, {
    organization_id: input.organization_id,
    account_id: input.account_id,
    tenant_id: input.tenant_id,
    bot_profile_id: input.bot_profile_id,
    name: "Margen Sabroso Bot",
    slug: "margen-sabroso-bot",
    channel: "whatsapp",
    status: "active",
    settings_json: {},
  });

  await pool.query("UPDATE conversations SET bot_id = $1 WHERE tenant_id = $2 AND bot_id IS NULL", [
    bot.id,
    input.tenant_id,
  ]);
  await pool.query("UPDATE messages SET bot_id = $1 WHERE tenant_id = $2 AND bot_id IS NULL", [bot.id, input.tenant_id]);
  await pool.query("UPDATE agent_runs SET bot_id = $1 WHERE tenant_id = $2 AND bot_id IS NULL", [
    bot.id,
    input.tenant_id,
  ]);
  await pool.query("UPDATE memory_documents SET bot_id = $1 WHERE tenant_id = $2 AND bot_id IS NULL", [
    bot.id,
    input.tenant_id,
  ]);
  await pool.query("UPDATE review_items SET bot_id = $1 WHERE tenant_id = $2 AND bot_id IS NULL", [
    bot.id,
    input.tenant_id,
  ]);

  return bot.id;
}

async function upsert_contact(pool, tenant_id, branch_id) {
  await pool.query(
    `
      INSERT INTO contacts (tenant_id, branch_id, whatsapp_phone, display_name, role_label, metadata_json)
      VALUES ($1, $2, '5215550000000', 'Operador Demo', 'encargado', '{}'::jsonb)
      ON CONFLICT (tenant_id, whatsapp_phone)
      DO UPDATE SET
        branch_id = EXCLUDED.branch_id,
        display_name = EXCLUDED.display_name,
        role_label = EXCLUDED.role_label,
        updated_at = now()
    `,
    [tenant_id, branch_id],
  );
}

async function upsert_whatsapp_number(pool, input) {
  return upsert_whatsapp_phone_number(pool, {
    organization_id: input.organization_id,
    account_id: input.account_id,
    tenant_id: input.tenant_id,
    branch_id: input.branch_id,
    phone_number_id: config.whatsapp_phone_number_id,
    display_phone_number: "+525555999999",
    status: "active",
  });
}

async function upsert_business_settings(pool, tenant_id, branch_id) {
  const existing = await pool.query(
    "SELECT id FROM business_settings WHERE tenant_id = $1 AND branch_id = $2 LIMIT 1",
    [tenant_id, branch_id],
  );

  if (existing.rows[0]) {
    return;
  }

  await pool.query(
    `
      INSERT INTO business_settings (
        tenant_id,
        branch_id,
        opening_days_json,
        opening_hours_json,
        strong_days_json,
        weak_days_json,
        monthly_rent,
        average_electricity,
        average_water,
        average_gas,
        other_fixed_costs_json
      )
      VALUES (
        $1,
        $2,
        '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb,
        '{"open":"13:00","close":"23:00"}'::jsonb,
        '["friday","saturday","sunday"]'::jsonb,
        '["monday","tuesday"]'::jsonb,
        18000,
        3500,
        900,
        6200,
        '{"internet": 600}'::jsonb
      )
    `,
    [tenant_id, branch_id],
  );
}

async function insert_named_rows(pool, table, tenant_id, branch_id, rows) {
  for (const row of rows) {
    const existing = await pool.query(
      `SELECT id FROM ${table} WHERE tenant_id = $1 AND branch_id = $2 AND name = $3 LIMIT 1`,
      [tenant_id, branch_id, row.name],
    );

    if (existing.rows[0]) {
      continue;
    }

    const keys = Object.keys(row);
    const values = Object.values(row);
    const placeholders = values.map((_, index) => `$${index + 3}`).join(", ");

    await pool.query(
      `
        INSERT INTO ${table} (tenant_id, branch_id, ${keys.join(", ")})
        VALUES ($1, $2, ${placeholders})
      `,
      [tenant_id, branch_id, ...values],
    );
  }
}

async function upsert_agent_profile(pool, input) {
  const existing = await pool.query(
    `
      SELECT id
      FROM agent_profiles
      WHERE key = $1
        AND COALESCE(tenant_id::text, '') = COALESCE($2::text, '')
        AND COALESCE(solution_template_id::text, '') = COALESCE($3::text, '')
        AND COALESCE(bot_profile_id::text, '') = COALESCE($4::text, '')
      LIMIT 1
    `,
    [
      input.key,
      input.tenant_id ?? null,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
    ],
  );

  if (existing.rows[0]) {
    await pool.query(
      `
        UPDATE agent_profiles
        SET
          name = $2,
          description = $3,
          agent_type = $4,
          scope = $5,
          system_instructions = $6,
          allowed_intents_json = $7::jsonb,
          allowed_tools_json = $8::jsonb,
          retrieval_config_json = $9::jsonb,
          status = 'active',
          updated_at = now()
        WHERE id = $1
      `,
      [
        existing.rows[0].id,
        input.name,
        input.description,
        input.agent_type,
        input.scope,
        input.system_instructions,
        JSON.stringify(input.allowed_intents_json ?? []),
        JSON.stringify(input.allowed_tools_json ?? []),
        JSON.stringify(input.retrieval_config_json ?? {}),
      ],
    );

    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `
      INSERT INTO agent_profiles (
        key,
        name,
        description,
        agent_type,
        scope,
        tenant_id,
        solution_template_id,
        bot_profile_id,
        system_instructions,
        allowed_intents_json,
        allowed_tools_json,
        retrieval_config_json,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, 'active')
      RETURNING id
    `,
    [
      input.key,
      input.name,
      input.description,
      input.agent_type,
      input.scope,
      input.tenant_id ?? null,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
      input.system_instructions,
      JSON.stringify(input.allowed_intents_json ?? []),
      JSON.stringify(input.allowed_tools_json ?? []),
      JSON.stringify(input.retrieval_config_json ?? {}),
    ],
  );

  return inserted.rows[0].id;
}

async function upsert_routing_rule(pool, input) {
  const existing = await pool.query(
    `
      SELECT id
      FROM agent_routing_rules
      WHERE COALESCE(intent_key, '') = COALESCE($1, '')
        AND agent_profile_id = $2
        AND COALESCE(tenant_id::text, '') = COALESCE($3::text, '')
        AND COALESCE(solution_template_id::text, '') = COALESCE($4::text, '')
        AND COALESCE(bot_profile_id::text, '') = COALESCE($5::text, '')
      LIMIT 1
    `,
    [
      input.intent_key ?? null,
      input.agent_profile_id,
      input.tenant_id ?? null,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
    ],
  );

  if (existing.rows[0]) {
    await pool.query(
      `
        UPDATE agent_routing_rules
        SET priority = $2, condition_json = $3::jsonb, enabled = true, updated_at = now()
        WHERE id = $1
      `,
      [existing.rows[0].id, input.priority, JSON.stringify(input.condition_json ?? {})],
    );
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `
      INSERT INTO agent_routing_rules (
        tenant_id,
        solution_template_id,
        bot_profile_id,
        priority,
        intent_key,
        agent_profile_id,
        condition_json,
        enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true)
      RETURNING id
    `,
    [
      input.tenant_id ?? null,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
      input.priority ?? 100,
      input.intent_key ?? null,
      input.agent_profile_id,
      JSON.stringify(input.condition_json ?? {}),
    ],
  );

  return inserted.rows[0].id;
}

async function seed_agent_profiles(pool, solution_template_id, bot_profile_id) {
  const agents = [
    { key: "operations_agent", intents: ["day_start", "daily_close", "daily_note"] },
    { key: "sales_agent", intents: ["sales_update"] },
    { key: "inventory_agent", intents: ["inventory_update"] },
    { key: "purchases_agent", intents: ["purchase"] },
    { key: "reports_agent", intents: ["report_request"] },
    { key: "support_agent", intents: [] },
    { key: "human_handoff_agent", intents: ["human_help"] },
    { key: "unknown_agent", intents: ["unknown"] },
  ];
  const profile_ids = new Map();

  for (const agent of agents) {
    const agent_profile_id = await upsert_agent_profile(pool, {
      key: agent.key,
      name: agent.key.replace(/_/g, " "),
      description: `Subagente generico ${agent.key}.`,
      agent_type: agent.key,
      scope: "solution_template",
      solution_template_id,
      system_instructions: "Delegar en handlers operativos existentes y no inventar hechos.",
      allowed_intents_json: agent.intents,
      allowed_tools_json: ["operation_handlers"],
      retrieval_config_json: { scopes: ["tenant", "conversation", "operational_day"] },
    });
    profile_ids.set(agent.key, agent_profile_id);
  }

  const routing_map = {
    purchase: "purchases_agent",
    sales_update: "sales_agent",
    inventory_update: "inventory_agent",
    day_start: "operations_agent",
    daily_close: "operations_agent",
    daily_note: "operations_agent",
    report_request: "reports_agent",
    human_help: "human_handoff_agent",
    unknown: "unknown_agent",
  };

  for (const [intent_key, agent_key] of Object.entries(routing_map)) {
    await upsert_routing_rule(pool, {
      solution_template_id,
      bot_profile_id,
      priority: 10,
      intent_key,
      agent_profile_id: profile_ids.get(agent_key),
    });
  }
}

async function upsert_knowledge_source(pool, input) {
  const existing = await pool.query(
    `
      SELECT id
      FROM knowledge_sources
      WHERE name = $1
        AND scope = $2
        AND source_type = $3
        AND COALESCE(tenant_id::text, '') = COALESCE($4::text, '')
        AND COALESCE(solution_template_id::text, '') = COALESCE($5::text, '')
      LIMIT 1
    `,
    [
      input.name,
      input.scope,
      input.source_type,
      input.tenant_id ?? null,
      input.solution_template_id ?? null,
    ],
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const inserted = await pool.query(
    `
      INSERT INTO knowledge_sources (
        tenant_id,
        branch_id,
        solution_template_id,
        bot_profile_id,
        scope,
        source_type,
        name,
        description,
        origin,
        metadata_json,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'active')
      RETURNING id
    `,
    [
      input.tenant_id ?? null,
      input.branch_id ?? null,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
      input.scope,
      input.source_type,
      input.name,
      input.description ?? null,
      input.origin ?? "seed",
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );

  return inserted.rows[0].id;
}

async function seed_knowledge_documents(pool, input) {
  const service = new memory_document_service({ pool });
  const knowledge_documents = [
    {
      scope: "global",
      document_type: "global_knowledge",
      name: "YoAyudo global knowledge",
      content:
        "YoAyudo convierte WhatsApp en un sistema operativo de negocio. El bot debe capturar datos operativos, ejecutar procesos simples, generar reportes y escalar a humano cuando haya incertidumbre.",
    },
    {
      scope: "solution_template",
      document_type: "solution_knowledge",
      name: "taqueria_control knowledge",
      solution_template_id: input.solution_template_id,
      content:
        "La solución taqueria_control captura ventas, compras, inventario, caja, sobrantes, faltantes, merma y notas del día. Debe pedir datos consistentes, no perfectos.",
    },
    {
      scope: "tenant",
      document_type: "client_knowledge",
      name: "demo tenant knowledge",
      tenant_id: input.tenant_id,
      branch_id: input.branch_id,
      bot_id: input.bot_id,
      bot_profile_id: input.bot_profile_id,
      content:
        "El cliente demo prefiere respuestas cortas, claras y enfocadas en registrar operación. No quiere conversación larga.",
    },
  ];

  for (const document of knowledge_documents) {
    const knowledge_source_id = await upsert_knowledge_source(pool, {
      tenant_id: document.tenant_id,
      branch_id: document.branch_id,
      solution_template_id: document.solution_template_id,
      bot_profile_id: document.bot_profile_id,
      scope: document.scope,
      source_type: "seed_config",
      name: document.name,
      description: "Seed knowledge document",
    });

    await service.create_document({
      tenant_id: document.tenant_id ?? null,
      branch_id: document.branch_id ?? null,
      bot_id: document.bot_id ?? null,
      solution_template_id: document.solution_template_id ?? null,
      bot_profile_id: document.bot_profile_id ?? null,
      scope: document.scope,
      document_type: document.document_type,
      title: document.name,
      content: document.content,
      source_table: "knowledge_sources",
      source_id: knowledge_source_id,
      metadata_json: {
        source: "seed_config",
        scope: document.scope,
      },
      visibility: "private",
    });
  }
}

export async function seed_development_data(pool) {
  const solution_template_id = await upsert_solution_template(pool);
  const tenant_id = await upsert_tenant(pool);
  const branch_id = await get_or_create_branch(pool, tenant_id);
  const bot_profile_id = await upsert_bot_profile(pool, tenant_id, branch_id, solution_template_id);
  const organization_id = await upsert_organization(pool);
  const account_id = await upsert_account(pool, organization_id, tenant_id);
  const bot_id = await upsert_bot(pool, {
    organization_id,
    account_id,
    tenant_id,
    bot_profile_id,
  });
  const whatsapp_phone_number = await upsert_whatsapp_number(pool, {
    organization_id,
    account_id,
    tenant_id,
    branch_id,
  });
  await assign_bot_to_whatsapp_phone_number(pool, {
    organization_id,
    account_id,
    whatsapp_phone_number_id: whatsapp_phone_number.id,
    bot_id,
    metadata_json: { source: "seed" },
  });

  await upsert_contact(pool, tenant_id, branch_id);
  await upsert_business_settings(pool, tenant_id, branch_id);

  await insert_named_rows(pool, "catalog_items", tenant_id, branch_id, [
    { name: "taco pastor", category: "tacos", price: 22, active: true, metadata_json: "{}" },
    { name: "taco bistec", category: "tacos", price: 24, active: true, metadata_json: "{}" },
    { name: "gringa", category: "especialidades", price: 65, active: true, metadata_json: "{}" },
    { name: "torta", category: "tortas", price: 55, active: true, metadata_json: "{}" },
    { name: "refresco", category: "bebidas", price: 25, active: true, metadata_json: "{}" },
  ]);

  await insert_named_rows(pool, "inventory_items", tenant_id, branch_id, [
    { name: "pastor", default_unit: "kg", category: "proteina", approximate_unit_cost: 140, yield_notes: null, active: true },
    { name: "bistec", default_unit: "kg", category: "proteina", approximate_unit_cost: 165, yield_notes: null, active: true },
    { name: "tortilla", default_unit: "kg", category: "base", approximate_unit_cost: 22, yield_notes: null, active: true },
    { name: "queso", default_unit: "kg", category: "lacteo", approximate_unit_cost: 110, yield_notes: null, active: true },
    { name: "verdura", default_unit: "kg", category: "verdura", approximate_unit_cost: 35, yield_notes: null, active: true },
    { name: "bolillo", default_unit: "pieza", category: "pan", approximate_unit_cost: 3, yield_notes: null, active: true },
    { name: "bebidas", default_unit: "pieza", category: "bebidas", approximate_unit_cost: 13, yield_notes: null, active: true },
  ]);

  await insert_named_rows(pool, "suppliers", tenant_id, branch_id, [
    { name: "proveedor Juan", contact_name: "Juan", phone: "+525555111111", notes: "Carnes y pastor" },
    { name: "Tortillería La Lupita", contact_name: "Lupita", phone: "+525555222222", notes: "Tortilla diaria" },
  ]);

  await seed_agent_profiles(pool, solution_template_id, bot_profile_id);
  await seed_knowledge_documents(pool, {
    tenant_id,
    branch_id,
    solution_template_id,
    bot_profile_id,
    bot_id,
  });

  logger.info({ tenant_id, branch_id, bot_id }, "development seed complete");
  return { tenant_id, branch_id, solution_template_id, bot_profile_id, organization_id, account_id, bot_id };
}

if (is_entrypoint(import.meta.url)) {
  const seed_pool = new pg.Pool({ connectionString: config.database_url });
  seed_development_data(seed_pool)
    .then(async () => {
      await seed_pool.end();
    })
    .catch(async (error) => {
      await seed_pool.end().catch(() => undefined);
      logger.error({ err: error }, "development seed failed");
      process.exit(1);
    });
}
