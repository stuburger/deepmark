# Transactional Emails — Build Plan

Status: Proposed (2026-05-06)
Owner: Stuart
Scope: One PR. PostHog analytics is a follow-up PR that will plug into the same bus.

---

## Goal

Wire up our first transactional emails. Get to a place where:

1. A new user receives a welcome email immediately after signup.
2. A user upgrading to Pro / Unlimited / paying for a PPU set / buying a Pro top-up receives the right email exactly once.
3. The teacher who started a marking batch receives an email when the whole batch finishes grading, alongside the existing Web Push notification.

While we're at it, lay the architectural groundwork so the next PR (PostHog) and any future reactive feature (Slack, in-product feed, weekly digest) plugs into the same primitive without entangling concerns.

---

## Architecture: EventBridge bus, single-purpose subscribers

We adopt the EventBridge pattern fwdcheck uses, with one correction: **each subscriber owns one concern.** fwdcheck's `PostHogSubscriber` mixes analytics forwarding and transactional email side-effects into a single handler — that's the shape we explicitly do not want.

```
                 ┌──────────────────────────┐
   emit  ───────▶│   sst.aws.Bus EventBus   │──▶ EmailSubscriber       (this PR)
   sites         └──────────────────────────┘──▶ PushSubscriber        (this PR — moved off the inline call)
                                              ──▶ AnalyticsSubscriber   (next PR — PostHog)
```

Each subscriber filters by `source` pattern and is a separate Lambda with its own DLQ. Emit sites do `PutEvents` and walk away — they have no knowledge of consumers.

### Event taxonomy

Source naming mirrors fwdcheck's `<app>.<domain>` convention:

| Source            | Detail-type               | Emitted from                                   |
| ----------------- | ------------------------- | ---------------------------------------------- |
| `deepmark.users`  | `user.signed_up`          | OAuth user.create branches in `auth.ts`        |
| `deepmark.billing`| `subscription.upgraded`   | `applySubscriptionToUser` — first transition into `pro_monthly` or `unlimited` |
| `deepmark.billing`| `ppu.purchased`           | `applyCompletedCheckoutSession` when `metadata.kind === "ppu"` |
| `deepmark.billing`| `topup.purchased`         | `applyCompletedCheckoutSession` when `metadata.kind === "topup"` |
| `deepmark.marking`| `batch.completed`         | `checkAndNotifyBatchCompletion` — atomic point in `student-paper-grade.ts` |

The `detail` payload carries the minimum the consumers need (user id, plan, batch id, etc.). Subscribers re-fetch any heavier context from the DB so we don't bloat the event envelope.

### EmailSubscriber filter

```ts
pattern: {
  source: ["deepmark.users", "deepmark.billing", "deepmark.marking"],
}
```

The handler dispatches by `detail-type` to the right template + recipient resolver.

### PushSubscriber filter

```ts
pattern: {
  source: ["deepmark.marking"],
  "detail-type": ["batch.completed"],
}
```

For now, only batch completion produces a push; the subscriber stays narrow.

---

## Email provider: SES via `sst.aws.Email` + react-email

- **SES** because it's SST-native, cheap, and matches the fwdcheck pattern for DNS/DKIM. Route 53 hosted zone confirmed.
- **react-email** for templates so we can mirror `apps/web/src/app/design-system` tokens by inlining CSS. JSX templates means a snapshot test per template is trivial.
- Sender domain: `mail.getdeepmark.com` (suggested — confirm at implementation). From: `DeepMark <hello@mail.getdeepmark.com>`. Reply-to: `support@getdeepmark.com`.

The octopus logo (`apps/web/public/octopus-logo.png`) renders in the masthead of every email. We host it on the public website (no CID attachments) so it loads consistently across clients.

---

## Discount-agnostic upgrade copy

> Stuart's ask: model this so it works for any discount, not just founders.

Today the only discount is the 6-month founders 40%-off. Tomorrow we may run a "back-to-school 20% off for 3 months" or a "MAT bulk discount." The Pro welcome email needs to say "you're paying £X/mo for the next N months, then £Y/mo thereafter" without hard-coding "founders."

**Approach.** When we receive the Stripe `customer.subscription.created` (or `.updated` upgrade transition), we read `subscription.discounts` from the Stripe object. If a discount is active, we capture three primitives on the event payload:

