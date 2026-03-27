---
name: Marking Workflow UX
overview: "Reorganize the teacher workflow so exam papers are the primary home base: update navigation, surface submissions contextually on the exam paper page, and open the marking workspace in a full-viewport dialog instead of navigating away."
todos:
  - id: nav-changes
    content: Update sidebar nav (rename, reorder, icon), layout.tsx header links, teacher/page.tsx redirect, submission-toolbar.tsx breadcrumb links
    status: pending
  - id: submissions-panel
    content: Add listMySubmissions() to exam paper page.tsx server fetch, add submissions panel to exam-paper-page-shell.tsx
    status: pending
  - id: upload-callback
    content: Add onJobReady callback prop to UploadStudentScriptDialog
    status: pending
  - id: submission-view-mode
    content: Add mode prop to SubmissionView for dialog vs page layout
    status: pending
  - id: marking-job-dialog
    content: Create new marking-job-dialog.tsx component
    status: pending
  - id: shell-wiring
    content: Wire markingJobId state, onJobReady, and MarkingJobDialog into exam-paper-page-shell.tsx
    status: pending
isProject: false
---

# Marking Workflow UX

## Current flow (problem)

```
Exam Papers → Start marking → /teacher/mark/{jobId} [away from paper]
Sidebar "Mark Papers" → global list → find paper again
```

## New flow

```
Exam Papers → Start marking → MarkingJobDialog (overlay, no navigation)
Exam paper page → Submissions panel (contextual history for THIS paper)
Sidebar → "Exam Papers" (primary), "Marking History" (secondary)
```

---

## 1. Navigation changes

`**[teacher-sidebar-nav.tsx](apps/web/src/components/teacher-sidebar-nav.tsx)**`

- Rename `"Mark Papers"` → `"Marking History"`, swap `PenLine` icon for `ClipboardList`
- Reorder so `"Exam Papers"` is first, `"Marking History"` is second

`**[layout.tsx](apps/web/src/app/teacher/layout.tsx)**`

- Sidebar header link: `/teacher/mark` → `/teacher/exam-papers` (both desktop and mobile)

`**[apps/web/src/app/teacher/page.tsx](apps/web/src/app/teacher/page.tsx)**`

- Root redirect: `/teacher/mark` → `/teacher/exam-papers`

`**[submission-toolbar.tsx](apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/submission-toolbar.tsx)**`

- Breadcrumb "Papers" link: `/teacher/mark` → `/teacher/exam-papers`
- Breadcrumb paper title link: `/teacher/mark/papers/${examPaperId}` → `/teacher/exam-papers/${examPaperId}`

---

## 2. Submissions panel on exam paper page

`**[page.tsx](apps/web/src/app/teacher/exam-papers/[id]/page.tsx)**` — add `listMySubmissions()` to the parallel server fetches, filter by `id`, pass as `initialSubmissions`:

```tsx
const [result, docsResult, submissionsResult] = await Promise.all([
  getExamPaperDetail(id),
  getPdfDocumentsForPaper(id),
  listMySubmissions(),
])
const initialSubmissions = submissionsResult.ok
  ? submissionsResult.submissions.filter((s) => s.exam_paper_id === id)
  : []
// pass initialSubmissions to ExamPaperPageShell
```

`**[exam-paper-page-shell.tsx](apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx)**` — accept `initialSubmissions?: SubmissionHistoryItem[]` and render a compact submissions section below the document upload cards:

- If 0 submissions: render nothing (or a faint "No submissions yet" line)
- If ≥1: a compact card with a small table (student name, score badge, date, "View" link to the existing submission page)
- Footer: "View all analytics →" links to `/teacher/mark/papers/${paper.id}` (existing stats page)
- The `initialSubmissions` is server-loaded so it renders green/complete on first paint; no extra polling needed

---

## 3. Marking workflow dialog

### 3a. `UploadStudentScriptDialog` callback

`**[upload-student-script-dialog.tsx](apps/web/src/app/teacher/exam-papers/[id]/upload-student-script-dialog.tsx)**` — add optional `onJobReady` prop. When provided, call it instead of `router.push`:

```tsx
// New prop:
onJobReady?: (jobId: string) => void

// In handleSubmit, after triggerOcr succeeds:
if (onJobReady) {
  onJobReady(jobIdRef.current)
} else {
  router.push(`/teacher/mark/${jobIdRef.current}`)
}
```

### 3b. `SubmissionView` dialog mode

`**[submission-view.tsx](apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/submission-view.tsx)**` — add `mode?: "page" | "dialog"` prop. Change the outer wrapper:

```tsx
// Current (page mode):
<div className="-m-6 flex flex-col overflow-hidden h-dvh">

// Dialog mode:
<div className="flex flex-col overflow-hidden h-full">
```

The `-m-6` escapes the `p-6` of the page layout. In a dialog with `p-0`, it's not needed. `h-dvh` becomes `h-full` to fill the dialog container.

### 3c. New `MarkingJobDialog` component

**New file: `apps/web/src/app/teacher/exam-papers/[id]/marking-job-dialog.tsx`**

Client component. Fetches `getStudentPaperJobForPaper`, `getJobScanPageUrls`, `getJobPageTokens` when `jobId` is set, then renders `SubmissionView mode="dialog"` inside a full-viewport Dialog:

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-[98vw] h-[98vh] p-0 overflow-hidden">
    {loading ? <centered spinner> : (
      <SubmissionView
        mode="dialog"
        examPaperId={examPaperId}
        jobId={jobId}
        initialData={data}
        scanPages={scanPages}
        pageTokens={pageTokens}
        initialPhase={phase}
      />
    )}
  </DialogContent>
</Dialog>
```

The job starts in `pending`/`processing` state immediately after upload — `SubmissionView`'s existing `useJobPoller` handles live updates automatically.

### 3d. Wire it up in the shell

`**[exam-paper-page-shell.tsx](apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx)**`

- Add `markingJobId: string | null` state (initially `null`)
- Pass `onJobReady` to `UploadStudentScriptDialog`:

```tsx
  onJobReady={(jobId) => {
    setUploadScriptOpen(false)
    setMarkingJobId(jobId)
  }}
  

```

- Render `MarkingJobDialog` at the bottom:

```tsx
  <MarkingJobDialog
    examPaperId={paper.id}
    jobId={markingJobId}
    open={markingJobId !== null}
    onOpenChange={(v) => { if (!v) setMarkingJobId(null) }}
  />
  

```

---

## File change summary


| File                               | Change                                                   |
| ---------------------------------- | -------------------------------------------------------- |
| `teacher-sidebar-nav.tsx`          | Rename, reorder, swap icon                               |
| `layout.tsx`                       | Header links → `/teacher/exam-papers`                    |
| `teacher/page.tsx`                 | Redirect → `/teacher/exam-papers`                        |
| `submission-toolbar.tsx`           | Breadcrumb links → exam-papers routes                    |
| `exam-papers/[id]/page.tsx`        | Add `listMySubmissions()` fetch                          |
| `exam-paper-page-shell.tsx`        | Add submissions panel + `MarkingJobDialog` wiring        |
| `upload-student-script-dialog.tsx` | Add `onJobReady` callback                                |
| `submission-view.tsx`              | Add `mode` prop, adjust outer div classes                |
| `marking-job-dialog.tsx`           | **New** — full-viewport dialog wrapping `SubmissionView` |


