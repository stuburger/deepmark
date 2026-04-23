---
name: Paragraph Node Refactor
overview: Replace the broken `examinerSummary` node and `ReadOnlyText` plugin with a clean `paragraph` block node. All document content becomes freely editable; annotation marks are restricted to `questionAnswer` nodes at the schema level and via a command-level guard on the toolbar.
todos:
  - id: "1"
    content: Delete examiner-summary-node.ts, examiner-summary-view.tsx, read-only-text.ts
    status: completed
  - id: "2"
    content: "Create paragraph-node.ts with marks: \"\" and plain <p> renderHTML"
    status: completed
  - id: "3"
    content: "Update annotated-answer-sheet.tsx: swap node/extension, update schema, remove BYPASS_READ_ONLY from stage-sync"
    status: completed
  - id: "4"
    content: "Update build-doc.ts: replace examinerSummary block with paragraph block, remove jobId param"
    status: completed
  - id: "5"
    content: "Update grading-results-panel.tsx: remove jobId from buildAnnotatedDoc call"
    status: completed
  - id: "6"
    content: "Update apply-annotation-mark.ts: add questionAnswer context guard"
    status: completed
  - id: "7"
    content: "Update annotation-toolbar.tsx: gate annotation buttons on inQuestionAnswer check"
    status: completed
  - id: "8"
    content: Remove UpdateExaminerSummaryResult from types.ts and updateExaminerSummary from mutations.ts
    status: completed
isProject: false
---

# Paragraph Node Refactor

## Architecture

```mermaid
flowchart TD
    subgraph before [Before]
        B_doc["doc"]
        B_es["examinerSummary?\n(isolating, hard-break Enter,\ndebounced save)"]
        B_qa["(questionAnswer | mcqTable)+\n(read-only via ReadOnlyText)"]
        B_doc --> B_es
        B_doc --> B_qa
        B_ROT["ReadOnlyText plugin\n(filterTransaction +\nBYPASS_READ_ONLY)"]
    end

    subgraph after [After]
        A_doc["doc"]
        A_p["paragraph\n(marks: empty string — schema blocks\nannotation marks)"]
        A_qa["(questionAnswer | mcqTable)+\n(freely editable)"]
        A_doc --> A_p
        A_doc --> A_qa
    end
```

**Document schema changes:**
- Before: `"examinerSummary? (questionAnswer | mcqTable)+"`
- After: `"(paragraph | questionAnswer | mcqTable)+"`

Paragraphs can appear anywhere — before, between, or after question blocks.

---

## Files to delete

- [`examiner-summary-node.ts`](apps/web/src/components/annotated-answer/examiner-summary-node.ts)
- [`examiner-summary-view.tsx`](apps/web/src/components/annotated-answer/examiner-summary-view.tsx)
- [`read-only-text.ts`](apps/web/src/components/annotated-answer/read-only-text.ts)

---

## Files to create

### `paragraph-node.ts` (new)
`apps/web/src/components/annotated-answer/paragraph-node.ts`

```ts
export const ParagraphNode = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  marks: "",  // annotation marks blocked at schema level; expands to "bold italic" when those extensions land
  parseHTML() { return [{ tag: "p" }] },
  renderHTML() { return ["p", {}, 0] },
})
```

No NodeView — renders as a plain `<p>`. No special attrs needed.

---

## Files to modify

### [`annotated-answer-sheet.tsx`](apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx)

1. Replace imports: remove `ExaminerSummaryNode`, `ReadOnlyText`, `BYPASS_READ_ONLY`; add `ParagraphNode`
2. Update Document content expression: `"(paragraph | questionAnswer | mcqTable)+"`
3. Remove `ReadOnlyText` from extensions array
4. Add `ParagraphNode` to extensions array
5. In the stage-sync `useEffect` (around line 261): remove `.setMeta(BYPASS_READ_ONLY, true)` — no filter to bypass any more. Keep `.setMeta("addToHistory", false)` and `.setMeta("preventUpdate", true)`

### [`build-doc.ts`](apps/web/src/components/annotated-answer/build-doc.ts)

1. Remove `examinerSummary?: string | null` and `jobId?: string | null` parameters; replace with `examinerSummary?: string | null` only (jobId no longer needed)
2. Replace the `examinerSummary` block push with a `paragraph` block:
```ts
if (examinerSummary) {
  blocks.push({
    type: "paragraph",
    content: [{ type: "text", text: examinerSummary }],
  })
}
```

### [`grading-results-panel.tsx`](apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/results/grading-results-panel.tsx)

Remove `jobId` from the `buildAnnotatedDoc` call (5th argument now, no 6th):
```ts
buildAnnotatedDoc(
  data.grading_results,
  marksByQuestion,
  alignmentByQuestion,
  tokensByQuestion,
  data.examiner_summary,  // seeds the leading paragraph; no jobId
)
```
Update the `useMemo` dependency array to match.

### [`apply-annotation-mark.ts`](apps/web/src/components/annotated-answer/apply-annotation-mark.ts)

Add a command-level guard at the top of `applyAnnotationMark` — if the selection is not inside a `questionAnswer` node, return `null` immediately. Schema already enforces this, but the guard prevents the function doing unnecessary work and makes intent clear:

```ts
const $from = editor.state.doc.resolve(selFrom)
const inQuestionAnswer = Array.from(
  { length: $from.depth + 1 },
  (_, d) => $from.node(d).type.name,
).includes("questionAnswer")
if (!inQuestionAnswer) return null
```

Update the comment on line 68 that references `ReadOnlyText` (it no longer exists).

### [`annotation-toolbar.tsx`](apps/web/src/components/annotated-answer/annotation-toolbar.tsx)

Add a helper inside the component to check if the selection is within a `questionAnswer` node, and gate the `disabled` prop on annotation buttons with it. This prevents the toolbar appearing active/enabled when the teacher's cursor is inside a paragraph.

```ts
const inQuestionAnswer = useMemo(() => {
  const { from } = editor.state.selection
  const $from = editor.state.doc.resolve(from)
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === "questionAnswer") return true
  }
  return false
}, [editor.state.selection, editor.state.doc])

// Then: disabled={!hasSelection || !inQuestionAnswer}
```

### [`types.ts`](apps/web/src/lib/marking/types.ts)

Remove `UpdateExaminerSummaryResult` type (dead code — nothing saves teacher notes yet).

### [`submissions/mutations.ts`](apps/web/src/lib/marking/submissions/mutations.ts)

Remove `updateExaminerSummary` server action and its `UpdateExaminerSummaryResult` import (dead code).

---

## What is NOT changed

- [`queries.ts`](apps/web/src/lib/marking/submissions/queries.ts) — still selects and returns `examiner_summary` from DB; needed to seed the leading paragraph block
- [`pdf-export/student-section.tsx`](apps/web/src/lib/marking/pdf-export/student-section.tsx) — reads `examiner_summary` directly from the DB payload, not from the PM doc; leave untouched
- `GradingRun.examiner_summary` DB field — unchanged; still written by the grader processor and read for seeding
- `questionAnswer` node — unchanged; freely editable now with no filter needed
- `BubbleMenu` in `annotated-answer-sheet.tsx` — annotation actions already call `applyAnnotationMark`, which now returns null early if not in a question answer; no separate guard needed there
