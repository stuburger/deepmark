# Billing + Launch Handoff — 2026-05-01

Session covering: marketing landing, Stripe billing end-to-end, in-app trial UX, MCQ extraction bug fix, and a cleanup pass on the result. Bookends the May 15 launch infra work.

---

## 1. MCQ extraction bug — `C - Farming`

### Symptom

Submission `cmolh3tba000002lau6ezpz8u` (Aijaz Ariana, GCSE Business): Q1.1 and Q1.3 marked 0/1 despite being correct. Marker reasoning: `Deterministic MCQ: student [A, C, F, G, I, M, N, R], correct [C]. Zero marks.`

### Root cause

`runOcr` in `packages/backend/src/lib/scan-extraction/gemini-ocr.ts` returned `selected_labels: ["C - Farming"]` instead of `["C"]`. `resolveMcqAnswers` joined to `"C - Farming"`, then `DeterministicMarker` stripped non-letter chars and got 8 letters that couldn't possibly equal `["C"]`.

The OCR LLM occasionally pulled the option text alongside the letter — schema and prompt were too loose.

### Fix — defence in depth

1. Tightened **schema description** of `selected_labels` (calls out the wrong values explicitly: `['C - Farming']` and `['Farming']` are wrong; `['C']` is right).
2. Tightened **prompt body** — dropped "or option text" from the indication list, added inline negative example.
3. New **post-parse normaliser** `normalizeMcqLabel` in `packages/backend/src/lib/scan-extraction/normalize-mcq-label.ts` — extracts leading 1–3 uppercase letters followed by non-letter or end-of-string. `"C - Farming"` → `"C"`, `"Farming"` → `""` (defers to attribution fallback). Applied in `runOcr`'s mapping before returning.

Tests: `packages/backend/tests/unit/normalize-mcq-label.test.ts` (9 cases including the regression).

---

## 2. Marketing landing page (DEE-20)

### Routing

- New `(marketing)` route group with its own minimal root layout (no teacher sidebar). Nav + footer only.
- Old `app/page.tsx` (redirect-only) deleted.
- `(marketing)/page.tsx` checks `auth()`: signed-in → redirects to `/teacher/mark`; otherwise renders the landing. SEO-friendly server-rendered HTML.

### Sections (single scrolling page, voice in brackets)

1. **Top nav** — wordmark + Sign in
2. **Hero** *(Outlaw → Hero)* — *"Marking all weekend isn't normal."* + promise + CTA + live counter
3. **Caregiver beat** — *"You're not slow. The job is too big."*
4. **Sage product section** — 3 cards (Scan / Mark / Annotate)
5. **Sample script proof** — `aspect-ratio` placeholder for DEE-15 videos
6. **How it works** — 3 alternating steps with screenshot placeholders
7. **Pricing strip** — links to /pricing
8. **Final CTA** — *"Take your evenings back."*
9. **Footer** — links to stub policy pages

Files all live in `apps/web/src/app/(marketing)/_components/`.

### Live "papers marked" counter

`apps/web/src/app/(marketing)/_lib/papers-marked.ts` — `unstable_cache` wrapper around `db.studentSubmission.count` filtered to non-superseded submissions with at least one complete grading run. 5-min revalidate. Rendered server-side into the hero.

### Stub pages

`/pricing`, `/privacy`, `/safeguarding`, `/terms` — all under `(marketing)/`. Pricing is the real billing UI; the others are placeholders awaiting DEE-19 / DEE-25 / etc.

---

## 3. Pricing strategy

### Unit economics (sampled in this session, May 2026)

50 most recent grading runs in production:

| Metric | USD | GBP (~×0.79) |
|---|---|---|
| Median | $0.094 | £0.075 |
| P90 | $0.119 | £0.095 |
| Max | $0.193 | £0.155 |

**87% of cost is Claude Sonnet on OCR.** Single biggest cost lever: switching OCR primary to Haiku 4.5 (~¼ price) or Gemini Flash (~1/40) would collapse per-paper cost by ~10×. Not done in this session — flagged.

### Tiers (locked)

**Trial** — 20 papers free, no card. Hard cap. Counts re-marks + re-scans.

**Pro Monthly** — £29/mo (GBP) · $35/mo (USD)
**Pro Annual** — £312/yr (GBP, 10.3% off) · $378/yr (USD, 10% off)

**Founders' offer** — first 100 customers, 50% off year one. One Stripe Coupon (50% / `repeating` / `duration_in_months: 12` / `max_redemptions: 100`). Server-side count gates whether the coupon is auto-attached at checkout; Stripe-side `max_redemptions` is the backstop.

### Currency

GBP + USD only at launch. Auto-detect via CloudFront `cloudfront-viewer-country` header in middleware → `dm-currency` cookie → user can override via switcher on `/pricing`. ZAR/AUD deferred until those markets justify the tax-registration overhead.

