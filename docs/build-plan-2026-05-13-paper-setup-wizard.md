# Build Plan — Paper Setup Wizard (Upload-and-Go)

**Date:** 2026-05-13
**Scope:** A new "view, not flow" wizard for setting up an exam paper. Teacher drops QP + MS (+ optional scripts) into a single drop zone; a smart classifier routes each file to the right slot; clicking Go creates the `ExamPaper` row with null metadata and fires processors immediately. The wizard then renders the live status of QP/MS/scripts ingestion until everything is ready, after which the user is redirected to the existing shell page.

The existing exam-paper shell remains unchanged. The wizard is an alternate, opt-in surface for new papers — power users can bypass it entirely.

---

## Background

Today's "wizard" is implicit. A teacher hits the dashboard → "Mark new paper" → uploads QP + MS via `LinkedPdfUploadClient` (with a synchronous Gemini Flash metadata extraction + confirmation step) → lands on `/teacher/exam-papers/[id]` → must find the floating Upload button (only enabled once `readyForSubmissions` is true) to upload scripts. The state machine that gates step 3 already exists (`hasQuestionPaper && allQuestionsHaveMarkSchemes` at `exam-paper-page-shell.tsx:229`) — it just isn't surfaced as steps.

Two structural improvements fall out of building the wizard:

1. **Parallel processing.** `batch-classify` (scripts segmentation) is independent of the QP — it can fire the moment a scripts PDF is uploaded. Token attribution and grading remain naturally gated by QP/MS completion (this is intrinsic, not added state).
2. **Bundle QP + MS extraction.** Running QP + MS through a single Gemini call (rather than two single-doc processors) improves question/mark-scheme linking accuracy. It's also the **only correct path** when both files are present at upload time — running the two single-doc processors in parallel is a race (the MS processor creates questions if they don't exist; concurrent runs duplicate or orphan).

---

## Converged design decisions

These have been settled in conversation:

- **The wizard is a view, not a new state machine.** It reads the same `ExamPaper + PdfIngestionJob + BatchIngestJob` state the shell does. No new container row.
- **Smart classifier, single drop zone.** Teacher drops 1–N files; Gemini Flash labels each as `question_paper | mark_scheme | scripts_bundle`. Labels render as "Mark scheme acquired ✓ / Question paper acquired ✓ / Scripts (n candidates) ✓" with a "Wrong slot?" affordance.
- **No confirmation/metadata-review screen.** `ExamPaper` is created with all metadata fields null on click of Go. Title/subject/year/etc. are backfilled by the async QP processor. Dashboard renders "Identifying paper…" placeholder for null fields.
- **Bundle processor is the only path when QP + MS are both present.** Routing table:
  | Slots filled | What fires |
  |---|---|
  | QP only | existing single-doc QP processor |
  | QP + MS | **bundle processor (required)** |
  | QP + scripts | single-doc QP + `batch-classify` in parallel |
  | QP + MS + scripts | bundle + `batch-classify` in parallel |
  Single-doc MS processor stays only for the "MS uploaded later via shell" path.
- **Go button enables when QP is present.** MS and scripts are optional; MS can be added later via the existing shell flow.
- **Live state via existing `useExamPaperLiveQueries` hook.** TanStack Query with conditional 3s `refetchInterval` while jobs are non-terminal. No Yjs introduced for the wizard (the Yjs/Hocuspocus migration in `project_marking_progress_ux` is for marking progress, not ingestion).
- **Two routes, not a dialog.** `/teacher/papers/new` (upload entry) and `/teacher/exam-papers/[id]/setup` (live status view). Dismissable to the shell at any time; auto-redirects to shell when complete.
- **Bundle-processor eval suite, mandatory for v1.** Sibling to `attribution-evals.test.ts`. Two fixtures: AQA Business pair already in the repo; one English paper pulled from production S3 (key TBD from Stuart).

---

## Out of scope for v1 (deferred)

