-- Phase 6 migration · Run AFTER `bun db:push` lands the new Plan/LedgerEntryKind
-- enums + paper_ledger table on the target stage.
--
-- Seeds the `trial_grant: +20` ledger entry for every existing User. New users
-- created after this point get their trial_grant via `seedTrialGrant()` in
-- `packages/backend/src/auth.ts` — this migration is just for the historical gap.
--
-- Idempotent via `NOT EXISTS` — safe to re-run. Trial cap is hardcoded at 20
-- (matches `Resource.StripeConfig.trialPaperCap` in `infra/billing.ts`); if
-- you ever change the trial cap, this file is a one-shot record of what was
-- granted historically and should NOT be re-run with a different value.
--
-- Wrapped in BEGIN/COMMIT so a partial failure rolls back cleanly. The single
-- INSERT is implicitly transactional in Postgres anyway, but the explicit
-- wrapper makes the intent clear and protects against any future addition of
-- a second statement to this file.
--
-- See: docs/build-plan-2026-05-02-pricing-restructure.md (Phase 6).

BEGIN;

INSERT INTO paper_ledger (id, user_id, papers, kind, created_at)
SELECT
  'tg_' || substring(md5(random()::text || users.id) FROM 1 FOR 24),
  users.id,
  20,
  'trial_grant',
  now()
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM paper_ledger
  WHERE paper_ledger.user_id = users.id
    AND paper_ledger.kind = 'trial_grant'
);

COMMIT;
