# Build Plan — Bookmarks

**Date:** 2026-05-07  
**Scope:** Allow teachers to bookmark individual student submissions for quick retrieval. Bookmarks surface in the submission editor (toggle button), the exam paper's submission table (icon column), and a new "Bookmarked" section in the teacher nav sheet.

---

## Background

Geoff's v7 editor mockup shows a **bookmark button** (`btn-bookmark`) in the top toolbar — a toggle icon that fills/unfills and changes border colour to teal when active. The use case: a teacher wants to flag a script for later review (e.g. borderline grade, interesting response, needs second opinion).

---

## DB — new `StudentSubmissionBookmark` table

```prisma
model StudentSubmissionBookmark {
  id            String   @id @default(cuid())
  user_id       String
  submission_id String
  created_at    DateTime @default(now())

  user       User              @relation("UserBookmarks", fields: [user_id], references: [id], onDelete: Cascade)
  submission StudentSubmission @relation("SubmissionBookmarks", fields: [submission_id], references: [id], onDelete: Cascade)

  @@unique([user_id, submission_id])
  @@index([user_id])
  @@index([submission_id])
  @@map("student_submission_bookmarks")
}
```

Add the back-relations to `User` and `StudentSubmission`:
```prisma
// on User:
bookmarks StudentSubmissionBookmark[] @relation("UserBookmarks")

// on StudentSubmission:
bookmarks StudentSubmissionBookmark[] @relation("SubmissionBookmarks")
```

Migration: `bun db:push`. No data loss — new table.

---

## Server actions

### `toggleBookmark` — mutation

Location: `apps/web/src/lib/marking/submissions/mutations.ts`

Upsert/delete pattern — idempotent toggle:

```ts
export const toggleBookmark = resourceAction({
  type: "submission",
  role: "viewer",  // read access is enough to bookmark
  schema: z.object({ jobId: z.string(), bookmarked: z.boolean() }),
  id: ({ jobId }) => jobId,
}).action(async ({ parsedInput: { jobId, bookmarked }, ctx }) => {
  if (bookmarked) {
    await db.studentSubmissionBookmark.upsert({
      where: { user_id_submission_id: { user_id: ctx.user.id, submission_id: jobId } },
      create: { user_id: ctx.user.id, submission_id: jobId },
      update: {},
    })
  } else {
    await db.studentSubmissionBookmark.deleteMany({
      where: { user_id: ctx.user.id, submission_id: jobId },
    })
  }
  return { bookmarked }
})
```

### `getBookmarkedSubmissions` — query for nav sheet

Location: `apps/web/src/lib/marking/submissions/queries.ts`

Returns the teacher's most recent 20 bookmarks with enough data to render nav links (student name, exam paper title, submission id).

```ts
export const getBookmarkedSubmissions = authenticatedAction
  .schema(z.object({}))
  .action(async ({ ctx }) => {
    const bookmarks = await db.studentSubmissionBookmark.findMany({
      where: { user_id: ctx.user.id },
      orderBy: { created_at: "desc" },
      take: 20,
      select: {
        submission: {
          select: {
            id: true,
            student_name: true,
            exam_paper: { select: { id: true, title: true } },
          },
        },
      },
    })
    return { bookmarks: bookmarks.map((b) => b.submission) }
  })
```

---

## Query keys

Add to `apps/web/src/lib/query-keys.ts`:

```ts
bookmarks: () => ["bookmarks"] as const,
submissionBookmark: (jobId: string) => ["submissionBookmark", jobId] as const,
```

---

## UI surfaces

### 1 — Submission editor toolbar (`SubmissionToolbar`)

A bookmark toggle button in toolbar row 1, to the left of the Confirm button.

**Behaviour:**
- Reads `is_bookmarked` from `StudentPaperJobPayload` (added to the existing listing/detail query via a join on `student_submission_bookmarks` filtered by `ctx.user.id`).
- `useMutation` → `toggleBookmark`. Optimistic update: flip `is_bookmarked` locally, rollback on error, `toast.error` on failure.
- On settle: `queryClient.invalidateQueries(queryKeys.submissions(examPaperId))` and `queryKeys.bookmarks()`.

**Visual spec (from mockup):**
```
Inactive: border-border bg-card text-muted-foreground     shadow-tile
Active:   border-primary bg-primary/5 text-primary        shadow-confirm (teal-tinted)
Icon:     Bookmark (lucide) — fill: none → fill: primary/15 when active
```