```ts
type ActiveDiscount = {
  amountOff: number          // discounted monthly amount in minor units (post-discount)
  standardAmount: number     // full monthly amount in minor units
  currency: "gbp" | "usd" | "eur"
  endsAt: Date | null        // when the discount expires; null = forever
}
```

We compute `amountOff` from the price + Stripe coupon (`percent_off` or `amount_off`). `endsAt` comes from `discount.end` if `coupon.duration === "repeating"`, else null for `forever`, else `subscription.current_period_end` for `once`.

The email template takes the `ActiveDiscount` (or null) and renders accordingly:

- No discount: `"You're on Pro. £24/mo, billed monthly."`
- Time-bounded discount: `"You're on Pro at £14.40/mo until 5 November 2026, then £24/mo."`
- Forever discount (rare): `"You're on Pro at £14.40/mo, billed monthly."`

This means we never hard-code the founders branding in the email path. The pricing page can still call it "founders" — that's a marketing concept. The email speaks in terms of "you have an active discount" and lets the discount expire naturally.

---

## Emit points

### 1. User signup

**File:** `packages/backend/src/auth.ts`

The OAuth callback has two `db.user.create` branches (GitHub at line 109, Google at line 145). Both run only on first login by construction (`findFirst` → `create`). After each `create`, we:

```ts
await emitEvent({
  source: "deepmark.users",
  detailType: "user.signed_up",
  detail: { userId: user.id, email: user.email, signupMethod: "github" /* or "google" */ },
})
```

`emitEvent` is a thin wrapper around `EventBridgeClient.PutEvents` living in `packages/backend/src/lib/events/emit.ts`. It's fire-and-forget with one synchronous retry; it never blocks signup. If publish fails the welcome email is missed — acceptable, and we log loudly so we notice.

### 2. Stripe billing events

**File:** `packages/backend/src/billing/webhook-handlers.ts`

Three new emit calls:

- **`subscription.upgraded`** — inside `applySubscriptionToUser`, after the DB write, only when `previousPlan !== newPlan && newPlan in {pro_monthly, unlimited}`. Capture `userId`, `plan`, and the `ActiveDiscount` (see above) from the Stripe object passed in.

- **`ppu.purchased`** — inside `applyCompletedCheckoutSession` when `metadata.kind === "ppu"`. Detail: `{ userId, currency, amount, papersGranted }`.

- **`topup.purchased`** — same handler, when `metadata.kind === "topup"`. Detail: `{ userId, currency, amount, papersGranted }`.

The "first transition only" guard for upgrades is mandatory: monthly Pro renewals must not re-trigger the welcome email. We compare the user's plan in the DB row before write to the new plan from the Stripe event.

### 3. Marking batch complete

**File:** `packages/backend/src/processors/student-paper-grade.ts:451-519`

`checkAndNotifyBatchCompletion` already has the atomic idempotency we need: it sets `batch_ingest_jobs.notification_sent_at` inside a `WHERE notification_sent_at IS NULL` UPDATE, so only one Lambda wins the race. Replace the inline `sendWebPush` call (~line 507) with a single `emitEvent` call:

```ts
await emitEvent({
  source: "deepmark.marking",
  detailType: "batch.completed",
  detail: { batchJobId, uploadedBy: batch.uploaded_by, totalSubmissions: batch.total_student_jobs },
})
```

Both `EmailSubscriber` and `PushSubscriber` consume this event. The CTA in the email links to the **submissions tab** of the relevant marking page (route TBD by the implementer — confirm the canonical URL shape during build).

---

## Subscribers

### EmailSubscriber

**Location:** `packages/backend/src/processors/email-subscriber.ts`
**Linked resources:** `email` (sst.aws.Email), `neonPostgres` (for recipient lookups & discount expiry checks).
**DLQ:** mandatory, with `maxReceiveCount: 3` per the pre-launch spend rule.

Dispatch table:

```ts
{
  "user.signed_up":          renderWelcomeEmail,
  "subscription.upgraded":   ({ plan }) => plan === "unlimited" ? renderUnlimitedEmail : renderProEmail,
  "ppu.purchased":           renderPpuEmail,
  "topup.purchased":         renderTopupEmail,
  "batch.completed":         renderMarkingCompleteEmail,
}
```

Each `render*` is a pure function returning `{ subject, html, text, to }`. Tests assert on the returned object, not on SES.

