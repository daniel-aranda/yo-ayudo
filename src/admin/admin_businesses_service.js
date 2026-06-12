// Admin view of every Negocio (organization) and its Cuentas (accounts), across
// all statuses (active/paused/archived), with per-account counts. Grouped queries
// + JS merge (pg-mem-safe; no correlated subqueries).
export async function get_businesses_admin_view(pool) {
  const [organizations, accounts, bot_counts, channel_counts, conversation_counts] = await Promise.all([
    pool.query("SELECT id, name, slug, status, created_at FROM organizations ORDER BY name"),
    pool.query("SELECT id, organization_id, name, slug, status FROM accounts ORDER BY name"),
    pool.query("SELECT account_id, count(*)::int AS count FROM bots WHERE status = 'active' GROUP BY account_id"),
    pool.query("SELECT account_id, count(*)::int AS count FROM whatsapp_phone_numbers WHERE status = 'active' GROUP BY account_id"),
    pool.query("SELECT account_id, count(*)::int AS count FROM conversations GROUP BY account_id"),
  ]);

  const index_by_account = (rows) => {
    const map = new Map();
    for (const row of rows) {
      map.set(row.account_id, row.count);
    }
    return map;
  };
  const bots_by_account = index_by_account(bot_counts.rows);
  const channels_by_account = index_by_account(channel_counts.rows);
  const conversations_by_account = index_by_account(conversation_counts.rows);

  const accounts_by_org = new Map();
  for (const account of accounts.rows) {
    const list = accounts_by_org.get(account.organization_id) ?? [];
    list.push({
      ...account,
      bot_count: bots_by_account.get(account.id) ?? 0,
      channel_count: channels_by_account.get(account.id) ?? 0,
      conversation_count: conversations_by_account.get(account.id) ?? 0,
    });
    accounts_by_org.set(account.organization_id, list);
  }

  const businesses = organizations.rows.map((organization) => ({
    ...organization,
    accounts: accounts_by_org.get(organization.id) ?? [],
  }));

  const totals = {
    businesses: organizations.rows.length,
    active_businesses: organizations.rows.filter((organization) => organization.status === "active").length,
    accounts: accounts.rows.length,
  };

  return { businesses, totals };
}
