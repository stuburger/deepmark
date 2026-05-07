# Build Plan — Confirm Marking + Script Navigation

**Date:** 2026-05-07  
**Scope:** Two tightly-coupled features in the submission editor — (1) a "Confirm marking" button that acts as the human-in-the-loop sign-off, and (2) Prev / Next navigation buttons so teachers can move through a class set without returning to the table.

---

## Background

Geoff's v7 editor mockup (`geoff_ui_claude_design/v2/deepmark_v7_editor.html`) shows:
- A **"Confirm marking ✓"** teal button (`btn-confirm`) at the top-right of the editor, styled with the `shadow-confirm` token.
- **"← Prev" and "Next →"** nav buttons centred in the toolbar row above the body.

These two features belong in the same ticket because the canonical Confirm action is "sign off this script and jump to the next one" — they share the same data dependency (the ordered list of submissions in the paper) and the same UI surface (toolbar row 1).

---

## Feature 1 — Confirm Marking

### What it does
The teacher reviews the AI-generated marks, optionally adjusts them via the editor, then clicks **Confirm marking**. This records a timestamp + user on the submission and — by default — jumps to the next unconfirmed script in the class set. If there is no next script, the dialog closes and the table refreshes.

A confirmed script shows a distinct indicator in `SubmissionTable` so the teacher can see at a glance how many scripts are still outstanding.

### DB change — `StudentSubmission`

Add two nullable fields to `StudentSubmission`:

```prisma
confirmed_at  DateTime?
confirmed_by  String?       // FK → User.id (nullable — no cascade needed)
```

No enum change needed. Confirmed state is computed: `confirmed_at IS NOT NULL`.

Migration: `bun db:push` (no data loss — new nullable columns).

### Server action — `confirmMarking`

Location: `apps/web/src/lib/marking/submissions/mutations.ts`

```ts
export const confirmMarking = resourceAction({
  type: "submission",
  role: "editor",
  schema: z.object({ jobId: z.string() }),
  id: ({ jobId }) => jobId,
}).action(async ({ parsedInput: { jobId }, ctx }) => {
  await db.studentSubmission.update({
    where: { id: jobId },
    data: { confirmed_at: new Date(), confirmed_by: ctx.user.id },
  })
  return { ok: true }
})
```

### Server action — `getAdjacentSubmissions`

Location: `apps/web/src/lib/marking/submissions/queries.ts`

Returns the prev/next **latest** (non-superseded) submission ids for a given jobId within the same exam paper, in `student_name asc, created_at asc` order (alphabetical by student name — predictable, matches how teachers think about a class set).

```ts
export const getAdjacentSubmissions = resourcesAction({
  resources: [
    { type: "examPaper", role: "viewer", id: ({ examPaperId }) => examPaperId },
    { type: "submission", role: "viewer", id: ({ jobId }) => jobId },
  ],
  schema: z.object({ examPaperId: z.string(), jobId: z.string() }),
}).action(async ({ parsedInput: { examPaperId, jobId } }) => {
  const all = await db.studentSubmission.findMany({
    where: { exam_paper_id: examPaperId, superseded_at: null },
    select: { id: true },
    orderBy: [{ student_name: "asc" }, { created_at: "asc" }],
  })
  const idx = all.findIndex((s) => s.id === jobId)
  return {
    prevId: idx > 0 ? all[idx - 1].id : null,
    nextId: idx !== -1 && idx < all.length - 1 ? all[idx + 1].id : null,
  }
})
```

**Query key:** `queryKeys.adjacentSubmissions(examPaperId, jobId)` — add to `query-keys.ts`.

### UI changes

#### `SubmissionToolbar` — row 1

Three changes to the topbar row:

1. **Prev / Next buttons** — centred in row 1, matching the mockup layout.
   - A `useQuery` for `getAdjacentSubmissions` supplies `prevId` / `nextId`.
   - Prev/Next buttons are `variant="outline" size="sm"` ghost-style (`← Prev` / `Next →`).
   - Disabled when `prevId` / `nextId` is null.
   - On click: call `onNavigateToJob(prevId|nextId)`.

