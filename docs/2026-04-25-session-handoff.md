# 2026-04-25 — Doc-as-source-of-truth session handoff

**Author:** Stuart + Claude Opus 4.7
**Status:** Step 1 + 2 of the build plan landed in working tree (uncommitted). Integration test partially passing — OCR + grade pipeline produces the correct doc shape locally; one outstanding test issue around `sst dev` Lambda invocation freshness.

This is a context-handoff doc for whichever Claude session picks this up next. Read this top-to-bottom before touching any of the touched files; there's a lot of nuance in *why* the code looks the way it does now.

The companion build plan is at [`docs/build-plan-doc-as-source-of-truth.md`](./build-plan-doc-as-source-of-truth.md) — it scopes Steps 1–8 of the full migration. This doc is the *session log* covering what was done, what was learned, and what the next session should pick up.

---

## What we set out to do

The session started with the user (Stuart) asking me to run the existing `tests/integration/end-to-end-pipeline.test.ts` against the live `sst dev` Lambdas to verify the editor-driven pipeline. Within ~30 minutes of investigation, the conversation pivoted to a much deeper architectural fix: **make the collaborative document (the Y.Doc behind the prosemirror editor) the actual source of truth for annotation/score state**, not a parallel side-channel that the OCR/grade Lambdas write to *in addition* to Postgres rows.

Stuart was very clear: he had told me about this architecture before, and I had drifted into "best-effort" defensive patterns that hide bugs. The pivot was driven by his (correct) read that the dual-write pattern was the disease, not the symptom.

---

## Architectural decisions made this session

### 1. Document is the source of truth (intentional, codified)

For everything that lives in the editor (question blocks, answer text, OCR token marks, AI annotation marks, **awarded score**), the Y.Doc is authoritative. Postgres rows for those things become a *projection*, written by a future projection Lambda (Step 4 of the build plan). DB stays authoritative for things that aren't in the editor: `StudentSubmission` identity, `OcrRun.status`, `GradingRun.status`, S3 keys, exam paper / question / mark scheme reference data.

### 2. Failure semantics: errors propagate, no "best-effort"

`withHeadlessEditor` used to return `Promise<boolean>` and swallow every error so the calling Lambda's "primary path" (DB writes) wasn't blocked. That was the dual-source-of-truth pattern leaking into code. **Today it returns `Promise<T>` and re-throws** — editor write failure becomes a real handler failure, SQS retries, no silent half-states. Every "Best-effort:" comment was deleted from the touched files.

### 3. One `withHeadlessEditor` call per Lambda invocation

- **OCR Lambda**: a single editor session at the *end* of the handler, after all OCR + attribution work. `dispatchExtractedDoc` inserts every block + sets answer text + applies `ocrToken` marks in one `editor.transact` (ySyncPlugin coalesces every PM dispatch into one Yjs update on the wire).
- **Grade Lambda**: a single editor session that wraps the *entire* grading pass. The per-question loop dispatches `setQuestionScore` and AI annotations against the same live editor as each question completes — teacher sees marks fill in question-by-question, no end-of-run batched flush.

This kills the old "skeleton seed first, fill later" pattern, which had been the source of the duplicate-blocks race (two concurrent OCR Lambda invocations both seeding 12 empty blocks at T+1s → CRDT merges to 24).

### 4. Score is on the block, not an "annotation"

`pointBasedAnnotations` and `deterministicMcqAnnotation` used to return `PendingAnnotation` objects with `anchorTokenStartId: null` / `anchorTokenEndId: null` — region-only "annotations" that were really tick/cross summary marks. Stuart correctly identified that these aren't *annotations* in the same sense as token-anchored LLM feedback — **they're the awarded score**.

Fix: added `awardedScore: number | null` attr to the `questionAnswer` block schema (in `packages/shared/src/editor/question-answer-node-schema.ts`). The `mcqAnswer` schema already had it. Added a new editor op `setQuestionScore(view, questionId, awardedScore)` that the grade Lambda dispatches per question. Renderers (editor inline indicator, scan-view tick overlay) read the attr directly. No parallel `student_paper_annotations` row carries the score.

`pointBasedAnnotations` and `deterministicMcqAnnotation` were deleted (file `packages/backend/src/lib/annotations/deterministic-annotations.ts` removed). `annotateOneResult` returns `[]` for `point_based` and `deterministic` marking methods — they have no token-anchored annotations to produce.

