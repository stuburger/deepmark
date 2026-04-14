# Answer Sheet Session Summary (2026-04-13)

## Overview

Replaced the card-based grading results view with a Google Docs-style ProseMirror answer sheet. This was a full 9-phase build plus extensive iterative refinement based on live testing.

---

## What Was Built

### Phase 1-9: Card View → PM Answer Sheet

**New components:**
- `grading-data-context.tsx` — React context providing grading data (scores, overrides, feedback) to PM NodeViews
- `mcq-answer-node.ts` + `mcq-answer-view.tsx` — PM atom node for MCQ questions
- `hover-highlight-plugin.ts` — Tiptap extension for cursor-driven sidebar activation + decoration highlights
- `comment-sidebar.tsx` — External React sidebar showing annotation details, editable reason/sentiment, delete marks
- `annotation-toolbar.tsx` — Sticky floating toolbar at top of A4 page
- `annotation-shortcuts.ts` — Keyboard shortcuts (bare 1-7 keys when text selected)
- `mark-actions.ts` — Single source of truth for mark action config
- `apply-annotation-mark.ts` — Word-level mark snapping + annotationId generation
- `read-only-text.ts` — Transaction filter blocking text changes, allowing mark changes

**Deleted:**
- `grading-result-card.tsx`, `answer-editor.tsx`, `annotated-answer.tsx` (card view)

**Moved:**
- `score-override-editor.tsx` and `feedback-override-editor.tsx` from `app/` route to `@/components/` (layering fix)

### Architecture Refactors

1. **GradingDataProvider ownership** — moved from inside AnnotatedAnswerSheet to the parent (GradingResultsPanel). Sheet went from 16 props to 6. Clean separation: sheet = PM editor concern, grading data = context from parent.

2. **HoverHighlightPlugin uses mutable refs** — plugin reads from refs instead of closed-over options, so alignment/token data updates without recreating the editor.

3. **No inline `import()` types** — fixed all instances across the codebase, added CLAUDE.md clause to prevent future occurrences.

### Google Docs-Style Layout

- Scan panel: 30% (down from 55%) — reference view
- Results panel: 70% — grey canvas (`bg-zinc-100`)
- A4 page: white, shadow, `max-w-[210mm]`, generous padding (`px-12 py-10`), centered
- Comment sidebar: right margin outside the page, `w-52`, visible on xl screens
- Score summary: compact inline bar (badge + progress + percentage) instead of card

### Annotation Editing UX

- **Three paths to annotate**: keyboard (1-7), floating toolbar, bubble menu
- **Word-level snapping**: selections extend to word boundaries before mark application
- **Auto-generated annotationId**: every teacher mark gets a UUID for sidebar tracking
- **Auto-focus comment**: applying a mark activates the sidebar card and focuses the reason textarea
- **Immutable text**: `ReadOnlyText` plugin blocks `ReplaceStep`/`ReplaceAroundStep`, allows `AddMarkStep`/`RemoveMarkStep`
- **Sidebar card editing**: click to expand, edit reason (textarea), change sentiment (pills), delete mark
- **Cursor-driven activation**: moving cursor into a mark range activates its sidebar card (not hover)

### Comment Sidebar Details

- Cards positioned via `coordsAtPos()` with stable layout (no reflow on active change)
- Active card expands in-place, neighbours shift down via CSS `transform: translateY()` (GPU-composited, smooth animation)
- Click to activate (not hover) — prevents jumpiness
- Mark fragment deduplication: coalesces split PM text nodes into single cards
- Cards show: mark icon, sentiment dot, AO badge, reason text, comment, chain phrase
- Expanded state: sentiment pills, reason textarea (4 rows), delete button

### Selection → Scan Highlight

- Text selection in the editor highlights corresponding handwritten words on the scan
- Per-word bounding boxes (not a hull) — individual token rects in blue
- Active annotation card also highlights its words on the scan
- Selection takes precedence over card highlight
- Removed scan→PM hover (was too distracting) — highlight is now one-directional (editor → scan)

### NodeView Changes

- **questionAnswer**: scores via ScoreOverrideEditor, WWW/EBI/feedback as toggle badges (not inline), no progress bar, no level awarded
- **mcqAnswer**: MCQ options grid with score badge, rendered as PM atom node
- Tick/cross symbols trail the decoration (`::after` instead of `::before`)

---

## Backend: Token-to-Answer Alignment Pipeline

### Problem

The frontend Levenshtein alignment was fragile — noisy OCR tokens (duplicates, misattributed words from neighbouring answers) caused alignment failures, especially for longer answers. The old reconciliation step only corrected individual token text, it didn't map tokens to answer words.

### Solution: Two-Step Pipeline (was three)

