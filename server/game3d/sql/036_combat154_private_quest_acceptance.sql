-- Combat / Quest 15.4 PRIVATE manual migration after migration 035.
-- Pinned accepted quest head + server-owned objective bindings. NO endpoint,
-- rewards, repeated quests, grant statements, or production auto-migration.
-- Refuse pre-existing orphan 15.2 objective bindings: a separate reviewed
-- backfill/migration would be required before applying 036 to such a database.
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM game3d_private_quest_objective_binding_152 LIMIT 1)
 THEN RAISE EXCEPTION '15.4 requires a reviewed quest-binding backfill';
 END IF;
END;$$;

CREATE TABLE game3d_private_quest_acceptance_154 (
 owner_id text NOT NULL,
 character_id text NOT NULL,
 quest_id text NOT NULL CHECK (quest_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
 catalog_revision text NOT NULL CHECK (
  catalog_revision ~ '^[A-Za-z0-9_.:-]{1,80}$'),
 status text NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('accepted','completed','abandoned')),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reward_authorized boolean NOT NULL DEFAULT false
  CHECK (reward_authorized=false),
 PRIMARY KEY(owner_id,character_id,quest_id),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
ALTER TABLE game3d_private_quest_objective_binding_152
 ADD CONSTRAINT game3d_quest_objective_acceptance_154
 FOREIGN KEY(owner_id,character_id,quest_id)
 REFERENCES game3d_private_quest_acceptance_154
 (owner_id,character_id,quest_id);
CREATE INDEX game3d_private_quest_acceptance_owner_154
 ON game3d_private_quest_acceptance_154(owner_id,character_id,status);
-- No public INSERT grants; only the trusted private server writer may bind.
