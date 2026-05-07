# Processing Batch Refactor — Build Plan

**Goal:** Split `BatchIngestJob` into two clean concepts — `BatchIngestJob` (upload + segmentation + staged-script delivery) and a new `ProcessingBatch` (OCR + grading + notification). Wire the completion email + push for *both* initial uploads and the new regrade flow, including failure modes (OCR-DLQ, grading-DLQ).

**Status going in:** the regrade button + version-expand UI just shipped on `main` (uncommitted), alongside parallel work from Stuart that added a `parent_submission_id` DAG-lineage column on `StudentSubmission`, a `submissionCloneFields` helper, and "supersede-all-active-siblings" defensive logic in the clone path. Regrades currently carry forward the original `batch_job_id` via that helper, which means no email fires when regrades complete because the batch's `notification_sent_at` is already set from the original run. See section 11 for the full inventory of what's already in the tree before this refactor starts.

---

## 1 — Why we're doing this

`BatchIngestJob` accumulated two unrelated responsibilities:

1. **Ingest lifecycle** — upload → AI segmentation → staged-script review → commit. Has its own UI surface (the staging banner, drag-and-drop review) and its own state machine (`uploading → classifying → staging → marking`).
2. **Processing notification grouping** — counting how many child grading runs have finished, then firing one email/push when all are done.

These don't share a lifecycle. Ingest is "done" when the user commits the staged scripts. Processing starts at that moment and keeps going for minutes/hours afterwards. Bundling them means:

