# Build Plan — Command Palette (cmd-K search)

**Date:** 2026-05-07
**Scope:** Add a global cmd-K / ctrl-K command palette that searches papers, submissions, and (later) students. Replaces the need for a file-tree navigator inside the marking workspace — the user can jump anywhere from anywhere without leaving the script they're marking.

---

## Why search, not a nav tree

The marking workspace (`submission-view.tsx`) is a focused two-pane: scan on the left, results on the right. Adding a tree view here:

- Steals visual real estate from the only task that matters in this view.
- Duplicates the toolbar's existing breadcrumb + Prev/Next.
- Is a one-level-at-a-time tree, which is just a worse breadcrumb.

A palette is cheaper to build, scales as data grows, and crucially solves the across-papers jump that Prev/Next can't (the toolbar only navigates within the current paper).

---

## UX

**Trigger:**
- `⌘K` (mac) / `Ctrl+K` (windows / linux) from anywhere under `/teacher`.
- A discoverable `[⌘K Search]` button in the icon rail / nav sheet header for affordance.

**Empty state (palette opens, no query yet):**
- Top section: **Recent** — 5 most recent submissions the user has touched (their own + ones shared with them), keyed by `studentJob` query history if available, otherwise by `created_at desc` over `submissionAccessWhere(...)`.
- Top section: **Bookmarked** — first 5 from the existing `getBookmarkedSubmissions` query (free reuse).

**With query:**
- Three result groups, in this order:
  1. **Papers** — `exam_papers.title` ILIKE `%q%`, max 5.
  2. **Submissions** — `student_submissions.student_name` ILIKE `%q%`, joined to `exam_papers.title` for context, max 10.
  3. **Students** *(phase 2 — defer)* — `students.name` / `students.email` ILIKE `%q%`, max 5.

Each row renders as:
- **Paper:** 📄 icon + title + subtle subject/year badge.
- **Submission:** 👤 icon + student name + ` — paper title` muted suffix + score chip if marked.
- Keyboard: ↑↓ to navigate, Enter to open, Esc to close.

**Open behaviour:**
- Paper → `router.push("/teacher/exam-papers/{id}")`.
- Submission → `router.push("/teacher/exam-papers/{paperId}?job={submissionId}")` — opens directly in the marking dialog using the existing `?job` param.

---

## Files touched

| File | Change |
|------|--------|
| `apps/web/src/lib/search/queries.ts` *(new)* | `searchEverything` action — fans out paper + submission queries, scoped to user. |
| `apps/web/src/components/teacher/command-palette.tsx` *(new)* | Self-contained `<CommandPalette>` — wraps `CommandDialog` from `@/components/ui/command`, owns its own open/close state + cmd-K binding. |
| `apps/web/src/components/teacher/command-palette-trigger.tsx` *(new)* | Small button (`⌘K Search`) rendered in the icon rail and nav sheet for discoverability. Emits a custom event the palette listens to (or uses a tiny zustand store / context). |
| `apps/web/src/components/teacher/teacher-nav-context.tsx` | Add `paletteOpen` + `setPaletteOpen` to the existing nav context so the trigger button and the cmd-K hotkey share state without a new provider. |
| `apps/web/src/app/teacher/layout.tsx` | Mount `<CommandPalette />` once, inside `TeacherNavProvider`. Renders nothing until opened. |
| `apps/web/src/lib/query-keys.ts` | Add `paletteSearch: (q: string) => ["paletteSearch", q] as const`. |

---

## Server action