2. **Confirm marking button** — right of row 1, `variant="confirm"` size `sm`.
   - Uses `useMutation` → `confirmMarking`.
   - `onMutate`: optimistic — updates local `confirmed_at` state.
   - `onSettled`: invalidates `queryKeys.submissions(examPaperId)` and `queryKeys.studentJob(jobId)`.
   - After success: if `nextId` exists, call `onNavigateToJob(nextId)`; otherwise call `onClose?.()`.
   - Loading state: spinner replaces checkmark icon.
   - If already confirmed: button shows "Confirmed ✓" in `variant="secondary"` (muted, non-interactive).

3. **Confirmed indicator** — when `confirmed_at` is set, show a small `SoftChip kind="success"` chip (`Confirmed`) to the left of the button so the state persists visually after confirmation.

New prop threaded through `SubmissionView` → `SubmissionToolbar`:
```ts
examPaperId: string  // already present at MarkingJobDialog level — just needs drilling
```

The `onNavigateToJob` callback already exists on `SubmissionToolbar` — reuse it.

#### `SubmissionTable` — confirmed column

- Add a **"Confirmed"** boolean to `SubmissionHistoryItem` type (derived from `confirmed_at IS NOT NULL` in the listing query).
- Add a new `TableHead` column between Status and Score: no label, just a bookmark-style icon (`CheckCircle` or `Check`) in the header.
- Each row: if confirmed, show `<StatusDot kind="success" />` with tooltip "Confirmed by teacher"; otherwise empty.
- Add `"confirmed"` as a new `SortKey` so teachers can sort by confirmed state.

#### `SubmissionHistoryItem` type / listing query

The listing query in `apps/web/src/lib/marking/listing/queries.ts` must add `confirmed_at: DateTime | null` to the select. The mapping function adds `is_confirmed: submission.confirmed_at !== null`.

---

## Feature 2 — Script Navigation (Prev / Next)

This is fully covered by the `getAdjacentSubmissions` action and the toolbar buttons above. Additional notes:

- Navigation must work both in the **dialog** (MarkingJobDialog, which uses `onNavigateToJob`) and on the **standalone route** (`/teacher/submissions/[jobId]`), which does a `router.push`.
- The standalone route needs to thread `examPaperId` down to `SubmissionToolbar` (it already knows it from the URL param).
- Order is: alphabetical by `student_name asc`, then `created_at asc` as tiebreaker. This is stable across page refreshes (unlike `created_at` alone which gives arbitrary ordering for same-day uploads).

---

## Files touched

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | Add `confirmed_at`, `confirmed_by` to `StudentSubmission` |
| `apps/web/src/lib/query-keys.ts` | Add `adjacentSubmissions` key |
| `apps/web/src/lib/marking/submissions/mutations.ts` | Add `confirmMarking` |
| `apps/web/src/lib/marking/submissions/queries.ts` | Add `getAdjacentSubmissions` |
| `apps/web/src/lib/marking/listing/queries.ts` | Add `confirmed_at` to listing select + `is_confirmed` to type |
| `apps/web/src/lib/marking/types.ts` | Add `is_confirmed` to `StudentPaperJobPayload` + `SubmissionHistoryItem` |
| `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/submission-toolbar.tsx` | Prev/Next buttons, Confirm button |
| `apps/web/src/app/teacher/exam-papers/[id]/submission-table.tsx` | Confirmed column |
| `apps/web/src/app/teacher/exam-papers/[id]/marking-job-dialog.tsx` | Pass `examPaperId` through |

No new pages or routes needed. No SQS/Lambda changes needed.

---

## Out of scope (follow-up)

- Bulk confirm (select all → confirm selected) — defer until single confirm is shipped.
- Undo confirm — not needed pre-launch.
- Keyboard shortcut `⌘ + Enter` to confirm (shown in mockup JS) — defer.
