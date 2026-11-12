-- Combat / Quest 16.4: PRIVATE mutual-consent Rival / Friendly Rival
-- invitation records. Manual migration after canonical 008. NO rewards,
-- matchmaking, public endpoint, meeting, PvP standing or chat moderation.
CREATE TABLE game3d_private_rival_invitation_164 (
 lead_id text PRIMARY KEY CHECK (lead_id ~ '^[A-Za-z0-9_.:-]{8,128}$'),
 initiator_owner_id text NOT NULL,
 initiator_character_id text NOT NULL,
 counterpart_owner_id text NOT NULL,
 counterpart_character_id text NOT NULL,
 evidence_kind text NOT NULL
  CHECK (evidence_kind='trusted-private-pvp-candidate-151'),
 verified_defeats integer NOT NULL CHECK (verified_defeats BETWEEN 3 AND 100),
 distinct_matches integer NOT NULL CHECK (distinct_matches BETWEEN 3 AND 100),
 evidence_digest text NOT NULL CHECK (evidence_digest ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending','rival','friendly_rival','declined','disputed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(initiator_owner_id,initiator_character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 FOREIGN KEY(counterpart_owner_id,counterpart_character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id),
 CHECK (initiator_owner_id<>counterpart_owner_id),
 CHECK (initiator_character_id<>counterpart_character_id)
);
CREATE TABLE game3d_private_rival_choice_164 (
 lead_id text NOT NULL
  REFERENCES game3d_private_rival_invitation_164(lead_id),
 actor_role text NOT NULL CHECK (actor_role IN ('initiator','counterpart')),
 owner_id text NOT NULL,
 character_id text NOT NULL,
 choice text NOT NULL CHECK (choice IN ('rival','friendly_rival','decline')),
 selected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(lead_id,actor_role),
 FOREIGN KEY(owner_id,character_id)
  REFERENCES game3d_trusted_character(owner_id,character_id)
);
CREATE TRIGGER game3d_private_rival_choice_164_immutable
 BEFORE UPDATE OR DELETE ON game3d_private_rival_choice_164
 FOR EACH ROW EXECUTE FUNCTION game3d_item_provenance_immutable();
CREATE INDEX game3d_private_rival_initiator_164 ON
 game3d_private_rival_invitation_164(initiator_owner_id,initiator_character_id);
CREATE INDEX game3d_private_rival_counterpart_164 ON
 game3d_private_rival_invitation_164(counterpart_owner_id,counterpart_character_id);
-- No unilateral conversion of an ignored suggestion to a relationship.
-- A future reviewed server lead resolver must attest the real PvP evidence.
-- Never run this on production without independent grants and review.