- **Stimulus pack upload.** New requirement that surfaced mid-conversation. Will need its own S3 prefix, `document_type`, schema decision (paper-level vs question-level link), and processor. Not in v1.
- **"Generate mark scheme from QP" CTA.** Mentioned as a future feature; the wizard's MS slot reserves room visually but no code.
- **Paper-level `generalGuidance`.** Per-`MarkScheme.guidance` already exists; new paper-level field can wait.
- **"Needs attention" flows.** Default assumption: bundle processor extracts cleanly, segmentation classifies cleanly. Anomaly detection on either is a v1.1 concern. The shell already has the manual link/review UI for the rare miss.
- **Heuristic-first classifier.** v1 uses pure Gemini Flash; optimise only if cost/UX becomes a real issue.

---

## DB changes

**Likely none required**, but verify:

1. `ExamPaper.title`, `subject`, `exam_board`, `year`, `paper_number`, `total_marks`, `duration_minutes`, `tier` — must all be nullable. Check `packages/db/prisma/schema.prisma`. If any are `String` (not `String?`) or `Int` (not `Int?`), make them nullable and `bun db:push`.
2. `PdfIngestionJob.metadata_extracted_at` or similar fields — confirm the async QP processor writes back to `ExamPaper` (it should, since the existing flow already does this for the sync extraction path).

**Per the pre-launch ops rule (`feedback_no_grandfathering_prelaunch`):** if any column needs to be nullable that isn't today, just make it nullable — no migration shims, no backfill for "existing" rows.

---

## Routes

### `/teacher/papers/new`

New file: `apps/web/src/app/teacher/papers/new/page.tsx`

The upload-and-go entry. Pre-creation surface. Renders:

- A single labelled drop zone — "Drop your question paper, mark scheme, and student scripts here."
- A staged-files list. Each file shows: filename, page count, classification status (`Classifying…` → `Question paper ✓` / `Mark scheme ✓` / `Scripts (n) ✓` / `Unrecognised — drag to slot`), a remove (X) button, and a "Wrong slot?" dropdown to manually reassign.
- A Go button. Disabled until at least one file is classified as `question_paper`. Conflict states (two QPs, etc.) block Go with an inline message.
- A subtle "Already have an exam paper to add to? Open it from the dashboard" link as the back-door.

On Go: server action creates `ExamPaper` + ingestion jobs, fires processors, returns paper id → client redirects to `/teacher/exam-papers/[id]/setup`.

### `/teacher/exam-papers/[id]/setup`

New file: `apps/web/src/app/teacher/exam-papers/[id]/setup/page.tsx`

Post-creation wizard view. Renders four step cards stacked vertically:

1. **Question paper** — locked / processing / done. Shows extracted title, subject, board, question count once available. Failure surface: red banner with retry CTA.
2. **Mark scheme** — locked while QP processing. Once QP is done: either "linked ✓" (if MS was bundle-processed), "Uploaded, processing…" (if separate MS upload still running), or "Add mark scheme" CTA + "Generate from question paper (coming soon)" disabled CTA (if no MS yet).
3. **Student scripts** — optional, but visible. Shows segmentation result ("n candidates detected, ready to review") or upload CTA if no scripts yet.
4. **(Reserved) Stimulus pack** — hidden in v1.

Top of page: a "Skip to paper view →" link to the shell.

Auto-redirect to `/teacher/exam-papers/[id]` once: QP done + MS done (or explicitly skipped via "I'll add this later") + scripts done (or explicitly skipped).

Uses `useExamPaperLiveQueries` exactly like the shell.

### Shell page banner

In `apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx`:

When `!hasScripts && (!QP || !MS)`, render a top banner: *"Setup in progress · Continue in wizard →"* linking to `/setup`. Once `hasScripts` is true, banner hidden.

---

## Server actions

### `classifyStagedFiles` — new

Location: `apps/web/src/lib/paper-setup/actions.ts` (new file)

Input: array of `{ tempUploadId: string }` representing files already uploaded to `pdfs/metadata-temp/{uuid}/document.pdf` via the existing temp-upload flow.

Per file, fetches page 1 (and maybe page 2) as image data, calls Gemini Flash with a three-label classifier prompt, returns `{ tempUploadId, label: "question_paper" | "mark_scheme" | "scripts_bundle" | "unrecognised", pageCount }[]`.

