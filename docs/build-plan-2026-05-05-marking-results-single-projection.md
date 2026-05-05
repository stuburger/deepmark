# Build Plan — Marking Results: Single Projection (2026-05-05)

Self-contained plan to fix a structural data-modelling problem surfaced while debugging the marketing homepage counter. The goal: make `marking_results` a queryable, normalised projection of the Yjs doc, written by the same projection Lambda that already owns `student_paper_annotations` and `grading_runs.grading_results`. Eliminate the dual source-of-truth + the snapshot-time persistence path that was never reliably populated.

---

## Context summary for a fresh chat

**The bug that surfaced this.** The marketing homepage shows `0 hours saved` and `0+ personalised comments generated` despite 159 graded papers in production. The counter source is `db.markingResult.count()` (`apps/web/src/app/(marketing)/_lib/papers-marked.ts:31`). On querying prod: `marking_results` has **0 rows**. So does `answers`. So does any path that needs them.

**Why the table is empty.** The grade Lambda only persists `Answer` + `MarkingResult` rows when the `student_submission` has been linked to a `Student` record:

```ts
// packages/backend/src/processors/student-paper-grade.ts:448
async function persistAnswerRowsIfLinked(args) {
  if (!args.sub.student_id) return  // ← bails here
  await persistAnswerRows({...})
}
```

In prod, **0 of 186 submissions have `student_id` set**. The grading pipeline never auto-creates a Student. The only place a submission gets linked is `apps/web/src/lib/marking/submissions/mutations.ts:54` — a manual teacher action, currently unused.

**Why the schema forces the gate.** `Answer.student_id` is non-nullable with an FK to `students` (`schema.prisma:366`). `MarkingResult.answer_id` is non-nullable with an FK to `answers` (`schema.prisma:384`). You literally cannot write a normalised row for an unlinked script — the FK rejects it. The "if linked" guard is the workaround.

**Why nothing visibly broke.** When annotations + Yjs landed, the teacher UI was reworked to read grade data from `grading_runs.grading_results` (a JSON column populated by the projection Lambda from the Yjs doc) instead of `marking_results`. Per the comment in `packages/backend/src/processors/student-paper-grade.ts:417`:

> `grading_results` is no longer written here — the doc is the source of truth for per-question grade metadata, and the projection Lambda mirrors it onto this column on every snapshot via `writeGradingResults`.

So `marking_results` quietly went vestigial. The grade Lambda still tries to write a snapshot at completion time (when a Student happens to be linked), but the doc is the live truth. **Two would-be sources of truth, one of which is a stale completion-time snapshot, both gated on a state the live flow doesn't establish.** Hence: 0 rows, broken counter, broken MCP tools, no foundation for analytics.

**Why we can't just point the marketing counter at annotations and walk away.** Stuart's analytics use cases — "average score for this question across all submissions", "how is this student doing across mock papers", "which question is the easiest/hardest" — need normalised, indexable per-(question, submission) score rows. Querying JSONB UNNEST over `grading_runs.grading_results` works at 200 submissions and breaks down at 20k. Bread-and-butter teacher analytics shouldn't be a sequential scan + JSONB unnest each time.

**The chosen fix: single projector, two outputs.** The Yjs doc remains the live source of truth. The annotation-projection Lambda (`packages/backend/src/processors/annotation-projection.ts`) already derives 4 things from each Yjs snapshot (annotations, gradingResults JSON, examinerSummary, teacherOverrides). Add a 5th derivation: `Answer` + `MarkingResult` rows. Both the JSON column and the normalised rows are then *projections of the same input*, written by *one* writer in *one* invocation. They cannot drift.

Then delete the snapshot-at-completion path entirely (`persistAnswerRows`, `persistAnswerRowsIfLinked`). Make `Answer` belong to `student_submission` (not `student`), so the projection runs whether or not a Student has been linked.

