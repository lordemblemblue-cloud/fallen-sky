-- Game 3D Combat / Quest 16.6 — private durable PvP proof only.
-- Manual migration after 008, 044 and 045. No public interface or grants.
-- An independently verified SERVER result is the only source of an outcome.
CREATE TABLE game3d_private_pvp_outcome_166 (
 receipt_id text PRIMARY KEY
  CHECK(receipt_id ~ '^[A-Za-z0-9_.:-]{8,160}$'),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 counterpart_owner_id text NOT NULL,
 counterpart_character_id text NOT NULL,
 world_instance_id text NOT NULL CHECK(world_instance_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 match_id text NOT NULL CHECK(match_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 encounter_id text NOT NULL CHECK(encounter_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 occurred_at timestamptz NOT NULL,
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[a-f0-9]{64}$'),
 source_kind text NOT NULL CHECK(source_kind='trusted-private-pvp-outcome'),
 committed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 FOREIGN KEY(counterpart_owner_id,counterpart_character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 CHECK(owner_id<>counterpart_owner_id),
 CHECK(character_id<>counterpart_character_id),
 UNIQUE(world_instance_id,encounter_id)
);
CREATE INDEX game3d_pvp_outcome_pair_time_166
 ON game3d_private_pvp_outcome_166
 (owner_id,character_id,counterpart_owner_id,counterpart_character_id,occurred_at);
CREATE TRIGGER game3d_private_pvp_outcome_166_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_pvp_outcome_166
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

CREATE TABLE game3d_private_rival_proof_166 (
 lead_id text NOT NULL CHECK(lead_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 counterpart_owner_id text NOT NULL,
 counterpart_character_id text NOT NULL,
 evidence_kind text NOT NULL CHECK(evidence_kind='trusted-private-pvp-candidate-151'),
 verified_defeats integer NOT NULL CHECK(verified_defeats=3),
 distinct_matches integer NOT NULL CHECK(distinct_matches=3),
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 source_kind text NOT NULL CHECK(source_kind='durable-private-pvp-proof-166'),
 PRIMARY KEY(lead_id),
 UNIQUE(owner_id,character_id,counterpart_owner_id,counterpart_character_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 FOREIGN KEY(counterpart_owner_id,counterpart_character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 CHECK(owner_id<>counterpart_owner_id),
 CHECK(character_id<>counterpart_character_id),
 CHECK(expires_at>issued_at)
);
CREATE TRIGGER game3d_private_rival_proof_166_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_rival_proof_166
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

CREATE TABLE game3d_private_rival_proof_receipt_166 (
 lead_id text NOT NULL REFERENCES game3d_private_rival_proof_166(lead_id),
 receipt_id text NOT NULL REFERENCES game3d_private_pvp_outcome_166(receipt_id),
 proof_order integer NOT NULL CHECK(proof_order BETWEEN 1 AND 3),
 PRIMARY KEY(lead_id,proof_order),
 UNIQUE(lead_id,receipt_id)
);
CREATE TRIGGER game3d_private_rival_proof_receipt_166_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_rival_proof_receipt_166
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();

-- No automated reissue after a decline; exactly one lead per directed pair.
-- No PvP reward, matchmaking, chat, public route or production migration.