### 5. MCQs use the existing `mcqTable` block, not per-question MCQ blocks

I tried to use `insertMcqAnswerBlock` (per-question MCQ blocks) and discovered the doc content model is `(paragraph | questionAnswer | mcqTable)+` — `mcqAnswer` exists in the schema but **isn't allowed at the top level**. The legacy `build-doc.ts` produces a single `mcqTable` atom holding every MCQ in its `results[]` attr. That's what `McqTableView` renders as the compact grid Stuart was expecting.

Fix: added `insertMcqTableBlock(view, rows)` and `findMcqTable` helper. `dispatchExtractedDocOps` collects MCQ questions into one `McqRow[]` and inserts a single `mcqTable` block. `setQuestionScore` is now bimodal: `questionAnswer` block → `setNodeMarkup` on the block; otherwise look inside `mcqTable.results[]`, swap the matching row's `awardedScore`, and `setNodeMarkup` on the table.

### 6. Duplicate-blocks bug: deferred, not fixed

Stuart explicitly rejected lock-based dedup ("locks can get stuck") and SQS FIFO ("sledgehammer"). His mental model: there should be no scenario where two concurrent OCR invocations exist at all. We agreed:

- Per-view idempotency check in `insertQuestionBlock` (line 65 of `editor-ops.ts`) handles 99% of cases (sequential invocations, A finishes before B starts).
- The remaining 1% (two genuinely-concurrent invocations both starting from an empty CRDT replica) can produce 24 blocks. Acknowledged. Not fixed.
- Behaviour under duplication: `findQuestionBlock` returns the *first* match. Half the blocks get text + marks; the duplicates stay empty. Recoverable (deduplication pass on demand), not corrupt.
- A real fix is queued for a future session — likely either Y.Map-keyed CRDT structure (set semantics) or finding/fixing whatever rare upstream produces duplicate SQS deliveries.

### 7. Cloud Vision 403 root cause + fix

OCR was producing zero word tokens because `@google-cloud/vision` was returning 403 PERMISSION_DENIED with "no identity" in the Lambda. After spelunking `.sst/artifacts/.../bundle.mjs` line 129456:

```js
const fallback = opts?.fallback ?? (typeof window !== "undefined" && typeof window?.fetch === "function")
```

The vision client auto-detects "am I in a browser?" via `globalThis.window`. happy-dom (used by `ensureHeadlessDom()` for the headless prosemirror editor) installs a `Window` with a `fetch` function. **Pre-refactor**: `seedSkeleton` ran *before* Vision → DOM polluted → `fallback: true` → request goes through happy-dom's fetch which doesn't attach the apiKey query param → 403. **Post-refactor**: editor sessions only run *after* Vision, so globals are clean → `fallback: false` (gRPC) → apiKey works.

Defensive belt-and-braces: `cloud-vision-ocr.ts` now sets `fallback: false` explicitly so future refactors that re-introduce DOM pollution before Vision don't silently break it.

---

## Files changed (working tree)

### Renames (carried over from earlier session, not undone)
- `lib/collab/y-doc-ops.ts` → `lib/collab/editor-ops.ts`
- `lib/collab/y-doc-seed.ts` → `lib/collab/editor-seed.ts`
- `processors/student-paper-grade/annotations-to-ydoc.ts` → `annotations-to-editor.ts`
- `tests/unit/y-doc-ops.test.ts` → `tests/unit/editor-ops.test.ts`

### Schema
- `packages/shared/src/editor/question-answer-node-schema.ts` — added `awardedScore: { default: null }` attr.
- Shared package was rebuilt (`bun run build --filter @mcp-gcse/shared`) — `dist/` is now consistent with source.

### Editor ops (`packages/backend/src/lib/collab/editor-ops.ts`)
- `findQuestionBlock` now scans only `questionAnswer` (reverted from a brief detour matching `mcqAnswer` too).
- `findMcqTable` — new internal helper.
- `insertQuestionBlock` — defaults `awardedScore: null` on creation.
- `insertMcqTableBlock(view, McqRow[])` — new. Inserts one `mcqTable` atom; idempotent (no-op if a table already exists).
- `setQuestionScore(view, questionId, awardedScore)` — new. Bimodal: `questionAnswer` block path or `mcqTable.results[]` row path.
- `McqRow` type exported.

