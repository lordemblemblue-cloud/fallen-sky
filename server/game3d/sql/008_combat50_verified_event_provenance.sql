-- Combat Foundation 5.0: PRIVATE DISPOSABLE BETA only; run after 001-007.
-- Separate trusted-event provenance from browser-synced Character Vault.
-- These tables are NOT populated from Character Vault or Base44 upgrade rows.
-- Actual server gameplay event issuer is NOT connected in 5.0.
CREATE TABLE IF NOT EXISTS game3d_trusted_character (
  owner_id text NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 160),
  character_id text NOT NULL CHECK(length(character_id) BETWEEN 1 AND 128),
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
  xp_total bigint NOT NULL DEFAULT 0 CHECK(xp_total>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(owner_id,character_id)
);
CREATE TABLE IF NOT EXISTS game3d_trusted_grant_event (
  event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 160),
  owner_id text NOT NULL,
  character_id text NOT NULL,
  event_type text NOT NULL CHECK(event_type IN ('xp','item_mint')),
  event_digest text NOT NULL CHECK(event_digest ~ '^[a-f0-9]{64}$'),
  provenance text NOT NULL CHECK(provenance='verified-gameplay-event'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(owner_id,character_id)
    REFERENCES game3d_trusted_character(owner_id,character_id),
  UNIQUE(event_id,owner_id,character_id,event_type)
);
CREATE INDEX IF NOT EXISTS game3d_trusted_events_character_idx
  ON game3d_trusted_grant_event(owner_id,character_id,created_at);
CREATE TABLE IF NOT EXISTS game3d_trusted_item (
  item_instance_id text PRIMARY KEY CHECK(length(item_instance_id) BETWEEN 1 AND 160),
  mint_event_id text NOT NULL UNIQUE
    REFERENCES game3d_trusted_grant_event(event_id),
  owner_id text NOT NULL,
  character_id text NOT NULL,
  blueprint_id text NOT NULL CHECK(blueprint_id='training-blade-preview-v1'),
  item_state text NOT NULL DEFAULT 'owned' CHECK(item_state='owned'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(owner_id,character_id)
    REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE INDEX IF NOT EXISTS game3d_trusted_items_character_idx
  ON game3d_trusted_item(owner_id,character_id,item_instance_id);
-- No public XP/item authorizer and no spend, transfer, equip, sale or
-- reward issuance procedure is installed by this migration.