**Source files to read first:**
- `packages/backend/src/processors/annotation-projection.ts` — the existing single-source projection Lambda. Add the new write here.
- `packages/backend/src/lib/annotations/projection-diff.ts` — the diff/idempotence pattern for `replaceAnnotations`. Mirror this for marking results.
- `packages/backend/src/processors/student-paper-grade.ts` lines 370-460 — the snapshot-time persistence path being deleted.
- `packages/backend/src/lib/grading/persist-answers.ts` — being deleted.
- `packages/backend/src/services/mark-answer.ts` — the eval/MCP path that ALSO writes `MarkingResult` directly. Stays, but its signature changes (no `student_id` requirement, attribute via `submission_id`).
- `packages/db/prisma/schema.prisma:347-400` — `Student`, `Answer`, `MarkingResult` models.
- `packages/shared/src/...` (search for `deriveGradingResultsFromDoc`) — the doc-derivation that produces the per-question results array. Same input feeds the new write.
- Memory: `feedback_no_grandfathering_prelaunch.md` — zero users, schema breaks fine, no compat shims.

**Decisions already made — do not relitigate:**

| Question | Decision |
|---|---|
| Keep both stores or pick one? | **Both, with a single writer.** JSON stays for the existing UI reads; rows added for analytics. Single projection => no drift. |
| Doc remains source of truth? | **Yes.** Yjs doc is live truth. Both JSON column and normalised rows are derived projections. |
| `Answer.student_id` — nullable, or move FK? | **Move FK.** `Answer` belongs to `student_submission`. Add `submission_id` (non-null), drop the direct `student_id` FK. Student linkage becomes derivable through the submission, not a precondition. |
| Drop `marking_results` entirely instead? | **No.** Stuart needs SQL analytics over per-question scores (avg by question, per-student trajectory across papers, hardest/easiest question). JSONB UNNEST won't scale; rows + indexes will. |
| Keep snapshot-at-completion path as a fallback? | **No.** Delete `persistAnswerRows` + `persistAnswerRowsIfLinked` entirely. Single writer is the whole point. |
| Migrate existing data? | **No.** Pre-launch, zero users, no data to preserve. Drop and reset; the projection re-derives on the next Yjs save. |
| Should `markAnswerById` (eval/MCP path) keep writing rows? | **Yes** — it's the one-off "mark this single answer" tool, runs outside the doc/Yjs flow. Keep, but adapt to the new Answer shape (FK by `submission_id`). |
| Marketing counter — annotations or marking_results? | **`marking_results`.** Once populated, it's the right semantic source for "personalised comments per graded answer" and gives a defensible `hoursSaved` derivation per answer rather than per overlay. |
| Schema sync mechanism | `bun db:push --force-reset` in dev (per CLAUDE.md). No Prisma Migrate. |

---

## What's already in place — don't rebuild

- `annotation-projection.ts` Lambda triggered on S3 ObjectCreated for `yjs/*.bin` snapshots. Already idempotent. Already does 4 parallel writes.
- `deriveGradingResultsFromDoc(node)` in `@mcp-gcse/shared` — produces per-question `GradingResult` items from a parsed PM doc. This is the input we want.
- `replaceAnnotations(submissionId, derived)` pattern — diff-then-converge against existing rows. Mirror this exactly.
- The Lambda already resolves `latestGradingRun` for the submission to attribute AI-authored rows. Reuse.
- Stage isolation guard (`if (parsed.stage !== STAGE) return`). Reuse.
- `markAnswerById` in `services/mark-answer.ts` — eval/MCP path. Keep, adapt for new schema.

---

## Target architecture

### Data flow

```
                  Yjs doc (live source of truth)
                          │
                          ▼
              S3 snapshot (yjs/*.bin)
                          │
                          ▼
      annotation-projection Lambda (single writer)
                          │
        ┌─────────────────┼─────────────────────────┬──────────────────┐
        ▼                 ▼                         ▼                  ▼
student_paper_      grading_runs.            student_submission.  teacher_overrides
annotations         grading_results          examiner_summary    (rows)
(rows)              (JSON, current UI)
                          │
                          └──────► NEW: writeMarkingResults projection ◄──────
                                            │
                                            ▼
                                 answers + marking_results (rows)
```

### Schema shift

**Before** (current):