**Before (3 steps):**
1. Reconciliation: image + raw tokens → `text_corrected` (per-page LLM call)
2. Attribution: image + corrected tokens + questions → `question_id` + answer regions
3. Frontend Levenshtein alignment (fragile, no backend persistence)

**After (2 steps):**
1. **Attribution** (unchanged): image + raw tokens + questions + answers → `question_id` + answer regions
2. **Token Correction + Answer Mapping** (new, merged): image + attributed tokens + answer text → `text_corrected` + `answer_char_start`/`answer_char_end`

### Schema Change

Added to `StudentPaperPageToken`:
```prisma
answer_char_start Int?  // Character offset (start) in student_answer
answer_char_end   Int?  // Character offset (end, exclusive) in student_answer
```

### Implementation

- `packages/backend/src/lib/scan-extraction/align-tokens-to-answer.ts` — new module
- `USE_LLM_MAPPING = false` const — hardcoded toggle between LLM and Levenshtein
- **LLM path**: sends page image + OCR tokens (showing raw + corrected text) + answer words to LLM, gets back per-token mapping + corrections
- **Levenshtein path**: two-pass algorithm (fuzzy match + positional fill), LOOK_AHEAD=8, no confidence gate
- Both paths write `answer_char_start`/`answer_char_end` + `text_corrected` to DB
- New LLM call site: `token-answer-mapping` registered in `LLM_CALL_SITE_DEFAULTS` + admin UI
- Removed `vision-token-reconciliation` call site (no longer in pipeline)

### Frontend

- `useQuestionAlignments` reads pre-computed offsets via `alignmentFromPrecomputed()`
- Falls back to client-side Levenshtein for old submissions without stored offsets
- Frontend alignment also improved: LOOK_AHEAD=8, no confidence gate, positional fill for unmatched tokens

---

## CLAUDE.md Updates

- Added clause: **No inline `import()` types** — always use top-level `import type`

---

## Key Design Decisions

1. **student_answer is the doc text source, not tokens** — token text has duplicates, OCR artifacts, and ordering issues. The Gemini-transcribed student_answer is cleaner. Tokens map TO it, they don't replace it.

2. **Store mappings in DB, filter at render time** — no data thrown away. The spatial outlier filter only affects answer region hulls, not token data.

3. **Reconciliation merged into mapping** — the mapping call already sees the image and outputs text_corrected. Separate reconciliation was redundant. One fewer LLM call per page.

4. **Editor text is immutable** — teachers annotate but don't edit the answer. Marks are mutable, text is not. This simplifies the data model and eliminates the answer persistence code.

---

## Files Changed (Summary)

### New Files (11)
- `components/annotated-answer/grading-data-context.tsx`
- `components/annotated-answer/mcq-answer-node.ts`
- `components/annotated-answer/mcq-answer-view.tsx`
- `components/annotated-answer/hover-highlight-plugin.ts`
- `components/annotated-answer/comment-sidebar.tsx`
- `components/annotated-answer/annotation-toolbar.tsx`
- `components/annotated-answer/annotation-shortcuts.ts`
- `components/annotated-answer/mark-actions.ts`
- `components/annotated-answer/apply-annotation-mark.ts`
- `components/annotated-answer/read-only-text.ts`
- `packages/backend/src/lib/scan-extraction/align-tokens-to-answer.ts`

### Deleted Files (3)
- `results/grading-result-card.tsx`
- `results/answer-editor.tsx`
- `results/annotated-answer.tsx`

### Moved Files (2)
- `score-override-editor.tsx` → `@/components/`
- `feedback-override-editor.tsx` → `@/components/`

### Modified (major changes)
- `annotated-answer-sheet.tsx` — A4 layout, toolbar, sidebar, selection→scan highlight
- `question-answer-view.tsx` — enriched NodeView with overrides, WWW/EBI badges
- `comment-sidebar.tsx` — full rewrite with editing, layout, animation
- `build-doc.ts` — MCQ node emission
- `grading-results-panel.tsx` — owns GradingDataProvider, builds PM doc
- `submission-view.tsx` — panel proportions, hover state cleanup
- `BoundingBoxViewer.tsx` — blue highlight rects, removed hover interaction layer
- `align.ts` — improved frontend fallback alignment
- `use-question-alignments.ts` — pre-computed offset support
- `packages/db/prisma/schema.prisma` — new token columns
- `packages/shared/src/llm/types.ts` — new call site, removed reconciliation
- `packages/backend/src/processors/student-paper-extract.ts` — 2-step pipeline

---

## To Deploy

1. `bun db:push` — adds `answer_char_start`/`answer_char_end` columns
2. Deploy backend — new pipeline runs on next scan
3. Old submissions use frontend Levenshtein fallback automatically
4. To enable LLM mapping: flip `USE_LLM_MAPPING = true` in `align-tokens-to-answer.ts`