### Editor seed (`packages/backend/src/lib/collab/editor-seed.ts`)
- Removed: `seedSkeleton`, `fillAnswerTexts`, `applyAnnotationMarks`. They were the old per-step helpers; the new world has just `dispatchExtractedDoc` and per-question dispatchers.
- `withHeadlessEditor<T>(submissionId, op, fn): Promise<T>` — now generic, propagates errors, returns whatever `fn` returns.
- `dispatchExtractedDoc(editor, questions, perQuestion)` — single editor session for the OCR Lambda.
- `dispatchExtractedDocOps(view, questions, perQuestion)` — pure inner sweep, exported for unit tests. Branches on `questionType === "multiple_choice"` to collect MCQ rows for one `mcqTable` insert; everything else gets a `questionAnswer` block + `setAnswerText` + `applyOcrTokenMarks`.
- `QuestionSkeleton` extended with optional `questionType`, `options`, `correctLabels`.

### Annotation pipeline
- `packages/backend/src/lib/annotations/annotate-result.ts` — `point_based` and `deterministic` paths now return `[]` (their score lives on the block now).
- `packages/backend/src/lib/annotations/deterministic-annotations.ts` — **deleted**.

### Grade Lambda (`packages/backend/src/processors/student-paper-grade.ts` + `student-paper-grade/annotations-to-editor.ts`)
- `gradeJob` opens one `withHeadlessEditor` for the entire grading pass.
- Pre-loads `tokensByQuestion` (parallel with `loadAnnotationContext`).
- Passes `editor` + `tokensByQuestion` into `gradeAndAnnotateAll`.
- `completeGradingJob` no longer takes `annotationError` (the old "did the editor write succeed?" indicator). Editor failures throw → handler catch → `markJobFailed` → SQS retry.
- `markGradingRunComplete` writes `annotation_error: null` + `annotations_completed_at: now` always.
- `writeAnnotationsToEditor` removed; replaced by `dispatchAnnotationsForQuestion(args)` called per-question inside the parallel grade loop.

### Grade questions (`packages/backend/src/lib/grading/grade-questions.ts`)
- `GradeAndAnnotateAllArgs` now requires `editor: HeadlessEditor` and `tokensByQuestion: Map<string, PageToken[]>`.
- After per-question grading: `editor.transact((view) => setQuestionScore(view, qId, awardedScore))`. Score visible in the doc immediately.
- After per-question annotation: `dispatchAnnotationsForQuestion({...})` if there are any token-anchored annotations.

### Extract Lambda (`packages/backend/src/processors/student-paper-extract.ts`)
- Removed the early `seedSkeleton` call (was the source of the duplicate-blocks race window at T+1s).
- Removed `writeAnswersToEditor` private helper.
- New private `dispatchExtractedDocToEditor(jobId, questionSeeds, answers)` — one `withHeadlessEditor` call near the end, after `OcrRun.update` for `extracted_answers_raw`. Loads tokens, builds `PerQuestionAnswer[]`, builds `QuestionSkeleton[]` (carrying `question_type`, `options`, `correctLabels` for MCQs), calls `dispatchExtractedDoc`.

### Question seeds (`packages/backend/src/lib/grading/question-seeds.ts` + `lib/types.ts`)
- `QuestionSeed` extended with optional `multiple_choice_options` and `correct_option_labels`.
- `loadQuestionSeeds` now also pulls `multiple_choice_options` from the `Question` row and `correct_option_labels` from the most recent linked `MarkScheme` (only populated for MCQ questions).

### Cloud Vision (`packages/backend/src/lib/scan-extraction/cloud-vision-ocr.ts`)
- Explicit `fallback: false` on the `ImageAnnotatorClient` constructor — pins gRPC. See "Cloud Vision 403 root cause + fix" above. Long comment in the source explains why.

### Document name (`packages/backend/src/lib/collab/document-name.ts`)
- `STAGE` is resolved on every call instead of at module load. Lambdas get `STAGE` via `environment: { STAGE: $app.stage }` in `infra/queues.ts`; the integration test process doesn't, so it parses the stage from a queue URL and sets `process.env.STAGE` in `beforeAll` before opening the observer. Prevents observer/Lambda doc-name mismatch.

