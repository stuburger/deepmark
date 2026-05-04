-- Phase 6 migration · Run AFTER `2026-05-03-01-seed-trial-grants.sql`.
--
-- Backfills a `consume: -1` ledger entry for every historically-completed
-- grading_run, so that each user's balance after migration reflects their
-- actual usage (`trial_grant +20` minus completed runs).
--
-- Effect per user:
--   * Trial-cap unused        → balance > 0, can still mark
--   * Exactly at trial cap    → balance == 0, blocked until purchase
--   * Heavy historical usage  → balance < 0, treated as exhausted
--
-- Admins skip the entitlement check entirely (their consume rows are written
-- but ignored). Active Pro subscribers will get a fresh subscription_grant on
-- their next invoice.payment_succeeded webhook — until then they see their
-- trial-grant bridge balance.
--
-- Idempotent via `NOT EXISTS` AND the schema's `@@unique([kind, grading_run_id])`
-- constraint. Safe to re-run.
--
-- `period_id` is NULL on every backfilled row — we don't know retroactively
-- which billing period the historical run drew against, and these all pre-date
-- the metered-Pro era, so NULL is correct.
--
-- Wrapped in BEGIN/COMMIT so a partial failure rolls back cleanly. The single
-- INSERT is implicitly transactional in Postgres anyway, but the explicit
-- wrapper makes the intent clear and protects against any future addition of
-- a second statement to this file.
--
-- See: docs/build-plan-2026-05-02-pricing-restructure.md (Phase 6).

BEGIN;

INSERT INTO paper_ledger (id, user_id, papers, kind, grading_run_id, created_at)
SELECT
  'cn_' || substring(md5(random()::text || gr.id) FROM 1 FOR 24),
  s.uploaded_by,
  -1,
  'consume',
  gr.id,
  COALESCE(gr.completed_at, gr.started_at, now())
FROM grading_runs gr
JOIN student_submissions s ON s.id = gr.submission_id
WHERE gr.status = 'complete'
  AND s.uploaded_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM paper_ledger pl
    WHERE pl.grading_run_id = gr.id
      AND pl.kind = 'consume'
  );

COMMIT;