### PushSubscriber

**Location:** `packages/backend/src/processors/push-subscriber.ts`
Wraps the existing push-notification logic now living inline in `student-paper-grade.ts:507`. We move that logic verbatim, adapt the input from "called inside the grader" to "received from the bus," and the grade processor stops importing `web-push` entirely.

---

## Email templates

All templates live in `packages/backend/src/emails/`:

```
emails/
  _components/
    layout.tsx            — masthead w/ octopus logo, footer with unsubscribe placeholder
    button.tsx            — primary CTA, mirrors design-system token shape
    card.tsx              — bordered surface for content blocks
    discount-line.tsx     — renders the ActiveDiscount sentence (Pro upgrade only)
  welcome.tsx              — user.signed_up
  welcome-to-pro.tsx       — subscription.upgraded → pro_monthly
  welcome-to-unlimited.tsx — subscription.upgraded → unlimited
  ppu-thank-you.tsx        — ppu.purchased
  topup-thank-you.tsx      — topup.purchased
  marking-complete.tsx     — batch.completed
```

### Styling

- Inline CSS via react-email's primitives, mirroring the design tokens from `apps/web/src/app/design-system`. Hex values are unavoidable in email (no CSS variables in Outlook), so we hand-port the relevant token values into a single `email-tokens.ts` constant module that's hand-checked against `globals.css`. The `lint:tokens` allowlist gets `packages/backend/src/emails/**` added with a justification comment.
- Geist isn't web-safe; fall back to a system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
- Octopus logo renders at the top of every template, linked to `https://getdeepmark.com`.

### Copy outlines

- **welcome:** Warm greeting, what DeepMark is in two lines, "Mark your first paper" CTA → dashboard. Mention the 20-paper free allocation.
- **welcome-to-pro:** Confirms plan, prints the discount-agnostic line, links to `/teacher/settings/billing`. Lists "what you get on Pro" succinctly.
- **welcome-to-unlimited:** Confirms plan, no caps language, billing link.
- **ppu-thank-you:** Confirms 30 papers added, papers-remaining count, link to dashboard. No subscription guilt-trip — keep it transactional.
- **topup-thank-you:** Confirms 15 extra papers added on top of monthly Pro allocation, link to dashboard. Different wording from PPU per Stuart's note.
- **marking-complete:** "Your batch '{{batchName}}' is ready for review — {{count}} scripts marked." CTA → submissions tab of the relevant batch.

---

## Infrastructure changes

### `infra/email.ts` (new)

Mirrors fwdcheck's per-stage shape but simpler — DeepMark has just `production` and per-developer dev stages. Production uses `mail.getdeepmark.com`; dev stages get `mail-{stage}.dev.getdeepmark.com` (or similar — confirm DNS strategy on implementation, since DeepMark doesn't have a `.ninja` wildcard like fwdcheck).

```ts
export const email = $app.stage === "production"
  ? new sst.aws.Email("Email", {
      sender: "mail.getdeepmark.com",
      dns: sst.aws.dns({ zone: GETDEEPMARK_ZONE_ID }),
    })
  : new sst.aws.Email("Email", {
      sender: `mail-${$app.stage}.dev.getdeepmark.com`,
      dns: sst.aws.dns({ zone: GETDEEPMARK_ZONE_ID }),
    });
```

### `infra/events.ts` (new)

```ts
export const bus = new sst.aws.Bus("EventBus");

bus.subscribe(
  "EmailSubscriber",
  {
    handler: "packages/backend/src/processors/email-subscriber.handler",
    link: [email, neonPostgres],
    timeout: "30 seconds",
    memory: "512 MB",
  },
  {
    pattern: { source: ["deepmark.users", "deepmark.billing", "deepmark.marking"] },
    transform: { deadLetterQueue: { /* DLQ */ } },
  }
);

bus.subscribe(
  "PushSubscriber",
  {
    handler: "packages/backend/src/processors/push-subscriber.handler",
    link: [neonPostgres, vapidKeys],
    timeout: "30 seconds",
    memory: "512 MB",
  },
  {
    pattern: { source: ["deepmark.marking"], "detail-type": ["batch.completed"] },
    transform: { deadLetterQueue: { /* DLQ */ } },
  }
);
```