Parallel across files. Bounded retry per file (max 2 attempts) per the pre-launch ops rule.

Use the standard `authenticatedAction` from `@/lib/authz`. No resource auth needed — these are temp-staged files owned by the authenticated user.

### `createPaperFromStaged` — new

Location: `apps/web/src/lib/paper-setup/actions.ts`

Input: `{ files: { tempUploadId, label, userOverrodeLabel: boolean }[] }`

Steps (in order, transactional where possible):

1. Validate at least one `question_paper` is present; no duplicate labels (one QP, one MS, one scripts max).
2. Create the `ExamPaper` row with all metadata fields null (apart from `user_id`, `created_at`).
3. For each staged file, S3 copy from `pdfs/metadata-temp/{uuid}/document.pdf` → durable key (`pdfs/question-papers/{jobId}/document.pdf`, `pdfs/mark-schemes/{jobId}/document.pdf`, or `pdfs/student-papers/{batchJobId}/document.pdf`). Delete the temp key after copy.
4. Create matching `PdfIngestionJob` and/or `BatchIngestJob` rows linked to the new `ExamPaper`.
5. Trigger processors:
   - If QP + MS both present → send one SQS message to the new `PaperBundleQueue` with `{ examPaperId, qpS3Key, msS3Key, qpJobId, msJobId }`.
   - If QP only → S3 PUT event already fires existing `QuestionPaperQueue`. Confirm: do we rely on the S3 trigger, or send an explicit SQS message? (See open questions.)
   - If scripts present → trigger `BatchClassifyQueue` for segmentation (this is currently a manual server-action trigger; pattern is in place).
6. Return `{ examPaperId }` for the client redirect.

Bounded retries on S3 ops; if any file copy fails, roll back the `ExamPaper` and surface a clear error. No partial papers.

### `useExamPaperLiveQueries` — reuse

No changes needed. Wizard view calls the same hook the shell does.

---

## Bundle QP + MS processor — new

This is the one substantive new piece of backend code.

### Location

`packages/backend/src/processors/paper-bundle.ts` (new file)
`packages/backend/src/processors/paper-bundle/` (folder for prompts.ts, schema.ts, helpers)

### Infrastructure

In `infra/queues.ts`: add `PaperBundleQueue`, wire as Lambda subscriber to `paper-bundle.ts`. DLQ configured (per `feedback_no_grandfathering_prelaunch` — bounded retries + DLQ + `status='failed'` capture is mandatory).

### Handler shape

Input SQS payload (parsed via Zod, never cast):

```ts
const paperBundleJobSchema = z.object({
  examPaperId: z.string(),
  qpS3Key: z.string(),
  msS3Key: z.string(),
  qpJobId: z.string(),
  msJobId: z.string(),
})
```

Logic:

1. Fetch both PDFs from S3 as bytes.
2. Single Gemini call with both PDFs as input. Structured output includes:
   - Paper-level metadata (title, subject, exam_board, year, paper_number, total_marks, duration_minutes, tier)
   - Sections + section ordering
   - Questions: id (synthetic), section, question_number, text, marks, AO, marking_method (`deterministic` / `point_based` / `level_of_response`)
   - Per-question mark scheme: type, max_marks, mark points (for `point_based`), level descriptors + caps (for `level_of_response`), correct answer (for `deterministic`), guidance text
3. Persist atomically: update `ExamPaper` row with metadata; create `ExamSection`, `Question`, `MarkScheme` rows. Use a transaction so we never end up with questions but no mark schemes (the exact orphan case the bundle approach is meant to eliminate).
4. Update both `PdfIngestionJob` rows (qp and ms) with `status='completed'`.
5. On any failure: capture `status='failed'` + error message on both jobs. Bounded retries handled by SQS visibility timeout config; after max attempts, message lands in DLQ.

### Cost / time controls (per pre-launch ops rule)

- Input size cap: reject jobs where combined PDF size > 30 MB. Surface as `status='failed'` immediately with a clear error, do not retry.
- Per-attempt timeout: 60 seconds. Anything beyond suggests the input is too large; split into single-doc fallback.
- Max 2 retries before DLQ.

