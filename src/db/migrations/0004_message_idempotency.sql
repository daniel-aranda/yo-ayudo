-- Idempotency for inbound WhatsApp messages.
-- Meta's WhatsApp Cloud API delivers webhooks at-least-once, so the same
-- inbound message can arrive more than once (especially if our ack is slow).
-- Without a guard, each redelivery would store a new message row and re-run
-- the whole pipeline, double-counting operations (e.g. a sale registered twice).
-- This partial unique index makes a redelivered inbound message_id a hard
-- conflict at the DB layer; the application layer also short-circuits early.
CREATE UNIQUE INDEX IF NOT EXISTS messages_inbound_external_id_unique
  ON messages (external_message_id)
  WHERE external_message_id IS NOT NULL AND direction = 'inbound';