- Regrades have no clean home (they reuse the original `batch_job_id`, which is "done" from ingest's perspective and has already fired its email).
- The completion-count query has a latent bug: it counts superseded submissions, so a single regrade against a finished batch causes the batch to falsely "re-complete".
- DLQ failure paths *don't* trigger completion checks at all — a batch where one submission permanently fails will never email the user.

Pre-launch operating mode (no users, no migrations) makes this the right time.

---

## 2 — Target architecture

```
┌─────────────────────────────────────┐
│  BatchIngestJob (ingest only)       │   No notification.
│  - uploading                        │   Owns staged_scripts + their review.
│  - classifying                      │   Terminal at `committed` or `failed`.
│  - staging                          │
│  - committed   ← new terminal       │
│  - failed                           │
└─────────────────────────────────────┘
                  │
                  │ commit creates …
                  ▼
┌─────────────────────────────────────┐
│  ProcessingBatch (new model)        │   Owns the email + push.
│  kind:  initial | re_extract | re_grade │
│  status: pending | complete | failed   │
│  total_jobs, completed_jobs, failed_jobs│
│  notification_sent_at               │
└─────────────────────────────────────┘
                  │
                  │ has_many …
                  ▼
        StudentSubmission (with processing_batch_id)
```

- **One `ProcessingBatch` per "group of N submissions being processed together"**. Initial commit creates one. Each regrade-action creates one. Each re-extract-action creates one.
- **`kind` is metadata only** — affects email copy + UI filtering, never branches the pipeline.
- **Completion criterion is uniform**: all child submissions reach a terminal state (grading complete/failed/cancelled, or OCR failed). Same check, regardless of kind.

---

## 3 — Schema changes

### 3.1 New model

```prisma
enum ProcessingBatchKind {
  initial
  re_extract
  re_grade
}

enum ProcessingBatchStatus {
  pending
  complete
  failed
}

model ProcessingBatch {
  id                   String                @id @default(cuid())
  exam_paper_id        String
  triggered_by         String
  kind                 ProcessingBatchKind
  status               ProcessingBatchStatus @default(pending)
  total_jobs           Int                   @default(0)
  notification_sent_at DateTime?
  /// Optional lineage back to the upload (only populated for `initial`).
  ingest_batch_id      String?
  created_at           DateTime              @default(now())
  completed_at         DateTime?

  exam_paper   ExamPaper        @relation(fields: [exam_paper_id], references: [id])
  triggerer    User             @relation("ProcessingBatchTriggerer", fields: [triggered_by], references: [id])
  ingest_batch BatchIngestJob?  @relation("ProcessingBatchIngest", fields: [ingest_batch_id], references: [id])
  submissions  StudentSubmission[] @relation("ProcessingBatchSubmissions")

  @@index([exam_paper_id, created_at])
  @@index([triggered_by, created_at])
  @@map("processing_batches")
}
```

### 3.2 `BatchIngestJob` — fields to drop

After backfill of `ProcessingBatch`:

- Drop `total_student_jobs`
- Drop `notification_sent_at`
- Drop `student_submissions` relation (FK on `StudentSubmission.batch_job_id` is going away — see 3.3)
- `BatchStatus` enum: drop `marking` and `complete`. Replace with a single terminal `committed`. The `failed` value stays.

### 3.3 `StudentSubmission` — column changes

- Drop `batch_job_id` (recoverable via `staged_script.batch_job_id` for the initial-upload case; null for regrades).
- Add `processing_batch_id String` (non-null, FK to `ProcessingBatch`). Add relation `processing_batch ProcessingBatch @relation("ProcessingBatchSubmissions", fields: [processing_batch_id], references: [id])`.
- Index: `@@index([processing_batch_id])`.
- **Keep** `parent_submission_id` (already added in the uncommitted working tree — explicit DAG lineage column, plus `parent` / `children` self-relations). It's complementary to `processing_batch_id`: `parent_submission_id` answers "what was this cloned from", while `processing_batch_id` answers "what notification group does this belong to".

### 3.4 Migration order (CRITICAL — this is what avoids data loss)

**Phase A — additive only (no destructive change yet):**

1. Take a Neon snapshot branch of `main` for safety. Costs nothing.
2. Add `ProcessingBatchKind` + `ProcessingBatchStatus` enums.
3. Add `ProcessingBatch` model.
4. Add `processing_batch_id String?` (nullable initially) to `StudentSubmission`.
5. `bun db:push` — new model + nullable column.

**Phase B — backfill:**

6. For every existing `BatchIngestJob`, create one `ProcessingBatch` with:
   - `kind: "initial"`
   - `triggered_by`: `BatchIngestJob.uploaded_by`
   - `status`: derive from `BatchIngestJob.status` (`complete` → `complete`, `failed` → `failed`, anything else → `pending`)
   - `total_jobs`: `BatchIngestJob.total_student_jobs`
   - `notification_sent_at`: copy verbatim
   - `ingest_batch_id`: `BatchIngestJob.id`
   - `created_at`: `BatchIngestJob.created_at`
   - `completed_at`: derive from notification_sent_at if present
7. For every `StudentSubmission`, set `processing_batch_id` to the corresponding new ProcessingBatch (joined via the old `batch_job_id`).

Run as a one-shot SQL migration script in `packages/db/prisma/migrations/manual/processing_batch_backfill.sql` (or as a `node packages/backend/scripts/...` script — pick whichever is more discoverable).

**Phase C — flip the writes (code change):**

8. Update `commit-service.ts` to also create a `ProcessingBatch` and set `submission.processing_batch_id` (still also writing `batch_job_id` to keep both populated during the transition).
9. Update `regradeSubmissions` and `retriggerOcr` (mutations.ts) to create `ProcessingBatch` rows of the appropriate `kind` and link new submissions to them. **Stop carrying forward the old `batch_job_id`.**
10. Update `checkAndNotifyBatchCompletion` (student-paper-grade.ts:463) to look up `ProcessingBatch` instead of `BatchIngestJob`. (See section 4.)
11. Update push-subscriber + email-subscriber to look up `ProcessingBatch` and `kind` (See section 4.)
12. Verify in `sst dev` that an end-to-end upload + regrade both fire the email correctly.

**Phase D — drop the redundant fields:**

13. Make `processing_batch_id` non-null in the schema. Run `bun db:push`. (Safe because backfill in Phase B set it for every row, and Phase C sets it for every new row.)
14. Drop `StudentSubmission.batch_job_id` column.
15. Drop `BatchIngestJob.total_student_jobs` and `notification_sent_at` columns.
16. Update `BatchStatus` enum: drop `marking` and `complete`, add `committed`. Update any `WHERE status IN ("marking", "complete")` queries to use the new terminal state.
17. `bun db:push` — destructive changes applied.

Each `bun db:push` between phases lets you smoke-test before the next destructive step. The Neon snapshot from Phase A is your rollback if something goes sideways.

---

## 4 — Code changes per file

### 4.1 `packages/backend/src/processors/student-paper-grade.ts`

**Function: `checkAndNotifyBatchCompletion`** (line 463) — rewrite against `ProcessingBatch`.

```ts
export async function checkAndNotifyBatchCompletion(
  processingBatchId: string,
): Promise<void> {
  const batch = await db.processingBatch.findUnique({
    where: { id: processingBatchId },
    select: {
      id: true,
      kind: true,
      total_jobs: true,
      notification_sent_at: true,
      triggered_by: true,
      exam_paper_id: true,
      exam_paper: { select: { title: true } },
    },
  })
  if (!batch || batch.notification_sent_at || batch.total_jobs === 0) return

  // Count submissions in this batch that have reached a terminal state.
  // Terminal = grading_run reached complete/failed/cancelled, OR ocr_run
  // permanently failed (in which case grading never started).
  const terminalCount = await db.studentSubmission.count({
    where: {
      processing_batch_id: processingBatchId,
      OR: [
        { grading_runs: { some: { status: { in: ["complete", "failed", "cancelled"] } } } },
        { ocr_runs: { some: { status: "failed" } } },
      ],
    },
  })
  if (terminalCount < batch.total_jobs) return

  // Tally success vs failure for the notification payload.
  const failedCount = await db.studentSubmission.count({
    where: {
      processing_batch_id: processingBatchId,
      OR: [
        { grading_runs: { some: { status: { in: ["failed", "cancelled"] } } } },
        { ocr_runs: { some: { status: "failed" } } },
      ],
    },
  })
  const successCount = batch.total_jobs - failedCount
  const overallStatus = failedCount === batch.total_jobs ? "failed" : "complete"

  // Atomic claim — only one Lambda emits the event.
  const updated = await db.processingBatch.updateMany({
    where: { id: processingBatchId, notification_sent_at: null },
    data: {
      status: overallStatus,
      notification_sent_at: new Date(),
      completed_at: new Date(),
    },
  })
  if (updated.count === 0) return

  await emitEvent({
    source: EventSource.marking,
    detailType: EventDetailType.batchCompleted,
    detail: {
      processingBatchId: batch.id,
      kind: batch.kind,
      triggeredBy: batch.triggered_by,
      totalSubmissions: batch.total_jobs,
      successCount,
      failedCount,
    },
  })
}
```

**Function: `notifyBatchIfComplete`** (line 450) — rename arg from `batchJobId` to `processingBatchId`. Caller at line 384 updates: `await notifyBatchIfComplete(args.sub.processing_batch_id)`.

### 4.2 `packages/backend/src/processors/student-paper-grading-dlq.ts`

**Currently doesn't call completion check.** Add it.

```ts
import { checkAndNotifyBatchCompletion } from "./student-paper-grade"
// ...
const sub = await db.studentSubmission.findUnique({
  where: { id: jobId },
  select: { processing_batch_id: true },
})
if (sub?.processing_batch_id) {
  await checkAndNotifyBatchCompletion(sub.processing_batch_id)
}
```

### 4.3 `packages/backend/src/processors/student-paper-ocr-dlq.ts`

Same change. After `markJobFailed` + refund, call `checkAndNotifyBatchCompletion` against `processing_batch_id`. This closes the bug where an OCR-DLQ-failed job never triggers the batch email.

### 4.4 `packages/emails/src/event-payloads.ts`

Update `BatchCompletedDetail`:

```ts
export type BatchCompletedDetail = {
  processingBatchId: string
  kind: "initial" | "re_extract" | "re_grade"
  triggeredBy: string
  totalSubmissions: number
  successCount: number
  failedCount: number
}
```

Detail-type string `batch.completed` stays the same — handlers branch on `kind` internally if they need to.

### 4.5 `packages/emails/src/index.ts` and the marking-complete template

The existing `renderMarkingCompleteEmail` takes `studentCount`. Extend its props:

```ts
{
  firstName,
  examPaperTitle,
  kind: "initial" | "re_extract" | "re_grade",
  successCount,
  failedCount,
  submissionsUrl,
  logoUrl,
}
```

Copy variants the template should support:

| kind | failedCount | Subject + body |
|---|---|---|
| `initial` | 0 | "Your N scripts for {paper} are ready" |
| `initial` | >0 & <total | "Your {paper} batch is ready — {success}/{total} marked, {failed} couldn't be processed" |
| `initial` | =total | "Marking failed — none of the {total} scripts could be processed for {paper}" |
| `re_grade` | 0 | "Your N regraded scripts for {paper} are ready" |
| `re_grade` | >0 | "{success}/{total} regrades complete for {paper} — {failed} couldn't be processed" |
| `re_extract` | * | Treat same as `initial` (re-extract is essentially "redo everything") |

### 4.6 `packages/backend/src/processors/email-subscriber.ts`

`dispatchBatchCompleted` (line 174):

```ts
async function dispatchBatchCompleted(
  detail: BatchCompletedDetail,
): Promise<Dispatched> {
  const batch = await db.processingBatch.findUnique({
    where: { id: detail.processingBatchId },
    select: {
      exam_paper_id: true,
      exam_paper: { select: { title: true } },
      triggerer: { select: { email: true, name: true } },
    },
  })
  if (!batch?.triggerer?.email) return null
  const email = await renderMarkingCompleteEmail({
    firstName: firstNameFrom(batch.triggerer.name),
    examPaperTitle: batch.exam_paper?.title ?? "your batch",
    kind: detail.kind,
    successCount: detail.successCount,
    failedCount: detail.failedCount,
    submissionsUrl: `${WEB_URL}/teacher/exam-papers/${batch.exam_paper_id}?tab=submissions`,
    logoUrl: LOGO_URL,
  })
  return { to: batch.triggerer.email, email }
}
```

### 4.7 `packages/backend/src/processors/push-subscriber.ts`

Switch lookup from `db.batchIngestJob` to `db.processingBatch` (line 58). Read `kind` for the title. Updated body should reflect success/failure counts when relevant.

### 4.8 `apps/web/src/lib/batch/lifecycle/commit-service.ts`

Inside the `db.$transaction` block (around line 92), **before** creating submissions:

```ts
const processingBatch = await tx.processingBatch.create({
  data: {
    exam_paper_id: batch.exam_paper.id,
    triggered_by: uploadedBy,
    kind: "initial",
    total_jobs: confirmedScripts.length,
    ingest_batch_id: batchJobId,
  },
})
```

Pass `processingBatch.id` into the submission creation (`processing_batch_id: processingBatch.id`). Drop `batch_job_id: batchJobId` once Phase D lands. The `BatchIngestJob.update({ status: "marking" ... })` becomes `status: "committed"` and the `total_student_jobs` increment is removed.

### 4.9 `apps/web/src/lib/marking/stages/mutations.ts`

The current uncommitted state already has a `submissionCloneFields(oldSub, parentSubmissionId)` helper used by both `cloneSubmissionForRegradeTx` and `retriggerOcr`. The refactor extends this helper:

```ts
function submissionCloneFields(
  oldSub: SubmissionCloneSource,
  args: { parentSubmissionId: string; processingBatchId: string },
) {
  return {
    s3_key: oldSub.s3_key,
    // ... existing fields ...
    parent_submission_id: args.parentSubmissionId,
    processing_batch_id: args.processingBatchId,
  }
}
```

Then per call site:

- `cloneSubmissionForRegradeTx(tx, oldSubmissionId, ledger, processingBatchId)` — accepts a `processingBatchId` param, passes it into `submissionCloneFields`. Drop `batch_job_id` from the create (it was already there only because `submissionCloneFields` carries it forward — once the column is dropped from the schema in Phase D, the helper field disappears too).
- `retriggerGrading` — create a `ProcessingBatch(kind: "re_grade", total_jobs: 1)` before the transaction, pass its id into the clone call.
- `regradeSubmissions` — create one `ProcessingBatch(kind: "re_grade", total_jobs: targets.length)` at the top, pass its id into every clone call inside the loop.
- `retriggerOcr` — same as `regradeSubmissions` but `kind: "re_extract"` and `total_jobs: 1`.

The existing **"supersede all active siblings"** logic in `cloneSubmissionForRegradeTx` (the `updateMany` that supersedes everything sharing a `staged_script_id`) is preserved unchanged. Orthogonal to this refactor.

### 4.10 `apps/web/src/lib/batch/lifecycle/queries.ts`

`getActiveBatchForPaper` (line 10) — the `status: { in: [...] }` filter loses `marking`. After Phase D the only "live" ingest states are `classifying`, `staging`, `failed`. Update accordingly.

The UI uses this to show the staging banner. Once a batch is `committed`, it disappears from the banner — which is correct, because the user has finished their review and the next concern (grading progress) is rendered by the submissions tab itself.

### 4.11 `apps/web/src/app/teacher/exam-papers/[id]/batch-status-banner.tsx`

Probably no change needed — it consumes `BatchIngestionState`. But verify the `marking` branch isn't being relied on anywhere.

### 4.12 `apps/web/src/lib/batch/types.ts`

Update the `BatchStatus` import + types if any client-side enum mirroring exists. Same for any string-literal `as BatchStatus[]` lists.

### 4.13 `apps/web/src/app/teacher/exam-papers/[id]/submissions-tab-content.tsx`

Already consumes `ingestion: BatchIngestionState | null`. Should still work, but verify the post-commit / pre-marking transition still renders correctly.

---

## 5 — Failure mode email path (currently broken — fix as part of this)

**Today**: a permanently-failed job (max retries exhausted, lands in DLQ, marked `status="failed"`) **never triggers the batch completion check**. So a batch where one submission fails will never email the user — the count never reaches `total_student_jobs` because grading_run for the failed one stays at `pending` (never updated in the failure path).

**This refactor closes that bug:**

1. DLQ handlers (4.2, 4.3) call `checkAndNotifyBatchCompletion` after marking failed.
2. The completion query (4.1) treats `ocr_run.status="failed"` as a terminal state (not just `grading_run` terminal states).
3. The event payload carries `failedCount`, so the email can say "{N} couldn't be processed".

This means: even if grading fails for every submission in a batch, the user gets an email saying "Marking failed". Better than silence.

**Test cases to add** (`packages/backend/tests/integration/batch-grade-completion.test.ts`):

- Batch of 3, all succeed → one email, `failedCount: 0`.
- Batch of 3, one OCR-DLQ failure, two grade success → one email, `successCount: 2, failedCount: 1`.
- Batch of 3, one grading-DLQ failure, two success → one email, `successCount: 2, failedCount: 1`.
- Batch of 3, all OCR-DLQ failures → one email, `successCount: 0, failedCount: 3, status: failed`.
- Regrade of 2, both succeed → one email, `kind: re_grade`.
- Regrade fired against a batch whose original email was already sent → original ProcessingBatch stays `complete`, new ProcessingBatch fires its own email when regrade finishes.

---

## 6 — UI implications

### 6.1 No changes required for the regrade button

`regradeSubmissions` continues to accept `{ examPaperId, submissionIds? }`. The internal change (creating a ProcessingBatch first) is invisible to the caller.

### 6.2 Version-expand history

Already uses `staged_script_id` for grouping (just shipped). Unaffected by this refactor.

### 6.3 Submissions list

The `useSubmissions` poll/query is unaffected — it doesn't consume `batch_job_id`. The grid keeps working.

### 6.4 Optional: surface ProcessingBatch progress in the UI

Future enhancement (not part of this refactor): show "12 of 30 marked" while a batch is in flight, driven by `ProcessingBatch.total_jobs` minus the count of pending grading_runs. Skip for now.

---

## 7 — Tests to update / add

### Existing tests that will break and need updating

- `packages/backend/tests/integration/batch-grade-completion.test.ts` — currently asserts against `BatchIngestJob.notification_sent_at`. Rewrite against `ProcessingBatch`. (Note: this file already has uncommitted edits adapting it to the non-null `staged_script_id` change — make sure to rebase your changes on top.)
- `apps/web/tests/integration/commit-batch.test.ts` — verify ProcessingBatch is created at commit.
- `packages/backend/tests/integration/batch-classify.test.ts` and `batch-classify.smoke.test.ts` — should be unaffected (ingest-only) but verify.
- `packages/backend/tests/integration/end-to-end-pipeline.test.ts` — already uses `createTestStagedScript`; verify the ProcessingBatch flow lines up.
- `packages/test-utils/src/seed.ts` — already exports `TEST_BATCH_JOB_ID` and `TEST_STAGED_SCRIPT_ID` and seeds them in `ensureExamPaper()`. Add `TEST_PROCESSING_BATCH_ID` following the same upsert pattern.
- `packages/test-utils/src/fixtures.ts` — already has `createTestBatch` and the new `createTestStagedScript({ examPaperId, uploadedBy })`. Add `createTestProcessingBatch({ examPaperId, triggeredBy, kind?, totalJobs? })` alongside.

### New tests to add

- Failure-mode email tests (see section 5).
- Regrade-batch tests: assert ProcessingBatch is created, kind is `re_grade`, email fires on completion.
- Re-extract tests: same as regrade, kind `re_extract`.
- Atomic notification claim: simulate two grade Lambdas finishing concurrently for the same batch — only one event emitted.

---

## 8 — Rollout / safety

**Pre-launch**: 211 prod submissions, 58 dev submissions, all yours/Geoff's test data. No paying customers. Risk profile: low.

**Steps in order** (same as section 3.4):

1. Snapshot Neon `main` to a sibling branch (point-in-time backup, costs nothing).
2. Phase A — additive schema changes. `bun db:push`. Smoke test in `sst dev`.
3. Phase B — run backfill script against `stuartbourhill` dev branch first. Verify counts match. Then run against `main`.
4. Phase C — code changes. PR-ready. Test end-to-end flows: fresh upload, regrade, re-extract, including a deliberately-failing grade (e.g. by mocking the LLM to throw).
5. Phase D — drop redundant fields. `bun db:push`. Done.

**Rollback plan**: if Phase D feels wrong, you've still got the snapshot from step 1. `bun db:push` against the older schema and restore from the snapshot.

**Don't do `sst deploy`** (per memory: Stuart manages all deploys).

---

## 9 — Open questions for the next conversation

1. **`BatchStatus.committed` naming** — is `committed` the right terminal-success state name for ingest? Alternatives: `submitted`, `done`. Pick one and use consistently.
2. **Email template copy** — the success/failure variants in section 4.5 are placeholder. Want Geoff to review before we commit to specific strings? Pre-launch is fine to ship something reasonable and tweak later.
3. **Should `kind: re_extract` and `kind: initial` share email copy?** They have the same user-facing meaning ("we ran the full pipeline on these scripts"). My instinct is yes — collapse to one branch in the template, only `re_grade` is meaningfully different.
4. **Push notification copy** — same kind-aware variants needed in `push-subscriber.ts` body.
5. **Backfill script discoverability** — write as raw SQL (Phase B) or as a TypeScript script? Argument for SQL: it's a one-shot, transparent, audit-friendly. Argument for TS: easier to run locally with sst shell, can be tested. Default to TS in `packages/backend/scripts/backfill-processing-batches.ts`.
6. **`total_student_jobs` increments for partial commits** — `commit-service.ts` currently increments on each commit (line 184), which suggests batches can be committed in chunks. Verify whether multi-commit per batch is actually used, and if so, plan how `ProcessingBatch.total_jobs` handles it. Worst case: one ProcessingBatch per commit-event.
7. **Status filtering on `getActiveBatchForPaper`** — once `marking` is dropped from the enum, the staging banner stops appearing during grading. That's the intent (the submissions tab takes over visually) but verify no downstream code depends on the `marking` status persisting.

---

## 10 — Files touched (checklist)

**Schema:**
- [ ] `packages/db/prisma/schema.prisma` — add ProcessingBatch model + enums; later drop fields on BatchIngestJob and StudentSubmission

**Backend processors:**
- [ ] `packages/backend/src/processors/student-paper-grade.ts` — rewrite `checkAndNotifyBatchCompletion`
- [ ] `packages/backend/src/processors/student-paper-grading-dlq.ts` — call completion check
- [ ] `packages/backend/src/processors/student-paper-ocr-dlq.ts` — call completion check
- [ ] `packages/backend/src/processors/email-subscriber.ts` — switch to ProcessingBatch
- [ ] `packages/backend/src/processors/push-subscriber.ts` — switch to ProcessingBatch
- [ ] `packages/backend/scripts/backfill-processing-batches.ts` — new

**Email package:**
- [ ] `packages/emails/src/event-payloads.ts` — extend BatchCompletedDetail
- [ ] `packages/emails/src/index.ts` + template — add `kind` / `successCount` / `failedCount` props

**Web app:**
- [ ] `apps/web/src/lib/batch/lifecycle/commit-service.ts` — create ProcessingBatch, set FK
- [ ] `apps/web/src/lib/batch/lifecycle/queries.ts` — drop `marking` from active-batch filter
- [ ] `apps/web/src/lib/batch/types.ts` — update BatchStatus mirroring
- [ ] `apps/web/src/lib/marking/stages/mutations.ts` — `cloneSubmissionForRegradeTx`, `retriggerGrading`, `retriggerOcr`, `regradeSubmissions` all create ProcessingBatch
- [ ] `apps/web/src/app/teacher/exam-papers/[id]/batch-status-banner.tsx` — verify
- [ ] `apps/web/src/app/teacher/exam-papers/[id]/submissions-tab-content.tsx` — verify

**Tests:**
- [ ] `packages/backend/tests/integration/batch-grade-completion.test.ts` — rewrite
- [ ] `packages/backend/tests/integration/batch-classify.test.ts` — verify
- [ ] `apps/web/tests/integration/commit-batch.test.ts` — verify ProcessingBatch creation
- [ ] `packages/test-utils/src/fixtures.ts` — add `makeProcessingBatch` helper
- [ ] New tests for failure-mode emails (section 5)

---

## 11 — What's already done (don't redo)

All of the following are uncommitted in the working tree on `main` — verify with `git diff HEAD` before starting:

**My work (the regrade feature):**
- `staged_script_id` is non-nullable in the schema ✅
- `version_count` groups on `staged_script_id` ✅
- `getSubmissionVersions` groups on `staged_script_id` ✅
- `regradeSubmissions` action exists with editor authz, batch quota, ledger consume, SQS staggering ✅
- `cloneSubmissionForRegradeTx` helper extracted, shared with `retriggerGrading` ✅
- Version expand UI (chevron + `v3` badge + lazy-fetched sub-rows) ✅
- Regrade button + ConfirmDialog wired into submissions-header ✅

**Stuart's parallel work (don't duplicate, build on top):**
- `parent_submission_id` lineage column on `StudentSubmission` with `parent` / `children` self-relations ✅
- `submissionCloneFields(oldSub, parentSubmissionId)` helper extracted in `mutations.ts` — used by both `cloneSubmissionForRegradeTx` and `retriggerOcr` ✅
- "Supersede all active siblings sharing a `staged_script_id`" defensive logic in clone helper (handles the stale-URL fork case) ✅
- `TEST_BATCH_JOB_ID` and `TEST_STAGED_SCRIPT_ID` exported from `packages/test-utils/src/seed.ts`, seeded by `ensureExamPaper()` ✅
- `createTestStagedScript({ examPaperId, uploadedBy })` helper in `packages/test-utils/src/fixtures.ts` ✅
- `batch-grade-completion.test.ts` and `end-to-end-pipeline.test.ts` already updated to set `staged_script_id` on every submission they create ✅

**What to change in Phase C:**
- Extend `submissionCloneFields(oldSub, { parentSubmissionId, processingBatchId })` to also stamp `processing_batch_id`.
- Drop `batch_job_id` from `submissionCloneFields` once Phase D lands.
- Wrap `retriggerGrading`, `regradeSubmissions`, `retriggerOcr`, and `commit-service.ts` call sites to create a `ProcessingBatch` first and pass its id into the clone helper.

**Don't touch the supersede-all-siblings logic** — it's correct and intentional.