### Prompts and schema

Live in `paper-bundle/prompts.ts` and `paper-bundle/schema.ts` per the convention in `CLAUDE.md`. Iterate against the eval suite.

---

## Eval suite — new

### Location

`packages/backend/tests/integration/paper-bundle-evals.test.ts`

Fixtures under `packages/backend/tests/integration/fixtures/paper-bundle/`.

### Fixtures for v1

1. `paper-bundle/aqa-business-y10-3-3-vol2/`
   - `question-paper.pdf` ← copy from repo root (`AQA GCSE Business Unit Assessment 3.3 Vol2_y10.pdf`)
   - `mark-scheme.pdf` ← copy from repo root (`AQA GCSE Business Mark Scheme 3.3 Vol2_y10.pdf`)
   - `fixture.ts` — expected metadata, expected per-question counts (extract from the PDF by hand once; freeze).

2. `paper-bundle/aqa-english-{slug}/`
   - `question-paper.pdf` — **TODO: Stuart to share production S3 key.** MS partner already in repo at `tmp/english-lit-mark-scheme-cmobrht6s.pdf` (verify pairing).
   - `mark-scheme.pdf`
   - `fixture.ts`

### Assertions per fixture (start strict, ratchet up)

1. `ExamPaper` metadata fields (title, subject, board, year, paper_number) match expected exactly.
2. Question count matches expected exactly.
3. Every extracted `Question` has exactly one linked `MarkScheme` row.
4. `MarkScheme.type` per question matches expected exactly.
5. `MarkScheme.maxMarks` per question matches expected exactly.
6. For `point_based` schemes: mark point count within ±1 of expected.
7. For `level_of_response`: level count matches exactly.

### Workflow rules (matches attribution-evals)

- Whenever you touch `packages/backend/src/processors/paper-bundle.ts` or anything under `paper-bundle/`, run the suite before committing.
- Add a new fixture whenever a real-world paper reveals a gap.
- Pull fixture data from Neon production via `mcp__Neon__run_sql` when expectations need re-verifying.
- Tighten thresholds when the model improves; never loosen.
- No mocking — real Gemini calls.

### Run command

```bash
cd packages/backend
AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
  bunx vitest run tests/integration/paper-bundle-evals.test.ts
```

---

## Files to touch / add

### New

- `apps/web/src/app/teacher/papers/new/page.tsx` — upload-and-go entry
- `apps/web/src/app/teacher/papers/new/staged-files-list.tsx` — extracted component
- `apps/web/src/app/teacher/papers/new/drop-zone.tsx` — extracted component
- `apps/web/src/app/teacher/exam-papers/[id]/setup/page.tsx` — wizard live view
- `apps/web/src/app/teacher/exam-papers/[id]/setup/step-card.tsx` — extracted (state: locked / processing / done / failed)
- `apps/web/src/lib/paper-setup/actions.ts` — `classifyStagedFiles`, `createPaperFromStaged`
- `apps/web/src/lib/paper-setup/types.ts`
- `packages/backend/src/processors/paper-bundle.ts`
- `packages/backend/src/processors/paper-bundle/prompts.ts`
- `packages/backend/src/processors/paper-bundle/schema.ts`
- `packages/backend/tests/integration/paper-bundle-evals.test.ts`
- `packages/backend/tests/integration/fixtures/paper-bundle/aqa-business-y10-3-3-vol2/` (PDFs + fixture.ts)
- `packages/backend/tests/integration/fixtures/paper-bundle/aqa-english-{slug}/` (PDFs + fixture.ts)

### Touch

- `infra/queues.ts` — add `PaperBundleQueue` + DLQ + Lambda binding
- `apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx` — render setup-in-progress banner when paper is in early state
- `apps/web/src/app/teacher/dashboard/...` — point "Mark new paper" CTA to `/teacher/papers/new`
- `apps/web/src/lib/pdf-ingestion/metadata.ts` — likely needs no change; temp-upload still works. The sync metadata extraction call (`extractPdfMetadata`) is no longer used by the wizard flow. **Keep it** for backwards-compat with the old shell-driven upload, OR remove if the shell upload is also being migrated (see open questions).
- `packages/db/prisma/schema.prisma` — verify `ExamPaper` metadata fields are nullable; nullify any that aren't and `bun db:push`.
- `sst-env.d.ts` — auto-generated when adding new SST resources.