### Admin role

`user.role === "admin"` → unlimited marking, never gated. Geoff + Stuart.

---

## 4. Stripe infrastructure

### SST config

`sst.config.ts` — added `stripe` provider (apiKey from `process.env.StripeSecretKey`).

`infra/billing.ts` — declarative Stripe resources:
- 1 `stripe.Product` (Pro)
- 4 `stripe.Price` (GBP/USD × monthly/annual)
- 1 `stripe.Coupon` (founders, 50% / 12mo / 100 redemptions)
- 1 `stripe.WebhookEndpoint` (`https://${domain}/api/stripe/webhook`)
- `StripeConfig` Linkable exposing all IDs + `foundersSlotLimit` + `trialPaperCap`
- `StripeWebhookSecret` Linkable
- 2 Secrets: `StripeSecretKey`, `StripePublishableKey`

`FOUNDERS_SLOT_LIMIT = 100` is a single constant in this file driving both the Coupon and the Linkable — single source of truth.

### Schema additions to User

```prisma
stripe_customer_id     String?  @unique
stripe_subscription_id String?  @unique
plan                   String?  // null = trial; "pro_monthly" | "pro_annual"
subscription_status    String?  // active | trialing | past_due | canceled | ...
current_period_end     DateTime?
```

### Stage setup checklist

```bash
# Local — for SST stripe provider to provision Products/Prices/Coupon
export StripeSecretKey=sk_test_...

# Per stage — used by the running app
bunx sst secret set StripeSecretKey      sk_test_... --stage=<stage>
bunx sst secret set StripePublishableKey pk_test_... --stage=<stage>
```

`StripeWebhookSecret` is auto-generated by the WebhookEndpoint resource — no manual `sst secret set`.

**Stripe Customer Portal** must be configured once in the Stripe Dashboard (Settings → Billing → Customer portal). Test/live mode have separate configs. First call will 400 with a clear message if missing.

---

## 5. Billing app code

All under `apps/web/src/lib/billing/`:

| File | Role |
|---|---|
| `types.ts` | `Currency`, `Interval`, `PlanId`, `TRIAL_PAPER_CAP`, `TRIAL_ERROR_PREFIX`, `TrialExhaustedError` |
| `plans.ts` | `resolvePrice`, `priceTiers`, `formatPrice` (handles fractional units) |
| `stripe-client.ts` | Lazy-init Stripe SDK |
| `quota.ts` | `countCompletedGradingRuns`, `trialPaperCap` (leaf module) |
| `entitlement.ts` | `Entitlement` discriminated type, `isActivelyEntitled`, `getEntitlement`, `enforcePapersQuota` — single source of truth for "can this user mark another paper?" |
| `founders.ts` | `foundersSlotsRemaining`, `foundersAvailable` — reads `Resource.StripeConfig.foundersSlotLimit` |
| `stripe-customer.ts` | `ensureStripeCustomer` — find-or-create with persist-back |
| `checkout-options.ts` | Pure: `decideCheckoutCouponOrPromo`, `buildCheckoutSessionParams` (+ `CouponOrPromo` type) |
| `checkout.ts` | `createCheckoutSession` server action — orchestration only |
| `portal.ts` | `createBillingPortalSession` — Stripe Customer Portal redirect |
| `webhook-translation.ts` | Pure: `extractCustomerId`, `subscriptionToUserUpdate`, `identifyUserCriteria`, `invoiceOutcomeToStatus` |
| `transient-error.ts` | Pure: `isTransientError` (Prisma codes P1001/P1002/P1008/P1017/P2024/P2034 + init/panic) |
| `webhook-handlers.ts` | Impure: `applySubscriptionToUser`, `clearSubscriptionFromUser`, `applyInvoiceToUser` — read input → call translator → write to db |
| `error-toast.ts` | Client: `surfaceMarkingError(input)` — strips trial sentinel, renders sonner with Upgrade action |

### Webhook route

