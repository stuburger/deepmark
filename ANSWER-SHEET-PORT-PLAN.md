# Plan: Replace Card View with ProseMirror Answer Sheet

## Context

The grading results panel has two views: card-based and a ProseMirror answer sheet. We want to delete the card view and make the answer sheet the only view. This requires:

1. Porting all card functionality into the sheet (MCQ, scores, feedback, WWW/EBI, overrides)
2. Adding new features (hover word linking, Google Docs-style comment sidebar)
3. Removing the card view and simplifying the component tree

### Key Architectural Decisions (Already Agreed)

- **Marks for annotations** — idiomatic PM pattern. Marks with `annotationId` attrs reference external data. Already implemented.
- **Comment sidebar is external React** — positioned via `view.coordsAtPos()`, not a NodeView or PM node. Reads marks by `annotationId`.
- **Grading data via React context** — scores, feedback, WWW/EBI, overrides come from `GradingDataContext`, not PM attrs. PM doc stays lean (text + marks). Can move to PM doc later for collab with trivial migration.
- **Lossless round-trip** — scan metadata (bbox, pageOrder, token IDs) carried through mark attrs. Already fixed.
- **MCQ annotations are spatial-only** — pass through to scan overlay directly, never enter PM doc.

---

## What Already Exists

| Component | File | Status |
|-----------|------|--------|
| `questionAnswer` node | `components/annotated-answer/question-answer-node.ts` | Done — block node, isolating, Enter→HardBreak, React NodeView |
| `QuestionAnswerView` | `components/annotated-answer/question-answer-view.tsx` | Done — minimal: question header + `<NodeViewContent />` |
| 7 annotation marks | `components/annotated-answer/annotation-marks.ts` | Done — tick, cross, underline, doubleUnderline, box, circle, chain |
| Mark CSS | `components/annotated-answer/annotation-marks.css` | Done — ::before for tick/cross symbols |
| Doc builder | `components/annotated-answer/build-doc.ts` | Done — builds PM JSON from GradingResult[] + TextMark[] |
| Derived annotations | `components/annotated-answer/use-derived-annotations.ts` | Done — walks PM doc, reverse-maps to scan annotations |
| Sheet component | `components/annotated-answer/annotated-answer-sheet.tsx` | Done — editable editor + bubble menu + undo/redo |
| Alignment hook | `lib/marking/alignment/use-question-alignments.ts` | Done — computes marksByQuestion, alignmentByQuestion, tokensByQuestion |
| Reverse alignment | `lib/marking/alignment/reverse.ts` | Done — `charRangeToTokens()` |
| Mark registry | `lib/marking/mark-registry.ts` | Done — signal↔tiptap name mapping |
| MCQ component | `components/mcq-options.tsx` | Done — standalone React, needs PM NodeView wrapper |
| Score override editor | `results/score-override-editor.tsx` | Done — can be reused inside NodeView |
| Feedback override editor | `results/feedback-override-editor.tsx` | Done — can be reused inside NodeView |

---

## Phase 1: GradingDataContext

**New file:** `components/annotated-answer/grading-data-context.tsx`

React context providing grading data to NodeViews without bloating PM attrs:

```ts
type GradingDataContextValue = {
  gradingResults: Map<string, GradingResult>
  answers: Record<string, string>
  overridesByQuestionId: Map<string, TeacherOverride>
  activeQuestionNumber: string | null
  isEditing: boolean
  jobId: string
  onAnswerSaved: (questionId: string, text: string) => void
  onOverrideChange: (questionId: string, input: UpsertTeacherOverrideInput | null) => void
}
```

**Provider wraps the `AnnotatedAnswerSheet`** in `grading-results-panel.tsx`. NodeViews consume via `useContext`.

---

## Phase 2: MCQ Node

**New file:** `components/annotated-answer/mcq-answer-node.ts`

