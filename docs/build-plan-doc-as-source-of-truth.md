# Build plan — Document is the source of truth

**Status:** in progress
**Started:** 2026-04-25
**Author:** Stuart + Claude Opus 4.7

## The problem we're fixing

The OCR and grading Lambdas currently *dual-write*: every authoritative state change is written to **both** Postgres rows **and** the collaborative Y.Doc. Examples:

- OCR Lambda writes `Answer.answer_text`, `StudentPaperPageToken`, `StudentPaperAnswerRegion` rows **and** dispatches PM transactions for skeleton + answer text + ocrToken marks.
- Grade Lambda writes `MarkingResult` rows **and** dispatches PM `addMark` transactions for AI annotations.

Because either write can fail independently, every editor write is wrapped in a `withHeadlessEditor(...)` call that **swallows errors** and returns a boolean ("best-effort"). The DB write is the safety net — if the editor write fails, the Lambda continues and the doc is silently out of sync with the DB.

This produced concrete bugs:
- **Duplicate question blocks (24 instead of 12)** when concurrent OCR Lambda invocations both seeded the doc — `insertQuestionBlock` is idempotent per-view, but two views starting from the same empty CRDT state both insert.
- **Silent partial failures** when Cloud Vision 403'd: pipeline marked OCR "complete" with zero tokens, the doc had skeleton blocks but no text, the user saw an empty document. No alert. No retry.
- **"Best-effort" comments everywhere** — code apologising for an architecture nobody owns.

## Target architecture

> **The document is the source of truth.** Period.

The collaborative Y.Doc holds the authoritative state for everything that lives in the editor: question blocks, answer text, OCR token marks, and AI annotation marks. Postgres rows for those things become a *projection* — derived state, written by a single Lambda that subscribes to the doc.

Postgres remains authoritative for things that **aren't** in the editor: `StudentSubmission` identity, `OcrRun.status`, `GradingRun.status`, `examiner_summary`, exam paper / question / mark scheme reference data, and the immutable raw artifacts (S3 keys for page images, Vision raw JSON).

### Data flow

```
                    ┌──────────────────────────┐
                    │   Hocuspocus + Y.Doc     │
                    │   (source of truth)      │
                    └────────────┬─────────────┘
                                 ▲
       ┌─────────────────────────┼─────────────────────────┐
       │                         │                         │
       │  PM transactions        │ PM transactions         │ Subscribe + observe
       │                         │ (per question)          │
       │                         │                         ▼
┌────────────┐          ┌─────────────────┐    ┌──────────────────────┐
│ OCR Lambda │          │   Grade Lambda  │    │  Projection Lambda   │
│            │          │                 │    │  (derives DB rows)   │
│ ONE        │          │ ONE per         │    │                      │
│ withHE     │          │ question:       │    │ Upserts:             │
│ at end of  │          │ - addMark for   │    │ - Answer             │
│ OCR        │          │   each AI       │    │ - StudentPaperPageT… │
│            │          │   annotation    │    │ - StudentPaperAnswer…│
│ Writes DB: │          │                 │    │ - StudentPaperAnnot. │
│ - OcrRun   │          │ Writes DB:      │    │ - MarkingResult      │
│ - vision_  │          │ - GradingRun    │    │                      │
│   raw S3   │          │ - examiner_summ.│    │                      │
└────────────┘          └─────────────────┘    └──────────────────────┘
```

### Failure semantics

- Editor write failure in any Lambda → exception propagates → SQS retries the message. **No silent swallows.** No "best-effort" comments.
- Projection Lambda failure → projection retries; eventually consistent; the editor is still authoritative regardless.
- DB write failure for `OcrRun.status` etc. → Lambda fails → SQS retries.

## Migration steps (ordered, each independently mergeable)

### ✅ Step 1: Single `withHeadlessEditor` call in extract Lambda *(this PR)*

The extract Lambda currently makes **two** editor sessions per OCR run: an early `seedSkeleton` (creates 12 empty blocks), then a late `fillAnswerTexts` (sets text + ocrToken marks). The early skeleton is what enables the duplicate-blocks race.

