# Refactoring Backlog

Catalogued by a codebase audit on 2026-04-01. Organised by priority band.

**Completed phases are checked off. The original monoliths are replaced with re-export barrels
while callsites migrate — delete the barrel once all imports point to the domain module.**

---

## Completed

### Phase 1 — Quick wins

- [x] **`batch-actions.ts`** — Move `getVapidPublicKey` + `registerPushSubscription` → `lib/notifications/push.ts`; update `push-registration.tsx` import
- [x] **`packages/shared/src/grader.ts`** — Extract `parseMarkPointsFromPrisma` + `parseMarkingRulesFromPrisma` → `grader-prisma.ts`; re-exported from `grader.ts`

### Phase 2 — Backend processor submodules

- [x] **`mark-scheme-pdf.ts`** → Extracted into `processors/mark-scheme-pdf/` submodule:
  - `schema.ts` — `MARK_SCHEME_SCHEMA`, `EXAM_PAPER_METADATA_SCHEMA`
  - `prompts.ts` — `buildExtractionPrompt`, `buildExistingQuestionsBlock`, `ExistingQuestionContext`
  - `queries.ts` — `findMatchingQuestionId`, `fetchExistingQuestionsForJob`, `embeddingToVectorStr`
  - `linking.ts` — `buildQuestionWithMarkScheme`, `linkJobQuestionsToExamPaper`
- [x] **`batch-classify.ts`** → Extracted into `lib/batch/` submodules:
  - `types.ts` — `PageData`, `PageGroup`, `StagedScriptData`, `PageKey`
  - `llm-output.ts` — `extractJsonFromResponse`
  - `pdf-pages.ts` — `extractPdfPages`, `extractJpegFromPdfPage`, `fetchS3Bytes`
  - `classify-calls.ts` — `callClassifyPageBoundary`, `callClassifyBlankPage`, `callExtractNameFromPage`
- [x] **`normalizeQuestionNumber`** duplication resolved — extracted to `lib/normalize-question-number.ts`; both `mark-scheme-pdf.ts` and `question-paper-pdf.ts` now import from there

### Phase 3 — `dashboard-actions.ts` decomposition (1724 → barrel)

New domain modules under `apps/web/src/lib/`:

- [x] `admin/queries.ts` — `getDashboardData`, `listQuestions`, `listExemplarAnswers`
- [x] `exam-paper/queries.ts` — `getExamPaperDetail`, `listExamPapers`, `listCatalogExamPapers`, `getUnlinkedMarkSchemes`, `getSimilarQuestionsForPaper`
- [x] `exam-paper/mutations.ts` — `createExamPaperStandalone`, `updateExamPaperTitle`, `toggleExamPaperPublic`, `deleteExamPaper`
- [x] `exam-paper/questions.ts` — `getQuestionDetail`, `updateQuestion`, `deleteQuestion`, `reorderQuestionsInSection`, `reorderSections`
- [x] `exam-paper/similarity.ts` — `consolidateQuestions`
- [x] `exam-paper/unlinked-schemes.ts` — `linkMarkSchemeToQuestion`
- [x] `mark-scheme/manual.ts` — `createMarkScheme`, `updateMarkScheme` + all input types
- [x] `embeddings.ts` — shared `embedText` helper (used by questions + similarity)
- [x] All 20 consumer files updated to import from domain modules
- [ ] **Delete `dashboard-actions.ts` barrel** once all imports confirmed migrated

### Phase 4 — `mark-actions.ts` decomposition (1049 → barrel)

New domain modules under `apps/web/src/lib/`:

- [x] `marking/types.ts` — all shared types (`StudentPaperJobPayload`, `GradingResult`, `ScanPageUrl`, etc.)
- [x] `marking/queries.ts` — `getStudentPaperJob`, `getStudentPaperJobForPaper`, `getJobScanPageUrls`, `getJobPageTokens`, `listMySubmissions`, `getExamPaperStats`
- [x] `marking/mutations.ts` — all write/trigger actions
- [x] All 31 consumer files updated to import from domain modules
- [ ] **Delete `mark-actions.ts` barrel** once all imports confirmed migrated

### Phase 5 — `pdf-ingestion-actions.ts` decomposition (817 → barrel)

New domain modules under `apps/web/src/lib/`:

- [x] `pdf-ingestion/upload.ts` — `createPdfIngestionUpload`, `createLinkedPdfUpload`
- [x] `pdf-ingestion/job-lifecycle.ts` — `getPdfIngestionJobStatus`, `cancelPdfIngestionJob`, `retriggerPdfIngestionJob`, `getPdfIngestionJobDownloadUrl`, `listPdfIngestionJobs`, `getPdfIngestionJobDetail`
- [x] `pdf-ingestion/queries.ts` — `getExamPaperIngestionLiveState`, `getPdfDocumentsForPaper`, `getActiveIngestionJobsForExamPaper`, `checkExistingDocument`, `archiveExistingDocument`
- [x] `pdf-ingestion/exam-paper.ts` — `createExamPaperFromJob`
- [x] All 10 consumer files updated to import from domain modules
- [ ] **Delete `pdf-ingestion-actions.ts` barrel** once all imports confirmed migrated

### Phase 6 — Front-end component decomposition

- [x] **`batch-ingest-dialog.tsx`** — Extracted to collocated files:
  - `draggable-page-thumb.tsx`
  - `dnd-script-card.tsx` (includes `PageKeyRaw` type + `confidenceColor`/`confidenceLabel` helpers)
  - `staged-script-review-cards.tsx`
- [x] **`exam-paper-page-shell.tsx`** — Extracted:
  - `naturalCompare` → `lib/utils.ts`
  - `hooks/use-exam-paper-live-queries.ts`
  - `hooks/use-similar-questions.ts`
  - `hooks/use-unlinked-schemes.ts`

---

## Remaining (Tier 3 — Medium Priority)

### Processors (same schema/prompt/handler pattern)

- [ ] `question-paper-pdf.ts` (~513 lines) — extract schema + prompts into `question-paper-pdf/` submodules
- [ ] `student-paper-extract.ts` (~468 lines) — extract schema + prompts into `student-paper-extract/` submodules
- [ ] `exemplar-pdf.ts` (~388 lines) — extract schema + prompts into `exemplar-pdf/` submodules
- [ ] `student-paper-grade.ts` (~345 lines) — extract prompt builder + schema

### Frontend forms / dialogs (split form sections into child components)

- [ ] `mark-scheme-edit-form.tsx` (~456 lines) — extract mark point rows, level table rows as child components
- [ ] `lor-mark-scheme-edit-form.tsx` (~546 lines) — extract level descriptors table, caps section
- [ ] `mark-scheme-dialog.tsx` (~416 lines) — extract inner form into a standalone component
- [ ] `upload-student-script-dialog.tsx` (~364 lines) — extract file-drop zone and page list into subcomponents
- [ ] `upload-client.tsx` (~383 lines) — extract upload step subcomponents
- [ ] `new/page.tsx` (~585 lines) — extract wizard steps into step-specific components

### Frontend shells / views

- [ ] `exam-paper-stats-shell.tsx` (~511 lines) — extract stats cards and mutation triggers
- [ ] `submission-grid.tsx` (~481 lines) — extract column definitions + sorting logic from rendering
- [ ] `submission-view.tsx` (~376 lines) — extract toolbar and answer sections as components
- [ ] `submission-toolbar.tsx` (~351 lines) — extract action groups
- [ ] `job-status-client.tsx` (~552 lines) — extract `STATUS_CONFIG` map + status badge into separate module

### Infrastructure / cross-cutting

- [ ] `mcp-server.ts` (~409 lines) — split tool registration from tool implementation; one file per domain as tools grow
- [ ] `auth.ts` (~305 lines) — review for policy/role-check logic mixed with session plumbing; split if found
- [ ] `BoundingBoxViewer.tsx` (~393 lines) — extract geometry/math helpers from canvas rendering

---

## Barrels to delete (after confirming zero remaining imports)

- [ ] `apps/web/src/lib/dashboard-actions.ts`
- [ ] `apps/web/src/lib/mark-actions.ts`
- [ ] `apps/web/src/lib/pdf-ingestion-actions.ts`

---

## Cross-Cutting Improvements (any time)

- [ ] Consolidate `lib/batch/` (frontend `batch-actions.ts` → `lib/batch/mutations.ts`)
- [ ] Establish a convention: prompts and schemas live in `*/prompts.ts` + `*/schema.ts` sibling files, never inline in handlers
- [ ] Consider further domain folders in `lib/` as the app grows (e.g. `lib/student/`, `lib/exemplar/`)