---

## Open questions for the next session

1. **Production S3 key for the English fixture.** Stuart to share. MS already at `tmp/english-lit-mark-scheme-cmobrht6s.pdf` — verify pairing.
2. **S3-trigger vs explicit SQS for the single-doc QP-only fallback.** Today the `QuestionPaperQueue` processor is triggered by S3 PUT events on `pdfs/question-papers/{jobId}/document.pdf`. The new server action does an S3 copy from temp → durable, which should fire the same trigger. Confirm this works as expected, or switch to explicit SQS send for determinism.
3. **`ExamPaper` field nullability.** Need to check current schema. Likely some fields will need to become nullable; per pre-launch ops rule, just change them — no migration shims.
4. **Does the existing shell upload flow stay, or get retired?** The old `LinkedPdfUploadClient` + sync `extractPdfMetadata` path still works. Options:
   - (a) Leave the shell upload as-is. Wizard is an alternate entry. Two upload paths exist long-term.
   - (b) Migrate the shell's "add MS later" flow to use a slim version of the wizard's upload-and-classify path. One classifier, two entry points.
   - Recommend (a) for v1 to minimise scope; revisit after launch.
5. **Auto-redirect from wizard to shell — exact condition.** "Once QP done + MS done (or skipped) + scripts done (or skipped)." Need to define "skipped" UX explicitly (a "I'll do this later" link on each optional card that marks it skipped client-side only).
6. **Classifier failure handling.** If Gemini Flash can't classify a file (returns `unrecognised` or times out), the file stays in the staged-files list with a "Drag to slot manually" prompt. Confirm this is the UX direction vs. blocking Go entirely.

---

## Build order recommendation

Build in this order to keep each PR shippable and reviewable:

1. **DB nullability check + bundle processor + eval suite.** Backend-only PR. Ship green eval against both fixtures before any UI work. (This is the highest-risk piece — proves the central technical bet.)
2. **Upload-and-go server actions** (`classifyStagedFiles`, `createPaperFromStaged`). Backend-ish PR — pure server-side. Unit/integration tested.
3. **`/teacher/papers/new` upload entry.** Drop zone, staged files list, Go button. Wires to actions from step 2.
4. **`/teacher/exam-papers/[id]/setup` live view.** Step cards, banner on shell, auto-redirect.
5. **Dashboard CTA repoint.** One-line PR redirecting "Mark new paper" to `/teacher/papers/new`.

Steps 1–4 can each ship independently behind manual URL access; step 5 makes it the default.

---

## Cross-references

- `CLAUDE.md` — Pre-launch operating mode (no grandfathering, bounded retries + DLQ + failure status mandatory)
- `CLAUDE.md` — Async Processing Pipeline (existing SQS queues, S3 prefixes)
- `CLAUDE.md` — Attribution Eval Suite (template for the new paper-bundle evals)
- `CLAUDE.md` — Tables, Grids & Dialogs Always Extracted (drives the wizard component split)
- `feedback_no_grandfathering_prelaunch` memory — bounded retries, DLQ, failure status, input size caps
- `project_marking_progress_ux` memory — Yjs/Hocuspocus is for marking, not ingestion; wizard sticks to existing polling
- `feedback_filler_vs_flare` memory — wizard step cards must show real signal, no padding
- Existing `useExamPaperLiveQueries` at `apps/web/src/app/teacher/exam-papers/[id]/hooks/use-exam-paper-live-queries.ts`
- Existing single-doc processors at `packages/backend/src/processors/question-paper-pdf.ts` and `packages/backend/src/processors/mark-scheme-pdf.ts`
- Existing temp-upload + sync metadata flow at `apps/web/src/lib/pdf-ingestion/metadata.ts` and `upload.ts`
