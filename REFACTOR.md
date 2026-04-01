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

## Tier 3 — Completed

### Processors

- [x] `question-paper-pdf.ts` — extracted `processors/question-paper-pdf/schema.ts` + `prompts.ts`; `linkJobQuestionsToExamPaper` promoted to shared `lib/link-job-questions.ts`
- [x] `student-paper-extract.ts` — extracted `SUBJECT_VALUES`, `isValidSubject`, `parsePages`, `loadQuestionSeeds` → `lib/student-paper/question-seeds.ts`
- [x] `exemplar-pdf.ts` — extracted `processors/exemplar-pdf/schema.ts` + `prompts.ts`
- [x] `student-paper-grade.ts` — extracted `EXAMINER_SYSTEM_PROMPT` → `lib/student-paper/grader-config.ts`; `loadExamPaperForGrading` → `lib/student-paper/grade-queries.ts`
- [x] `parseJobIdFromKey` + `getPdfBase64` duplication resolved → `lib/processor-s3.ts`

### Frontend forms / dialogs

- [x] `mark-scheme-edit-form.tsx` — extracted `MarkPointRow` → `mark-point-row.tsx`
- [x] `lor-mark-scheme-edit-form.tsx` — extracted `LevelBlock` → `level-block.tsx`, `CapBlock` → `cap-block.tsx`
- [x] `mark-scheme-dialog.tsx` — extracted `MarkSchemeFormWithAutofill` → `mark-scheme-form-with-autofill.tsx`
- [x] `upload-student-script-dialog.tsx` — extracted `StudentScriptPageRow` → `student-script-page-row.tsx`
- [x] `upload-client.tsx` — extracted `ProcessingStatus` + `STATUS_STEPS` → `processing-status.tsx`; presigned upload → `lib/presigned-upload.ts`
- [x] `new/page.tsx` — extracted `IdleDropZone` → `idle-drop-zone.tsx`, `ProcessingCard` → `processing-card.tsx`; `EXAM_BOARDS` → `lib/subjects.ts`

### Frontend shells / views

- [x] `exam-paper-stats-shell.tsx` — extracted `stats-config.ts`, `grade-distribution-chart.tsx`, `submission-tables.tsx`
- [x] `submission-grid.tsx` — extracted `submission-grid-config.ts`, `script-card.tsx`, `view-toggle.tsx`
- [x] `submission-view.tsx` — extracted `hooks/use-scroll-to-question.ts`, `scan-panel.tsx`, `results-panel.tsx`
- [x] `job-status-client.tsx` — extracted `job-status-config.ts`, `hooks/use-job-poll.ts`, `mark-scheme-detail.tsx`, `questions-list.tsx`, `exemplars-list.tsx`

### Infrastructure / cross-cutting

- [x] `mcp-server.ts` — extracted `create-mark-scheme` description → `tools/mark-schemes/create-mark-scheme-description.ts`
- [x] `BoundingBoxViewer.tsx` — extracted geometry utils → `lib/bounding-box.ts`; `GradingAnnotationOverlay` and `TokenOverlay` → `BoundingBoxViewer/` subfolder
- [ ] `auth.ts` — reviewed; ~71 lines, no meaningful split needed
- [x] `submission-toolbar.tsx` — extracted `GroupToggle` + `ScoreBadge` → `submission-toolbar-controls.tsx`

---

## Barrels deleted

- [x] `apps/web/src/lib/dashboard-actions.ts` — deleted (zero remaining consumers)
- [x] `apps/web/src/lib/mark-actions.ts` — deleted (zero remaining consumers)
- [x] `apps/web/src/lib/pdf-ingestion-actions.ts` — deleted (zero remaining consumers)

---

## Cross-Cutting Improvements (any time)

- [x] `lib/batch/mutations.ts` — all batch server actions moved from `batch-actions.ts`; 7 consumers updated; `batch-actions.ts` now thin re-export barrel
- [x] `exam-paper-page-shell.tsx` — badge helpers + `TableRowDeleteButton` extracted → `exam-paper-helpers.tsx`
- [ ] Establish a convention: prompts and schemas live in `*/prompts.ts` + `*/schema.ts` sibling files, never inline in handlers
- [ ] Consider further domain folders in `lib/` as the app grows (e.g. `lib/student/`, `lib/exemplar/`)