```ts
Node.create({
  name: 'mcqAnswer',
  group: 'block',
  atom: true,        // non-editable, no inline content
  draggable: false,
  isolating: true,
  addAttributes() {
    return {
      questionId: { default: null },
      questionNumber: { default: null },
      questionText: { default: null },
      maxScore: { default: null },
      options: { default: [] },         // McqOption[]
      correctLabels: { default: [] },   // string[]
      studentAnswer: { default: null }, // string
      awardedScore: { default: 0 },
    }
  },
  addNodeView() { return ReactNodeViewRenderer(McqAnswerView) },
})
```

**New file:** `components/annotated-answer/mcq-answer-view.tsx`

React NodeView that renders:
- Question header (same style as `questionAnswer`: Q number, text, score badge, max marks)
- MCQ options grid (reuse rendering logic from `mcq-options.tsx`)
- Score progress bar

Reads override data from `GradingDataContext` for score display.

**Modify:** `build-doc.ts`

Change line that skips deterministic: instead emit `mcqAnswer` node:

```ts
if (r.marking_method === "deterministic") {
  blocks.push({
    type: "mcqAnswer",
    attrs: {
      questionId: r.question_id,
      questionNumber: r.question_number,
      questionText: r.question_text || null,
      maxScore: r.max_score,
      options: r.multiple_choice_options ?? [],
      correctLabels: r.correct_option_labels ?? [],
      studentAnswer: r.student_answer,
      awardedScore: r.awarded_score,
    },
  })
  continue
}
```

**Modify:** `annotated-answer-sheet.tsx` — add `McqAnswerNode` to extensions. Update Document content to `"(questionAnswer | mcqAnswer)+"`.

---

## Phase 3: Enrich questionAnswer NodeView

**Modify:** `components/annotated-answer/question-answer-view.tsx`

Currently renders: question header + `<NodeViewContent />`. Expand to render everything from `GradingResultCard`:

**Above `<NodeViewContent />`:**
- Question number + text (already exists)
- Score badge (top-right) — colour-coded by percentage. Blue if teacher override exists. Shows effective score (override ?? AI score).
- Max marks indicator (already exists)

**Below `<NodeViewContent />`:**
- Margin comment badges — sentiment-coloured pills. Filter annotations for this question's comments from context.
- WWW list — green checkmarks + items. Read from `GradingResult.what_went_well`.
- EBI list — amber arrows + items. Read from `GradingResult.even_better_if`.
- Feedback section — collapsible `<details>`. Shows `feedback_summary` + `llm_reasoning`.
- Level awarded label (LoR only) — from `GradingResult.level_awarded`.
- Score progress bar + percentage.

**All data comes from `GradingDataContext`** — NodeView looks up `questionId` from `node.attrs`, gets `GradingResult` from context map.

**Active question highlight:** Check `activeQuestionNumber` from context, apply `bg-blue-500/20` when active.

**Element ID:** `id={`question-${node.attrs.questionNumber}`}` on the `<NodeViewWrapper>` for scroll-to-question.

---

## Phase 4: Teacher Override Editing in NodeView

**Modify:** `components/annotated-answer/question-answer-view.tsx`

When `isEditing` from context is true:

- **Score override:** Reuse `ScoreOverrideEditor` component directly inside the NodeView header area. It already handles number input, clamping, blur-to-save, reset. Wire to `onOverrideChange` from context.
- **Feedback override:** Reuse `FeedbackOverrideEditor` inside the collapsible feedback section. Same blur-to-save pattern. Wire to `onOverrideChange` from context.

These are existing React components — just render them inside the NodeView's `contentEditable={false}` sections.

---

## Phase 5: Answer Text Editing

The PM editor is already `editable: true`. When the teacher types, PM handles it. What we need:

**Persist on mode change:** When the teacher toggles editing off (or navigates away), extract text from each `questionAnswer` node and call `updateExtractedAnswer` for any that changed.

**Implementation:** Track original answer texts. On editor blur or edit-mode toggle, diff current node text content against originals. For changed questions, call `onAnswerSaved(questionId, newText)` from context.

