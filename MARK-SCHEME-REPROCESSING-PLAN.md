# Plan: Mark Scheme Reprocessing + Versioning

> Written 2026-04-13. Implementation plan for cross-conversation handoff.

## Context

Teachers can't reprocess a mark scheme PDF once it's attached to an exam paper. If the LLM extraction was bad or the mark scheme PDF was wrong, there's no way to fix it without manual editing. We need:

1. A "Reprocess" button on the Paper tab to re-run extraction on the same PDF
2. Mark scheme versioning so old grading results aren't silently invalidated
3. A hard gate: mark schemes require questions to exist (QP first)
4. Removal of the ghost question creation path from the MS processor

**Key design decision**: When an exam paper has graded submissions, reprocessing creates *new* mark scheme rows and deactivates old ones. When there are no graded submissions, we overwrite in place (cheaper, no history to preserve). Old `GradingRun.grading_results` already snapshot `mark_scheme_id` per question, so historical grades are self-contained.

**What already works**: `mark_scheme_id` is already populated in grading results JSON by the backend. The enrichment pipeline loads mark schemes by explicit ID (not "active"), so it correctly loads whatever scheme was used at grading time. `infra/web.ts` already links `markSchemePdfQueue` to the Next.js app.

---

## Phase 1 — Schema: Add `is_active` to MarkScheme

**File:** `packages/db/prisma/schema.prisma`

Add to `MarkScheme` model:
```prisma
is_active   Boolean   @default(true)
```

Run `bun db:push` to apply. Non-breaking — all existing rows default to `true`.

---

## Phase 2 — Backend: Mark scheme queries filter by `is_active`

All queries that pick "the current mark scheme" must filter by `is_active: true`.

### 2a. Grading query

**File:** `packages/backend/src/lib/grading/grade-queries.ts` (line 22)

Change:
```ts
mark_schemes: { take: 1, orderBy: { created_at: "desc" } }
```
To:
```ts
mark_schemes: { where: { is_active: true }, take: 1, orderBy: { created_at: "desc" } }
```

### 2b. Exam paper detail query (web UI)

**File:** `apps/web/src/lib/exam-paper/paper/queries.ts` (line 82-89)

Change:
```ts
mark_schemes: {
  select: { id: true, link_status: true, description: true, correct_option_labels: true, points_total: true },
  take: 1,
}
```
To:
```ts
mark_schemes: {
  where: { is_active: true },
  select: { id: true, link_status: true, description: true, correct_option_labels: true, points_total: true },
  take: 1,
}
```

### 2c. Mark answer service (MCP tools path)

**File:** `packages/backend/src/services/mark-answer.ts` (line 36)

Change:
```ts
return db.markScheme.findFirstOrThrow({ where: { question_id: answer.question_id } })
```
To:
```ts
return db.markScheme.findFirstOrThrow({ where: { question_id: answer.question_id, is_active: true } })
```

### 2d. MCP tools that load mark schemes

**Files:**
- `packages/backend/src/tools/mark-schemes/create-test-dataset/tool.ts` (line 67)
- `packages/backend/src/tools/answers/evaluate/tool.ts` (line 69)

These use `findFirstOrThrow({ where: { question_id } })` — add `is_active: true` to the where clause.

### 2e. Enrichment data loading — NO CHANGE needed

**File:** `packages/backend/src/lib/enrichment/data-loading.ts` (line 88)

This loads mark schemes by explicit `id` from `grading_results.mark_scheme_id`. Correct behaviour — it should load the scheme that was actually used for grading, even if now inactive.

---

## Phase 3 — Backend: Version mark schemes in `upsertMarkScheme`

**File:** `packages/backend/src/processors/mark-scheme-pdf/process-question.ts`

### 3a. Add `hasGradedSubmissions` to `ProcessQuestionContext`

Add field:
```ts
type ProcessQuestionContext = {
  // ... existing fields ...
  hasGradedSubmissions: boolean
}
```

### 3b. Compute flag in main handler

**File:** `packages/backend/src/processors/mark-scheme-pdf.ts`

Before the question processing loop, compute:
```ts
const gradedCount = job.exam_paper_id
  ? await db.gradingRun.count({
      where: {
        submission: { exam_paper_id: job.exam_paper_id, superseded_at: null },
        status: "complete",
      },
    })
  : 0
const hasGradedSubmissions = gradedCount > 0
```

Pass through to `processExtractedQuestion` context.

### 3c. Update `upsertMarkScheme` logic

**File:** `packages/backend/src/processors/mark-scheme-pdf/process-question.ts` (lines 261-299)

