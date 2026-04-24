---
name: Annotated Answer Refactor
overview: Split three oversized files — `annotated-answer-sheet.tsx` (462 lines), `comment-sidebar.tsx` (563 lines), and `queries.ts` (709 lines) — into focused modules, and name the large inline type in `toJobPayload`.
todos:
  - id: r1
    content: Create use-token-highlight.ts with the three resolver helpers + useEffect
    status: completed
  - id: r2
    content: Update annotated-answer-sheet.tsx to use the new hook, remove extracted code
    status: completed
  - id: r3
    content: Create comment-card-view.tsx with CommentCardView, CommentCardViewProps, updateMarkAttr, removeMark
    status: completed
  - id: r4
    content: Update comment-sidebar.tsx to import from comment-card-view.tsx, remove extracted code
    status: completed
  - id: r5
    content: Name toJobPayload parameter type using Prisma.StudentSubmissionGetPayload in queries.ts
    status: completed
isProject: false
---

# Annotated Answer Component + Queries Refactor

## 1. Extract `use-token-highlight.ts` from `annotated-answer-sheet.tsx`

The three `resolveTokens*` helpers plus the token-highlight `useEffect` are a self-contained concern that has nothing to do with editor setup or rendering. Extract them into a new hook file.

**New file:** `apps/web/src/components/annotated-answer/use-token-highlight.ts`

```ts
export function useTokenHighlight(
  editor: Editor | null,
  activeAnnotationId: string | null,
  onTokenHighlight?: (tokenIds: string[] | null) => void,
): void
```

The hook owns:
- `resolveTokensForRange` (private)
- `resolveTokensForAnnotation` (private)
- `resolveTokenAtCursor` (private)
- The `useEffect` that subscribes to `editor.on("transaction", handleUpdate)` (currently lines 295–325 in the sheet)

**`annotated-answer-sheet.tsx` after extraction:** drops from 462 → ~340 lines. Replace the three helpers + effect with one `useTokenHighlight(editor, activeAnnotationId, onTokenHighlight)` call.

---

## 2. Extract `comment-card-view.tsx` from `comment-sidebar.tsx`

`CommentCardView` (lines 328–562, ~235 lines) is a standalone React component with its own state, effects, and handlers. It is only wired to the parent via props — a perfect extraction boundary.

**New file:** `apps/web/src/components/annotated-answer/comment-card-view.tsx`

Move:
- `CommentCardViewProps` (named type — currently an inline object on the function)
- `CommentCardView` function component
- `updateMarkAttr` and `removeMark` helpers (lines 92–121 in sidebar — they are only called from `CommentCardView`)

`comment-sidebar.tsx` keeps:
- `CommentCard` type
- `layoutCards` helper
- `CommentSidebar` component
- Constants (`MARK_ICONS`, `MARK_LABELS`, `SENTIMENT_DOT`, `CARD_HEIGHT_PX`, etc.)

**`comment-sidebar.tsx` after extraction:** drops from 563 → ~330 lines.

---

## 3. Name the `toJobPayload` parameter type in `queries.ts`

The `toJobPayload` function has a ~60-line inline parameter type (lines 179–239). Replace it with a named type derived from Prisma's generated types.

**Named type approach using Prisma inference:**

```ts
import type { Prisma } from "@mcp-gcse/db"

type SubmissionWithDetail = Prisma.StudentSubmissionGetPayload<{
  include: typeof submissionDetailInclude
}>
```

This eliminates the manual duplication of the Prisma select shape and keeps the type automatically in sync with `submissionDetailInclude`.

`toJobPayload(sub: SubmissionWithDetail)` — the function signature becomes a single line.

**Note:** `submissionDetailInclude` is currently defined with `as const` in the same file (line ~78). Extracting it to a `const` with an explicit type works with Prisma's `GetPayload` utility. The `toJobPayload` function body needs no changes — it already accesses the correct fields.

---

## File changes summary

| File | Action | Lines before | Lines after (est.) |
|---|---|---|---|
| `annotated-answer-sheet.tsx` | Extract hook | 462 | ~340 |
| `use-token-highlight.ts` | Create | — | ~70 |
| `comment-sidebar.tsx` | Extract card | 563 | ~330 |
| `comment-card-view.tsx` | Create | — | ~250 |
| `queries.ts` | Named type | 709 | ~660 |

All public exports remain unchanged. No callers outside these files need modification.
