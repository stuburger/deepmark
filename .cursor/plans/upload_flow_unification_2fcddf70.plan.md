---
name: Upload Flow Unification
overview: Unify the single-script and batch-ingest upload flows into one dialog backed exclusively by BatchIngestJob/StagedScript, adding a `classification_mode` field to control whether Gemini segmentation runs. Remove UploadStudentScriptDialog and the split FAB, replacing them with a single "Upload scripts" button.
todos:
  - id: schema-migration
    content: Add ClassificationMode enum and classification_mode field to BatchIngestJob in schema.prisma, run prisma migrate dev
    status: completed
  - id: backend-classifier
    content: "Update batch-classify.ts to branch on classification_mode: per_file skips Gemini and creates one StagedScript per file; add oversized page-count flag"
    status: completed
  - id: server-actions
    content: Update createBatchIngestJob and updateBatchJobSettings in batch-actions.ts to accept and persist classificationMode
    status: completed
  - id: unified-dialog
    content: Create upload-scripts-dialog.tsx replacing both BatchIngestDialog and UploadStudentScriptDialog, with auto/per_file toggle in advanced panel and per_file oversized warning in staging
    status: completed
  - id: fab-shell
    content: "Update exam-paper-page-shell.tsx: replace split FAB with single Upload scripts button, remove UploadStudentScriptDialog and MarkingJobDialog auto-open logic"
    status: completed
  - id: cleanup
    content: Delete upload-student-script-dialog.tsx and remove createStudentPaperJob/addPageToJob/reorderPages/triggerOcr if no longer used elsewhere
    status: completed
isProject: false
---

# Upload Flow Unification

## Goal

Replace the two separate upload paths (single-script via `createStudentPaperJob` + `triggerOcr`, and batch ingest via `BatchIngestJob`) with a single unified path that always goes through `BatchIngestJob → StagedScript → StudentPaperJob`.

## New data flow

```mermaid
flowchart TD
    FAB["Upload scripts button"] --> Dialog["UnifiedUploadDialog"]
    Dialog -->|"classification_mode: auto"| BatchJob["BatchIngestJob"]
    Dialog -->|"classification_mode: per_file"| BatchJob

    BatchJob --> Queue["BatchClassifyQueue (SQS)"]

    Queue -->|"auto mode"| Gemini["Gemini boundary classifier"]
    Queue -->|"per_file mode"| PerFile["1 StagedScript per file, confidence=1.0, skip Gemini"]
    Gemini --> StagedScripts["StagedScript rows"]
    PerFile --> StagedScripts

    StagedScripts -->|"auto-commit threshold met"| Commit["StudentPaperJob created + OCR queued"]
    StagedScripts -->|"review required"| StagingUI["Staging review UI"]
    StagingUI --> Commit
```



## What changes

### 1. Schema — `[packages/db/prisma/schema.prisma](packages/db/prisma/schema.prisma)`

Add `classification_mode` enum and field to `BatchIngestJob`:

```prisma
enum ClassificationMode {
  auto
  per_file
}

model BatchIngestJob {
  // existing fields...
  classification_mode ClassificationMode @default(auto)
}
```

Migration: `npx prisma migrate dev --name add_classification_mode`

### 2. Backend classifier — `[packages/backend/src/processors/batch-classify.ts](packages/backend/src/processors/batch-classify.ts)`

In `classifyBatch`, branch on `batch.classification_mode`:

- `per_file`: for each source file, create one `StagedScript` directly (all pages in order, `confidence: 1.0`, `status: confirmed`). Skip all Gemini calls. Proceed straight to staging or auto-commit.
- `auto`: existing logic unchanged.

Add a page-count guard in `per_file` mode: if a file's page count is `> pages_per_script * 2`, set a `hasUncertainPage: true` equivalent so the staging UI can warn.

### 3. Server actions — `[apps/web/src/lib/batch-actions.ts](apps/web/src/lib/batch-actions.ts)`

- Update `createBatchIngestJob` to accept `classificationMode: "auto" | "per_file"` and persist it.
- Update `updateBatchJobSettings` to allow changing `classification_mode`.
- No changes to `commitBatch`, `updateStagedScript`, `splitStagedScript` — they already work generically.

### 4. New unified dialog — `apps/web/src/app/teacher/exam-papers/[id]/upload-scripts-dialog.tsx`

Replace `BatchIngestDialog` and `UploadStudentScriptDialog` with a single component. Essentially `BatchIngestDialog` with:

- Renamed/simplified header: "Upload student scripts"
- Default mode: `auto`. Toggle in advanced panel: "Each file is one student's script" → sets `per_file`.
- Remove the client-side PDF → JPEG conversion that existed in `UploadStudentScriptDialog` (the batch pipeline handles this server-side already via `extractPdfPages`).
- Staging phase: when a staged script in `per_file` mode has significantly more pages than `pages_per_script`, show a page-count warning badge and surface the **Split** action prominently on the card.

### 5. FAB + shell — `[apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx](apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx)`

- Replace the split pill button (lines 1060–1079) with a single "Upload scripts" button.
- Remove `uploadScriptOpen` / `batchOpen` state; replace with single `uploadOpen` state.
- Remove `UploadStudentScriptDialog` import and usage (lines 1018–1035).
- Remove `MarkingJobDialog` usage — the single-script flow no longer bypasses staging to open the submission view directly. After commit, the submission appears in the `SubmissionGrid` like any batch job.
- Keep `activeBatch` polling and `SubmissionGrid` unchanged.

### 6. Delete obsolete files

- `apps/web/src/app/teacher/exam-papers/[id]/upload-student-script-dialog.tsx`
- `apps/web/src/lib/marking/mutations.ts` — check if `createStudentPaperJob`, `addPageToJob`, `reorderPages`, `triggerOcr` are used anywhere else; if not, remove.

## What stays the same

- `StagedScript` schema — no changes, `batch_job_id` stays non-nullable.
- `commitBatch` / `commitBatchService` — already creates `StudentPaperJob` rows generically from confirmed staged scripts.
- `StagedScriptReviewCards`, `DndScriptCard`, `splitStagedScript` — all work on `StagedScript.page_keys` and are mode-agnostic.
- `MarkingJobDialog` can be kept for deep-linking to a specific job via `?job=` query param but is no longer opened automatically after upload.

## Modes at a glance

- `auto` (default): Gemini classifies boundaries per file. Handles single scripts, multi-student PDFs, and mixed batches. Safe for all teachers.
- `per_file`: skips Gemini, one staged script per file. For power users with known one-per-file uploads. Staging UI warns if a script looks oversized.