```ts
// apps/web/src/lib/search/queries.ts
"use server"

import { authenticatedAction } from "@/lib/authz"
import {
  examPaperAccessWhere,
  submissionAccessWhere,
} from "@/lib/authz"
import { db } from "@/lib/db"
import { z } from "zod"

export type PaletteResult =
  | { kind: "paper"; id: string; title: string; subject: string | null }
  | {
      kind: "submission"
      id: string
      student_name: string | null
      paper_id: string
      paper_title: string
    }

export const searchEverything = authenticatedAction
  .schema(z.object({ q: z.string().trim().min(0).max(100) }))
  .action(async ({ parsedInput: { q }, ctx }): Promise<{
    papers: PaletteResult[]
    submissions: PaletteResult[]
  }> => {
    if (q.length === 0) {
      return { papers: [], submissions: [] }
    }
    const [paperWhere, subWhere] = await Promise.all([
      examPaperAccessWhere(ctx.user, "viewer"),
      submissionAccessWhere(ctx.user, "viewer"),
    ])
    const [papers, subs] = await Promise.all([
      db.examPaper.findMany({
        where: {
          ...paperWhere,
          title: { contains: q, mode: "insensitive" },
        },
        orderBy: { updated_at: "desc" },
        take: 5,
        select: { id: true, title: true, subject: true },
      }),
      db.studentSubmission.findMany({
        where: {
          ...subWhere,
          superseded_at: null,
          student_name: { contains: q, mode: "insensitive" },
        },
        orderBy: { created_at: "desc" },
        take: 10,
        select: {
          id: true,
          student_name: true,
          exam_paper_id: true,
          exam_paper: { select: { title: true } },
        },
      }),
    ])
    return {
      papers: papers.map((p) => ({
        kind: "paper",
        id: p.id,
        title: p.title,
        subject: p.subject,
      })),
      submissions: subs
        .filter((s) => s.exam_paper)
        .map((s) => ({
          kind: "submission",
          id: s.id,
          student_name: s.student_name,
          paper_id: s.exam_paper_id,
          paper_title: s.exam_paper?.title ?? "",
        })),
    }
  })
```

---

## Component sketch

```tsx
// apps/web/src/components/teacher/command-palette.tsx
"use client"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { searchEverything } from "@/lib/search/queries"
import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import { FileText, User } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useTeacherNav } from "./teacher-nav-context"

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useTeacherNav()
  const [q, setQ] = useState("")
  const router = useRouter()

  // ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [setPaletteOpen])

  const { data } = useQuery({
    queryKey: queryKeys.paletteSearch(q),
    queryFn: async () => {
      const r = await searchEverything({ q })
      if (r?.serverError) throw new Error(r.serverError)
      return r?.data ?? { papers: [], submissions: [] }
    },
    enabled: paletteOpen && q.length > 0,
    staleTime: 10_000,
  })

  function go(url: string) {
    setPaletteOpen(false)
    setQ("")
    router.push(url)
  }

  return (
    <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
      <CommandInput
        placeholder="Search papers, students, submissions…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {data?.papers.length ? (
          <CommandGroup heading="Papers">
            {data.papers.map((p) =>
              p.kind === "paper" ? (
                <CommandItem
                  key={p.id}
                  onSelect={() => go(`/teacher/exam-papers/${p.id}`)}
                >
                  <FileText className="size-4" />
                  <span>{p.title}</span>
                </CommandItem>
              ) : null,
            )}
          </CommandGroup>
        ) : null}
        {data?.submissions.length ? (
          <CommandGroup heading="Submissions">
            {data.submissions.map((s) =>
              s.kind === "submission" ? (
                <CommandItem
                  key={s.id}
                  onSelect={() =>
                    go(
                      `/teacher/exam-papers/${s.paper_id}?job=${s.id}`,
                    )
                  }
                >
                  <User className="size-4" />
                  <span>{s.student_name ?? "Unnamed"}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {s.paper_title}
                  </span>
                </CommandItem>
              ) : null,
            )}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
```

---

## Phasing

**Phase 1 — ship this week**
- Server action: `searchEverything` (papers + submissions only).
- `<CommandPalette />` mounted in teacher layout.
- ⌘K binding + a small trigger button in the icon rail.

**Phase 2 — follow-up**
- Empty-state recents (`Recent` + `Bookmarked` groups) using existing `listMySubmissions` + `getBookmarkedSubmissions`. No new query.
- Add **Students** group once student management has more data.
- Switch ILIKE → trigram (`pg_trgm` extension already present in the schema if `vector` is) for typo-tolerant fuzzy match. Only worth doing once we have >10k submissions.
- Track keyboard-only telemetry: how often is the palette opened from keyboard vs button, to confirm the binding is the right primary path.

---

## Out of scope

- A full-text search over annotation/answer text — that's a different (and much bigger) project; treat as Tier 3.
- Recent searches history — premature; revisit if the palette becomes a daily-driver.
- Sharing the palette with non-teachers (admin search) — separate route.

---

## Open questions

- **Trigger affordance:** add the `⌘K Search` button to the icon rail (visible always) or only inside the nav sheet (visible after click)? The icon rail wins for discoverability but costs vertical space. Default: nav sheet only for now; promote to icon rail if early users miss it.
- **Subject icon on papers** — Geoff has a custom icon set in `geoff_ui_claude_design/v2/deepmark_icons.svg`. Worth wiring per-subject icons in the palette, or keep generic `FileText` and revisit? Default: generic for phase 1.
