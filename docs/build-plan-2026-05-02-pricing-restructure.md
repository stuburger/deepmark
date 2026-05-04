# Build Plan — Pricing Restructure (2026-05-02)

Implement Geoff's "Pricing Strategy — Tiers, Margins & Psychology" doc as the new source of truth. Replace the current single-tier Pro subscription (£24/mo, founders £12, unlimited) with a four-product ladder: PPU pack, Pro capped subscription with 6-month founders' lock-in, in-app top-ups, and a Limitless tier.

**Source of truth.** Geoff's pricing doc (May 2026) is canonical. Any disagreement between this build plan and the doc resolves to the doc. Quoted summary below.

---

## The pricing ladder (canonical)

| Product | Price | Cadence | Cap | Notes |
|---|---|---|---|---|
| **Pay-per-use** | £10 / set | one-off | 30 papers per set | No subscription, no expiry on this version (revisit after launch). On-ramp / occasional use. |
| **Pro — founders** | £14.50 / mo (40% off) | recurring, **6-month lock-in** | 60 papers / month | Locked at £14.50 for 6 months, then transitions to £24/mo. First 100 teachers. |
| **Pro — standard** | £24 / mo | recurring | 60 papers / month | Post-founders price. Public anchor. |
| **Top-up** | £6.50 | one-off, in-app only | +15 papers (TBC — see open questions) | Surfaced inside the app when a Pro user nears or hits the monthly cap. Not on the public pricing page. |
| **Limitless** | £49 / mo | recurring | unlimited | Power users, exam-season heavy, or schools wanting one teacher on truly uncapped. |

**Geoff's psychology summary** (verbatim, captured for posterity):

> The jumps between tiers are self-evident to the teacher at every stage:
> - PPU → Pro founders: "£10 for one set, or £14.50 for a whole month?" — the subscription sells itself.
> - Pro → top-up: Exam season hits, they spend £6.50 once or twice. Do it twice and they've spent £27–28 that month. Limitless at £49 starts looking rational.
> - Founders lock-in: £14.50 for 6 months builds deep dependency. When it expires at £24, they can't live without it — the price increase lands on an already-converted user.
> - 60-paper cap: Feels generous most of the year (2 full class sets). During crunch it generates top-up revenue from teachers who are most stressed and least price-sensitive — exactly when they're most grateful for the product.

**Decisions already made** (do not relitigate):

| Question | Decision |
|---|---|
| Annual subs on the public pricing page? | **No.** Caps make annual psychologically awkward (pre-paying for ghost capacity). Keep annual Stripe Prices in infra for B2B sales / post-conversion upgrade nudge later. |
| Founders cohort length? | **6 months**, not 12 (was previously 12 in shipped infra). |
| Founders discount magnitude? | **40% off** (£24 → £14.40 with `percent_off: 40`). Marketing copy rounds to £14.50; the 10p delta is acceptable accounting drift. |
| Limitless tier on launch page? | **Yes**, third card alongside PPU and Pro. Even if usage is low, it anchors the value of Pro and gives heavy users an upgrade path. |
| Top-up on the public pricing page? | **No.** Top-ups are an in-app upsell when the Pro cap bites. Surfacing them on the public page muddles the ladder. |
| Existing Pro subscribers (currently uncapped at £24)? | **N/A — no paid users yet.** Decision originally was to grandfather, but as of 2026-05-03 there are zero subscribers on the old plan, so the `pro_monthly_grandfathered` enum value + Phase 6 conversion SQL were removed. If a paid user appears before launch, restore the grandfather path. |
| Per-exam scoping for PPU sets? | **Deferred.** See "Deferred design decisions" below. |

**Open questions** (need Geoff to confirm before finalising):