**"Re-mark to update score" hint:** Show a subtle banner at the bottom of a `questionAnswer` NodeView when the text has been modified from the original.

---

## Phase 6: Scroll-to-Question

**Verify:** Existing `useScrollToQuestion` hook queries `#question-{number}` by ID. The `QuestionAnswerView` already sets `id` on its wrapper. Should work as-is.

**Active highlight:** Already covered in Phase 3 — NodeView reads `activeQuestionNumber` from context and applies blue tint.

**Test:** Click annotation region on scan → results panel scrolls to the correct question in the answer sheet.

---

## Phase 7: Hover Word Linking (NEW)

### Scan → PM (hover scan word, highlight in PM)

1. `BoundingBoxViewer` emits `onTokenHover(tokenId | null)` callback when a token bbox is hovered/unhovered.
2. `AnnotatedAnswerSheet` receives this via prop.
3. Look up `tokenId` in `alignmentByQuestion` → get `{ start, end }` char range for that question.
4. Resolve to PM document position: find the `questionAnswer` node for that question, add the char offset.
5. Apply a transient `Decoration.inline(from, to, { class: "bg-yellow-200/50" })` via a tiptap plugin.
6. Clear on `onTokenHover(null)`.

### PM → Scan (hover PM word, highlight on scan)

1. Tiptap plugin tracks mouse position via `handleDOMEvents.mousemove`.
2. Resolve cursor pos → char offset within `questionAnswer` node.
3. Reverse lookup via `charRangeToTokens(charOffset, charOffset + 1, alignment, tokens)` → get token IDs.
4. Emit `onTokenHighlight(tokenIds | null)` callback to parent.
5. `BoundingBoxViewer` highlights those token bboxes.
6. Clear on mouse leave.

**New files:**
- `components/annotated-answer/hover-highlight-plugin.ts` — tiptap extension with decoration state + mouse handlers
- Props added to `AnnotatedAnswerSheet`: `hoveredTokenId?: string | null`, `onTokenHighlight?: (tokenIds: string[] | null) => void`

---

## Phase 8: Comment Sidebar (NEW)

**New file:** `components/annotated-answer/comment-sidebar.tsx`

External React component rendered **alongside** `<EditorContent />`, not inside PM.

### Layout

```
┌──────────────────────────┬───────────────────┐
│  <EditorContent />       │  Comment Sidebar   │
│  (70%)                   │  (30%)             │
│                          │                    │
│  Q1a ...                 │  ┌─ ✓ correct ──┐ │
│  "The ✓cell membrane"    │  │  osmosis      │ │
│                          │  └──────────────┘ │
│                          │                    │
│  Q1b ...                 │  ┌─ ✗ weak ─────┐ │
│  "Plants need water"     │  │  no detail    │ │
│                          │  │  → needed:    │ │
│                          │  │    turgor     │ │
│                          │  └──────────────┘ │
└──────────────────────────┴───────────────────┘
```

### How it works

1. On every PM transaction, walk the doc to collect all marks with their `from` positions.
2. For each mark, call `editor.view.coordsAtPos(from)` to get pixel Y position.
3. Subtract the editor container's `getBoundingClientRect().top` to get relative offset.
4. Render comment cards at those Y positions in the sidebar.
5. Debounce repositioning on scroll/resize via `ResizeObserver` + scroll listener.

### Each comment card shows

- Annotation type icon (✓, ✗, ─, ═, □, ○, chain colour)
- Sentiment dot (green/red/zinc)
- Reason text (from mark `reason` attr)
- AO badge (if `ao_category` attr present)
- Mark point results (for point-based, from `GradingDataContext`)

### Hover interaction

- Hover comment card → apply `Decoration.inline` highlighting the mark range in PM
- Hover mark in PM → highlight the corresponding comment card (CSS class toggle via state)
- Both use the existing mark `annotationId` as the linking key.

---

## Phase 9: Remove Card View

Once Phases 1-8 are verified:

### Delete files
- `results/grading-result-card.tsx`
- `results/answer-editor.tsx`
- `results/annotated-answer.tsx` (card span renderer)

