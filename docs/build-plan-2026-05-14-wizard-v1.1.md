# Build Plan — Paper Setup Wizard v1.1

**Date:** 2026-05-14
**Scope:** Three improvements on top of the v1 wizard that shipped 2026-05-13:
1. **Real per-script segmentation confidence** — replace the hardcoded `1.0` with a calibrated LLM-emitted score; use it to surface (not gate) low-confidence segments.
2. **Parallel ingestion pipelines** — extract (QP + MS) and segment (scripts) run as independent, parallel tracks. No backend rendezvous; the teacher's explicit click is the synchronisation point.
3. **Segmentation-in-session + 4-pill stepper** — the wizard owns the lifecycle from drop to "Start marking." The shell stays unchanged as the post-onboarding editing surface.

**Headline principle:** the marking flow IS the review. Every staged script auto-confirms on segmentation completion (no per-card confirm step), but staged scripts only promote to `StudentSubmission` rows when the teacher hits **Start marking** in the wizard summary. That click both promotes and dispatches grading — drop and go.

---

## Background

v1 (shipped) gives us:

- `/teacher/papers/new` → drop zone → classifier → click Go.
- `PaperSetupSession` row + `PaperSetupStagedFile` rows.
- Bundle processor extracts QP + MS in one Gemini call, atomically promotes to `ExamPaper`, **then** dispatches `BatchClassifyQueue` for scripts (strictly sequential).
- `/teacher/sessions/[id]` polls until `status='completed'` then redirects to `/teacher/exam-papers/[id]`.
- `staged_scripts.confidence Float?` is wired end-to-end but always written as `1.0` placeholder.

What's broken / unfit for v1.1:

