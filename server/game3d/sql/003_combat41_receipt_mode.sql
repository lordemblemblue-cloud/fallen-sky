-- Combat Foundation 4.1 — PRIVATE BETA PostgreSQL migration.
-- Requires 001 and 002. This does NOT alter Base44 DuelSession.
-- Distinguishes a journal-only receipt from a Base44 projection update.
ALTER TABLE game3d_duel_report_journal
  ADD COLUMN IF NOT EXISTS ack_mode text NOT NULL DEFAULT 'base44-projection'
  CHECK (ack_mode IN ('base44-projection','journal-only'));