```ts
async function upsertMarkScheme(
  questionId: string,
  r: ResolvedMarkScheme,
  ctx: ProcessQuestionContext,
  linkStatus: "linked" | "auto_linked",
): Promise<string> {
  const markSchemeFields = { /* unchanged */ }

  const existing = await db.markScheme.findFirst({
    where: { question_id: questionId, is_active: true },
  })

  if (existing) {
    if (ctx.hasGradedSubmissions) {
      // VERSION: deactivate old, create new
      await db.markScheme.update({
        where: { id: existing.id },
        data: { is_active: false },
      })
      const created = await db.markScheme.create({
        data: {
          question_id: questionId,
          created_by_id: ctx.uploadedBy,
          tags: [],
          is_active: true,
          ...markSchemeFields,
        },
      })
      return created.id
    }
    // OVERWRITE: no graded submissions, safe to update in place
    await db.markScheme.update({
      where: { id: existing.id },
      data: markSchemeFields,
    })
    return existing.id
  }

  // No existing active mark scheme — create fresh
  const created = await db.markScheme.create({
    data: {
      question_id: questionId,
      created_by_id: ctx.uploadedBy,
      tags: [],
      is_active: true,
      ...markSchemeFields,
    },
  })
  return created.id
}
```

---

## Phase 4 — Backend: Remove ghost question creation from MS processor

**File:** `packages/backend/src/processors/mark-scheme-pdf/process-question.ts`

### 4a. Remove `createNewQuestion` function

Delete the `createNewQuestion` function (lines 216-248). In `persistQuestionAndMarkScheme`, change:

```ts
// Before:
if (resolved.match.existingId) {
  await updateExistingQuestion(resolved, ctx)
} else {
  await createNewQuestion(resolved, ctx)
}

// After:
if (resolved.match.existingId) {
  await updateExistingQuestion(resolved, ctx)
} else {
  // No matching question — log warning, skip
  logger.warn(TAG, "Unmatched mark scheme entry — no existing question found", {
    jobId: ctx.jobId,
    question_number: resolved.canonicalNumber,
    question_text: resolved.questionText.slice(0, 100),
  })
}
```

### 4b. Return unmatched count from `processExtractedQuestion`

Change return type to `Promise<{ matched: boolean }>` so the main handler can count unmatched entries. Log unmatched count in the completion event:

```ts
void logEvent(db, jobId, {
  type: "mark_scheme_processed",
  at: new Date().toISOString(),
  questions_matched: matchedCount,
  questions_unmatched: unmatchedCount,
})
```

### 4c. Upload gate in backend handler

**File:** `packages/backend/src/processors/mark-scheme-pdf.ts`

After fetching `existingQuestionsForContext`, if the list is empty and `job.exam_paper_id` is set:

```ts
if (job.exam_paper_id && existingQuestionsForContext.length === 0) {
  await db.pdfIngestionJob.update({
    where: { id: jobId },
    data: {
      status: "failed",
      error: "No questions found — upload the question paper first.",
    },
  })
  continue
}
```

### 4d. Upload gate in web server action

**File:** `apps/web/src/lib/pdf-ingestion/upload.ts`

In `createLinkedPdfUpload`, when `document_type === "mark_scheme"`, add before creating the job:

```ts
if (input.document_type === "mark_scheme") {
  const questionCount = await db.examSectionQuestion.count({
    where: { exam_section: { exam_paper_id: input.exam_paper_id } },
  })
  if (questionCount === 0) {
    return { ok: false, error: "Upload the question paper first — no questions found." }
  }
}
```

---

## Phase 5 — Server action: Reprocess mark scheme

**File (new):** `apps/web/src/lib/pdf-ingestion/reprocess.ts`

Reuse the pattern from `packages/backend/src/tools/pdf-ingestion/retrigger/tool.ts`:

```ts
"use server"

export type ReprocessMarkSchemeResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string }

export async function reprocessMarkScheme(
  examPaperId: string,
): Promise<ReprocessMarkSchemeResult> {
  // 1. Auth check
  // 2. Find most recent completed MS job for this exam paper:
  //    db.pdfIngestionJob.findFirst({
  //      where: { exam_paper_id: examPaperId, document_type: "mark_scheme", status: "ocr_complete" },
  //      orderBy: { processed_at: "desc" },
  //    })
  // 3. Verify questions exist (same gate as upload)
  // 4. Reset job: status → "pending", error → null
  // 5. SQS send: { job_id } → MarkSchemePdfQueue
  // 6. Return { ok: true, jobId }
}
```

`infra/web.ts` already links `markSchemePdfQueue` (line 31) — no infra change needed.

---

## Phase 6 — Server action: Bulk re-grade after MS update

**File:** `apps/web/src/lib/marking/mutations.ts`

Add a new server action:

```ts
export type BulkRetriggerGradingResult =
  | { ok: true; count: number }
  | { ok: false; error: string }

export async function bulkRetriggerGrading(
  examPaperId: string,
): Promise<BulkRetriggerGradingResult> {
  // 1. Auth check
  // 2. Find all non-superseded submissions for this exam paper
  //    that have at least one completed grading run
  // 3. For each: call retriggerGrading(sub.id) — reuses existing logic
  //    (creates new submission, copies OCR data, supersedes old, enqueues)
  // 4. Return { ok: true, count: retriggeredCount }
}
```

This reuses the existing `retriggerGrading` per-submission logic. No new queue infrastructure needed.

---

