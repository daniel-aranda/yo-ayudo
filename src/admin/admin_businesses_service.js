// Admin view of every Negocio (organization) and its Cuentas (accounts), across
// all statuses (active/paused/archived), with per-account counts. Grouped queries
// + JS merge (pg-mem-safe; no correlated subqueries). Search + pagination also
// happen in JS over the organizations list: keeps pg-mem compatibility and at
// miles de negocios the grouped aggregates are still cheap.
const DEFAULT_PER_PAGE = 100;
const MIN_PER_PAGE = 10;
const MAX_PER_PAGE = 500;

export async function get_businesses_admin_view(pool, input = {}) {
  const [organizations, accounts, bot_counts, channel_counts, conversation_counts, users] = await Promise.all([
    pool.query("SELECT id, name, slug, status, created_at FROM organizations ORDER BY name"),
    pool.query("SELECT id, organization_id, name, slug, status FROM accounts ORDER BY name"),
    pool.query("SELECT account_id, count(*)::int AS count FROM bots GROUP BY account_id"),
    pool.query("SELECT account_id, count(*)::int AS count FROM whatsapp_phone_numbers WHERE status = 'active' GROUP BY account_id"),
    pool.query("SELECT account_id, count(*)::int AS count FROM conversations GROUP BY account_id"),
    pool.query(
      "SELECT id, organization_id, name, email, role FROM users WHERE status = 'active' AND organization_id IS NOT NULL ORDER BY name",
    ),
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

  const q = String(input.q ?? "").trim();
  const q_lower = q.toLowerCase();
  const matching = q_lower
    ? organizations.rows.filter(
        (organization) =>
          String(organization.name ?? "").toLowerCase().includes(q_lower) ||
          String(organization.slug ?? "").toLowerCase().includes(q_lower),
      )
    : organizations.rows;

  const per_page_raw = Number.parseInt(input.per_page, 10);
  const per_page = Math.min(
    Math.max(Number.isFinite(per_page_raw) && per_page_raw > 0 ? per_page_raw : DEFAULT_PER_PAGE, MIN_PER_PAGE),
    MAX_PER_PAGE,
  );
  const total_pages = Math.max(Math.ceil(matching.length / per_page), 1);
  const page_raw = Number.parseInt(input.page, 10);
  const page = Math.min(Math.max(Number.isFinite(page_raw) && page_raw > 0 ? page_raw : 1, 1), total_pages);

  const users_by_org = new Map();
  for (const user of users.rows) {
    const list = users_by_org.get(user.organization_id) ?? [];
    list.push(user);
    users_by_org.set(user.organization_id, list);
  }

  const businesses = matching.slice((page - 1) * per_page, page * per_page).map((organization) => ({
    ...organization,
    accounts: accounts_by_org.get(organization.id) ?? [],
    users: users_by_org.get(organization.id) ?? [],
  }));

  const totals = {
    businesses: organizations.rows.length,
    active_businesses: organizations.rows.filter((organization) => organization.status === "active").length,
    accounts: accounts.rows.length,
  };

  return {
    businesses,
    totals,
    filters: { q },
    pagination: {
      page,
      per_page,
      total: matching.length,
      total_pages,
      has_prev: page > 1,
      has_next: page < total_pages,
    },
  };
}