`apps/web/src/app/api/stripe/webhook/route.ts`:
- Signature verification via `stripeClient().webhooks.constructEvent`
- Dispatches to handlers
- **Failure model**: signature mismatch → 400; transient handler error → 500 (Stripe retries with backoff); permanent error → 200 + loud log (retrying won't help)

### Country-detection middleware

`apps/web/src/middleware.ts` — reads `cloudfront-viewer-country` (and Vercel/CF fallbacks), writes `dm-currency` cookie. Matcher excludes `/api/` entirely (was a bug — was only excluding `/api/internal`, fixed).

---

## 6. Quota gate

### `markingAction` factory

`apps/web/src/lib/authz/marking-action.ts` — composes `authenticatedAction` with `enforcePapersQuota({ user, additionalPapers: 1 })`. Used by single-paper actions.

### Where it's applied

| Action | File | Cost |
|---|---|---|
| `retriggerGrading` | `lib/marking/stages/mutations.ts` | 1 paper |
| `retriggerOcr` | `lib/marking/stages/mutations.ts` | 1 paper |
| `commitBatch` | `lib/batch/lifecycle/mutations.ts` | counts net-new submissions in the batch |

`commitBatch` calls `enforcePapersQuota` inline (not via factory) because the additional-papers count is the staged-script count, not 1.

### `triggerGrading` was deleted

Confirmed dead via grep. No UI callers, no Lambda callers. Removed from `marking/stages/mutations.ts`.

### `enforcePapersQuota` flow

1. `getEntitlement(userId)` → admin/active/trial
2. admin or active → pass
3. trial → check `used + additionalPapers > cap`, throw `TrialExhaustedError` if so

Lambda processors should re-check the same gate before doing real work — flagged as TODO; client-side check can race (double-click, multi-tab).

### Error → toast → upgrade

`TrialExhaustedError` flow:
1. Server: `handleServerError` prefixes with `TRIAL_ERROR_PREFIX = "[trial-exhausted] "` (`lib/billing/types.ts`, single source of truth)
2. Client: `surfaceMarkingError(serverError)` detects prefix, strips it, renders sonner toast with **Upgrade** action button → `/pricing`
3. Plain `toast.error` for everything else

Six callsites use `surfaceMarkingError` — re-scan-button, stage-pips-hooks (×2), re-run-menu (×2), use-batch-ingestion.

---

## 7. In-app billing surfaces

### Trial banner

`apps/web/src/components/trial-banner.tsx` — server component, mounted in `app/teacher/layout.tsx` between AppNavbar and `<main>`. Three escalating tones:
- **Default (>5 left):** muted info — `Free trial · X of 20 papers used`
- **Warning (≤5 left):** amber
- **Exhausted (0 left):** red — `Trial complete — upgrade to keep marking. **Upgrade now**`

Renders nothing for admin and active users (`getEntitlement.kind !== "trial"`).

### `/teacher/billing` page

`apps/web/src/app/teacher/billing/page.tsx` — three states:
- **Admin** → "Admins have unlimited marking."
- **Paid** (has `plan && subscription_status`) → plan name, status badge, renewal/access-ends date, **Manage subscription** button → opens Stripe Billing Portal
- **Trial** → progress bar (used/cap), remaining count, **Upgrade to Pro** CTA

Sidebar nav entry added in `components/teacher-sidebar-nav.tsx` ("Billing" with `CreditCard` icon).

### Pricing card

`apps/web/src/app/(marketing)/_components/pricing-tiers.tsx` — monthly/annual toggle, founders strikethrough display:

- **Without founders**: `£29` / per month
- **With founders (monthly)**: `£14.50` ~~£29~~ / per month for year one / Then £29/mo after.
- **With founders (annual)**: `£156` ~~£312~~ / £13/mo billed annually for year one / Then £312/yr after.

Card has `overflow-visible` override (default Card has `overflow-hidden` for image children, which clipped the floating badge).

Currency switcher (`_components/currency-switcher.tsx`) — pill toggle, calls `setCurrency` server action that writes the cookie + revalidates.

---

## 8. Stripe gotchas hit

1. **`discounts` + `allow_promotion_codes` are mutually exclusive parameters.** Even `allow_promotion_codes: false` alongside `discounts: [...]` trips Stripe's validation. The `decideCheckoutCouponOrPromo` helper returns one or the other, never both. Regression test in `__tests__/checkout-options.test.ts`.

2. **`current_period_end` moved.** In Stripe API 2026-04-22 it's on `subscription.items.data[0].current_period_end`, not on the subscription itself. Translation helper handles both (uses items[0], returns null if absent).

3. **Customer field shape.** Stripe `Subscription.customer` can be a string id, an expanded `Customer` object, or a `DeletedCustomer`. `extractCustomerId` normalises all three.

4. **API version pin.** `stripe-client.ts` pins `apiVersion: "2026-04-22.dahlia"` to match the SDK's expected literal.

---

## 9. Tests

All colocated in `__tests__/` folders next to the code. Vitest's `web:unit` project picks up `src/**/__tests__/**/*.test.ts`.

| Test file | Cases | Covers |
|---|---|---|
| `lib/billing/__tests__/webhook-translation.test.ts` | 14 | Customer field shapes, period_end on items[0], plan metadata fallback, all 8 status values, lookup-criteria branches |
| `lib/billing/__tests__/transient-error.test.ts` | 14 | Each transient code + permanent codes (P2002, P2025, P2003, P2014) + init/panic + null/string/duck-typed |
| `lib/billing/__tests__/checkout-options.test.ts` | 8 | Coupon/promo decision (incl. mutual-exclusion regression) + `buildCheckoutSessionParams` |
| `packages/backend/tests/unit/normalize-mcq-label.test.ts` | 9 | The "C - Farming" regression + edge cases |

**CLAUDE.md was updated** to remove the incorrect "tests must not import from `apps/web/`" rule and replace it with a "Test Colocation" subsection documenting the actual `__tests__/` convention.

DEE-40 (CI for tests + evals) will pick all of this up via `bun test:unit`.

---

## 10. Cleanup hit list — final state

✅ #1 `sst-env.d.ts` regenerated
✅ #2 middleware matcher excludes all `/api/`
✅ #3 unified `getEntitlement` (admin/active/trial discriminated union)
✅ #4 founders slot limit deduped via `Resource.StripeConfig.foundersSlotLimit`
✅ #5 webhook + checkout pure-helper tests
✅ #7 webhook transient/permanent split (5xx vs 200)
✅ #8 dead `triggerGrading` removed
✅ #10 `createCheckoutSession` split (`ensureStripeCustomer`, `decideCheckoutCouponOrPromo`, `buildCheckoutSessionParams` all extracted)
✅ #11 `formatPrice` handles fractional units (closed incidentally by founders strikethrough work)

Skipped:
- ⏭️ #9 sentinel prefix on trial errors — defensible, single source of truth in `types.ts`. Refactor to typed metadata if/when we add a second client-branchable error.

---

## 11. Known gaps / follow-ups

1. **Lambda-side quota re-check** — web-side gate is not enough on its own. The grade Lambda should call `enforcePapersQuota` before doing real work to handle race conditions (double-click, multi-tab, queued retries).
2. **OCR cost reduction** — 87% of per-paper spend is Claude Sonnet on OCR. Switching OCR primary to Haiku 4.5 or Gemini Flash would dramatically improve gross margin. No correctness work; pure cost play. Worth A/B before locking pricing publicly.
3. **Stripe Customer Portal config** — must be set up in Stripe Dashboard before the "Manage subscription" button works in each environment (test mode + live mode separate).
4. **Currency expansion** — ZAR + AUD whenever those markets justify the tax-registration overhead. Schema is ready (separate `stripe.Price` per currency × interval); just add 4 more Prices and update the `StripeConfig.plans.pro.prices` map.
5. **Founders' badge after slots fill** — left up indefinitely per product call. Server-side coupon attachment respects the count, so no risk of over-redemption — UX just becomes slightly stale.
6. **`triggerGrading` was deleted** — if anything else needs the same shape, it'd need to be rebuilt with `markingAction` + the appropriate authz spec.

---

## 12. Constants worth remembering

| Thing | Value | Where |
|---|---|---|
| Trial paper cap | 20 | `Resource.StripeConfig.trialPaperCap` (set in `infra/billing.ts`) |
| Founders slot limit | 100 | `Resource.StripeConfig.foundersSlotLimit` + `Coupon.maxRedemptions` |
| GBP monthly | £29 (`2900` cents) | `infra/billing.ts` |
| GBP annual | £312 (`31200` cents) — 10.3% off | `infra/billing.ts` |
| USD monthly | $35 (`3500` cents) | `infra/billing.ts` |
| USD annual | $378 (`37800` cents) — 10% off | `infra/billing.ts` |
| Stripe API version | `2026-04-22.dahlia` | `lib/billing/stripe-client.ts` |
| Trial error sentinel | `[trial-exhausted] ` | `lib/billing/types.ts` |
| Currency cookie | `dm-currency` | `middleware.ts`, `_lib/currency.ts` |
| Webhook URL | `https://${domain}/api/stripe/webhook` | `infra/billing.ts` |

---

## 13. Linear ticket status

- **DEE-9** (deepmark.co.uk redirect) — orthogonal, not done in this session
- **DEE-15** (product videos) — placeholder slots in landing, pending content
- **DEE-16** (landing copy) — provisional copy written in voice, awaiting Geoff's revision
- **DEE-17** (Joe Hillier DPA) — orthogonal
- **DEE-18** (wire up UI end-to-end) — partially helped via marketing landing; main work pending
- **DEE-19** (GDPR policy) — stub page only
- **DEE-20** (landing page + counter) — ✅ landed
- **DEE-21** (pricing strategy) — ✅ locked (this session)
- **DEE-25** (safeguarding policy) — stub page only
- **DEE-26** (Stripe) — ✅ landed
- **DEE-40** (CI for tests + evals) — pending; tests are ready

---

*Stuart Bourhill · Geoff Waugh · DeepMark · 2026-05-01*
