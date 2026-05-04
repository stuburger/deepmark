# Deploy Runbook — Pricing Restructure (Phase 6)

Companion to `docs/build-plan-2026-05-02-pricing-restructure.md`. Use this when you're ready to land Phases 1-5 on a deployed stage.

---

## Before you start

- This project uses `bun db:push` (NOT Prisma Migrate). The two SQL files in `packages/db/prisma/` are one-shot data backfills, not Prisma migrations. They are run **manually** after `db:push`.
- `db:push` will fail loudly if any existing row holds a `User.plan` string that's not in the new `Plan` enum. Per-stage check first (see "Pre-flight" below).
- Both SQL files are idempotent — safe to re-run if anything fails partway.
- All Stripe-side resources (Top-up product, Limitless product, PPU product, founders coupon update) land via `sst deploy` automatically. No manual Stripe console work.

---

## Files involved

| Path | Purpose |
|---|---|
| `packages/db/prisma/2026-05-03-01-seed-trial-grants.sql` | One row per existing User: `trial_grant: +20`. Idempotent via `NOT EXISTS`. |
| `packages/db/prisma/2026-05-03-02-backfill-consume-rows.sql` | One row per `grading_runs.status = 'complete'`: `consume: -1`. Idempotent via `NOT EXISTS` + `@@unique([kind, grading_run_id])`. |

---

## Pre-flight (per stage, BEFORE db:push)

Confirm no existing User row has a `plan` value outside the new enum (`pro_monthly`, `limitless_monthly`). Without this check, `db:push` aborts on the first bad value.

```sql
-- Acceptable: NULL, 'pro_monthly', 'limitless_monthly'
-- Anything else needs a manual conversion before db:push.
SELECT plan, COUNT(*) AS user_count
FROM users
GROUP BY plan
ORDER BY user_count DESC;
```

If you see `pro_annual` or anything else, decide per row: convert to `pro_monthly` (same entitlement, different cadence — that's how the webhook translates new subscriptions today) or NULL out the legacy plan.

---

## Per-stage execution

The order is identical for every stage. Repeat this block for `stuartbourhill` (your dev branch), then `development` (shared dev), then `production`.

### 1. Deploy the schema + Stripe-side resources

```bash
AWS_PROFILE=deepmark npx sst deploy --stage=<stage>
```

This runs `db:push` automatically (via the `db:push` target wired into the deploy hook) and creates the new Stripe Products + Prices: `LimitlessProduct`, `PpuProduct`, `TopUpProduct`. `sst-env.d.ts` is regenerated with the new `StripeConfig` shape.

### 2. Run the trial-grant seed

Find the right Neon branch:
- **production** → main branch (no `branchId` parameter; the default works)
- non-production → branch named after the SST stage (look up the branch ID via `mcp__Neon__list_branch_computes` or the Neon console)

Then run:

```bash
# Via psql against the stage's connection string:
psql "$DATABASE_URL" -f packages/db/prisma/2026-05-03-01-seed-trial-grants.sql
```

Or via the Neon MCP, paste the file's contents into `mcp__Neon__run_sql` with the right `branchId`.

Verify:

```sql
SELECT COUNT(*) FROM paper_ledger WHERE kind = 'trial_grant';
-- Should match: SELECT COUNT(*) FROM users;
```

### 3. Run the consume backfill

```bash
psql "$DATABASE_URL" -f packages/db/prisma/2026-05-03-02-backfill-consume-rows.sql
```

Verify:

```sql
SELECT
  (SELECT COUNT(*) FROM paper_ledger WHERE kind = 'consume') AS consume_rows,
  (SELECT COUNT(*) FROM grading_runs gr JOIN student_submissions s ON s.id = gr.submission_id WHERE gr.status = 'complete' AND s.uploaded_by IS NOT NULL) AS expected_count;
-- These two numbers should now match.
```

### 4. Smoke test from the app

For each stage with users:
- Visit `/teacher/billing` — trial users should show their post-backfill balance correctly.
- Submit a small batch (1-3 papers) → confirm the new reserve-on-submit consume rows land in `paper_ledger` with `kind = 'consume'` AND that the marking pipeline still runs end-to-end.
- For active Pro subscribers: their billing page will show "Setting up your allowance — refresh in a minute" until the next `invoice.payment_succeeded` webhook lands a `subscription_grant` row. They retain marking access via the trial_grant bridge in the meantime.

---

## Post-deploy

- Founders coupon update (40% / 6mo, was 50% / 12mo): existing redemptions keep their original terms (Stripe attaches at redemption time). Any new founders signups get the new terms.
- The Webhook Endpoint URL doesn't change between deploys — Stripe keeps using the same per-stage URL.

---

## What to do if it goes wrong

| Symptom | Fix |
|---|---|
| `db:push` aborts on a bad `plan` value | Run the pre-flight SQL, manually convert the offending row(s), retry. |
| Trial-grant SQL inserts 0 rows | Re-check the `NOT EXISTS` condition matched — every user already has a trial_grant. No-op success. |
| Consume backfill conflicts with `@@unique([kind, grading_run_id])` | Already inserted (probably from local testing). The constraint plus `NOT EXISTS` make this a no-op success. |
| User reports "out of papers" surprise after deploy | Their historical usage exceeded the trial cap. Issue an admin grant via `/admin/credits` with a goodwill note. |
| Active Pro subscriber sees no allowance meter | Expected until their next Stripe invoice fires. If urgent, manually trigger an invoice via the Stripe dashboard. |

---

## Stage-by-stage status (fill in as you deploy)

| Stage | Schema pushed | Trial-grants seeded | Consume backfilled | Smoke-tested |
|---|---|---|---|---|
| `stuartbourhill` | ✅ (was already live) | ✅ 2026-05-03 (7 rows) | ✅ 2026-05-03 (109 rows) | |
| `development` | | | | |
| `production` | | | | |

### stuartbourhill — post-migration balance shape

Verified via `SUM(papers) GROUP BY user_id` after both backfills. Distribution is what the runbook predicted:

| User | Role | trial_grant | consumes | Balance | Entitlement |
|---|---|---|---|---|---|
| stuburger@gmail.com | admin | +20 | -108 | **-88** | Uncapped (admin bypasses ledger) |
| test+kai-jassi@deepmark.test | teacher | +20 | -1 | **19** | Metered, 19 papers left of trial |
| All other 5 users | mixed | +20 | 0 | **20** | Metered, full trial available |

Net: heavy historical testing on Stu's admin account = -88 balance, irrelevant because admin role short-circuits the entitlement check. Real teachers (test fixtures + fwdcheck) all start with their full trial allowance. **Exactly what the build plan predicted** — no surprises.
