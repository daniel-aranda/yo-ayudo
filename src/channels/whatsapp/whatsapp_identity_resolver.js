function row_to_identity(row) {
  return {
    whatsapp_phone_number: row.whatsapp_phone_number_id
      ? {
          id: row.whatsapp_phone_number_uuid,
          phone_number_id: row.whatsapp_phone_number_id,
          display_phone_number: row.display_phone_number,
          status: row.whatsapp_phone_number_status,
        }
      : null,
    phone_number_bot_assignment: row.assignment_id
      ? {
          id: row.assignment_id,
          whatsapp_phone_number_id: row.whatsapp_phone_number_uuid,
          bot_id: row.bot_id,
          status: row.assignment_status,
        }
      : null,
    bot_profile: row.bot_profile_id
      ? {
          id: row.bot_profile_id,
          name: row.bot_profile_name,
          timezone: row.bot_profile_timezone,
          solution_template_id: row.bot_profile_solution_template_id,
          solution_template_key: row.solution_template_key,
        }
      : null,
    solution_template: row.solution_template_id
      ? {
          id: row.solution_template_id,
          key: row.solution_template_key,
        }
      : null,
    organization: row.organization_id
      ? {
          id: row.organization_id,
          name: row.organization_name,
          slug: row.organization_slug,
        }
      : null,
    account: row.account_id
      ? {
          id: row.account_id,
          organization_id: row.organization_id,
          name: row.account_name,
          slug: row.account_slug,
          timezone: row.account_timezone,
        }
      : null,
    bot: row.bot_id
      ? {
          id: row.bot_id,
          organization_id: row.organization_id,
          account_id: row.account_id,
          bot_profile_id: row.bot_profile_id,
          name: row.bot_name,
          slug: row.bot_slug,
          channel: row.bot_channel,
          bot_type: row.bot_type,
          description: row.bot_description,
          definition_json: row.definition_json ?? {},
          definition_version: row.definition_version,
          status: row.bot_status,
        }
      : null,
  };
}

async function resolve_from_active_assignment(pool, phone_number_id) {
  const result = await pool.query(
    `
      SELECT
        whatsapp_phone_numbers.id AS whatsapp_phone_number_uuid,
        whatsapp_phone_numbers.phone_number_id AS whatsapp_phone_number_id,
        whatsapp_phone_numbers.display_phone_number,
        whatsapp_phone_numbers.status AS whatsapp_phone_number_status,
        phone_number_bot_assignments.id AS assignment_id,
        phone_number_bot_assignments.status AS assignment_status,
        bot_profiles.id AS bot_profile_id,
        bot_profiles.name AS bot_profile_name,
        bot_profiles.timezone AS bot_profile_timezone,
        bot_profiles.solution_template_id AS bot_profile_solution_template_id,
        solution_templates.id AS solution_template_id,
        solution_templates.key AS solution_template_key,
        bots.id AS bot_id,
        bots.name AS bot_name,
        bots.slug AS bot_slug,
        bots.channel AS bot_channel,
        bots.bot_type,
        bots.description AS bot_description,
        bots.definition_json,
        bots.definition_version,
        bots.status AS bot_status,
        organizations.id AS organization_id,
        organizations.name AS organization_name,
        organizations.slug AS organization_slug,
        accounts.id AS account_id,
        accounts.name AS account_name,
        accounts.slug AS account_slug,
        accounts.timezone AS account_timezone
      FROM whatsapp_phone_numbers
      JOIN phone_number_bot_assignments
        ON phone_number_bot_assignments.whatsapp_phone_number_id = whatsapp_phone_numbers.id
       AND phone_number_bot_assignments.status = 'active'
       AND phone_number_bot_assignments.active_key = 'active'
      JOIN bots ON bots.id = phone_number_bot_assignments.bot_id
       AND bots.status = 'active'
      JOIN accounts ON accounts.id = bots.account_id
      JOIN organizations ON organizations.id = bots.organization_id
      LEFT JOIN bot_profiles ON bot_profiles.id = bots.bot_profile_id
        AND bot_profiles.status = 'active'
      LEFT JOIN solution_templates ON solution_templates.id = bot_profiles.solution_template_id
      WHERE whatsapp_phone_numbers.phone_number_id = $1
        AND whatsapp_phone_numbers.status = 'active'
      LIMIT 1
    `,
    [phone_number_id],
  );

  return result.rows[0] ? row_to_identity(result.rows[0]) : null;
}

async function resolve_legacy_identity(pool, phone_number_id) {
  const result = await pool.query(
    `
      SELECT
        whatsapp_phone_numbers.id AS whatsapp_phone_number_uuid,
        whatsapp_phone_numbers.phone_number_id AS whatsapp_phone_number_id,
        whatsapp_phone_numbers.display_phone_number,
        whatsapp_phone_numbers.status AS whatsapp_phone_number_status,
        NULL AS assignment_id,
        NULL AS assignment_status,
        bot_profiles.id AS bot_profile_id,
        bot_profiles.name AS bot_profile_name,
        bot_profiles.timezone AS bot_profile_timezone,
        bot_profiles.solution_template_id AS bot_profile_solution_template_id,
        solution_templates.id AS solution_template_id,
        solution_templates.key AS solution_template_key,
        bots.id AS bot_id,
        bots.name AS bot_name,
        bots.slug AS bot_slug,
        bots.channel AS bot_channel,
        bots.bot_type,
        bots.description AS bot_description,
        bots.definition_json,
        bots.definition_version,
        bots.status AS bot_status,
        organizations.id AS organization_id,
        organizations.name AS organization_name,
        organizations.slug AS organization_slug,
        accounts.id AS account_id,
        accounts.name AS account_name,
        accounts.slug AS account_slug,
        accounts.timezone AS account_timezone
      FROM whatsapp_phone_numbers
      LEFT JOIN accounts ON accounts.id = whatsapp_phone_numbers.account_id
      LEFT JOIN organizations
        ON organizations.id = COALESCE(whatsapp_phone_numbers.organization_id, accounts.organization_id)
      LEFT JOIN bots ON bots.account_id = accounts.id
        AND bots.status = 'active'
      LEFT JOIN bot_profiles ON bot_profiles.id = bots.bot_profile_id
        AND bot_profiles.status = 'active'
      LEFT JOIN solution_templates ON solution_templates.id = bot_profiles.solution_template_id
      WHERE whatsapp_phone_numbers.phone_number_id = $1
        AND whatsapp_phone_numbers.status = 'active'
      ORDER BY bots.created_at NULLS LAST
      LIMIT 1
    `,
    [phone_number_id],
  );

  return result.rows[0] ? row_to_identity(result.rows[0]) : null;
}

export async function resolve_whatsapp_identity_by_phone_number_id(pool, phone_number_id) {
  const assignment_identity = await resolve_from_active_assignment(pool, phone_number_id);

  if (assignment_identity) {
    return assignment_identity;
  }

  const legacy_identity = await resolve_legacy_identity(pool, phone_number_id);

  if (!legacy_identity) {
    throw new Error(`No account configured for WhatsApp phone_number_id ${phone_number_id}`);
  }

  return legacy_identity;
}