1. **Top-up size.** Doc shows £6.50 with no quantity. Inferred 15 papers (£0.43/paper, slightly more expensive than PPU's £0.33 — friction-free convenience premium). **Confirm before wiring the Stripe Price.**
2. **PPU expiry.** Currently the build plan assumes no expiry. Geoff's earlier psychology might want a 90-day expiry to nudge re-engagement. **Confirm before launch — no expiry is the safer initial position.**
3. **Limitless founders pricing.** Does Limitless also get a 6-month founders' discount, or is £49 the launch price? Default: no founders discount on Limitless. Reason: it's the premium ceiling; discounting it weakens the anchor.
4. **USD prices** for new tiers. Existing convention is GBP × 1.25 → USD. Top-up £6.50 → $8.50. Limitless £49 → $62. Round to nearest dollar at marketing's discretion.

---

## Deferred design decisions

### Per-exam scoping for PPU credits — deferred (revisit post-launch)

Geoff's hypothesis is that teachers think in "marking sessions" — a sit-down to mark *this exam's* class set. That maps naturally to scoping a PPU set to a single `exam_paper_id`: buy 30 papers, they only mark scripts against the QP/MS pair you bought them for.

**Decision: don't ship this in v1.** Reasons:

1. **No usage signal yet.** The gaming pattern scoping prevents (1 script across 30 different exams) may never materialize in practice. Ship the simpler model, see what happens.
2. **The migration path later is cheap.** New schema column would be `exam_paper_id String?` on `paper_ledger`. Existing PPU rows stay NULL = legacy unscoped (same grandfather pattern as plans). No backfill, no Stripe refund dance.
3. **The hard part — drawing-order logic in consume insertion (draw scoped pool first, fall through to unscoped) — has to be built into reserve-on-submit either way.** Doing it later is the same bill, not a bigger one.
4. **Top-ups must stay unscoped regardless.** A Pro subscriber buying a £6.50 top-up to clear a cap-bite is in a cross-exam mental model (their subscription is cross-exam). Scoping top-ups would be a UX gotcha (stranded leftovers on the wrong exam). Even if PPU eventually gets scoped, the asymmetry is deliberate and correct: PPU = "buy a marking session", subscription/top-up = "extend monthly capacity".

**Two micro-decisions in Phase 4.5 to keep the door open** (zero cost if scoping never ships, saves 1-2 hours of grep-and-rename if it does):

- Reserve-on-submit's consume-insert function should take a batch context (`{ batchId }`), not a flat `(userId, count)`. The batch already knows its `exam_paper_id`; passing the batch lets a future scoping change be one query, not every caller rewritten.
- Name the cross-exam balance helper `getSharedBalance(userId)` rather than `getBalance(userId)`. When `getExamBalance(userId, examPaperId)` lands, the names compose without a rename of the existing one.

**Stranded-credit policy is the only real product question** when (if) we revisit. PPU buyer marks 22 of 30 → 8 left forever on the wrong exam? Either: short PPU expiry (90d nudges re-engagement), or "convert remaining to top-up credit" UI button. Worth a five-minute Geoff conversation before committing.

---

## Data layer principles

These constraints govern every schema/code decision in Phases 2-4. They exist because the obvious shortcut (a denormalised `papers_used_this_period` counter on the User row, plus a separate ledger for purchased credits) creates two sources of truth that desync — race conditions on increment, drift if a webhook fails. Pick one model and stick to it.

1. **Single ledger, no denormalised counters.** Every paper-affecting event is a row in `paper_ledger`. Trial grants, subscription period grants, PPU purchases, top-ups, consumptions, refunds, period expiries — all of them. There is no `papers_used_this_period` counter, no `papers_balance` cache. Balance and usage are always computed from `SUM(papers)` over the relevant slice. With proper indexes the cost is one indexed lookup; cheaper than the cost of keeping a counter correct.

2. **Pools via `period_id`.** Subscription papers expire at period rollover; PPU and trial papers don't. Distinguish with a `period_id` field: subscription_grants and consumes against subscription credit carry the Stripe invoice id; PPU/topup/trial entries leave it null. At rollover, a `period_expiry` entry zeroes any unused subscription papers from the previous period — a single SQL operation that preserves the "balance = SUM" invariant globally.

3. **Prisma enums for plan and ledger entry kind.** Stringly-typed `plan = "pro_monthly_capped"` and `reason = "consume:batch:<id>"` are exactly the kind of thing that gets typo'd in a webhook handler at 11pm. Use `Plan` and `LedgerEntryKind` enums; the database refuses bad values, the code gets exhaustive switch checks.

4. **Per-grading-run idempotency.** Consumption ledger entries carry `grading_run_id` (UNIQUE). Refunds reverse a specific grading_run_id. This makes partial-batch failures correct — if 20/30 scripts succeed, only 20 ledger entries exist; refund logic operates per failed run, not per batch.

5. **Trial folds into the ledger.** A new user gets a single `trial_grant: +20` entry on User creation. Trial-cap enforcement is then the same code path as paid-credit enforcement (check `SUM >= N`). No parallel `countCompletedGradingRuns` system to maintain.

6. **Founders' state stays in Stripe.** Don't snapshot `founders_started_at` on User. Stripe's `subscription.discount.start` is canonical; read it from the cached subscription state when needed. One less reconciliation surface.

7. **Foreign keys, not strings.** `grading_run_id`, `stripe_invoice_id`, `stripe_session_id` are real fields with `@unique` constraints and (where applicable) declared relations. The DB enforces referential integrity; idempotency is enforced by the unique indexes, not by application logic that can race.

8. **Period bounds snapshotted on grant rows.** `subscription_grant` carries `period_starts_at` / `period_ends_at` from the Stripe invoice line at grant time. Decouples "what period are we in for this grant" from a Stripe round-trip, and is the seam for future annual/quarterly cadence: a single annual invoice can later produce 12 monthly grants by varying these bounds inside one cron loop. Cap value is implicit in `papers` on the same row — no separate `cap` column.

9. **No JSON columns for raw Stripe payloads.** Stable IDs (`stripe_session_id`, `stripe_invoice_id`) are pointers; raw payloads can be re-fetched on demand. Webhook handlers log the event id + action — that's the audit trail. JSON storage would be ~5-50KB per ledger entry of defensive engineering against a problem we don't have. Stripe Dashboard retains events for 30 days for ad-hoc debugging during launch.

---

## Implementation phases

Phase order matches deploy risk: lowest-risk UI first (visible to users, easy to revert), then schema + Stripe + entitlement (the load-bearing rework), then in-app top-up surface.

### Phase 0 — Public pricing page restructure (UI only) — ✅ DONE 2026-05-02

**Status:** in flight 2026-05-02, separate from this plan. Lands the visible ladder so Geoff can validate copy before the heavy backend work begins.

Files touched:
- `apps/web/src/app/(marketing)/pricing/page.tsx` — switch to 3-card grid (PPU / Pro / Limitless), strip annual toggle, new headline, new explainer copy
- `apps/web/src/app/(marketing)/_components/pricing-tiers.tsx` — convert to a single `ProCard` component (no interval toggle, shows 60-paper cap, "founders 40% off, locked 6 months" badge)
- `apps/web/src/app/(marketing)/_components/limitless-card.tsx` — new, mirrors `PpuCard` pattern with "Available soon" CTA until Stripe wiring lands
- `apps/web/src/app/(marketing)/_components/ppu-card.tsx` — keep as-is (already at £10/$13, "Available soon")

No infra change in this phase. PPU and Limitless show informational pricing only.

### Phase 1 — Stripe infra (`infra/billing.ts`) — ✅ DONE 2026-05-02

(Founders coupon 40% / 6 months done; `proPaperCap: 60` added to StripeConfig; `charge.refunded` event subscribed. Limitless / PPU / top-up Stripe Products + Prices NOT yet created — picked up in Phase 5 when checkout flows land.)

**Subscription products:**

```ts
// Existing — UPDATE
const proGbpMonthly: 2400  // £24 (already done)
const proUsdMonthly: 3000  // $30 (already done)

// Existing — KEEP IN INFRA, REMOVE FROM PUBLIC UI
proGbpAnnual / proUsdAnnual stay defined for B2B sales + post-conversion upgrades.

// NEW — Limitless tier
const limitlessGbpMonthly = new stripe.Price("LimitlessGbpMonthly", {
  product: limitlessProduct.id,
  unitAmount: 4900, // £49
  currency: "gbp",
  recurring: { interval: "month", intervalCount: 1 },
})
const limitlessUsdMonthly = new stripe.Price("LimitlessUsdMonthly", {
  product: limitlessProduct.id,
  unitAmount: 6200, // $62
  currency: "usd",
  recurring: { interval: "month", intervalCount: 1 },
})
```

**One-off products:**

```ts
// NEW — PPU set (informational price, not yet checkout-wired in Phase 0)
const ppuProduct = new stripe.Product("PpuProduct", {
  name: "DeepMark — 1 set (30 papers)",
  description: "One question paper, up to 30 student scripts.",
})
const ppuGbpPerSet: 1000  // £10
const ppuUsdPerSet: 1300  // $13

// NEW — Top-up (in-app only)
const topUpProduct = new stripe.Product("TopUpProduct", {
  name: "DeepMark — top-up (15 papers)",  // CONFIRM 15
  description: "Add 15 papers to your monthly Pro allowance.",
})
const topUpGbp: 650   // £6.50
const topUpUsd: 850   // $8.50
```

**Founders coupon — UPDATE:**

```ts
const foundersCoupon = new stripe.Coupon("FoundersCoupon", {
  name: "Founders' offer — 40% off, 6 months",
  percentOff: 40,                 // was 50
  duration: "repeating",
  durationInMonths: 6,            // was 12
  maxRedemptions: FOUNDERS_SLOT_LIMIT,  // unchanged at 100
})
```

**StripeConfig Linkable** — add `limitless`, `ppu`, `topUp` alongside existing `pro`. Schema:

```ts
plans: {
  pro: { ... existing ... },
  limitless: {
    name: "Limitless",
    prices: { gbp: { monthly: { id: ..., amount: 4900 } }, usd: { ... } },
  },
},
ppu: { gbp: { id: ..., amount: 1000 }, usd: { ... } },
topUp: { gbp: { id: ..., amount: 650 }, usd: { ... } },
proPaperCap: 60,
ppuPapersPerSet: 30,
topUpPapersPerPurchase: 15,
foundersDurationMonths: 6,
```

### Phase 2 — Schema (`packages/db/prisma/schema.prisma`) — ✅ DONE 2026-05-02

(Plan + LedgerEntryKind enums added; `PaperLedgerEntry` model with all fields including `period_starts_at`/`period_ends_at` and `granted_by_user_id`/`note`; compound unique `[kind, grading_run_id]`. `db:push` NOT yet run against any deployed stage — that's a deploy step gated on Phase 6 SQL for production.)

**Plan as a Prisma enum** (replaces existing `String?` field on User):

```prisma
enum Plan {
  pro_monthly         // capped at 60 papers/month, current product
  limitless_monthly   // uncapped paid tier
}
```

(`pro_monthly_grandfathered` was originally planned for legacy uncapped subscribers but removed 2026-05-03 — no paid users existed yet to grandfather. Add it back if a paid customer appears before the cutover.)

**User table changes:**

```prisma
model User {
  // ... existing ...

  /// Active subscription plan. NULL = no active sub (trial / PPU-only).
  plan  Plan?

  // REMOVED (intentional): no `papers_used_this_period` counter — compute
  // from the ledger.
  // REMOVED (intentional): no `founders_started_at` — derive from
  // Stripe subscription's `discount.start` when needed.

  // KEEP: `current_period_end` — useful for "when does my Pro period end"
  // without a Stripe round-trip. Already exists on the model.
}
```

**Ledger entry kind enum:**

```prisma
enum LedgerEntryKind {
  trial_grant           // +20 papers, seeded on User creation
  subscription_grant    // +N papers, on invoice.payment_succeeded for capped plan
  period_expiry         // -N papers, zeroes prior period's unused subscription papers
  purchase_ppu          // +30 papers per set, on PPU checkout completion
  purchase_topup        // +15 papers, on top-up checkout completion
  consume               // -1 paper per grading run
  refund                // +1 paper per failed/refunded grading run
  admin_grant           // +N papers, manual support grant (audit trail)
}
```

**The ledger:**

```prisma
model PaperLedgerEntry {
  id                String           @id @default(cuid())
  user_id           String
  user              User             @relation(fields: [user_id], references: [id])

  /// Signed paper count. +ve = grant, -ve = consumption or expiry.
  papers            Int

  /// What kind of ledger event this is. Determines which idempotency key
  /// applies and how the row is interpreted.
  kind              LedgerEntryKind

  /// Stripe Checkout Session id — set on `purchase_ppu` and `purchase_topup`
  /// only. UNIQUE so webhook replay is a no-op.
  stripe_session_id String?          @unique

  /// Stripe Invoice id — set on `subscription_grant` (the invoice that paid
  /// for this period) and `period_expiry` (the invoice whose rollover
  /// expired the previous period). UNIQUE so webhook replay is a no-op.
  stripe_invoice_id String?          @unique

  /// Grading run id — set on `consume` and `refund`. UNIQUE on consume so
  /// a retried grading_run can't double-debit. Refunds reverse a specific
  /// consume by referencing the same grading_run_id (so refund rows live
  /// in a separate uniqueness scope from consume rows; see app-level
  /// idempotency in the ledger helpers).
  grading_run_id    String?

  /// Period this entry belongs to — Stripe invoice id of the period.
  /// - subscription_grant: the invoice that paid for this period
  /// - consume: the period the grading_run was charged against (snapshotted)
  /// - period_expiry: the period being expired
  /// - everything else: NULL
  period_id         String?

  /// Period bounds — set on `subscription_grant` only. Snapshotted from
  /// `invoice.lines.data[0].period.{start,end}`. Decoupled from Stripe so
  /// "what period are we in for this grant" doesn't require a Stripe
  /// round-trip, AND so a single annual invoice can later carry multiple
  /// monthly grants by varying these bounds while sharing a period_id.
  /// Also: future "show me this user's grants for May" queries become a
  /// simple range filter without inferring period from invoice metadata.
  period_starts_at  DateTime?
  period_ends_at    DateTime?

  created_at        DateTime         @default(now())

  @@index([user_id])
  @@index([user_id, period_id])
  @@index([user_id, kind])
  @@index([user_id, period_starts_at])
  @@map("paper_ledger")
}
```

**Idempotency on grading_run_id via compound unique:** `@@unique([kind, grading_run_id])` constrains uniqueness per kind, so a `consume` and a `refund` can share a grading_run_id (the refund undoes the consume), but two consumes for the same grading_run can't coexist. Postgres treats NULLs as distinct in unique constraints, so the many ledger entry kinds with NULL grading_run_id (grants, expiries, admin grants, etc.) are unaffected. No partial index, no raw SQL migration — Prisma models this natively.

**Balance** is always `SUM(papers) WHERE user_id = ?`. No date filter, no kind filter, no special cases — `period_expiry` rows handle subscription-credit expiry by being negative entries that get summed alongside everything else. The invariant: if the ledger is correct, `SUM(papers)` is the user's current available balance, full stop.

**Cap-per-grant is implicit, no separate field needed.** The grant amount on a `subscription_grant` row IS that period's cap (e.g. +60 for Pro). Display "47 of 60 used this month" by reading the latest `subscription_grant.papers` for the current period_id and subtracting the SUM of consume entries against the same period_id. Changing the global cap (60 → 80 in StripeConfig) only affects future grants; in-flight users keep their original cap because their grant row already captured the value. No retroactive effect, no special handling.

**Why no JSON column for raw Stripe payloads.** We have stable Stripe IDs as pointers (`stripe_session_id`, `stripe_invoice_id`); raw payloads can be re-fetched from Stripe on demand. Webhook handlers log the event id and the action taken — that's the audit trail. Storing JSON would be ~5-50KB per ledger entry of defensive engineering against a problem we don't have. Stripe Dashboard retains events for 30 days (extendable) for any ad-hoc debugging during launch.

### Phase 3 — Entitlement system (`apps/web/src/lib/billing/entitlement.ts`) — ✅ DONE 2026-05-02

(Three-kind union shipped via pure `entitlement-decision.ts` + impure `entitlement.ts`. Ledger helpers in `ledger.ts` / pure `ledger-pure.ts`. `InsufficientBalanceError` replaces `TrialExhaustedError` (alias retained for back-compat — slated for removal in Pre-Phase-5 cleanup). `isFounder()` derives from Stripe.)

The entitlement check collapses to two questions: "is this user uncapped?" and "do they have enough balance?" Everything else is a query against the ledger.

**Discriminated union:**

```ts
export type Entitlement =
  | { kind: "admin" }                                  // bypass
  | { kind: "uncapped"; plan: Plan }                   // limitless_monthly
  | { kind: "metered"; balance: number; plan: Plan | null }
  //   ^ everyone else: trial, PPU-only, Pro-capped — all share one path.
  //     `balance` is SUM(papers) over the ledger. `plan` is the active sub
  //     if any (so the UI can show "47 of 60 this month" for Pro users by
  //     reading subscription_grant - consume entries with current period_id).
```

Two kinds (admin, uncapped) bypass quota; one kind (metered) requires a balance check. That's the whole API.

**`getEntitlement(userId)` becomes:**

```ts
const user = await db.user.findUnique({
  where: { id: userId },
  select: { role: true, plan: true, subscription_status: true },
})
if (!user) return { kind: "metered", balance: 0, plan: null }
if (user.role === "admin") return { kind: "admin" }

const isActiveSub = user.subscription_status === "active" || user.subscription_status === "trialing"
if (isActiveSub && user.plan === "limitless_monthly") {
  return { kind: "uncapped", plan: user.plan }
}

const balance = await ledger.getBalance(userId)
return { kind: "metered", balance, plan: isActiveSub ? user.plan : null }
```

One DB read for the user; one indexed SUM for the balance. Same shape for trial users, PPU-only users, and capped Pro users — the ledger naturally encodes all three.

**`enforcePapersQuota({ user, additionalPapers, gradingRunIds })`:**

```ts
const ent = await getEntitlement(user.id)
if (ent.kind === "admin" || ent.kind === "uncapped") return
if (ent.balance < additionalPapers) {
  throw new InsufficientBalanceError({
    balance: ent.balance,
    requested: additionalPapers,
    plan: ent.plan,  // drives upgrade-prompt copy: trial → buy/subscribe; capped → top-up
  })
}
await ledger.debit({ userId: user.id, gradingRunIds, periodId: currentPeriodId(ent) })
```

The single `metered` path serves trial users (low balance from one trial_grant entry), PPU-only users (balance from purchase_ppu), and capped Pro users (balance from subscription_grant within the current period — anything they consume from PPU/trial/topup also counts naturally because it's all one balance).

**Drawing order is implicit** in the SUM: when a Pro-capped user marks 5 papers, 5 consume entries are inserted; the next balance read drops by 5 from whichever pool. We don't need to explicitly say "draw from subscription first." If a Pro user wants subscription credits to deplete first (so PPU credits aren't wasted on capped marking), that's a UX/policy choice — implementable later via a `period_id` filter on the consume insert without schema change.

**Reserve-on-submit, refund-on-failure:**
- On batch submit: insert N consume entries (one per grading run id), each with `papers: -1, kind: consume, grading_run_id: <run_id>`. Idempotent via the partial unique index.
- On grading run failure: insert refund entry `papers: +1, kind: refund, grading_run_id: <same_run_id>`. Idempotency at the application level (check no refund row exists for this run before inserting).
- Partial-batch failure is correct by construction — only the failed runs get refunded; successful runs stay debited.

**Founders' state derived from Stripe** (no User column):

```ts
async function isFounder(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { stripe_subscription_id: true } })
  if (!user?.stripe_subscription_id) return false
  const sub = await stripeClient().subscriptions.retrieve(user.stripe_subscription_id)
  return sub.discount?.coupon?.id === Resource.StripeConfig.foundersCouponId
}
```

Cached per request in `ctx` (the action client already provides per-request scope). For UI surfaces that need it on every render, fold the founders flag into the cached subscription state read by `getEntitlement` — one round-trip, not two.

### Phase 4 — Webhook updates (`apps/web/src/lib/billing/webhook-handlers.ts`) — ✅ DONE 2026-05-02

(`applyInvoiceSucceeded` performs period_grant + period_expiry transactionally for Pro-monthly; `applyChargeRefunded` is a logged stub until PPU checkout exists. `seedTrialGrant` wired into `packages/backend/src/auth.ts` for new users. `debitPaperLedger` wired into `student-paper-grade.ts` Lambda. Admin Credits surface (Grant + Ledger view + delete) shipped alongside.)

**`checkout.session.completed`** — branch on `session.mode`:

```ts
case "checkout.session.completed": {
  const session = event.data.object
  if (session.mode === "payment") {
    const purchaseKind = session.metadata?.kind  // "ppu" | "topup"
    if (purchaseKind === "ppu") await applyPpuPurchase(session)
    else if (purchaseKind === "topup") await applyTopUpPurchase(session)
  }
  // mode === "subscription" → no-op; subscription.* + invoice.* drive that path
}
```

Both inserters use `purchase_ppu` / `purchase_topup` ledger entries, idempotent on `stripe_session_id`.

**`invoice.payment_succeeded`** — drives subscription period transitions for capped plans:

```ts
async function applyInvoiceSucceeded(invoice: Stripe.Invoice) {
  const user = await findUserByCustomerId(invoice.customer)
  if (!user || user.plan !== "pro_monthly") return  // only capped Pro needs ledger work

  // Period bounds come from the line item, not the invoice itself — Stripe
  // exposes them per line so we read [0] (single-line for monthly Pro).
  const line = invoice.lines.data[0]
  const periodStartsAt = new Date(line.period.start * 1000)
  const periodEndsAt = new Date(line.period.end * 1000)

  await db.$transaction([
    // 1. Expire previous period's unused subscription credits (if any).
    //    Idempotent on stripe_invoice_id of the *previous* invoice.
    expirePreviousPeriodGrant(user.id, invoice),
    // 2. Grant the new period's 60 papers, idempotent on this invoice id.
    insertSubscriptionGrant({
      userId: user.id,
      papers: PRO_PAPER_CAP,
      stripeInvoiceId: invoice.id,
      periodId: invoice.id,  // invoice id IS the period id
      periodStartsAt,
      periodEndsAt,
    }),
  ])
}
```

`expirePreviousPeriodGrant` reads SUM of all entries for the previous period_id and inserts a `period_expiry` row of `-unused`. If the row already exists (replay), the unique constraint on `stripe_invoice_id` makes it a no-op.

The period bounds are snapshotted on the grant row so future "what's my current period?" reads don't need to call Stripe. They're also the seam for annual/quarterly cap support: when we eventually offer annual capped plans, a single annual invoice can produce 12 monthly grants by varying `period_starts_at` / `period_ends_at` inside one cron-driven loop, sharing the annual invoice id as `stripe_invoice_id` only for the first grant (subsequent grants get a synthetic key).

Limitless users skip the ledger work entirely — their entitlement is "uncapped" and the ledger has no subscription_grant rows for them. PPU-only users have no `plan`, so they also skip.

**`customer.subscription.created`** — no special founders handling needed (we derive founders' state from Stripe on demand). Existing handler that mirrors `subscription_status` and `plan` onto User stays as-is.

**`charge.refunded`** — new handler for Stripe-side refunds of PPU/top-up purchases. Inserts a negative `purchase_ppu` / `purchase_topup` reversal entry; balance can legitimately go negative (blocks future use until balance is positive again).

### Phase 4.5 — Pre-Phase-5 cleanup — ✅ HIGH PRIORITY DONE 2026-05-03

(Items 1-3 + medium #5 shipped. Items 4 + 6 still queued for the start of Phase 5; items 7-10 deferred. See per-item status below.)

Items called out during the Phase 0-4 retrospective. Address before starting Phase 5 so the foundation is clean. Ordered by priority — top items are real soft spots; bottom items are polish.

#### High priority

**1. Reserve-on-submit (close the over-spend race). — ✅ DONE 2026-05-03**

What shipped:
- `commit-service.ts` pre-generates a `crypto.randomUUID()` per submission, then within one `db.$transaction` creates `StudentSubmission` + `OcrRun(pending)` + `GradingRun(pending)` + paper_ledger consume row. SQS messages send after commit.
- Re-mark (`retriggerGrading`) and re-scan (`retriggerOcr`) follow the same pattern (one consume per call, single-row insert).
- Period_id snapshotted **before** the transaction so all rows in a batch share the same period.
- Lambda-side `debitPaperLedger` retained as defensive backfill (delegates to the shared helper; no-op-on-replay covers any pre-Phase-4.5 inflight or operator-injected SQS messages).
- `enforcePapersQuota` → `assertPapersQuota` rename across all 4 call sites.

**2. Extract shared ledger helpers — ✅ DONE 2026-05-03**

Lives in `packages/db/src/ledger.ts` (NOT `packages/shared` as originally planned). Reasoning: `packages/db/src/events.ts` is the established pattern for "helpers that take a Prisma client", `@mcp-gcse/shared` doesn't depend on Prisma and shouldn't gain a peer dep, and both web and backend already import `@mcp-gcse/db`. Net: same outcome (one source of truth for the consume-insert), better placement.

Exports: `insertConsumesForGradingRuns({ db, userId, gradingRunIds, periodId })` and `lookupCurrentPeriodId({ db, userId, plan })`. `db` accepts both a full PrismaClient and a `tx` interactive-transaction client. Web wrapper at `apps/web/src/lib/billing/ledger.ts` adds the singleton `db` for ergonomics; backend Lambda calls the shared helper directly.

9 new unit tests against a fake Prisma store cover early-return paths, payload shape, and replay no-ops. Concurrency / FK semantics still belong in integration tests (not yet written — see Phase 5 test surface).

What shipped:
- `getBalance(userId)` → `getSharedBalance(userId)` in `apps/web/src/lib/billing/ledger.ts` and its single caller (`entitlement.ts`).
- The web wrapper is now `insertConsumesForBatch({ userId, gradingRunIds, periodId, tx })`, named for its caller context (batch / re-mark / re-scan reservation) rather than the per-grading-run shape. Adding `examPaperId` later is a one-line signature extension; the underlying `@mcp-gcse/db` helper signature stays generic.
- When `getExamBalance(userId, examPaperId)` ships, the naming composes naturally and no rename is needed.

#### Medium priority

**4. Move PPU + Limitless prices into StripeConfig. — ✅ DONE 2026-05-03**

What shipped:
- New `stripe.Product` + `stripe.Price` resources for **Limitless** (gbp/usd monthly) and **PPU** (gbp/usd one-off) in `infra/billing.ts`. Stable IDs available for Phase 5 checkout wiring.
- StripeConfig Linkable extended: `plans.limitless.prices.{gbp,usd}.monthly.{id,amount}` mirrors the existing pro shape; `ppu.{gbp,usd}.{id,amount}` sits at the top level (one-off has no interval).
- New `foundersDiscountPercent: 40` exposed on StripeConfig — read by the marketing pricing page to compute the founders price (`amount × (100 - %) / 100`).
- `pricing/page.tsx` reads `Resource.StripeConfig.ppu[currency].amount`, `Resource.StripeConfig.plans.limitless.prices[currency].monthly.amount`, and `Resource.StripeConfig.foundersDiscountPercent`. The hardcoded `PPU_AMOUNTS` / `LIMITLESS_AMOUNTS` / `FOUNDERS_DISCOUNT_FACTOR` constants are gone.
- `sst-env.d.ts` updated to match the new StripeConfig shape (regenerated cleanly on next `sst dev`).

Drift risk closed: `infra/billing.ts` is the single source for both Stripe-charged amounts and marketing-page display. Top-up Stripe Product + Price still pending Phase 5 (in-app only, not on the public pricing page).

**Deploy note:** the new Stripe Products/Prices land on the next `sst deploy` per stage. The marketing page reads stable resource IDs that resolve at deploy-time — no behavior change until then, but typecheck is green immediately.

**5. Drop `TrialExhaustedError` deprecated alias. — ✅ DONE 2026-05-03**

Done alongside the high-priority items (was on the path of the touched files anyway). The alias and `TRIAL_ERROR_PREFIX` are gone; consumers (`handle-server-error.ts`, `error-toast.ts`) now reference `InsufficientBalanceError` and `BALANCE_ERROR_PREFIX` directly.

**6. Rename `proPaperCap` → `proMonthlyGrantSize`. — ✅ DONE 2026-05-03**

`StripeConfig.proPaperCap` → `StripeConfig.proMonthlyGrantSize` in `infra/billing.ts`, `sst-env.d.ts`, and the two usages in `apps/web/src/lib/billing/webhook-handlers.ts` (grant amount + log line). Comment in the Linkable definition records the rename rationale for future searches.

#### Low priority

**7. Schema-by-constraint instead of schema-by-convention.**
Many `PaperLedgerEntry` fields are nullable with "set on certain kinds only" docstring conventions: `grading_run_id` (consume/refund only), `period_id` (subscription_grant/consume/period_expiry), `granted_by_user_id` (admin_grant only), `stripe_session_id` (PPU/topup only), etc. Nothing stops a buggy insert from writing a `consume` row with `period_id` but no `grading_run_id`, or any other broken shape.

Two routes:
- Postgres CHECK constraints in raw SQL (need to revisit the no-raw-SQL-with-db:push call we made earlier)
- Discriminated-union table model (separate tables per kind) — bigger refactor

Defer this until a real bug surfaces. The conventions are documented and the code paths that write to the ledger are few; risk is low for now. But it'll bite eventually.

**8. Document the pure/impure file naming convention (`-decision.ts`, `-pure.ts`).**
Invented during Phase 3 because tests broke when modules import `db` at load time. The pattern doesn't appear elsewhere in the codebase. Either document in `CLAUDE.md` (under "Code Quality" or "Test Colocation"), or convert to using `vi.mock("@/lib/db")` in the affected tests so the convention isn't needed.

Estimated effort: 20 minutes either way.

**9. Admin Credits polish.**
- No pagination / search on `listUsersWithBalance` — fine for alpha (≤ 100 users), real cliff at scale
- `router.refresh()` instead of TanStack Query optimistic updates (project convention per CLAUDE.md)
- No confirmation step on the grant form (negative grants execute immediately)
- The destructive ledger-entry delete IS confirmed via `ConfirmDialog` (added 2026-05-02) — don't regress that

Defer all of these — alpha admin tooling, low impact.

**10. PPU + Limitless cards on the pricing page show "Available soon".**
Resolved by Phase 5 itself (when the checkout flows ship). Nothing to do here, but worth tracking — if Phase 5 slips past launch, hide the cards rather than ship "available soon" labels to founders.

---

### Phase 5 — PPU + top-up checkout flows + in-app upsell — ✅ DONE 2026-05-03

What shipped:

**Stripe infra (`infra/billing.ts`):**
- New `TopUpProduct` + 2 prices (£6.50 / $8.50, 15 papers per purchase). Adds `StripeConfig.topUp.{papersPerPurchase, gbp, usd}`.
- `StripeConfig.ppu.papersPerSet = 30` exposed for the webhook fulfilment path.

**Server actions (`apps/web/src/lib/billing/checkout-payment.ts` — NEW):**
- `createPpuCheckoutSession({ currency })` — `mode: payment`, `metadata.kind = "ppu"`, success returns to /teacher.
- `createTopUpCheckoutSession({ currency, returnPath })` — same shape, `metadata.kind = "topup"`. `returnPath` lets the cap-bite modal land the user mid-flow on the originating exam paper.
- Both inject `metadata.user_id` on the session AND on `payment_intent_data.metadata` (defence-in-depth for any future PI-driven webhook).

**Webhook handlers:**
- New `applyCompletedCheckoutSession(session)` — branches via the new pure helper `decideCheckoutSessionAction` (subscription mode → no-op, payment-mode + `metadata.kind` → ledger insert via `insertPpuPurchase` / `insertTopUpPurchase`). Idempotent via the `stripe_session_id @unique` constraint.
- Wired into `apps/web/src/app/api/stripe/webhook/route.ts` — replaces the previous "log and continue" stub on `checkout.session.completed`.
- `applyChargeRefunded` stays a logged stub — see deferred-design note below.

**Public pricing page (`PpuCard`):**
- "Available soon" disabled button → live "Buy a set" / "Sign in to buy" CTA mirroring `ProCard`. Calls `createPpuCheckoutSession` and redirects to Stripe. Errors surface via `surfaceMarkingError` toast.

**Billing page (`/teacher/billing`):**
- Capped Pro users see a new "This month's allowance" card with progress bar (consumed/grant), period reset date, "Plus N papers from sets / top-ups" line for cross-period extras, and a primary `<BuyTopUpButton>` CTA + secondary "Compare plans" link.
- Loading-edge case handled: brand-new subscriber whose first invoice hasn't landed sees "Setting up your allowance — refresh in a minute."

**Cap-bite modal (`apps/web/src/app/teacher/exam-papers/[id]/cap-bite-modal.tsx` — NEW):**
- Surfaced when `commitBatch` fails with `InsufficientBalanceError`. Replaces the generic Upgrade-action toast for the batch path so the user can resolve inline.
- `useBatchIngestion` gained an optional `onCapBite(message)` callback; the page shell wires it to local modal state. Single-script paths (re-mark, re-scan) keep the existing toast.
- Currency + top-up price label + papers-per-purchase plumbed page → shell → modal as props (no extra round-trip on open).

**Trial banner (`apps/web/src/components/trial-banner.tsx`):**
- Extended to also serve capped Pro users at ≥80% of the period grant (amber) and at-cap with no extras (red). Pro at <80% sees nothing — billing page meter is the proper status surface; banner avoids permanent visual noise.

**Pure helpers + tests:**
- `decideCheckoutSessionAction` (in `webhook-translation.ts`) — discriminated decision for `checkout.session.completed` events. 6 unit tests.
- `parseInsufficientBalanceError` (extracted from `error-toast.ts`) — sentinel-stripping helper shared by the toast + the cap-bite modal trigger. 5 unit tests.
- `getCurrentPeriodUsage` added to `lib/billing/ledger.ts` — returns grant size, consumed count, and period bounds for the billing meter + banner.
- `getCurrency` moved from `(marketing)/_lib/currency.ts` to `lib/billing/currency.ts` — used by both marketing /pricing and in-app /teacher/billing.

**Deferred to follow-up (not blocking launch):**

- **Auto-reverse on `charge.refunded`** — the existing `stripe_session_id @unique` constraint blocks reusing the original session id on a reversal row, and same-`kind` + negative-`papers` would also conflict. Clean fix needs either a new `purchase_refund` LedgerEntryKind or a `@@unique([kind, stripe_session_id])` rework with a sign convention. For launch: refunds are rare and handled manually via the admin Credits negative-grant. Logged stub is in `applyChargeRefunded` with this rationale.
- **Plan-contextual cap-bite modal copy** — the modal currently shows "Buy a top-up" + "See plans" universally. Trial / PPU users get suboptimal "top-up" framing instead of "buy a set" / "subscribe" — they can route via the See-plans link. Worth polishing post-launch.
- **Telemetry for the 80%/90% near-cap toast** — the in-banner amber warning at 80% covers the spirit; a one-shot toast with idempotent suppress-per-period needs persistent state.

### Phase 6 — Migration (deploy-time) — ✅ stuartbourhill DONE 2026-05-03 · production PENDING

The two one-shot SQL backfills are committed in `packages/db/prisma/`:
- `2026-05-03-01-seed-trial-grants.sql` — `trial_grant: +20` per existing user (idempotent on `NOT EXISTS`)
- `2026-05-03-02-backfill-consume-rows.sql` — `consume: -1` per completed grading_run (idempotent on `NOT EXISTS` + `@@unique([kind, grading_run_id])`)

Both wrapped in `BEGIN; COMMIT;` for forensic clarity. Per-stage execution sequence + verification queries documented in **`docs/deploy-runbook-2026-05-03-pricing-restructure.md`** — that's the ground truth, not this section.

**Auth.ts hardening landed alongside (2026-05-03):** `seedTrialGrant` + `attachPendingResourceGrantsForSignup` are now hoisted out of the `if (!user)` block in both OAuth branches, running on every login. Self-heals signups whose user.create succeeded but a side effect failed (Neon blip → permanently zero-balance account). Side benefit: retroactively attaches resources shared with a user's email after their account already existed.

**stuartbourhill execution result (2026-05-03):**
- 7 trial_grant rows inserted (matches user count)
- 109 consume rows inserted (matches completed-grading-run count)
- Final balance shape verified — see runbook stage matrix
- Stu's admin account: balance −88 (108 historical consumes), correctly bypasses entitlement via `role: admin`
- Real teachers: full +20 trial available

**Deferred to a Phase 6.5 cleanup pass before / after launch:**

Surfaced during the post-migration audit; documented here for the record. None block the migration itself.

1. **Auto-refund on grading-run failure not wired.** `insertRefundForGradingRun` exists in `apps/web/src/lib/billing/ledger.ts` but no production code path calls it. Reserve-on-submit (Phase 4.5) moved the consume row to submit time → DLQ-delivered failures now leave a debit with no offsetting refund. Right fix: extract the refund insert into the shared `@mcp-gcse/db/ledger.ts` and call from `student-paper-ocr-dlq.ts` + `student-paper-grading-dlq.ts`. Idempotent via `@@unique([kind, grading_run_id])`. ~30-45 min including tests. **Real money/credit loss, important to wire before non-trivial paid load.**
2. **Trial_grant race window widened by the auth.ts hoist.** `seedTrialGrant` runs on every login now; two parallel logins can both pass the `findFirst` and both insert → user gets 40 trial papers. Outcome is "generous, not harmful" but a partial unique index `WHERE kind = 'trial_grant'` (raw SQL, matches the `setup-vectors.sql` precedent) closes it permanently. ~15 min.
3. **No UI feedback after top-up success.** `?topup=success` query param is set on the redirect URL but nothing reads it. ~10 min for an on-mount toast.
4. **`charge.refunded` still a logged stub.** Unchanged — needs schema decision (new `purchase_refund` kind or `@@unique([kind, stripe_session_id])` rework). Manual via admin Credits in the meantime.

---

### Phase 7 — Relocate Stripe webhook from Next.js route → Lambda Hono route

**Status: NOT STARTED. Blocking smoke-test of all paid flows in `sst dev`. Architectural cleanup, doesn't block deployed-environment correctness.**

#### Why this exists

Stripe webhook delivery currently fails silently in `sst dev` mode. The webhook is wired to `https://${domain}/api/stripe/webhook` (a route inside the deployed Next.js app at `apps/web/src/app/api/stripe/webhook/route.ts`). The aspirational comment in `infra/billing.ts:84-87` claims "Local sst dev works because dev mode tunnels traffic from the deployed CloudFront URL down to localhost — no Stripe CLI forwarding needed." **This is not true for `sst.aws.Nextjs`.** `sst dev` boots the Next.js dev server on `localhost:3000` only — there is no IoT / Live-Lambda tunnel from the deployed CloudFront/Lambda back to your machine. So Stripe POSTs hit the deployed Lambda (frozen at last `sst deploy`), not your local handler.

The fix: move the webhook handler from a Next.js route into a dedicated Lambda mounted on the existing `sst.aws.ApiGatewayV2`. SST's Live Lambda Development DOES tunnel ApiGateway invocations to localhost, so `sst dev` becomes self-sufficient — Stripe → ApiGateway → IoT tunnel → your local Lambda handler.

#### Reference implementation

The pattern lives in **`/Users/stuartbourhill/dev/kiddo`** (sibling project on Stu's machine). Specifically:

- `kiddo/sst.config.ts:151` — `stripe.WebhookEndpoint` URL is `${api.url}/v1/stripe/webhook` (an `sst.aws.ApiGatewayV2`)
- `kiddo/sst.config.ts:208` — `api.route("$default", { handler: "packages/api/src/main.handler", link: [...] })`
- `kiddo/packages/api/src/routes/stripe/webhook/main.ts` — the actual Hono route that constructs and dispatches the event

In `sst dev`, kiddo's webhook works against localhost via the IoT tunnel. Deepmark's webhook does not. The architectural difference is the only reason.

#### Deepmark already has the substrate

`infra/api.ts:7` already declares `const api = new sst.aws.ApiGatewayV2("ApiGateway")` with a default route at `packages/backend/src/main.handler`, which composes Hono routes via `packages/backend/src/api.ts`. We just need to add a Stripe webhook route to it, alongside the existing `/v1/*` and `/mcp/*` routes.

#### The work — recommended path (Option A from the audit)

**Total effort estimate: ~2.5 hours.** This is the version that doesn't create duplicated implementations between web and backend.

##### 1. Extract the four "write-side" ledger helpers to `@mcp-gcse/db/ledger.ts`

Currently in `apps/web/src/lib/billing/ledger.ts`, all importing `db` from `@/lib/db`:
- `insertSubscriptionGrant({ userId, papers, stripeInvoiceId, periodId, periodStartsAt, periodEndsAt }) → { granted: boolean }`
- `expirePreviousPeriodGrant({ userId, newInvoiceId }) → { expired: number }`
- `insertPpuPurchase({ userId, papers, stripeSessionId }) → { granted: boolean }`
- `insertTopUpPurchase({ userId, papers, stripeSessionId }) → { granted: boolean }`

Move them to `packages/db/src/ledger.ts` with the same signature shape used by the existing `insertConsumesForGradingRuns` and `lookupCurrentPeriodId` helpers there: takes a `LedgerCapableClient` (Prisma client or tx client) as the first arg. Web's wrapper (`apps/web/src/lib/billing/ledger.ts`) becomes a thin re-export delegating to the shared helpers with the singleton `db`.

The pure helper for `expirePreviousPeriodGrant`'s arithmetic — `computePeriodExpiryAmount` — stays in `apps/web/src/lib/billing/ledger-pure.ts` and imports back into the shared module as needed. Or move it to a `packages/db/src/ledger-pure.ts` — small, no harm.

Don't forget to bump the dist build (`cd packages/db && bun run build`) so web + backend resolve the new exports through the compiled `dist/index.js`. The existing pattern in `packages/db/src/index.ts:11-14` shows where to add the exports.

##### 2. Extract the pure webhook-translation helpers (already done)

`decideCheckoutSessionAction`, `subscriptionToUserUpdate`, `extractCustomerId`, `identifyUserCriteria`, `invoiceOutcomeToStatus`, `toPersistedPlan` already live in `apps/web/src/lib/billing/webhook-translation.ts`. They have **zero dependencies on web-side singletons** (just types from `@mcp-gcse/db` and Stripe types). Move the entire file to `packages/backend/src/billing/webhook-translation.ts` — backend imports them directly, and **delete the web copy** (or, if the web side ever needs them, re-export through `@mcp-gcse/shared`). Keep the existing test file in lockstep.

Tests at `apps/web/src/lib/billing/__tests__/webhook-translation.test.ts` (11 tests) need to follow — move them or update their import paths. The new test home: `packages/backend/tests/unit/webhook-translation.test.ts` (matches the existing `backend:unit` Vitest project at `vitest.config.ts:31-39`).

##### 3. Build the Hono webhook route in backend

Create **`packages/backend/src/billing/webhook-handlers.ts`** by porting the impure handlers from `apps/web/src/lib/billing/webhook-handlers.ts`:
- `applySubscriptionToUser(sub)`
- `clearSubscriptionFromUser(sub)`
- `applyInvoiceFailed(invoice)`
- `applyInvoiceSucceeded(invoice)`
- `applyChargeRefunded(charge)` — keeps its logged-stub status (Phase 6.5 deferred item — schema decision needed)
- `applyCompletedCheckoutSession(session)`

These import:
- `db` from the backend's existing `createPrismaClient(Resource.NeonPostgres.databaseUrl)` (pattern in `packages/backend/src/auth.ts:13`)
- The four ledger helpers from `@mcp-gcse/db` (post-step 1)
- Translation helpers from `./webhook-translation` (post-step 2)
- `Resource.StripeConfig` for `proMonthlyGrantSize`, `ppu.papersPerSet`, `topUp.papersPerPurchase`
- `log`/logger — backend has its own at `packages/backend/src/lib/infra/logger.ts`

Create **`packages/backend/src/billing/stripe-webhook-route.ts`** — Hono router exporting a `POST /webhook` route. Reads raw body, verifies signature against `Resource.StripeWebhookSecret.secret`, switches on `event.type`, dispatches to the handlers above. Match the existing transient-vs-permanent error model from `apps/web/src/app/api/stripe/webhook/route.ts:36-104` — 500 for transient (Stripe retries), 200 for permanent (logged + acked).

Mount it in `packages/backend/src/api.ts`. **Critical: do NOT mount inside `/v1` because `/v1` has `authMiddleware`** (line 33-34: `.route("/v1", v1Routes.use(authMiddleware))`). Webhook events from Stripe don't carry an OpenAuth bearer token. Mount at top level alongside `/mcp`:

```ts
.route("/stripe", stripeWebhookRoutes)  // → POST /stripe/webhook
```

Or directly:

```ts
.route("/stripe/webhook", stripeWebhookRoute)
```

##### 4. Update `infra/billing.ts`

Replace:
```ts
const stripeWebhook = new stripe.WebhookEndpoint("StripeWebhook", {
  url: `https://${domain}/api/stripe/webhook`,
  ...
})
```

With:
```ts
import { api } from "./api"  // export it from infra/api.ts first

const stripeWebhook = new stripe.WebhookEndpoint("StripeWebhook", {
  url: $interpolate`${api.url}/stripe/webhook`,
  ...
})
```

`infra/api.ts` currently doesn't export `api`. Add `export const api = new sst.aws.ApiGatewayV2("ApiGateway")` and re-import in `billing.ts`. Alternatively, restructure the `api.url` construction to live in `billing.ts` — whatever fits the existing infra layout.

Then ensure the api Lambda's `link` includes `stripeWebhookSecret` and `stripeConfig` (currently in `infra/api.ts:14-23` it links neonPostgres + auth + APIs but NOT Stripe). Add the Stripe linkables.

Update the comment block at `infra/billing.ts:84-87` to delete the wrong claim about `sst dev` tunneling Next.js.

##### 5. Decommission the Next.js webhook route

Delete `apps/web/src/app/api/stripe/webhook/route.ts`. Or stub it with HTTP 410 Gone for ~30 days as a safety net in case any in-flight Stripe retries land on the old URL during the cutover (unlikely — Stripe retries against the URL in the webhook endpoint config, which we update in step 4). Cleanest: just delete.

Check for any other web-side imports of the webhook handlers — there shouldn't be any (`apps/web/src/lib/billing/webhook-handlers.ts` is only used by the route handler being deleted), but `grep -rn "webhook-handlers" apps/web/src` to confirm.

##### 6. Tests + verification

- Move `webhook-translation.test.ts` to `packages/backend/tests/unit/` (11 tests covering `decideCheckoutSessionAction`, `subscriptionToUserUpdate`, etc.)
- Add backend integration test: a real Stripe-shaped event POSTed against the Hono route, asserting the right ledger row gets written. Reference shape: `packages/backend/tests/integration/attribution-evals.test.ts`.
- `bun typecheck` ✓ FULL TURBO
- `bun test:unit` should remain at 426/426 (or grow with the move)
- `bun check` clean on touched files

#### Manual verification (post-implementation)

Run end-to-end in `sst dev`:

1. `AWS_PROFILE=deepmark npx sst dev --stage=stuartbourhill`
2. In a second terminal: trigger a PPU checkout from `/pricing` while signed in
3. Complete payment in Stripe checkout (test card `4242 4242 4242 4242`)
4. **Verify:** the `packages/backend/src/billing/stripe-webhook-route.ts` handler logs the event id locally — proves the IoT tunnel is delivering
5. Query the ledger:
   ```sql
   SELECT * FROM paper_ledger WHERE kind = 'purchase_ppu' ORDER BY created_at DESC LIMIT 1;
   ```
   Should show a `+30` row with the user_id and `stripe_session_id` from the checkout
6. Visit `/teacher/billing` → balance should reflect the new 30 papers
7. Repeat for top-up flow via the cap-bite modal (or direct `/teacher/billing` button)
8. Repeat for subscribe → confirm `applySubscriptionToUser` + `applyInvoiceSucceeded` paths still work end-to-end

#### Trade-off: skinny port (Option B)

If time pressure forces it, the alternative is **inlining the four ledger helpers + the impure webhook handlers into `packages/backend/src/billing/`** without extracting to `@mcp-gcse/db`. Web's `lib/billing/ledger.ts` keeps its own copy. ~1.5 hours instead of 2.5, but creates a duplicated implementation that will drift the next time you change the ledger row shape. **Recommended only as a last-resort if Phase 7 ends up on a tight pre-launch slot.** Document the duplication clearly and leave a TODO in both files referencing each other.

#### Files affected — quick reference

| Path | Action |
|---|---|
| `packages/db/src/ledger.ts` | Extend with `insertSubscriptionGrant`, `expirePreviousPeriodGrant`, `insertPpuPurchase`, `insertTopUpPurchase` |
| `packages/db/src/index.ts` | Re-export the four new helpers |
| `apps/web/src/lib/billing/ledger.ts` | Reduce to thin wrappers delegating to `@mcp-gcse/db` (matches the Phase 4.5 consume pattern) |
| `apps/web/src/lib/billing/webhook-translation.ts` | DELETE (moved) |
| `apps/web/src/lib/billing/__tests__/webhook-translation.test.ts` | DELETE (moved) |
| `apps/web/src/lib/billing/webhook-handlers.ts` | DELETE (moved + ported) |
| `apps/web/src/app/api/stripe/webhook/route.ts` | DELETE |
| `packages/backend/src/billing/webhook-translation.ts` | NEW (moved) |
| `packages/backend/src/billing/webhook-handlers.ts` | NEW (ported, uses backend's `db` + shared ledger helpers) |
| `packages/backend/src/billing/stripe-webhook-route.ts` | NEW (Hono route, raw body + signature verify + dispatch) |
| `packages/backend/tests/unit/webhook-translation.test.ts` | NEW (moved) |
| `packages/backend/src/api.ts` | Mount the new route at `/stripe/webhook` (top-level, NOT under `/v1` — no auth) |
| `infra/api.ts` | Export `api`; add `stripeWebhookSecret` + `stripeConfig` to the api Lambda's `link` |
| `infra/billing.ts` | Update `stripe.WebhookEndpoint.url` to `${api.url}/stripe/webhook`; delete the wrong `sst dev` tunneling comment |
| `apps/web/src/lib/billing/stripe-client.ts` | Mirror to `packages/backend/src/billing/stripe-client.ts` (or move) — small file, just `new Stripe(key)` |
| `apps/web/src/lib/billing/transient-error.ts` | Same — small, mirror or move |

#### Hand-off context for the next conversation

Pre-existing state of the repo on the day this plan section was written (2026-05-03):

- All Phases 0-5 complete and merged. 426/426 unit tests green. `bun typecheck` FULL TURBO.
- Phase 6 backfill SQLs ran successfully against `stuartbourhill` Neon branch (7 trial_grants + 109 consume rows). Production deploy + backfill not yet run.
- The auth.ts hardening (hoist of `seedTrialGrant` + `attachPendingResourceGrantsForSignup` out of `if (!user)`) is live.
- Phase 6.5 deferred items remain open: (1) auto-refund on grading-run failure, (2) trial_grant uniqueness, (3) top-up success toast, (4) `charge.refunded` auto-reverse. None block Phase 7.
- The user's smoke-test attempt on a PPU "Buy a set" flow was the trigger for discovering the webhook-tunneling bug. They're handing this work off to a fresh conversation.

The next conversation should re-read this section, verify the survey ("are the helpers still where this plan says they are?" — grep `apps/web/src/lib/billing/webhook-handlers.ts` to confirm), then execute Option A as written. If anything has drifted (e.g. Phase 6.5 #1 landed and changed the helper layout) adjust accordingly — the principle is "move the impure webhook handlers + their write-side ledger deps to the backend Lambda; mount the Hono route on the existing ApiGatewayV2; update the WebhookEndpoint URL."

---

(Original Phase 6 design notes follow for historical reference.)

Two one-shot SQL migrations, run after `db:push` in order. (A third — converting legacy `plan` strings to a grandfathered enum value — was removed 2026-05-03 because no paid users existed yet. If a paid customer signs up before the cutover, restore the `pro_monthly_grandfathered` enum value AND the conversion SQL below before deploying:

```sql
-- ONLY needed if paid users exist on the old uncapped plan at deploy time.
-- UPDATE users
-- SET plan = 'pro_monthly_grandfathered'
-- WHERE plan IN ('pro_monthly', 'pro_annual') AND subscription_status = 'active';
```
)

**1. Seed trial grants for every existing User.**

```sql
INSERT INTO paper_ledger (id, user_id, papers, kind, created_at)
SELECT
  'tg_' || substring(md5(random()::text) from 1 for 24),
  id,
  20,
  'trial_grant',
  now()
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM paper_ledger
  WHERE paper_ledger.user_id = users.id AND kind = 'trial_grant'
);
```

Idempotent on the `NOT EXISTS` subquery — safe to re-run.

**2. Backfill consume entries from existing grading runs** (so the ledger reflects historical usage):

```sql
INSERT INTO paper_ledger (id, user_id, papers, kind, grading_run_id, created_at)
SELECT
  'cn_' || substring(md5(random()::text) from 1 for 24),
  s.uploaded_by,
  -1,
  'consume',
  gr.id,
  gr.completed_at
FROM grading_runs gr
JOIN student_submissions s ON s.id = gr.submission_id
WHERE gr.status = 'complete'
  AND NOT EXISTS (
    SELECT 1 FROM paper_ledger pl
    WHERE pl.grading_run_id = gr.id AND pl.kind = 'consume'
  );
```

Result: balance after migration = `20 - count(historical consumes)` for each existing user. Trial users mid-trial keep their remaining headroom; users who exceeded 20 will have negative balance, which the entitlement check will treat as "exhausted, must purchase or subscribe."

**`UserCreate` hook update:** new users get a trial_grant inserted in the same transaction as User insert. Single-source: no UI surface ever sees a user without a trial_grant entry.

**Existing founders coupon redemptions:** the Stripe coupon was modified (50% → 40%, 12mo → 6mo). No production redemptions existed at the time of the change, so nothing to verify. If a redemption pre-dating the change ever surfaces in Stripe, that user keeps their original 50%/12mo deal — Stripe attaches coupon terms at redemption time, not retroactively.

---

## Test surface

**Unit (sibling `__tests__/`):**

- `entitlement.test.ts` — every (plan × subscription_status × ledger balance) combination → expected `Entitlement` shape and `enforcePapersQuota` decision. Three kinds (admin / uncapped / metered) keep the matrix small.
- `ledger.test.ts` — pure functions for balance computation, idempotent grant inserts (replay returns existing row), idempotent consume inserts via partial unique index, refund-undoes-consume flow, period_expiry math (sum of unused subscription_grant credits = expiry amount).
- `webhook-translation.test.ts` — extend with payment-mode session translation for PPU vs top-up; invoice.payment_succeeded → period grant + previous-period expiry pair.
- `migration-trial-seed.test.ts` — run the trial-seed SQL twice against a fresh fixture, confirm idempotency and resulting balance.

**Integration (`web:integration`):**

- Founders subscriber: subscribe → mock-clock advances 6 months → next invoice arrives at £24 → ledger gets a fresh subscription_grant.
- Period rollover: Pro user uses 47/60 in period A → invoice for period B succeeds → ledger contains period_expiry of -13 against period A and subscription_grant of +60 for period B → balance is exactly 60.
- Partial-batch failure: Pro user submits 30-script batch → 25 grading runs complete, 5 fail → balance reflects -25 (not -30) after refunds.
- Cap-overflow draw: Pro at 55/60 used, has +10 PPU balance, submits batch of 12 papers → 12 consume entries inserted → balance = (60-55) + 10 - 12 = 3 → succeeds.
- Webhook idempotency: same `checkout.session.completed` event delivered twice → second delivery is a no-op (unique constraint on stripe_session_id).

**Manual end-to-end before launch:**

- Subscribe as founders → confirm Stripe shows 40% coupon, 6-month duration → cancel mid-period → confirm grace period until period end.
- Buy PPU → mark all 30 → buy second set → mark 30 more.
- Subscribe to Limitless → mark 100 papers → confirm no quota errors and no ledger writes (uncapped path).
- Trial user → mark 20 → 21st is blocked with upgrade prompt → buy 1 PPU set → 21st succeeds.

---

## Files affected — quick reference

| Path | Change |
|---|---|
| `infra/billing.ts` | Founders coupon 40%/6mo (done); new Limitless / PPU / top-up products + prices; expanded StripeConfig Linkable with `proPaperCap`, `ppuPapersPerSet`, `topUpPapersPerPurchase` |
| `packages/db/prisma/schema.prisma` | Add `Plan` enum, `LedgerEntryKind` enum, `PaperLedgerEntry` model (with `period_starts_at`/`period_ends_at` for annual-cadence resilience and `@@unique([kind, grading_run_id])` for consume/refund idempotency); convert `User.plan` to `Plan?`; **remove** `papers_used_this_period` (never added — covered by ledger); **do not add** `founders_started_at` (derived from Stripe); **do not add** JSON columns for raw Stripe payloads (logging + Stripe IDs are sufficient — see Data layer principles) |
| `apps/web/src/lib/billing/entitlement.ts` | Three-kind discriminated union (admin / uncapped / metered); single ledger SUM call replaces all the special-case counters |
| `apps/web/src/lib/billing/quota.ts` | `enforcePapersQuota` reads balance, debits per grading run; new `InsufficientBalanceError` with plan-aware upgrade copy |
| `apps/web/src/lib/billing/ledger.ts` | NEW — `getBalance`, `insertConsume`, `insertRefund`, `insertSubscriptionGrant`, `insertPpuPurchase`, `insertTopUpPurchase`, `expirePreviousPeriodGrant`, `currentPeriodId`. Pure functions over Prisma client; idempotency via DB constraints. |
| `apps/web/src/lib/billing/ppu/checkout.ts` | NEW server action `createPpuCheckoutSession` |
| `apps/web/src/lib/billing/ppu/topup.ts` | NEW server action `createTopUpCheckoutSession` |
| `apps/web/src/lib/billing/founders.ts` | New `isFounder(userId)` derived from Stripe subscription's `discount.coupon.id`; existing seat-counting helper unchanged |
| `apps/web/src/lib/billing/webhook-handlers.ts` | Branch on `session.mode`; new `applyInvoiceSucceeded` (period grant + previous-period expiry); new `applyChargeRefunded` |
| `apps/web/src/app/api/stripe/webhook/route.ts` | Add `charge.refunded` to enabled events |
| `apps/web/src/lib/auth/create-user.ts` | Insert `trial_grant` ledger row in same transaction as User insert |
| `apps/web/src/app/(marketing)/pricing/page.tsx` | 3-card grid, no annual toggle (Phase 0, done) |
| `apps/web/src/app/(marketing)/_components/pro-card.tsx` | Renamed from pricing-tiers; no interval toggle; cap copy (Phase 0, done) |
| `apps/web/src/app/(marketing)/_components/limitless-card.tsx` | NEW (Phase 0, "Available soon", done) |
| `apps/web/src/app/teacher/billing/page.tsx` | Add usage meter (current period grants - consumes), top-up button, history table from ledger |
| `apps/web/src/components/trial-banner.tsx` | Switch to balance-aware copy: "X papers remaining" instead of "X / 20" — works for trial, PPU, and approaching-cap states |
| `apps/web/src/lib/admin/credits/queries.ts` | NEW — `listUsersWithBalance` (single grouped SUM) and `getUserLedgerHistory` (per-user entries with grantor email) |
| `apps/web/src/lib/admin/credits/mutations.ts` | NEW — `grantPapersToUser` (admin-issued grants with audit log) and `deleteLedgerEntry` (hard delete for fixture cleanup) |
| `apps/web/src/app/admin/credits/page.tsx` | NEW — server shell |
| `apps/web/src/app/admin/credits/_components/credits-table.tsx` | NEW — user table with Ledger + Grant action buttons |
| `apps/web/src/app/admin/credits/_components/grant-papers-dialog.tsx` | NEW — modal form with optimistic balance preview |
| `apps/web/src/app/admin/credits/_components/user-ledger-sheet.tsx` | NEW — Sheet showing per-user ledger entries with delete-with-confirm |
| `apps/web/src/components/admin-sidebar-nav.tsx` | Add Credits nav entry |
| `packages/db/src/ledger.ts` | NEW (Phase 4.5) — shared `insertConsumesForGradingRuns` and `lookupCurrentPeriodId` helpers; both web commit-service and backend Lambda delegate to these so the consume-row shape can't drift between caller sites. Takes Prisma client / tx as arg. |
| `apps/web/src/lib/billing/__tests__/ledger-shared.test.ts` | NEW (Phase 4.5) — 9 unit tests against fake Prisma store covering early-return paths, payload shape, replay no-ops |
| `apps/web/src/lib/batch/lifecycle/commit-service.ts` | Phase 4.5 reserve-on-submit — pre-gen `crypto.randomUUID()` per submission, create OcrRun(pending) + GradingRun(pending) + paper_ledger consume rows atomically inside the existing `db.$transaction` |
| `apps/web/src/lib/marking/stages/mutations.ts` | Phase 4.5 reserve-on-submit for re-mark + re-scan; `assertPapersQuota` rename |
| `apps/web/src/lib/billing/types.ts` | Phase 4.5 — drop `TrialExhaustedError` alias; rename `TRIAL_ERROR_PREFIX` → `BALANCE_ERROR_PREFIX` |
| `infra/billing.ts` | Phase 4.5 medium #4+#6 — new `LimitlessProduct` + 2 prices, new `PpuProduct` + 2 prices; StripeConfig gains `plans.limitless`, `ppu`, `foundersDiscountPercent`; `proPaperCap` renamed to `proMonthlyGrantSize`. Phase 5 — new `TopUpProduct` + 2 prices; StripeConfig gains `topUp.{papersPerPurchase, gbp, usd}` and `ppu.papersPerSet` |
| `apps/web/src/app/(marketing)/pricing/page.tsx` | Phase 4.5 medium #4 — drop hardcoded PPU/Limitless/founders constants; read all amounts from `Resource.StripeConfig`. Phase 5 — pass `signedIn` to PpuCard |
| `sst-env.d.ts` | Phase 4.5 medium #4+#6 — mirror new StripeConfig shape. Phase 5 — extend with `topUp` + `ppu.papersPerSet` |
| `apps/web/src/lib/billing/checkout-payment.ts` | NEW (Phase 5) — `createPpuCheckoutSession` + `createTopUpCheckoutSession`. `mode: payment` Checkout sessions with `metadata.kind` + `metadata.user_id` for the webhook fulfilment path |
| `apps/web/src/lib/billing/currency.ts` | NEW (Phase 5) — moved from `(marketing)/_lib/currency.ts` so both marketing /pricing and in-app /teacher/billing can read the cookie |
| `apps/web/src/lib/billing/webhook-translation.ts` | Phase 5 — new `decideCheckoutSessionAction` discriminated decision for `checkout.session.completed` events |
| `apps/web/src/lib/billing/webhook-handlers.ts` | Phase 5 — new `applyCompletedCheckoutSession` calling `insertPpuPurchase` / `insertTopUpPurchase`; `applyChargeRefunded` comment expanded with the deferred-design rationale |
| `apps/web/src/app/api/stripe/webhook/route.ts` | Phase 5 — `checkout.session.completed` now routes to `applyCompletedCheckoutSession` (was a logged stub) |
| `apps/web/src/lib/billing/ledger.ts` | Phase 5 — new `getCurrentPeriodUsage` (period grant + per-period consume sum + period bounds) for the billing meter + trial banner |
| `apps/web/src/lib/billing/error-toast.ts` | Phase 5 — extracted `parseInsufficientBalanceError` helper shared between toast + cap-bite modal trigger |
| `apps/web/src/app/(marketing)/_components/ppu-card.tsx` | Phase 5 — wired live "Buy a set" / "Sign in to buy" CTA via `createPpuCheckoutSession` |
| `apps/web/src/app/teacher/billing/page.tsx` | Phase 5 — period-usage meter card for capped Pro, BuyTopUpButton, currency-aware top-up price |
| `apps/web/src/app/teacher/billing/_components/buy-topup-button.tsx` | NEW (Phase 5) — calls `createTopUpCheckoutSession` and redirects |
| `apps/web/src/app/teacher/exam-papers/[id]/page.tsx` | Phase 5 — fetch currency + top-up price + papers count, pass to shell for cap-bite modal |
| `apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx` | Phase 5 — accept currency/topUp props, local `capBiteMessage` state, render `<CapBiteModal>` |
| `apps/web/src/app/teacher/exam-papers/[id]/cap-bite-modal.tsx` | NEW (Phase 5) — Top-up + See-plans CTAs, returns user mid-flow to the same exam paper |
| `apps/web/src/app/teacher/exam-papers/[id]/hooks/use-batch-ingestion.ts` | Phase 5 — optional `onCapBite(message)` callback; insufficient-balance errors trigger the modal instead of the generic toast |
| `apps/web/src/components/trial-banner.tsx` | Phase 5 — extended to also serve capped Pro users at ≥80% of the period grant; reads `getCurrentPeriodUsage` |
| `apps/web/src/lib/billing/__tests__/error-toast.test.ts` | NEW (Phase 5) — 5 tests for `parseInsufficientBalanceError` |
| `apps/web/src/lib/billing/__tests__/webhook-translation.test.ts` | Phase 5 — 6 new tests for `decideCheckoutSessionAction` |

---

## Estimated effort

- Phase 0 (UI only) — **✅ done 2026-05-02**
- Phase 1 (Stripe infra) — **✅ partial done 2026-05-02** (founders coupon, proPaperCap, charge.refunded). PPU + top-up + Limitless Stripe Products + Prices land in Phase 5 alongside checkout.
- Phase 2 (schema + ledger) — **✅ done 2026-05-02**. `db:push` not yet run on any deployed stage — that's a deploy step.
- Phase 3 (entitlement + ledger helpers) — **✅ done 2026-05-02**. 23 new unit tests. Pure/impure file split for testability.
- Phase 4 (webhooks + Lambda + auth seeding + admin Credits) — **✅ done 2026-05-02**. Includes admin Credits Grant + Ledger view + entry delete.
- Phase 4.5 (pre-Phase-5 cleanup) — **✅ HIGH + MEDIUM DONE 2026-05-03**. All medium items (4, 5, 6) shipped alongside the high-priority work. 9 new unit tests for shared ledger helpers, 415/415 unit tests green. Low-priority items (7-10) deferred.
- Phase 5 (PPU + top-up checkout + in-app top-up surface) — **✅ DONE 2026-05-03**. 11 new unit tests (decideCheckoutSessionAction + parseInsufficientBalanceError). 426/426 unit tests green. Auto-reverse on `charge.refunded` deferred (schema decision needed); plan-contextual cap-bite copy + 80%/90% one-shot toast deferred to post-launch polish.
- Phase 6 (deploy-time migration) — **stuartbourhill ✅ DONE 2026-05-03** (7 trial_grants + 109 consume rows, balance shape verified). Auth.ts hoist + SQL `BEGIN/COMMIT` wrappers landed alongside. Production deploy + backfill pending; runbook is `docs/deploy-runbook-2026-05-03-pricing-restructure.md`.
- Phase 7 (relocate Stripe webhook → Lambda Hono route) — **NOT STARTED**. Blocking smoke-test of paid flows in `sst dev` (Next.js routes don't tunnel to localhost; ApiGateway+Lambda routes do). ~2.5 hours for the recommended Option A. Reference implementation is `/Users/stuartbourhill/dev/kiddo`. Self-contained section above includes the full file plan + hand-off context for a fresh conversation.

**Realistic total: ~6 working days end-to-end** (was 5 before the data-layer rework — the unified ledger is a half-day more upfront in exchange for not needing a refactor at scale). Phase 0 (already shipped) unblocks Geoff's review of the page; Phases 1-6 land sequentially on a feature branch.

---

## What this plan does NOT cover

- Schools / MAT / exam-board pricing (separate B2B sales motion, quoted not transacted)
- Annual subscription UX (kept in infra, no public surface)
- Convert-PPU-credits-to-subscription discount (post-launch nudge, not v1)
- Multi-pack PPU (e.g. 3 sets for £25) — explicitly skipped per Geoff's "self-evident jumps" psychology
- Limitless founders' discount (defaulted to "no" — confirm with Geoff)
- Bundle pricing (e.g. department of 5 teachers) — out of scope, separate project

These are deliberate cuts to keep v1 shippable. Each can be added later without re-architecting the ledger or entitlement system — the unified ledger model in particular is designed so future kinds (school-allocated credits, gift packs, referral grants) plug in as new `LedgerEntryKind` enum values without disturbing existing code.