```
Student (1) ──< Answer (N) ──< MarkingResult (N)
                  │
                  └─ student_id  NOT NULL  FK→students(id)
```

**After** (target):

```
StudentSubmission (1) ──< Answer (N) ──< MarkingResult (N)
                            │
                            ├─ submission_id  NOT NULL  FK→student_submissions(id)
                            ├─ question_id    NOT NULL  FK→questions(id)
                            └─ student_id     (DROPPED — derivable via submission.student_id)
```

`Student` keeps `answers` relation only via the submission's link, not directly. Cross-paper student progress queries become:

```sql
SELECT q.text, AVG(mr.total_score::float / mr.max_possible_score)
FROM marking_results mr
JOIN answers a ON a.id = mr.answer_id
JOIN student_submissions s ON s.id = a.submission_id
JOIN questions q ON q.id = a.question_id
WHERE s.student_id = $1 AND s.superseded_at IS NULL
GROUP BY q.id, q.text
```

— a normal indexed JOIN. No JSON traversal.

### Idempotence model (mirrors annotations)

Stable identity for an `Answer`:  `(submission_id, question_id)` — at most one Answer per question per submission. Use a unique constraint and upsert.

Stable identity for a `MarkingResult`: 1:1 with `Answer`. The Yjs doc encodes one current grade per question, so we replace-on-upsert. We do NOT keep historical `MarkingResult` rows — Yjs already is the temporal store, and per-projection-pass row churn would defeat the diff pattern.

```
For each derived GradingResult from the doc:
  upsert Answer by (submission_id, question_id)
  upsert MarkingResult by answer_id (replace fields)
Delete MarkingResult/Answer rows for (submission_id) where question_id no longer in derived set.
```

This converges in one pass, never inserts duplicates, and tolerates partial doc states.

---

## Implementation steps

### 1 — Schema change

`packages/db/prisma/schema.prisma`:

- `Answer`: drop `student_id` field + relation. Add `submission_id String` + `submission StudentSubmission @relation(...)`. Add `@@unique([submission_id, question_id])`.
- `Student`: drop `answers Answer[] @relation("StudentAnswers")` line.
- `StudentSubmission`: add `answers Answer[]` relation.

```bash
bun db:push --force-reset    # pre-launch — wipe and reapply, no migration needed
bun db:generate
```

Verify: `bun typecheck` from monorepo root surfaces every code site that referenced `Answer.student_id` / `Answer.student`. Each one needs updating in step 2 or 3.

### 2 — Add `writeMarkingResults` to the projection Lambda

In `packages/backend/src/processors/annotation-projection.ts`:

- Import a new `writeMarkingResults(submissionId, derived: GradingResult[])` helper.
- Call it in the `Promise.all` block alongside the existing four writes (line 121).
- The helper resolves the `MarkScheme` per question, upserts `Answer` keyed on `(submission_id, question_id)`, upserts `MarkingResult` keyed on `answer_id`, and deletes orphaned rows for questions no longer in `derived`. Wrap the whole thing in a Prisma `$transaction` so partial failures don't half-write.
- Mirror the diff helper pattern from `lib/annotations/projection-diff.ts` — keep the diff logic in a sibling file (`lib/grading/marking-result-projection.ts`) so it stays unit-testable without S3/Yjs.

`Answer.student_answer` comes from `derived.gradingResults[i].student_answer`. `MarkingResult.mark_points_results`, `feedback_summary`, `llm_reasoning`, `level_awarded`, `why_not_next_level`, `cap_applied` — all already in the `GradingResult` shape produced by `deriveGradingResultsFromDoc`. No new prompt, no new LLM call.

`mark_scheme_id` resolution: `findFirst` by `question_id` (same approach as `mark-answer.ts:43`). One query per derived result; in practice the question list is short enough not to matter, but if we see hot-path concerns, batch it with a single `findMany` and a Map.

### 3 — Delete the snapshot-at-completion writer