**Change:**
- Delete the early `seedSkeleton` call site.
- Delete the `writeAnswersToEditor` private helper and its call site.
- After all OCR DB writes complete (line ~305), make one `withHeadlessEditor` call that dispatches **everything** for the doc — skeleton + text + ocrToken marks — in a single `editor.transact`. ySyncPlugin coalesces the PM dispatches into one Yjs update on the wire.
- Keep `seedSkeleton` and `fillAnswerTexts` exported (they're still useful primitives), but the extract Lambda no longer calls them directly.
- Add a new high-level helper `dispatchExtractedDoc(editor, seeds, perQuestionAnswers)` that does the single combined dispatch.

**UX consequence:** the teacher no longer sees empty skeleton boxes appear instantly when the OCR Lambda starts. They see a "extracting…" loading state for 60–80s, then the doc populates all at once. This is the right trade — the empty boxes were misleading anyway, and the simpler model kills the duplicate-blocks race.

**Tests:**
- Unit: `dispatchExtractedDoc` with mixed empty/non-empty answers, verify final PM doc shape.
- Integration: existing `headless-editor-roundtrip.test.ts` covers the round-trip; add a single-call assertion.

### Step 2: Remove "best-effort" semantics from `withHeadlessEditor`

`withHeadlessEditor` currently catches every error and returns `boolean`. With the document-as-source-of-truth model, that's wrong. Editor failure must be a real failure.

**Change:**
- `withHeadlessEditor` returns `Promise<void>` and re-throws any error.
- Caller of `withHeadlessEditor` in extract Lambda is the existing `try/catch` at the handler boundary — already converts to `batchItemFailures` for SQS retry.
- Caller in grade Lambda's `writeAnnotationsToEditor` likewise: failure rolls up, GradingRun is marked failed, SQS retries.
- Delete every "best-effort" comment in extract / grade / collab code.

**Tests:**
- Unit: `withHeadlessEditor` rejecting on Hocuspocus connect failure, on dispatch failure, on flush failure.

### Step 3: OCR token CRDT-level idempotency

Even with one editor session per Lambda, two concurrent invocations of the same SQS message produce duplicate blocks because both views start from the same empty CRDT state. PM-level idempotency (`findQuestionBlock` → no-op) doesn't help across concurrent views.

**Options (choose one in Step 3):**

A. **SQS-level deduplication.** Switch the OCR queue to a FIFO queue with content-based dedup. Single delivery guaranteed within a 5-minute dedup window. Pros: zero code change in handlers. Cons: must move queue type; can't process same submission twice in 5 min (probably fine).

B. **Application-level distributed lock.** OcrRun row gets a `claimed_by` UUID + `claimed_at` timestamp. Lambda CAS-claims the row at handler entry; if already claimed by a fresh holder, the duplicate invocation exits early. Pros: works on any queue. Cons: more code; needs lease expiry for crashed Lambdas.

C. **Move to a Y.Map keyed by `questionId`** for the question block container. Y.Map has set semantics over the CRDT — concurrent inserts of the same key merge, not duplicate. Pros: principled CRDT fix. Cons: requires schema redesign for question blocks, custom PM ↔ Y.Map binding.

**Recommendation: A.** Lowest blast radius. (B is a fine fallback; C is too invasive for the value.)

### Step 4: Stand up the Projection Lambda

A new Lambda subscribes to all submission docs via Hocuspocus. On every document update event, it reads the current doc state for that submission and upserts the derived DB rows.

**What it derives from the doc:**
- `Answer` (one row per `questionAnswer` block with non-empty text)
- `StudentPaperPageToken` (one row per `ocrToken` mark — keyed by `tokenId`, attrs `bbox`, `pageOrder`, char range)
- `StudentPaperAnswerRegion` (derived from the spatial extent of `ocrToken` marks per question per page — same algorithm currently in the OCR Lambda)
- `StudentPaperAnnotation` (one row per AI annotation mark — keyed by `annotationId` attr, attrs `signal`, `sentiment`, `from`, `to`, `comment`, `ao_category`, etc.)
- `MarkingResult` (derived per question by tallying positive vs negative annotation marks against the mark scheme — or read from a new attribute on the `questionAnswer` block: `awardedScore`)

**Design decisions to settle:**
- *Where does `awardedScore` live?* Two options: (a) compute it on the projection side from annotation marks, (b) the grade Lambda dispatches a `setQuestionScore` PM transaction that sets `awardedScore` as an attr on the `questionAnswer` block. **Recommendation: (b).** The score is an authoritative grading output, not a derived count.
- *When does projection run?* On every doc update is too noisy. Debounce per submission (~500ms) or trigger explicitly on `OcrRun.status="complete"` and `GradingRun.status="complete"` events.
- *Concurrency.* Projection Lambda reading a doc that's still being written produces interim states. Either (a) only project on terminal status events, or (b) idempotent upserts so interim projections converge to the same final state. Idempotent upserts are simpler.

### Step 5: Stop writing derived rows from OCR + grade Lambdas

Once the projection Lambda is live and verified, delete the direct DB writes from OCR + grade Lambdas:

- OCR Lambda: stop writing `Answer.answer_text`, `StudentPaperPageToken`, `StudentPaperAnswerRegion`. Keep writing `OcrRun.status`, `vision_raw_s3_key`, `extracted_answers_raw` (raw artifact, not derived state).
- Grade Lambda: stop writing `MarkingResult`. Keep writing `GradingRun.status`, `examiner_summary`.

After this step, the only writers to `Answer` / `StudentPaperPageToken` / `StudentPaperAnswerRegion` / `StudentPaperAnnotation` / `MarkingResult` are the projection Lambda and the teacher (via the editor itself, for manual edits / overrides).

### Step 6: Add a `setQuestionScore` PM op + dispatch it from grade Lambda

After Step 5, `MarkingResult.awarded_score` is derived. We need a deterministic source for it. Add a new attr on `questionAnswer` blocks: `awardedScore`. The grade Lambda dispatches one `setQuestionScore` PM transaction per question after grading completes. Projection reads the attr → upserts `MarkingResult.awarded_score`.

### Step 7: Delete the legacy DB-driven UI fallbacks

The web UI currently has "doc loading…" fallbacks that fetch from DB queries when the editor isn't connected. After Step 5 + 6, these fallbacks are obsolete — the editor is always authoritative. Either:
- Delete them entirely (assume editor is always reachable; show a blocking error if not), or
- Keep them as a degraded read-only mode that streams from the DB rows the projection wrote.

### Step 8: Update the integration test suite

The current `end-to-end-pipeline.test.ts` is a real-Lambda driver that observes via a HeadlessEditor. After this migration, the test simplifies:
- Push SQS message to OCR queue.
- Observer's PM doc converges to: skeleton + text + ocrToken marks (single update from OCR), then incrementally adds annotation marks (one update per question from grade).
- No `settledFor` polling needed — convergence criteria are tighter.
- Cleanup: delete `MarkingResult`, `StudentPaperAnnotation`, etc. via the projection's reverse path or by direct row deletion.

## Open questions for the next session

1. **Hocuspocus connection limits.** A projection Lambda subscribed to many concurrent submissions could exhaust Hocuspocus connection slots. Audit and bound.
2. **Doc snapshot retention.** If the doc is the source of truth, doc snapshots are now business-critical. Confirm Hocuspocus is persisting to durable storage (S3?) with appropriate retention.
3. **What happens to a submission whose doc gets corrupted?** Need a "rebuild doc from raw artifacts" path: re-run OCR Lambda. The raw artifacts (Vision JSON in S3, page images) are immutable, so this is always possible.
4. **`StudentPaperPageToken` derivation cost.** A 12-question paper with ~500 tokens means projection re-derives 500 token rows per doc update. Ensure idempotent upserts use the unique key efficiently.

## Today's commit

This PR delivers **Step 1 only**:
- Extract Lambda makes one `withHeadlessEditor` call at the end of OCR.
- New helper `dispatchExtractedDoc` in `lib/collab/editor-seed.ts`.
- Removed `writeAnswersToEditor` from extract Lambda.
- Tests updated.

Steps 2–8 are scoped above for the next session.