DLQs are non-negotiable per the pre-launch spend rule (CLAUDE.md). They're plain `sst.aws.Queue` resources alongside the existing OCR/grading DLQs in `infra/queues.ts`.

### `infra/api.ts` / handler-side

The web app's server actions (Stripe webhook is on the API Lambda, signup is on the web app's auth handler) need IAM permission to `events:PutEvents` on `bus.arn`. SST's `link: [bus]` handles this — every emit-site Lambda gets the bus linked.

---

## Tests

### Unit tests (Vitest, colocated)

- `packages/backend/src/emails/__tests__/discount-line.test.ts` — table-driven cases: no discount, time-bounded, forever, edge cases (discount expiring same day as renewal, 100%-off coupon).
- One snapshot test per template asserting the rendered HTML is stable. Templates are pure render-functions; no snapshots of SES output.
- `packages/backend/src/billing/__tests__/upgrade-detection.test.ts` — confirms the "first transition only" guard fires on `none → pro`, `none → unlimited`, `pro → unlimited`, but not on `pro → pro`. This logic lives in a pure helper so it's testable without Stripe.
- `packages/backend/src/lib/events/__tests__/active-discount.test.ts` — confirms we map Stripe `coupon.duration` (`once`/`repeating`/`forever`) + `percent_off`/`amount_off` to the right `ActiveDiscount` shape and `endsAt`.

### Integration

No new integration test for email delivery itself — SES is a black box and we don't want flaky network tests in CI. Instead:

- Manually trigger each emit point in dev (`sst dev`) and verify the rendered email lands. SES sandbox mode means we have to verify recipient addresses; the dev stage uses our own emails, which is fine.
- The existing batch-grading integration test (`packages/backend/tests/integration/`) will gain an assertion that the bus received a `batch.completed` event (we can stub `EventBridgeClient` for this).

---

## Migration / cutover

This is a clean break — there's no production traffic. Order:

1. Land bus + email infra + emit helper. No subscribers wired yet.
2. Add `EmailSubscriber` with all five templates and dispatch.
3. Add `PushSubscriber` and remove the inline `sendWebPush` from `student-paper-grade.ts`. **Verify push still works in dev before merging.**
4. Wire emit calls at the three sites (auth, webhook, grader).
5. Manual end-to-end smoke in dev: signup with a fresh OAuth account, run a Stripe test upgrade, run a small marking batch.

No feature flag. No dual-write. We don't ship the bus and then ship subscribers in a follow-up — the entire path lands together so failure modes are obvious.

---

## Out of scope (confirmed)

- Payment-failed dunning emails.
- Refund/cancellation emails.
- Email verification (OAuth handles identity).
- Password change / email change flows.
- Unsubscribe management beyond a placeholder footer (transactional emails are exempt from CAN-SPAM / GDPR opt-out; we'll add it when we ship marketing emails).

---

## Follow-up PRs

- **PostHog `AnalyticsSubscriber`.** Subscribes to a broader source pattern (likely `deepmark.*`), forwards to PostHog. Demonstrates the bus pattern paying off — zero changes to the email path.
- **Per-script enrich complete event** (`deepmark.marking`, `submission.enriched`) once the annotation pipeline is live. Will not auto-email teachers per script — only batches.
- **Slack subscriber for ops alerts** (e.g., DLQ messages). Trivial once the bus exists.

---

## Open items at implementation time

1. Confirm sender subdomain: `mail.getdeepmark.com` vs `email.getdeepmark.com` vs sending from the apex.
2. Confirm canonical submissions-tab URL shape for the marking-complete CTA.
3. Confirm the Route 53 hosted-zone ID linkable name (matches fwdcheck's `FWDCHECK_ZONE_ID` pattern).
4. Decide whether dev stages share one `mail-dev.getdeepmark.com` SES identity or each developer gets their own — fwdcheck uses per-stage, which is the safer default.

---

## Definition of done

- Five templates render and send via SES in `production` and at least one dev stage.
- Five emit sites publish to the bus and we can see the events in EventBridge console.
- Web Push still fires on batch completion (now via `PushSubscriber`).
- Both subscribers have working DLQs and `maxReceiveCount: 3`.
- All five emails received in a manual end-to-end smoke test.
- `lint:tokens` updated with the email-templates allowlist + justification.
- Tests green: snapshot per template, discount-line table tests, upgrade-detection guard.