## Phase 7 — UI: Reprocess button + re-mark banner

### 7a. DocCard: Add reprocess action

**File:** `apps/web/src/app/teacher/exam-papers/[id]/document-upload-cards.tsx`

Add optional props to `DocCard`:
```ts
onReprocess?: () => void
isReprocessing?: boolean
```

In the `isAcquired` status section (line 165-174), add a "Reprocess" button next to "View":

```tsx
{isAcquired && completedDoc && (
  <div className="flex items-center justify-between gap-2">
    <span className="text-xs font-medium text-green-700 dark:text-green-400">
      Acquired
    </span>
    <div className="flex items-center gap-1.5">
      {onReprocess && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={(e) => { e.stopPropagation(); onReprocess() }}
          disabled={isReprocessing}
        >
          {isReprocessing ? <Spinner className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
          Reprocess
        </Button>
      )}
      <PdfViewerDialog jobId={completedDoc.id} label={config.label} />
    </div>
  </div>
)}
```

Add `onReprocessMarkScheme` and `isReprocessingMarkScheme` props to `DocumentUploadCards`, thread to the MS card only.

### 7b. Wire up in exam paper page shell

**File:** `apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx`

Add mutation:
```ts
const reprocessMutation = useMutation({
  mutationFn: () => reprocessMarkScheme(paper.id),
  onSuccess: (result) => {
    if (!result.ok) { toast.error(result.error); return }
    toast.success("Mark scheme reprocessing started")
    void queryClient.invalidateQueries({ queryKey: queryKeys.examPaperLiveState(paper.id) })
  },
  onError: () => toast.error("Failed to start reprocessing"),
})
```

Pass to `DocumentUploadCards`:
```tsx
<DocumentUploadCards
  examPaperId={paper.id}
  completedDocs={completedDocs}
  activeJobs={activeJobs}
  onJobStarted={handleJobStarted}
  onReprocessMarkScheme={() => reprocessMutation.mutate()}
  isReprocessingMarkScheme={reprocessMutation.isPending}
/>
```

### 7c. Re-mark banner

**File:** `apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx`

After mark scheme reprocessing completes (live state polling detects MS job transition to `ocr_complete`), show a banner if there are graded submissions:

```tsx
{showRemarkBanner && (
  <Alert>
    <AlertDescription className="flex items-center justify-between">
      <span>
        {gradedSubmissionCount} submission{gradedSubmissionCount !== 1 ? "s were" : " was"} graded
        against the previous mark scheme.
      </span>
      <Button size="sm" onClick={() => remarkMutation.mutate()}>
        Re-mark all
      </Button>
    </AlertDescription>
  </Alert>
)}
```

The banner is shown when:
- The MS `completedDoc.processed_at` is more recent than the latest grading run for this paper
- There are non-superseded submissions with completed grading runs

The banner is dismissible and disappears after "Re-mark all" is clicked.

---

## Files Changed (summary)

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | Add `is_active` to `MarkScheme` |
| `packages/backend/src/lib/grading/grade-queries.ts` | Filter `is_active: true` |
| `packages/backend/src/services/mark-answer.ts` | Filter `is_active: true` |
| `packages/backend/src/tools/mark-schemes/create-test-dataset/tool.ts` | Filter `is_active: true` |
| `packages/backend/src/tools/answers/evaluate/tool.ts` | Filter `is_active: true` |
| `apps/web/src/lib/exam-paper/paper/queries.ts` | Filter `is_active: true` |
| `packages/backend/src/processors/mark-scheme-pdf.ts` | Compute `hasGradedSubmissions`, backend gate |
| `packages/backend/src/processors/mark-scheme-pdf/process-question.ts` | Remove `createNewQuestion`, version logic in `upsertMarkScheme` |
| `apps/web/src/lib/pdf-ingestion/upload.ts` | Front-end gate on MS upload |
| `apps/web/src/lib/pdf-ingestion/reprocess.ts` | **New** — `reprocessMarkScheme` server action |
| `apps/web/src/lib/marking/mutations.ts` | Add `bulkRetriggerGrading` |
| `apps/web/src/app/teacher/exam-papers/[id]/document-upload-cards.tsx` | Reprocess button |
| `apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx` | Wire mutation + re-mark banner |

---

## Verification

1. **`bun typecheck`** — passes
2. **`bun check`** — Biome passes
3. **Schema push** — `bun db:push` applies `is_active` column
4. **Manual test — no graded submissions**: Upload QP → Upload MS → Questions get mark schemes. Upload new MS → mark schemes overwritten in place (same IDs).
5. **Manual test — with graded submissions**: Upload QP → Upload MS → Grade a submission → Reprocess MS → Old mark schemes deactivated, new ones created → Banner shows "1 submission needs re-marking" → Click re-mark → New grading run uses new mark scheme.
6. **Gate test**: Try uploading MS before QP → Error toast: "Upload the question paper first"
7. **Unmatched test**: Upload MS where some questions don't match → Those entries skipped with warning, matched ones processed normally.