- Delete `packages/backend/src/lib/grading/persist-answers.ts` entirely.
- Delete `persistAnswerRowsIfLinked` from `packages/backend/src/processors/student-paper-grade.ts` (lines 381 + 448-457). Remove the `import { persistAnswerRows } from "@/lib/grading/persist-answers"` line.
- The grade Lambda no longer writes `Answer` / `MarkingResult` directly. It only owns `grading_runs` lifecycle (status, timestamps, errors) + paper-level metadata (examiner_summary). The projection owns everything else.

### 4 — Adapt `markAnswerById` (eval/MCP path)

`packages/backend/src/services/mark-answer.ts` writes `MarkingResult` directly for the one-off "mark this single answer" MCP tool. It runs outside the doc/Yjs flow (e.g. mark scheme test runs). Keep it, but:

- Update `loadAnswer` include / signature so `Answer` is fetched by id but uses `submission_id` for the relation chain (no longer joins through `Student`).
- The actual write logic at lines 109-133 stays — it's still creating one MarkingResult per Answer. The Answer must already exist (precondition of the tool). No behavioural change beyond the schema rename.

### 5 — Update the marketing counter

`apps/web/src/app/(marketing)/_lib/papers-marked.ts`:

- Switch `personalizedComments` from `db.markingResult.count()` to a query that counts `MarkingResult` rows where the parent submission is current (`superseded_at IS NULL`). Stale superseded rows shouldn't inflate the public counter.
- Adjust `SECONDS_SAVED_PER_ANSWER` if needed — 45s/answer is fine; defer tuning.

```ts
const personalizedComments = await db.markingResult.count({
  where: { answer: { submission: { superseded_at: null } } },
})
```

### 6 — Verification

- Trigger the projection on a known submission (touch a Yjs doc, or replay an S3 snapshot manually) and confirm rows appear in `answers` + `marking_results` with the expected `submission_id` and per-question scores.
- Edit an annotation that adjusts a score in the teacher UI. Confirm the projection re-runs and the `marking_results` row updates without duplicating the `Answer`.
- Delete an annotation that removes a question's grading. Confirm orphan deletion fires.
- Run `bun test:integration --project backend:integration` to confirm nothing in the existing backend integration suite regresses.
- Marketing homepage: confirm the counter shows non-zero comments + hours saved against current prod data after the projection has rerun on existing snapshots.

A backfill might be needed for the projection to populate rows for already-graded submissions whose Yjs docs haven't been touched since the change. Two options: (a) wait for the next teacher edit to trigger a snapshot, (b) write a one-off script that lists current submissions, downloads their latest Yjs snapshot from S3, and invokes `processRecord` directly. Option (b) is preferred so the marketing counter shows real data on day one. Add `scripts/backfill-marking-results.ts` in `packages/backend/scripts/` for this. Script must support a `--dry-run` flag that logs what it would write without persisting, so a bulk rerun can be sanity-checked before it touches `marking_results`.

---

## Tests

The architectural premise is "single writer, idempotent, derived from one input." Tests must defend that premise — not just type-checking, not just one diff unit test.

### 1. Diff helper — unit (new)

`packages/backend/src/lib/grading/__tests__/marking-result-projection.test.ts`

Pure-function tests over the diff helper extracted in step 2. No Prisma, no S3 — feed in `(existingRows, derivedFromDoc)` and assert the planned `{ upserts, deletes }` operations.

Cases:
- Insert: derived has questions [A,B,C], existing rows none → 3 upserts, 0 deletes.
- Update: existing row for question A with `total_score=2`, derived has A with `total_score=3` → 1 upsert (with new score), 0 deletes.
- Delete-orphan: existing rows for [A,B,C], derived has only [A,B] → 1 upsert (or 0 if A,B unchanged), 1 delete for C.
- No-op: existing rows match derived exactly (same scores, same feedback) → 0 ops, or upserts that are field-identical (depending on whether we short-circuit equal fields). Document and lock in whichever behaviour we choose.
- Empty derived: doc parses to no questions → all existing rows for the submission are deleted.

### 2. Projection idempotence — integration (new)

`packages/backend/tests/integration/marking-result-projection.test.ts`

