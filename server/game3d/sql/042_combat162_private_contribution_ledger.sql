-- Game 3D 16.2, manual PRIVATE Contribution Points journal (after 040).
-- NOT the browser's twelvesky_contribution_v1, no automatic 10,000 CP seed.
-- Do not activate a public spend endpoint or production migrations.
CREATE TABLE game3d_private_contribution_account_162 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 balance bigint NOT NULL DEFAULT 0 CHECK(balance>=0 AND balance<=9000000000000000),
 lifetime_earned bigint NOT NULL DEFAULT 0 CHECK(lifetime_earned>=0),
 lifetime_spent bigint NOT NULL DEFAULT 0 CHECK(lifetime_spent>=0),
 lifetime_refunded bigint NOT NULL DEFAULT 0 CHECK(lifetime_refunded>=0),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 migration_status text NOT NULL DEFAULT 'legacy-unreconciled'
  CHECK(migration_status='legacy-unreconciled'),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 CHECK(lifetime_refunded<=lifetime_spent),
 CHECK(balance=lifetime_earned-lifetime_spent+lifetime_refunded)
);
CREATE TABLE game3d_private_contribution_event_162 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 operation_id text NOT NULL CHECK(operation_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 kind text NOT NULL CHECK(kind IN ('quest-credit','approved-spend','approved-refund')),
 source_ref text NOT NULL CHECK(source_ref ~ '^[A-Za-z0-9_.:-]{8,160}$'),
 -- For refunds this points to the original approved-spend journal row;
 -- the source kind is fixed by the FK and can never be a quest credit.
 original_kind text,
 amount bigint NOT NULL CHECK(amount BETWEEN 1 AND 1000000),
 balance_after bigint NOT NULL CHECK(balance_after>=0),
 wallet_revision bigint NOT NULL CHECK(wallet_revision>=1),
 source_kind text NOT NULL
  CHECK(source_kind='trusted-private-contribution-operation'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,operation_id),
 UNIQUE(owner_id,character_id,kind,source_ref),
 UNIQUE(owner_id,character_id,kind,operation_id),
 UNIQUE(owner_id,character_id,wallet_revision),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_private_contribution_account_162(owner_id,character_id),
 FOREIGN KEY(owner_id,character_id,original_kind,source_ref)
  REFERENCES game3d_private_contribution_event_162
   (owner_id,character_id,kind,operation_id),
 CHECK(
   (kind='approved-refund' AND original_kind='approved-spend') OR
   (kind<>'approved-refund' AND original_kind IS NULL)
 ),
 CHECK(kind<>'approved-refund' OR operation_id<>source_ref)
);
CREATE INDEX game3d_contribution_events_character_162
 ON game3d_private_contribution_event_162(owner_id,character_id,created_at);
CREATE TRIGGER game3d_contribution_event_162_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_contribution_event_162
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
-- No production GRANT, auto-issue, wallet bridge, client import or currency conversion.
