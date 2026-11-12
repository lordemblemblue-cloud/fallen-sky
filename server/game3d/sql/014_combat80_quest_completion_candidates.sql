-- Combat 8.0: optional PRIVATE BETA, manual migration 014.
-- Apply after 001-013 on disposable DB, never public deployment.
-- Do NOT backfill from browser Character Vault or client quest state.
CREATE TABLE IF NOT EXISTS game3d_quest_completion_evidence (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 quest_id text NOT NULL CHECK(quest_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 instance_id text NOT NULL CHECK(instance_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 quest_policy_version text NOT NULL CHECK(length(quest_policy_version) BETWEEN 1 AND 160),
 journal_digest text NOT NULL CHECK(journal_digest ~ '^[a-f0-9]{64}$'),
 objective_digest text NOT NULL CHECK(objective_digest ~ '^[a-f0-9]{64}$'),
 source_authenticity text NOT NULL
   CHECK(source_authenticity='pending_simulation_attestation'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(owner_id,character_id,quest_id,instance_id),
 FOREIGN KEY(owner_id,character_id)
 REFERENCES game3d_trusted_character(owner_id,character_id)
);
-- All rows remain unverified *candidates* until a separate server-owned
-- world simulation/identity attester is implemented. Never pay rewards.
CREATE TRIGGER game3d_quest_completion_evidence_immutable
 BEFORE UPDATE OR DELETE ON game3d_quest_completion_evidence
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
