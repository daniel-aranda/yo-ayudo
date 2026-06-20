// Resolución de identidad para los canales de Meta basados en Messenger Platform
// (Instagram DM y Facebook Messenger). Espejo del resolver de WhatsApp, pero la
// clave de ruteo es el id de la cuenta IG / página de FB (el `recipient.id` del
// webhook) en lugar del phone_number_id. La forma de identidad (organization /
// account / bot / bot_profile / solution_template) es la MISMA que consume el
// engine; se agrega `channel_account` + `access_token` (para la Send API).

function build_meta_identity(row) {
  if (!row) {
    return null;
  }
  return {
    channel_account: {
      id: row.channel_account_uuid,
      external_id: row.channel_external_id,
      username: row.channel_username ?? null,
      page_name: row.channel_page_name ?? null,
      status: row.channel_status,
    },
    // Token de página/cuenta para enviar la respuesta. Null = sin credenciales:
    // el cliente no envía (registra not_configured), nunca finge.
    access_token: row.channel_access_token ?? null,
    assignment: row.assignment_id
      ? { id: row.assignment_id, bot_id: row.bot_id, status: row.assignment_status }
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
      ? { id: row.solution_template_id, key: row.solution_template_key }
      : null,
    organization: row.organization_id
      ? { id: row.organization_id, name: row.organization_name, slug: row.organization_slug }
      : null,
    account: row.account_id
      ? {
          id: row.account_id,
          organization_id: row.organization_id,
          name: row.account_name,
          slug: row.account_slug,
          timezone: row.account_timezone,
          settings_json: row.account_settings_json ?? {},
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

// Resolver genérico parametrizado por la tabla de cuenta del canal y su tabla de
// asignación. Los nombres de tabla/columna son constantes del código (no entrada
// de usuario), así que interpolarlos es seguro.
async function resolve_meta_channel_identity(pool, descriptor, ref) {
  const { account_table, assignment_table, fk_column, external_column, name_select } = descriptor;
  const result = await pool.query(
    `
      SELECT
        ${account_table}.id AS channel_account_uuid,
        ${account_table}.${external_column} AS channel_external_id,
        ${name_select},
        ${account_table}.access_token AS channel_access_token,
        ${account_table}.status AS channel_status,
        assignment.id AS assignment_id,
        assignment.status AS assignment_status,
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
        accounts.timezone AS account_timezone,
        accounts.settings_json AS account_settings_json
      FROM ${account_table}
      JOIN ${assignment_table} assignment
        ON assignment.${fk_column} = ${account_table}.id
       AND assignment.status = 'active'
       AND assignment.active_key = 'active'
      JOIN bots ON bots.id = assignment.bot_id
       AND bots.status = 'active'
      JOIN accounts ON accounts.id = bots.account_id
      JOIN organizations ON organizations.id = bots.organization_id
      LEFT JOIN bot_profiles ON bot_profiles.id = bots.bot_profile_id
        AND bot_profiles.status = 'active'
      LEFT JOIN solution_templates ON solution_templates.id = bot_profiles.solution_template_id
      WHERE ${account_table}.${external_column} = $1
        AND ${account_table}.status = 'active'
      LIMIT 1
    `,
    [ref],
  );

  return build_meta_identity(result.rows[0]);
}

export async function resolve_instagram_identity_by_account_id(pool, external_account_id) {
  const identity = await resolve_meta_channel_identity(
    pool,
    {
      account_table: "instagram_accounts",
      assignment_table: "instagram_account_bot_assignments",
      fk_column: "instagram_account_id",
      external_column: "external_account_id",
      name_select: "instagram_accounts.username AS channel_username",
    },
    external_account_id,
  );
  if (!identity) {
    throw new Error(`No bot assigned for Instagram account ${external_account_id}`);
  }
  return identity;
}

export async function resolve_facebook_identity_by_page_id(pool, external_page_id) {
  const identity = await resolve_meta_channel_identity(
    pool,
    {
      account_table: "facebook_pages",
      assignment_table: "facebook_page_bot_assignments",
      fk_column: "facebook_page_id",
      external_column: "external_page_id",
      name_select: "facebook_pages.page_name AS channel_page_name",
    },
    external_page_id,
  );
  if (!identity) {
    throw new Error(`No bot assigned for Facebook page ${external_page_id}`);
  }
  return identity;
}