Use `Button` with `variant="ghost"` as base, apply bespoke active-state classes via `cn()` — don't add a new button variant just for this.

### 2 — Submission table (`SubmissionTable`)

Add a **bookmark column** as the second column (after the checkbox, before Student Name):

- `TableHead`: `Bookmark` label, `w-8`.
- Each row: a small icon button (`size="icon-sm" variant="ghost"`) showing `Bookmark` (lucide). Filled/teal when bookmarked.
- Click → `toggleBookmark` mutation with optimistic update. The table receives `bookmarkedIds: Set<string>` as a prop from the page shell (loaded alongside submissions).
- Add `"bookmarked"` to `SORT_KEYS` in the table so teachers can group bookmarked scripts at the top.

The exam paper page shell fetches bookmarks alongside submissions:

```ts
const { data: bookmarkedIds = new Set<string>() } = useQuery({
  queryKey: queryKeys.bookmarks(),
  queryFn: async () => {
    const r = await getBookmarkedSubmissions({})
    const ids = r?.data?.bookmarks
      .filter((b) => b.exam_paper.id === examPaperId)
      .map((b) => b.id) ?? []
    return new Set(ids)
  },
})
```

### 3 — Teacher nav sheet (`TeacherNavSheet`)

A new **"Bookmarked"** section between `RECENT_ITEMS` and `ALL_ITEMS`.

- **Server-rendered** in the nav sheet's server wrapper component (the sheet already receives a `displayName` etc from the server layout — add `bookmarks` to that fetch). Alternatively, load client-side via `useQuery(queryKeys.bookmarks())` to keep it reactive without a page reload.
- Recommend client-side (the sheet is already `"use client"`): add a `BookmarkedSection` sub-component that runs `useQuery`.
- Each bookmark renders as a nav link: `student_name — paper_title` → href: `/teacher/exam-papers/{exam_paper_id}?job={submission_id}` (opens the marking job dialog directly via the existing `?job` query param).
- Show at most 5 recent bookmarks. If there are more, show a "See all" link to a future `/teacher/bookmarks` page (stub with `href="/teacher/bookmarks"` for now).
- Empty state: a small muted `"No bookmarks yet"` line rather than hiding the section entirely — teachers need to know the feature exists.

**Nav section visual:**
```
NavLabel: "Bookmarked"
  [Bookmark icon]  Jasmine Kawsamally — Economics P2
  [Bookmark icon]  Daniel Park — Economics P2
  No bookmarks yet  (empty state, muted)
```

---

## `StudentPaperJobPayload` / listing type changes

Add `is_bookmarked: boolean` to `StudentPaperJobPayload` (used by the editor toolbar):

In the detail query (`getStudentPaperJobForPaper`), include bookmarks in the select filtered by the requesting user, and derive `is_bookmarked` in `toJobPayload`.

Add `is_bookmarked: boolean` to `SubmissionHistoryItem` (used by the table):

In the listing query, include a `_count` or direct join on `student_submission_bookmarks` filtered by user. The `ctx.user.id` is available in the action handler.

---

## Files touched

| File | Change |
|------|--------|
| `packages/db/prisma/schema.prisma` | Add `StudentSubmissionBookmark` model + back-relations |
| `apps/web/src/lib/query-keys.ts` | Add `bookmarks`, `submissionBookmark` keys |
| `apps/web/src/lib/marking/submissions/mutations.ts` | Add `toggleBookmark` |
| `apps/web/src/lib/marking/submissions/queries.ts` | Add `getBookmarkedSubmissions`; add bookmark join to detail + listing queries |
| `apps/web/src/lib/marking/types.ts` | Add `is_bookmarked` to `StudentPaperJobPayload` + `SubmissionHistoryItem` |
| `apps/web/src/lib/marking/listing/queries.ts` | Add bookmark join to listing |
| `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/submission-toolbar.tsx` | Bookmark toggle button |
| `apps/web/src/app/teacher/exam-papers/[id]/submission-table.tsx` | Bookmark column + sort key |
| `apps/web/src/app/teacher/exam-papers/[id]/exam-paper-page-shell.tsx` | Fetch `bookmarkedIds`, pass to table |
| `apps/web/src/components/teacher/teacher-nav-sheet.tsx` | `BookmarkedSection` sub-component |

---

## Out of scope (follow-up)

- `/teacher/bookmarks` listing page — stub the link now, build later.
- Bookmark notes / labels — not needed pre-launch.
- Shared bookmarks across a department — post-launch.
- Bookmark count badge on the nav icon — post-launch.