Hits a real DB via the existing integration harness (same one that backs `attribution-evals.test.ts`). Seeds a submission + grading run, invokes `processRecord` against a fixture Yjs snapshot from S3 (or an in-memory equivalent), then invokes it **a second time on the same input** and asserts:
- Row count in `answers` and `marking_results` is identical after the second run.
- No `Answer` row has been recreated (compare `created_at` is stable across both runs).
- `MarkingResult.updated_at` either is stable (if the helper short-circuits) or is the only thing that changed — never the awarded score, never the feedback content, when input is unchanged.

This is the test that actually defends the "cannot drift" claim. Without it, the diff helper test is just unit-level vibes.

### 3. `markAnswerById` (eval/MCP) — integration (update existing)

If a test exists for `services/mark-answer.ts`, update it for the new schema. If not, add a thin one: seed a submission + answer (now via `submission_id`), invoke `markAnswerById`, assert the `MarkingResult` row is created and the relation chain back to `StudentSubmission` resolves.

This is the smoke test that the FK move didn't silently break the MCP write path.

### 4. Marketing counter query — unit (new)

`apps/web/src/app/(marketing)/_lib/__tests__/papers-marked.test.ts` (web:unit project).

Seed two submissions, one with `superseded_at = null`, one superseded. Each has a marking result. Assert `getMarketingStats().personalizedComments` returns 1, not 2. The Prisma traversal `{ answer: { submission: { superseded_at: null } } }` is exactly the kind of nested filter that's easy to get wrong silently — pin it.

### 5. Grade Lambda lifecycle regression — integration (verify, not new)

After deleting `persistAnswerRowsIfLinked`, the existing grade-lambda integration test (whichever drives a submission to `grading_run.status='complete'`) must still pass without modification. If no such test exists, add a minimal one: enqueue a synthetic grade event, assert the run reaches `complete` and `Answer` / `MarkingResult` rows do **not** appear (those now come from the projection, which the grade Lambda no longer triggers).

This is the negative assertion: the grade Lambda has stopped writing rows. Without it, the deletion in step 3 could regress and you'd never know until the projection diverges from production data.

### 6. Backfill script dry-run — manual

The `scripts/backfill-marking-results.ts --dry-run` should print expected row counts for current submissions without writing. Run it on dev before letting the live version touch `marking_results`. Not an automated test, but a checklist item.

### What to run

```bash
bun typecheck
bun test:unit
AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
  bunx vitest run --project backend:integration
```

All green before merging. Same hard rule as the attribution evals: no mocking the projection — these are real DB writes against the dev branch.

---

## Things to delete

- `packages/backend/src/lib/grading/persist-answers.ts` (whole file)
- `persistAnswerRowsIfLinked` function and its call in `student-paper-grade.ts`
- The unused `import { persistAnswerRows }` in `student-paper-grade.ts`
- `Answer.student_id` field, `Answer.student` relation, `Student.answers` relation in `schema.prisma`
- Any stale type-imports referencing `Answer.student` after `bun db:generate`

---

## Out of scope (for this PR)

- Auto-creating a `Student` per submission. Student linkage stays manual; the projection runs without it.
- Cross-paper analytics queries / UI. Schema unblocks them; building them is separate work.
- The MCP tool `mark-results/create` — its `markAnswerById` callee is adapted but the tool's API surface doesn't change.
- Indexes for analytics. Add later, when query patterns stabilise. The unique `(submission_id, question_id)` index is sufficient for the projection's correctness.
- Telemetry / metrics for divergence (there shouldn't be any with one writer, but a periodic invariant check could be valuable later).

---

## Acceptance criteria

1. `marking_results` row count > 0 in dev after projection runs on a graded submission.
2. Marketing homepage shows non-zero comments + hours saved (after backfill, if applied).
3. Editing an annotation that changes a score → next Yjs snapshot → corresponding `marking_results` row's `total_score` updates. No duplicate `Answer` rows for the same `(submission_id, question_id)`.
4. `bun typecheck` clean across the monorepo.
5. `bun test:unit` + `bun test:integration --project backend:integration` clean.
6. All six test items in the Tests section above are completed (1–5 automated, 6 manual checklist before backfill runs live).
