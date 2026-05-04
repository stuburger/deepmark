# Batch Segmentation Fix — Build Plan

**Status:** approved, not started
**Owner:** Stuart
**Date drafted:** 2026-05-04
**Trigger:** production batch `cmorezqfn000302lb6v5rkn62` stuck on "Analysing upload…" for 38 min after Geoff uploaded a 700-page / 44 MB business mocks PDF (`GWAUGH Exams.pdf`, 25 scripts × 28 pages).

---

## 1. Context — what broke

The `BatchClassifyQueue` Lambda (`packages/backend/src/processors/batch-classify.handler`) crashed 8+ consecutive times on this upload — `Runtime.OutOfMemory` and `timeout` alternating — never wrote a failure status, never reached the staging step. The user's UI sat on "Analysing upload… scripts will appear shortly" indefinitely. With no DLQ and 4-day SQS retention, the message would have kept retrying for ~3 more days.

### Already mitigated (done during the investigation)

- ✅ Stuck batch row in production marked `status='failed'` with a teacher-readable error.
- ✅ Production `BatchClassifyQueue` purged via CLI; SQS retention reduced from 4 days → 30 min.
- ✅ `infra/queues.ts` updated: `PRELAUNCH_QUEUE_RETENTION_SECONDS = 30 * 60` applied via `transform: prelaunchRetention` to all 7 subscriber queues. DLQs intentionally kept at the SQS default (4 days) — they exist for post-mortem inspection.
- ✅ `CLAUDE.md` updated with a "Pre-launch operating mode" section: zero users, no BC, no migrations, no compat shims, infra/LLM spend is personal money. Memory entry `feedback_no_grandfathering_prelaunch.md` captures the rule for future sessions.

---

## 2. Root cause

**Unbounded `Promise.all` fan-out in `extractPdfPages`** (`packages/backend/src/lib/script-ingestion/pdf-pages.ts:49`).

Every page is processed concurrently. Each in-flight task holds: a `pdf-lib` `PDFDocument` for the single-page extract, a second `PDFDocument` re-loaded inside `extractJpegFromPdfPage` (line 125), a `singlePageBytes` Uint8Array, a `jpegBytes` Buffer, and an in-flight S3 PUT. For a 700-page PDF this fans out 700 concurrent operations holding ~3-5 MB peak each. The 1 GB Lambda heap can't hold it. The OOM is the primary failure; the timeout is GC thrash secondary failure.

`segmentPdfScripts` (`packages/backend/src/lib/script-ingestion/segment-script.ts:53`) has the **same** `Promise.all` pattern around per-page Cloud Vision calls — would compound the OOM if extract ever succeeded.

PDF size (44 MB) and Lambda timeout (4 min) are red herrings — even a 200-page well-behaved PDF would crash this code.

---

## 3. Locked-in decisions

### Concurrency bounds
- `extractPdfPages` page loop: **4** (CPU + memory bound; pdf-lib is single-threaded JS)
- `segmentPdfScripts` Vision loop: **8** (I/O bound; Cloud Vision quota tolerates this comfortably)

### Lambda sizing
- Bump `BatchClassifyQueue` subscriber memory **1 GB → 2 GB**. Crosses the AWS 1-vCPU threshold at 1769 MB and gives ~1.4 GB usable heap — meaningful safety margin on top of bounded concurrency. ~2× cost per ms but Lambda is <$0.01 per batch — pennies.

### Architecture
- **No fan-out per page.** Coordination cost (join, partial failure, distributed transactions) outweighs the win. One Lambda with bounded concurrency is the right level.
- **Don't null `jpegBuffer` after Vision.** At 2 GB the ~350 MB ambient `pages[]` array is comfortable. Worth flagging in the PR — revisit only if memory pressure shows up in CloudWatch.

### Fail-fast layers
1. **Pre-flight reject at upload boundary** (server action `triggerClassification`): inspect PDF, reject if `byteSize > 25 MB` or `pageCount > 80`. User sees error in form, instantly, zero Lambda spend.
2. **`ApproximateReceiveCount > 1` short-circuit** at the top of the handler: if we're seeing this message twice, the previous attempt crashed silently. Mark `status='failed'` with a "previous attempt crashed" message and ack. Catches OOM/timeout silent-death without needing a DLQ.
3. **DLQ + `retry: 1`** on `BatchClassifyQueue` (mirror the `studentPaperOcrDlq` pattern). DLQ subscriber writes `status='failed'` with the SQS-reported error. Belt-and-braces backstop.

### Live progress events
Write to the existing `BatchIngestJob.job_events` JSONB column. Per-source-file events at meaningful steps:
- `source_file_started` (s3 key, mime)
- `pages_extracted: N/M`
- `vision_done: N/M`
- `segmentation_complete` (script count)
- terminal `failed` (reason) or `complete`