- **Single status enum (`PaperSetupStatus`) is a denormalised summary** of state that already lives in other rows. Two writers updating it can drift from underlying facts.
- **Sequential bundle → segmentation leaves wall-clock on the floor.** Bundle (~30–60s) and segmentation (~95s on a 700-page PDF) are independent work and should run in parallel.
- **`BatchIngestJob.exam_paper_id` is required**, which forces sequentiality (segmentation can't run until the paper exists) and blocks the future "email a stack of scripts, attach to a paper later" workflow.
- **Wizard hands off to the shell mid-task** the moment the bundle finishes; the shell becomes the surface for confirming segmentation, which jars after the wizard's "drop and go" feel.
- **Confidence is a placeholder.** A real value unlocks the soft-nudge banner that points the teacher at uncertain segments before they hit Start marking.

---

## Converged design decisions

These are settled. Stuart to challenge anything that no longer fits before code lands.

### Data model — derive state, don't denormalise

- **Drop `PaperSetupStatus` enum entirely.** Drop `PaperSetupSession.status`. The four wizard states are derived in queries from facts that already exist in related rows:
  - **Bundle done** ↔ `session.exam_paper_id IS NOT NULL`.
  - **Segmentation done** ↔ `BatchIngestJob.status = 'committed'`.
  - **Segmentation skipped** ↔ no `BatchIngestJob` exists for this session (teacher dropped no scripts).
  - **Either failed** ↔ `session.error IS NOT NULL` or `batchIngestJob.status = 'failed'`.
- **Single source of truth wins.** A status column has to be kept in sync with its inputs; derived state can't drift.
- **`BatchIngestJob.exam_paper_id` becomes nullable**, and a new nullable FK `BatchIngestJob.paper_setup_session_id → PaperSetupSession` provides the linkage during the parallel-pipeline window (and for the future email-a-stack case).
- **`StudentSubmission.exam_paper_id` stays required.** Submissions are the post-rendezvous artefact; they're only created when a paper exists and a teacher has clicked Start marking.

### Pipeline shape — parallel tracks, single-writer-per-column

- **Both queues fire in parallel from `createPaperFromStaged`.** No more "bundle handler dispatches batch."
- **Each handler only writes its own track and its own data:**
  - Bundle handler → creates `ExamPaper`, writes `session.exam_paper_id`. Single writer.
  - Batch handler at successful end → writes `staged_scripts.status='confirmed'` (auto-confirm) + flips `batchIngestJob.status='committed'`. Single writer.
- **No backend rendezvous.** Staged scripts and ExamPaper exist independently after their respective handlers finish. Nothing auto-merges them on the backend.
- **"Start marking" CTA is the explicit rendezvous.** Single server action with a single writer: read `session.exam_paper_id` + confirmed staged_scripts, create `StudentSubmission` rows, dispatch the marking pipeline, navigate to a page where grading is already running.

### Auto-confirm vs auto-promote — distinguish

- **Auto-confirm**: segmentation handler flips `staged_scripts.status` from `proposed` to `confirmed` automatically at end of batch. The teacher does not have to tick boxes.
- **Auto-promote**: would mean creating `StudentSubmission` rows automatically — we do NOT do this. Promotion happens only at the explicit Start-marking click.
- **Human in the loop is preserved.** The wizard's completed-state summary lets the teacher deselect a staged script (flipping its status back to `excluded`), or follow "Edit in paper view →" to the shell's existing drag/split/rename surface. A deselected staged_script does not promote when Start marking fires.

### Confidence — nudge, not gate

- Real per-script `confidence: number` emitted by the segmenter, anchored on observable cues (boundary sharpness, name legibility, length plausibility).
- All segments still auto-confirm regardless of confidence. Low-confidence segments are surfaced via:
  - A dismissable banner at the top of the wizard's completed panel: "_n segment(s) looked uncertain — worth a quick eyeball._"
  - A pill on the matching cards in the script-summary list.
- Threshold is one constant in code (`LOW_CONFIDENCE_NUDGE_THRESHOLD`, suggested starting point `0.85`), tuned after the eval-suite histogram lands.

### UX

- **No new web routes.** `/teacher/sessions/[id]` is the wizard canvas through every state; `/teacher/papers/new` remains the entry. The shell at `/teacher/exam-papers/[id]` is unchanged — it is the post-onboarding home and the editing surface.
- **4-pill stepper, wizard surfaces only.** Pills: **Upload · Extract · Scripts · Done**. Derived from the same facts as the panel state:
  - Upload: completed when session exists (always true on /sessions/[id]).
  - Extract: active until `exam_paper_id IS NOT NULL`; then completed.
  - Scripts: active until `batchIngestJob.status='committed'`; skipped (grey) if no batch row exists for the session; failed pill on `batchIngestJob.status='failed'`.
  - Done: active once both prior pills are completed.
- **No auto-redirect on completion.** The wizard's completed panel shows a custom summary list (thumbnail + name + low-confidence pill) and a single primary CTA, "Start marking →" (which dispatches and navigates). Per-card "Edit in paper view →" is the escape hatch.

---

## Out of scope for v1.1 (deferred)

- **Catastrophic-segmentation gate** (e.g. segmenter returned 1 script for a 30-page PDF). Batch-level sanity signal, separate from per-script confidence. Worth handling, but as a single hard gate.
- **Stimulus pack upload.** Slot-reserved visually only.
- **"Generate mark scheme from QP"** CTA on the MS slot.
- **Reconciler / second-pass segmenter** for confidence improvement. Don't pay for more LLM calls until we've seen the first one fail in the wild.
- **DLQ/recovery UX for a stuck batch handler.** Trust DLQ + Lambda retries for now; revisit if eval data shows it's common.
- **Email-a-stack workflow.** The data-model changes in v1.1 unblock it (nullable `exam_paper_id` on BatchIngestJob), but the surface for it lands later.
- **Stepper on the shell page.** Wizard surfaces only.

---

## Status of step 1 (already implemented in this conversation)

The segmenter wiring is **done**; calibration eval run is pending.

Implemented:
- `SegmentationSchema` gains `confidence: z.number().min(0).max(1)` (`segment-script-prompt.ts`).
- Prompt now anchors high (≥0.9) / medium (0.6–0.9) / low (<0.6) on observable cues.
- `RawSegmentedScript` and `SegmentedScript` carry `confidence`; `lengthsToRanges` and `snapBlankStartPages` preserve it (`segmentation-transforms.ts`).
- Both fallback paths in `segment-script.ts` emit `confidence: 0` (all-blank input, validation-failed retry — no signal → low-confidence by definition).
- `source-file-processing.ts` writes the real value from segmenter output; single-image path stays at `1.0` (trivially perfect).
- `confidence-nudge.ts` with `LOW_CONFIDENCE_NUDGE_THRESHOLD = 0.85` + `isLowConfidence` helper.
- New unit tests for `isLowConfidence` and confidence pass-through in transforms; 633/633 unit tests green.
- `segmentation-evals.test.ts` extended with a new eval block that logs `confidence | match-status | name` per script and asserts `>0.5` for boundary-matched scripts.

Pending:
- **Stuart runs the eval suite** to harvest the per-fixture confidence histogram and commit to (or change) the `0.85` starting threshold:
  ```
  cd packages/backend
  AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
    bunx vitest run --project=backend:integration tests/integration/segmentation-evals.test.ts
  ```
- Each fixture prints a `confidence distribution (avg=X.XX)` block — grep for it.
- The schema bump I added (`segmenting` enum value) has been **reverted**; the new step 2 replaces it.

---

## DB changes (replaces v1.1's earlier "schema bump" step)

### `PaperSetupSession`

- **Drop** `status PaperSetupStatus @default(extracting)`.
- **Keep** `error String?` (bundle failures populate it).
- **Keep** `exam_paper_id String? @unique` and the relation to `ExamPaper`.

### `PaperSetupStatus` enum

- **Drop entirely.** No code path needs a denormalised summary status — everything derives from related rows.

### `BatchIngestJob`

- **Make `exam_paper_id` nullable.** Unblocks parallel-with-bundle dispatch and the future email-a-stack workflow.
- **Add `paper_setup_session_id String?`** (nullable FK to `PaperSetupSession`, indexed). Populated when the batch is dispatched as part of a wizard session; left null in the future email-a-stack case.
- **Keep** `status BatchStatus` and `error String?` (the batch handler writes these as it does today; the session view reads them).

### Migration

- `bun db:push --accept-data-loss` (zero users — drop the column freely).
- `bun db:generate`.

---

## Backend changes

### 1. `createPaperFromStaged` — dispatch both queues in parallel

`apps/web/src/lib/paper-setup/actions.ts`

Currently dispatches only `PaperBundleQueue`. Update:

- Always dispatch `PaperBundleQueue` (for QP + MS).
- If a `scripts_bundle` staged file exists, ALSO dispatch `BatchClassifyQueue` directly (in parallel):
  - Create the `BatchIngestJob` with `exam_paper_id = null`, `paper_setup_session_id = session.id`, `status = 'uploading'`.
  - Copy the temp upload to its durable `batches/<batch_id>/source/` prefix (same as today, just lifted out of the bundle handler).
  - Send the SQS message.

The bundle handler no longer dispatches the batch. Move that code from `packages/backend/src/processors/paper-bundle.ts` (around the existing dispatch site) into the server action.

### 2. Bundle handler — single-writer cleanup

`packages/backend/src/processors/paper-bundle.ts`

- After `promoteSessionToExamPaper` writes the new `ExamPaper` + sets `session.exam_paper_id`, **stop**. No more status writes, no batch dispatch.
- If the batch was already dispatched in parallel and (race) finished first, it will already carry `paper_setup_session_id` and once the bundle finishes we link `batch.exam_paper_id = newExamPaper.id` from inside `promoteSessionToExamPaper` (single transaction, the bundle handler's last write).

`packages/backend/src/processors/paper-bundle/persist.ts`

- Drop the `status='completed'` write on `PaperSetupSession`. Handler owns lifecycle, and there is no status column anyway.

### 3. Batch handler — auto-confirm staged scripts

`packages/backend/src/processors/batch-classify.ts`

At end of a successful batch:

- Mark all staged scripts for this batch as `status='confirmed'`. Single update, no per-script logic — auto-include with the confirmed flag.
- Flip `batchIngestJob.status='committed'`. (Today the handler already sets `status='committed'` at successful end — confirm this still happens; the auto-confirm of staged scripts is the new behaviour.)
- If `batch.exam_paper_id` is null at this point (bundle still running), that's fine — the bundle handler will populate it when it finishes. Nothing for the batch handler to do.
- On batch failure: `status='failed'`, `error=<reason>` (existing behaviour).

### 4. `startMarking` server action — the rendezvous

New server action at `apps/web/src/lib/paper-setup/actions.ts` (or its own file if it grows).

Input: `{ sessionId: string }`. Authz: resourceAction with paper-setup-session role.

Steps (single transaction):
1. Load session + linked `BatchIngestJob` + confirmed staged scripts.
2. Pre-conditions: `session.exam_paper_id IS NOT NULL`, batch is `committed`, at least one confirmed staged_script. Otherwise return a typed serverError.
3. For each confirmed staged_script: create one `StudentSubmission` row, linked to the exam paper and the staged_script.
4. Dispatch the existing per-submission OCR/grading pipeline (same code path the shell uses today).
5. Return `{ examPaperId }` to the client, which navigates to `/teacher/exam-papers/[id]` (where grading is already running).

The action is the only writer of `StudentSubmission` from the wizard flow. The shell's existing batch-staging panel keeps its own promotion path for non-wizard cases (email-a-stack later, or manual upload via the shell).

### 5. Eval surface unchanged

Bundle eval (`paper-bundle-evals.test.ts`) tests bundle correctness — untouched.
Segmentation eval (`segmentation-evals.test.ts`) tests segmenter correctness — already extended in step 1.

No new integration test needed for the rendezvous: it's a pure server action with no LLM calls and no parallel handlers — covered by unit tests of `startMarking` (mock the DB layer, assert StudentSubmissions are created from confirmed staged_scripts only).

---

## Web changes

### 1. Shared stepper component

`apps/web/src/components/paper-setup/stepper.tsx` (new file, new folder).

```tsx
type Step = "upload" | "extract" | "scripts" | "done"
type StepState = "pending" | "active" | "skipped" | "completed" | "failed"

export function PaperSetupStepper({
  current,
  hasScripts,
  extractDone,
  segmentationDone,
  extractFailed,
  segmentationFailed,
}: {
  current: Step
  hasScripts: boolean
  extractDone: boolean
  segmentationDone: boolean
  extractFailed: boolean
  segmentationFailed: boolean
})
```

Four pills. Active pill accented (teal); completed pills with the editor's green-tick highlight (`AcquiredLabel` pattern shipped 2026-05-14). Skipped pills muted grey + "Skipped" sublabel. Failed pill destructive variant + "Failed" sublabel.

Shared between `/papers/new` (current="upload") and `/sessions/[id]` (current derived from session state). Two consumers, one component.

### 2. `/teacher/papers/new/page.tsx`

Mount stepper at `current="upload"`. One-line addition.

### 3. `/teacher/sessions/[id]/session-live-view.tsx` — state machine

Today: branches for loading, not-found, failed, extracting (+ completed redirect).

Rewrite to derive state from facts, not from `status`:

```ts
const bundleDone = session.examPaperId !== null
const segmentationSkipped = session.batchIngestJob === null
const segmentationDone =
  segmentationSkipped || session.batchIngestJob?.status === "committed"
const bundleFailed = session.error !== null && !bundleDone
const segmentationFailed = session.batchIngestJob?.status === "failed"
const allDone = bundleDone && segmentationDone
```

Panels:
- **Pre-extract or in-extract** (`!bundleDone && !bundleFailed`): existing "Extracting your paper..." panel. Stepper at `current="extract"`.
- **In-segment** (`bundleDone && !segmentationDone && !segmentationFailed`): NEW panel. "Segmenting your scripts..." + progress (`n of m pages processed`) read from `job_events` (existing event stream). Skeleton script cards. Stepper at `current="scripts"`.
- **All done** (`allDone`): NEW completed-state summary. `script-summary.tsx` lists thumbnail + name + low-confidence pill per confirmed staged_script. Soft-nudge banner at the top if `lowConfidenceCount > 0`. Primary CTA "Start marking →" wires to the `startMarking` action. Per-card "Edit in paper view →" navigates to the shell. Stepper at `current="done"`.
- **Failed** (`bundleFailed || segmentationFailed`): existing failed panel, updated to handle the per-track distinction.

Polling stays — 3s `refetchInterval` while not all-done.

The auto-redirect on completion goes away.

### 4. `getPaperSetupSession` query

`apps/web/src/lib/paper-setup/queries.ts`

Returns a single shape with all the facts the view derives state from:

```ts
type PaperSetupSessionState = {
  id: string
  createdAt: Date
  examPaperId: string | null
  error: string | null
  batchIngestJob: {
    id: string
    status: "uploading" | "classifying" | "staging" | "committed" | "failed"
    error: string | null
  } | null
  scripts: Array<{           // only populated when status='committed'
    id: string
    proposedName: string | null
    confirmedName: string | null
    thumbnailUrl: string | null
    confidence: number | null
    isLowConfidence: boolean
    status: "proposed" | "confirmed" | "excluded"
  }>
  lowConfidenceCount: number  // count of confirmed staged_scripts below threshold
}
```

The view does the derivation; the query just exposes the facts.

### 5. New components in the session folder

- `apps/web/src/app/teacher/sessions/[id]/script-summary.tsx` — the completed-state list. Per-card thumbnail + name + confidence pill + "Edit in paper view →" + deselect toggle.
- `apps/web/src/app/teacher/sessions/[id]/low-confidence-banner.tsx` — the soft-nudge banner.
- `apps/web/src/app/teacher/sessions/[id]/segmenting-panel.tsx` — the in-progress segmentation panel.

All use design tokens — no raw colours, soft chips via brand scales.

### 6. Deselect mutation

Quick server action to flip a staged_script between `confirmed` and `excluded`. Optimistic via React Query. Excluded scripts don't promote when Start marking fires.

---

## Files to touch / add

### New

| File | Purpose |
|---|---|
| `apps/web/src/components/paper-setup/stepper.tsx` | Shared 4-pill stepper |
| `apps/web/src/app/teacher/sessions/[id]/script-summary.tsx` | Completed-state script list |
| `apps/web/src/app/teacher/sessions/[id]/low-confidence-banner.tsx` | Soft-nudge banner |
| `apps/web/src/app/teacher/sessions/[id]/segmenting-panel.tsx` | In-progress segmentation panel |
| `apps/web/src/lib/paper-setup/start-marking.ts` (or in actions.ts) | `startMarking` server action |

### Touch

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Drop `PaperSetupStatus`; drop `PaperSetupSession.status`; nullable `BatchIngestJob.exam_paper_id`; add `BatchIngestJob.paper_setup_session_id` |
| `apps/web/src/lib/paper-setup/actions.ts` | Dispatch `BatchClassifyQueue` in parallel from `createPaperFromStaged` |
| `packages/backend/src/processors/paper-bundle.ts` | Remove batch dispatch; link `batch.exam_paper_id` once paper is created |
| `packages/backend/src/processors/paper-bundle/persist.ts` | Drop the `session.status='completed'` write |
| `packages/backend/src/processors/batch-classify.ts` | Auto-confirm staged scripts at successful end |
| `apps/web/src/lib/paper-setup/queries.ts` | Return derived facts shape (no `status`); include batch + staged_scripts |
| `apps/web/src/app/teacher/papers/new/page.tsx` | Mount stepper |
| `apps/web/src/app/teacher/sessions/[id]/session-live-view.tsx` | Derive state from facts; remove auto-redirect; mount new panels |

### Already touched in step 1 (no further work needed)

| File | What it carries |
|---|---|
| `packages/backend/src/lib/script-ingestion/segment-script-prompt.ts` | `confidence` in Zod + prompt anchor |
| `packages/backend/src/lib/script-ingestion/segmentation-transforms.ts` | `confidence` threaded through transforms |
| `packages/backend/src/lib/script-ingestion/segment-script.ts` | Mapping + fallback paths emit confidence |
| `packages/backend/src/lib/script-ingestion/source-file-processing.ts` | Writes real confidence value |
| `packages/backend/src/lib/script-ingestion/confidence-nudge.ts` | Threshold + helper |
| `packages/backend/tests/unit/confidence-nudge.test.ts` | Boundary tests |
| `packages/backend/tests/unit/segment-script.test.ts` | Confidence pass-through |
| `packages/backend/tests/integration/segmentation-evals.test.ts` | Log + regression assertion |

---

## Open questions

1. **Soft-nudge threshold.** `0.85` is the placeholder. Stuart's eval run gives us a histogram; we commit to a value before the soft-nudge UI lands.
2. **Thumbnail surface.** Is there a thumbnail-per-page S3 endpoint we can read directly for the script-summary cards, or do we need a new server action returning presigned URLs? Worth checking before designing the card.
3. **What does `segmenting-panel.tsx` render when scripts are uploaded but bundle isn't done yet?** Two reasonable interleavings:
   - Bundle still running, batch already committed: stepper shows Extract=active + Scripts=done. Panel reads "Extracting your paper... your scripts are ready and waiting."
   - Both still running: panel reads either based on whichever started first, or shows a stacked status. My weak preference: derive panel from "earliest unfinished step" — Extract takes priority because the CTA is locked on the paper existing.
4. **Edge: `BatchIngestJob` with `paper_setup_session_id` but no `exam_paper_id` and the bundle fails permanently.** What happens to the orphan batch? Probably: the session view shows the failure on the Extract pill, the batch sits in committed status with `exam_paper_id=null`, the teacher gets a "retry extraction" or "delete and restart" option. Lean on the same UI for the future email-a-stack case — both surfaces hit the same `attachBatchToPaper` action. Defer to v1.2 unless this comes up in testing.

---

## Build order

Sequenced so each step is independently shippable.

1. **DONE: confidence wiring + eval extension** (segmenter Zod + prompt + transforms + helper + unit tests + eval logging). Awaits Stuart's eval run for the threshold sign-off.
2. **DB migration.** Drop `PaperSetupStatus` + `session.status`; nullable `batch.exam_paper_id`; add `batch.paper_setup_session_id`. Push + regenerate. Touches several read sites (anything that queries `session.status`) — fix typecheck before merging.
3. **Parallel dispatch + handler lifecycle.** Update `createPaperFromStaged` to dispatch both queues. Drop batch dispatch from bundle handler. Add auto-confirm in batch handler. Verify existing bundle eval + segmentation eval stay green.
4. **`startMarking` server action.** Pure unit tests for the promotion logic.
5. **Stepper component + mount on /papers/new.** Pure presentational, low risk.
6. **Session view rewrite.** Derive state from facts; new `segmenting` panel + `script-summary` + per-card deselect. Remove auto-redirect. Wire `startMarking` to the Start marking CTA.
7. **Soft-nudge banner + low-confidence pills.** Lands once the threshold is decided.

Total: ~1.5–2 days. Step 1 is done modulo Stuart's eval. Step 2 unblocks steps 3–7; the rest can flow in order.

---

## Cross-references

- v1 plan: `docs/build-plan-2026-05-13-paper-setup-wizard.md` — the strict-invariants rationale for `ExamPaper` carries through to v1.1: we drop `PaperSetupStatus` rather than add nullable columns to `ExamPaper`.
- `feedback_no_grandfathering_prelaunch` — schema bumps land directly, no migration shims. Drop columns freely.
- `project_marking_progress_ux` — still scoped to marking, not ingestion. Polling stays the live-state mechanism for the wizard.
- Existing segmentation evals at `packages/backend/tests/integration/segmentation-evals.test.ts` — the calibration substrate.
- Existing `staged_scripts.confidence Float?` column — wired end-to-end, value now real (step 1 complete).
- Existing `batch-staging-panel.tsx` in the shell — the editing surface we link out to but don't reuse. Keeps its existing promotion flow for non-wizard cases.
- `AcquiredLabel` component shipped 2026-05-14 — the editor-style green-tick pattern reused by the stepper's completed pills.