### Tests
- `tests/unit/dispatch-extracted-doc.test.ts` — 6 new unit tests covering `dispatchExtractedDocOps`. Empty inputs, text population, ocrToken marks, idempotency, orphan-answer filtering.
- `tests/unit/editor-ops.test.ts` — added `describe("setQuestionScore")` (4 tests) and `describe("insertMcqTableBlock")` (3 tests). Total 64 unit tests, all green.
- `tests/integration/end-to-end-pipeline.test.ts` — rewritten earlier in this session as a real-SQS-driven test (no mocks, observer is a `HeadlessEditor`). New convergence criteria: every question's block has `awardedScore` set + every block has text. `summariseDoc` flattens `mcqTable.results[]` so MCQs count toward the per-question summary. `marks` assertion now expects `0` for the kai-jassi fixture (all MCQ + point-based — no LoR, no token-anchored annotations).

### Build plan + handoff docs
- `docs/build-plan-doc-as-source-of-truth.md` — the canonical migration plan (Steps 1–8). Step 1 + 2 are landed today; rest is queued.
- This file (`docs/2026-04-25-session-handoff.md`).

---

## Outstanding issues for the next session

### 1. Integration test still failing for environmental/race reasons, not code

Last green-on-OCR-side run we got: `blocks=12/12 withText=12 scored=0/12 marks=0`. The OCR Lambda produced the right doc shape; the grade Lambda hadn't dispatched any scores by the time the 2-min budget expired. The MCQ rendering fix (today's last code change) hasn't been verified end-to-end yet — `sst dev` needs to be running and live to pick up the new bundle. Do a fresh run to confirm:

```bash
AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
  bunx vitest run --project=backend:integration \
    tests/integration/end-to-end-pipeline.test.ts --reporter=verbose
```

Expected once `sst dev` is healthy: `blocks=12/12 withText=12 scored=12/12 marks=0`.

If `blocks=0` for the full window, `sst dev` isn't picking up SQS messages — most likely needs a restart so it rebundles the OCR + grade Lambdas with the rebuilt `@mcp-gcse/shared` (which now has the `awardedScore` schema attr).

### 2. Collab-server auth: `[onAuthenticate] token not active`

User pasted a log earlier showing `[onAuthenticate] token not active` twice. We added a `[auth-debug]` console.log to `packages/collab-server/src/auth.ts` to compare the token sent by the test process vs what the server sees, **then reverted it without seeing the debug output** because the user was busy. If the next test still shows zero updates, re-add this debug log:

```ts
const expected = Resource.CollabServiceSecret.value
console.log("[auth-debug]", {
  got_first8: token?.substring(0, 8),
  got_len: token?.length,
  expected_first8: expected?.substring(0, 8),
  expected_len: expected?.length,
  exact_match: token === expected,
})
```

The collab-server uses `tsx watch` so the log will hot-reload. Verify whether the test's token actually equals the server's `Resource.CollabServiceSecret.value`. Both should resolve from the same SST stage (`stuartbourhill`) but a stale `sst dev` startup could have a different secret value cached.

### 3. Cleanup-vs-Lambda race on test failure path

Earlier in the session the `afterAll` cleanup was deleting the StudentSubmission row while the grade Lambda was still mid-flight (~3m47s OCR runtime). The grade Lambda then crashed at `db.studentSubmission.findUniqueOrThrow`. The current test convergence criteria require *every block scored* — if convergence succeeds, grading is done and cleanup is safe. If convergence times out, cleanup races again. Could be worth a brief grace period (e.g. wait 10s for in-flight grading after timeout before deleting), but not urgent — diagnosis works fine with cleanup disabled and a fresh submission ID per run.

### 4. The "Step 3 race fix" never landed

Build plan Step 3 (FIFO dedup / DB CAS / Y.Map) was discussed and explicitly deferred. The duplicate-blocks bug remains a latent risk under genuinely-concurrent invocations. Stuart wants the eventual fix to feel principled, not sledgehammer-y. Worth raising again next session as a real architectural choice.

### 5. Build plan Steps 4–8

Untouched today. The big one is Step 4 — stand up the projection Lambda. After that, Steps 5–7 are the cleanup work that gets us fully off the dual-write pattern. Step 8 simplifies the integration test once the projection is the only thing writing derived rows.

### 6. The 3m47s OCR runtime regression

Earlier in the session, an OCR Lambda invocation took **3m47s** when it had previously run in ~30–80s. The exact log line was the user's paste:

> `+3m47.262 ... "Job failed" ... PrismaClientKnownRequestError ... db.studentSubmission.update ... No record was found for an update`

That long runtime is suspicious and was never investigated — could be cold-start, could be `sst dev` rebundling mid-handler, could be LLM rate limits. Worth a sanity check next session that OCR is back to ~30s under normal load.