Each event is `{ at: ISO timestamp, kind: string, ...payload }`. Append to the existing array; don't replace.

### UI
Replace the static "Analysing upload…" banner on `/teacher/exam-papers/[id]?tab=submissions` with a live status card driven by `job_events`:
- Current step + N/M progress per source file
- Per-source-file rows showing success (script count) or failure (reason)
- Final terminal state surfaces failed staged scripts alongside successful ones, so the teacher can see what happened across the batch

Polling cadence: piggyback on the existing 3-second poll in `use-batch-ingestion.ts:71-76`. No need for SSE or websockets at this scale.

---

## 4. Test strategy — four layers

| Layer | Where | What it catches | When it runs |
|---|---|---|---|
| **Unit** | `packages/backend/src/**/__tests__/` | Pure logic: `concurrencyLimit`, pre-flight checks, receive-count short-circuit, event writer, DLQ handler, validation helpers | `bun test:unit` — every change |
| **Integration (sst shell)** | `packages/backend/tests/integration/segmentation.test.ts` | End-to-end correctness against real S3 + Vision + Gemini + DB using a small fixture | `bunx sst shell --stage=stuartbourhill -- bunx vitest run …` — PR-time |
| **Lambda smoke** | same file, separate vitest project | Real OOM/timeout/native-binding behaviour against the GWAUGH 700-page fixture in deployed Lambda | `bun test:integration --project backend:lambda-smoke` — opt-in, run before merge |
| **CloudWatch watch** | manual / dashboard | `MaxMemoryUsed`, `Duration p99`, `Errors`, `Throttles` after each deploy | post-deploy |

### Why a dedicated test Lambda

A new `sst.aws.Function("BatchClassifyTestRunner", { ..., dev: false })` mirrors the queue subscriber's handler + memory + timeout, but is invokable directly via the AWS SDK. Two reasons:
- `dev: false` keeps it in real AWS even during `sst dev` (Live Lambda is bypassed). The smoke test always exercises real Lambda conditions.
- Decouples the smoke test from the actual production pipeline — no risk of test invocations interfering with real teacher uploads on shared dev stages.

Same handler module as the production subscriber. Gated to `$app.stage !== "production"` so it doesn't ship to prod.

### Fixture handling

`tmp/GWAUGH Exams.pdf` (44 MB) is too big for git. Plan:
- Keep gitignored locally
- Maintain a permanent copy in the dev S3 bucket at `s3://...stuartbourhill.../test-fixtures/segmentation/gwaugh-700-page/source.pdf`
- Smoke test downloads on first run if not present locally
- A `manifest.json` alongside in S3 records expected outcomes (script count ~25, no terminal `failed` event)

---

## 5. Build sequence (TDD, outside-in)

Each step is small enough to be a single commit. Numbered for sequencing, not for separate PRs (likely all one PR).

### Phase A — harness (enables everything else)
1. Add `BatchClassifyTestRunner` Function to `infra/queues.ts` — gated to non-prod stages, `dev: false`, 2 GB / 4 min, same handler as subscriber.
2. Bump `BatchClassifyQueue` subscriber memory 1 GB → 2 GB.
3. Add DLQ for `BatchClassifyQueue` with `retry: 1` (mirror `studentPaperOcrDlq` pattern).
4. Deploy to `stuartbourhill` stage.
5. Upload `tmp/GWAUGH Exams.pdf` to S3 fixture path; insert synthetic `batch_ingest_jobs` row.
6. Write the smoke test (`packages/backend/tests/integration/batch-classify-smoke.test.ts`) that invokes `BatchClassifyTestRunner` with synthetic SQS payload. Run → **RED** (current code OOMs). North star established.

### Phase B — fail-fast layer (DEFERRED 2026-05-04)
**Status:** intentionally skipped for now. Rationale: with the structural fix
in place we want to observe real teacher uploads and let actual edge cases
reveal themselves before pre-emptively designing for failure modes we may
not actually hit. Re-evaluate after a week of real usage. The 30-min SQS
retention cap (already shipped) bounds the worst-case retry storm — that's
our floor of safety until we add the rest.

7. ~~Pre-flight reject in `triggerClassification` server action~~
8. ~~`ApproximateReceiveCount > 1` short-circuit at top of handler~~
9. ~~DLQ handler~~

### Phase C — bounded concurrency (the actual fix)
10. `concurrencyLimit(n, items, fn)` helper in `packages/backend/src/lib/concurrency.ts` (or pull `p-limit` from npm — decide at implementation time based on weight). Unit test first.
11. Wire bounded concurrency into `extractPdfPages` — re-run unit tests for `processSourceFile` correctness (small fixture).
12. Wire bounded concurrency into `segmentPdfScripts` Vision loop.
13. Re-run smoke test → **GREEN** if the fix works. (If still red, iterate at the unit/integration layer until green.)