### Simplify files
- `results/grading-results-panel.tsx` — remove view toggle, card rendering loop, `hasAnnotationsWithAnchors` check. Always render `AnnotatedAnswerSheet`.
- `results/index.tsx` (`MarkingResults`) — remove `view` / `onViewChange` props.
- `results-panel.tsx` — remove `view` / `onViewChange` threading.
- `submission-view.tsx` — remove `resultsView` state and toggle. `effectiveAnnotations` always uses PM-derived + spatial-only.

### Keep files (reused inside NodeViews)
- `score-override-editor.tsx` — used inside `QuestionAnswerView`
- `feedback-override-editor.tsx` — used inside `QuestionAnswerView`
- `mcq-options.tsx` — rendering logic reused in `McqAnswerView`

---

## Key Files to Create

| File | Description |
|------|-------------|
| `components/annotated-answer/grading-data-context.tsx` | React context for NodeView data access |
| `components/annotated-answer/mcq-answer-node.ts` | PM atom node for MCQ questions |
| `components/annotated-answer/mcq-answer-view.tsx` | NodeView rendering MCQ options |
| `components/annotated-answer/hover-highlight-plugin.ts` | Tiptap extension for bidirectional word hover |
| `components/annotated-answer/comment-sidebar.tsx` | External React component for annotation details |

## Key Files to Modify

| File | Change |
|------|--------|
| `components/annotated-answer/question-answer-view.tsx` | Expand: scores, WWW/EBI, feedback, comments, progress bar, overrides, active highlight |
| `components/annotated-answer/build-doc.ts` | Add MCQ block emission |
| `components/annotated-answer/annotated-answer-sheet.tsx` | Add McqAnswerNode extension, GradingDataContext provider, hover props, sidebar layout |
| `results/grading-results-panel.tsx` | Remove view toggle, always render sheet |
| `results/index.tsx` | Remove view/onViewChange props |
| `results-panel.tsx` | Remove view threading |
| `submission-view.tsx` | Remove resultsView state, simplify effectiveAnnotations |

---

## Build Order

| Phase | What | Depends on | Can test independently |
|-------|------|-----------|----------------------|
| 1 | GradingDataContext | — | Yes (renders with existing NodeView) |
| 2 | MCQ node | Phase 1 | Yes (MCQ questions appear in sheet) |
| 3 | Enrich questionAnswer NodeView | Phase 1 | Yes (scores, feedback visible in sheet) |
| 4 | Override editing in NodeView | Phase 1, 3 | Yes (edit mode works in sheet) |
| 5 | Answer text editing persistence | Phase 1 | Yes (edit text, save, re-mark hint) |
| 6 | Scroll-to-question | Phase 3 | Yes (click scan annotation, sheet scrolls) |
| 7 | Hover word linking | Phase 1 | Yes (hover scan word, PM highlights) |
| 8 | Comment sidebar | Phase 1, 3 | Yes (annotation details alongside PM) |
| 9 | Remove card view | Phases 1-8 verified | Final cleanup |

Phases 1-6 are the port. Phases 7-8 are new features. Phase 9 is cleanup. Each phase is independently testable.

---

## Verification

1. `bun typecheck` — passes after each phase
2. `bun check` — Biome passes after each phase
3. `bun test:unit` — existing 76+ tests pass (alignment, build-doc, derived annotations)
4. **MCQ test**: Open submission with MCQ questions → MCQ options render in answer sheet
5. **Score/feedback test**: Scores, WWW/EBI, feedback visible in sheet, match card view data
6. **Override test**: Toggle edit mode → change score → override saves → badge turns blue
7. **Scroll test**: Click annotation on scan → answer sheet scrolls to correct question
8. **Hover test**: Hover word on scan → corresponding PM text highlights (and vice versa)
9. **Comment sidebar test**: Annotation details render alongside marks, positioned at correct Y
10. **Card view removed**: No toggle, no card code, sheet is the only view