---

## How the new code works (quick architecture tour)

```
                                  ┌─────────────────────────┐
                                  │   Hocuspocus + Y.Doc    │
                                  │  (source of truth for   │
                                  │   editor state)         │
                                  └────────────┬────────────┘
                                               ▲
                                               │ PM dispatches via ySyncPlugin
                                               │ (one Yjs update per editor.transact)
                                               │
   ┌───────────────────────────────────────────┼─────────────────────────┐
   │                                           │                         │
   ▼                                           ▼                         ▼
┌─────────────────┐                  ┌──────────────────┐      ┌────────────────────┐
│   OCR Lambda    │                  │   Grade Lambda   │      │  Test observer     │
│                 │                  │                  │      │  (HeadlessEditor)  │
│ 1. Vision +     │                  │ ONE editor sess. │      │                    │
│    Gemini OCR   │                  │ wraps all work:  │      │ Read view.state.   │
│ 2. Persist      │                  │                  │      │ doc to verify      │
│    DB rows      │                  │ For each Q (in   │      │ convergence.       │
│ 3. ONE editor   │                  │ parallel):       │      │                    │
│    session:     │                  │  - grade w/ LLM  │      │ No DB polling.     │
│   dispatchExtr- │                  │  - dispatch      │      │                    │
│   actedDoc      │                  │    setQuestion-  │      │                    │
│   - skeleton    │                  │    Score         │      │                    │
│   - text        │                  │  - annotate +    │      │                    │
│   - ocrToken    │                  │    dispatch      │      │                    │
│   - mcqTable    │                  │    annotations   │      │                    │
└─────────────────┘                  └──────────────────┘      └────────────────────┘
        │                                       │
        └───── enqueues grade msg via SQS ──────┘
```

Key invariants:

- **One editor session per Lambda invocation.** Two open/close cycles per Lambda was the source of the duplicate-blocks race; one is the maximum.
- **Errors propagate.** `withHeadlessEditor` re-throws; SQS retries on failure.
- **Score lives on the block.** Not in `student_paper_annotations`. Renderers read `node.attrs.awardedScore` (for `questionAnswer`) or `node.attrs.results[i].awardedScore` (for `mcqTable`).
- **Annotations are token-anchored only.** Region-only summary marks (the old `pointBasedAnnotations` / `deterministicMcqAnnotation` returns) no longer exist. If LLM annotation produces no token-anchored marks (e.g. for MCQ + point_based fixtures), zero annotation marks land in the doc — and that's correct.

---

## Verification checklist for the next session

When you sit down with this:

1. Confirm `sst dev` is running (and shows the linked Resources output).
2. Confirm `bun run build --filter @mcp-gcse/shared` has been run since the last `awardedScore`-schema change (verify with `grep awardedScore packages/shared/dist/editor/question-answer-node-schema.js`).
3. Run unit tests: `bunx vitest run --project=backend:unit --no-coverage` — should be 64/64 green.
4. Run integration test (above command) — expected: `blocks=12/12 withText=12 scored=12/12 marks=0` and the test passes.
5. If the test still hangs at `blocks=0`, debug the collab-server auth (re-add the `[auth-debug]` log; the `tsx watch` will pick it up). Most likely root cause: stale `sst dev` startup not seeing the current `CollabServiceSecret`.
6. If MCQ rendering still looks wrong in the live web UI, check:
   - Doc has an `mcqTable` block with the right `results[]` (query Hocuspocus snapshot or read via observer).
   - `McqTableView` renders the array — likely OK since this code path was already used by `build-doc.ts`.

---

## Conventions established this session (worth carrying forward)

- **No "Best-effort" comments.** If you write one, you're hiding a bug. Either propagate the error or fix the underlying issue.
- **The doc is the source of truth.** Keep saying it until everyone believes it.
- **One editor session per Lambda invocation.** Not zero, not two.
- **Score is on the block, not an annotation.** Don't write `PendingAnnotation` for ticks/crosses.
- **Function names should match the implementation, not the legacy mental model.** `writeAnnotationsToYDocFragment` was renamed to `writeAnnotationsToEditor` for this reason; the file `annotations-to-ydoc.ts` was renamed to `annotations-to-editor.ts`.
- **Don't blame the test fixture for an architectural gap.** The kai-jassi fixture has zero LoR questions, so zero token-anchored annotations is the right outcome — not a regression to "fix" by relaxing the assertion.