### Phase D — observability + UX
14. `job_events` writer helper + unit tests. Append-only updates to the JSONB array.
15. Wire event emission into `batch-classify.handler` at each meaningful step.
16. UI: replace the static banner with the live status card on `/teacher/exam-papers/[id]?tab=submissions`. Manual browser verification per CLAUDE.md.

### Phase E — capstone
17. Re-run smoke test against deployed `stuartbourhill` Lambda — confirm green.
18. Watch CloudWatch dashboard post-deploy for `MaxMemoryUsed` distribution on the GWAUGH-shaped input.
19. Manual UX walk-through: upload `GWAUGH Exams.pdf` via the dev UI, verify live progress card, verify final state surfaces all scripts.

---

## 6. Anticipated file changes

| File | Change |
|---|---|
| `infra/queues.ts` | `BatchClassifyTestRunner` Function, DLQ for `BatchClassifyQueue`, subscriber memory 1→2 GB |
| `packages/backend/src/processors/batch-classify.ts` | Receive-count short-circuit, event emission, replace `Promise.all` with bounded concurrency calls |
| `packages/backend/src/processors/batch-classify-dlq.ts` | New DLQ handler |
| `packages/backend/src/lib/script-ingestion/pdf-pages.ts` | Bounded concurrency in `extractPdfPages` |
| `packages/backend/src/lib/script-ingestion/segment-script.ts` | Bounded concurrency in Vision loop |
| `packages/backend/src/lib/concurrency.ts` (new) or import `p-limit` | Helper |
| `packages/backend/src/lib/script-ingestion/__tests__/*` | Unit tests for the above |
| `packages/backend/tests/integration/batch-classify-smoke.test.ts` (new) | Lambda-invoke smoke test |
| `packages/backend/tests/integration/fixtures/segmentation/gwaugh-700-page/manifest.json` (new) | Fixture metadata |
| `apps/web/src/lib/batch/upload/mutations.ts` | Pre-flight size + page-count rejection in `triggerClassification` |
| `apps/web/src/app/teacher/exam-papers/[id]/...` (multiple) | Live progress card replacing static banner; surface failed + successful scripts |

---

## 7. Open questions to resolve before kickoff

1. **Fixture storage location:** confirmed plan is `s3://...stuartbourhill.../test-fixtures/segmentation/gwaugh-700-page/source.pdf` — anyone OK?
2. **Pre-flight thresholds:** 25 MB / 80 pages was a first-pass guess. Worth sanity-checking against typical class sizes (30 students × ~10 pages = 300 pages might be a realistic class). Maybe higher: **40 MB / 100 pages**? Decide before writing the unit test.
3. **Who runs `sst deploy --stage=stuartbourhill`** — Stuart manually, or the agent on his behalf? Slow (~3 min) and reversible but it's his stage.
4. **Concurrency helper choice:** custom `concurrencyLimit` (10 lines) or `p-limit` from npm (battle-tested, +1 dep)? Lean toward custom to keep deps lean — but reconsider if we want it elsewhere.
5. **Pre-flight uses what to count pages?** Either `pdf-lib` (already imported, fast header parse) or a lightweight HEAD-then-Range read. `pdf-lib` is fine for the server action.

---

## 8. Definition of done

- [ ] Smoke test against the GWAUGH fixture passes consistently in deployed Lambda
- [ ] Pre-flight rejects oversized PDFs at the upload boundary with a clear error in the UI
- [ ] A silent OOM/timeout in the handler surfaces as `status='failed'` within ~5 min (via receive-count check)
- [ ] DLQ catches anything that bypasses the receive-count check, within ~10 min
- [ ] UI shows live N/M progress during segmentation and surfaces failed + successful scripts on terminal state
- [ ] CloudWatch `MaxMemoryUsed` for the GWAUGH-shaped input lands well below 2048 MB
- [ ] No "Analysing upload… scripts will appear shortly" infinite-spinner state is reachable

---

## 9. Out of scope (deliberately deferred)

- **Vision OCR caching between segmentation and per-script extract.** Highest-impact margin lever (~50% cost reduction on the per-batch happy path) but a different change with its own design — separate plan.
- **`student-paper-extract` and `student-paper-grade` Lambdas.** Same `Promise.all` patterns may exist there. Worth a separate audit pass after this fix lands; the smoke-test infrastructure built here is reusable for those queues.
- **Provisioned concurrency / cold-start optimisation.** Not needed at current scale.
