-- A bot belongs to an account, and the account belongs to an organization, so a bot's
-- organization_id must always match its account's organization_id. Older seed runs left
-- some bots pointing at a different (now archived) organization, which made them vanish
-- from the inspector (joins org via bots.organization_id) while still showing in the
-- dashboard (lists by account_id). Re-sync them to the account's organization.
UPDATE bots
SET organization_id = accounts.organization_id, updated_at = now()
FROM accounts
WHERE accounts.id = bots.account_id
  AND bots.organization_id <> accounts.organization_id;
