# Annotation System — Phase 6 Implementation Notes

> Written 2026-04-12. Context handoff for continuing this work in a new conversation.

## What Was Built

### Single State, Two Renderers

The PM (ProseMirror/tiptap) document is the single source of truth for annotations. Both the `EditorContent` (text editor) and `BoundingBoxViewer` (scan overlay) derive their rendering from it.

```
DB annotations → buildAnnotatedDoc → PM Document (the single state)
                                          ↓
                            ┌─────────────┴──────────────┐
                            ↓                            ↓
                     EditorContent              useDerivedAnnotations
                    (tiptap renders)                     ↓
                                            effectiveAnnotations[]
                                                        ↓
                                               BoundingBoxViewer
                                              (scan overlay)
```

When a teacher applies a mark in the PM editor (via bubble menu), it appears on the scanned script in real time. When they switch back to card view, the scan reverts to DB annotations.

### Key Files Created/Modified

#### New: `apps/web/src/lib/marking/alignment/`
Split from the monolithic `token-alignment.ts` into single-responsibility modules:
- `types.ts` — `TokenAlignment`, `TextMark`, `TextSegment`, `AnnotationSignal`, `ResolvedTokenSpan`, `WordWithOffset`
- `string-utils.ts` — `levenshtein`, `normalizedDistance`, `splitWithOffsets`
- `align.ts` — `alignTokensToAnswer` (forward: OCR tokens → char positions in student_answer)
- `reverse.ts` — `charRangeToTokens` (reverse: char range → OCR tokens with bboxes)
- `marks.ts` — `deriveTextMarks` (annotations → PM-style TextMark[])
- `segments.ts` — `splitIntoSegments` (interval-splitting for span rendering)
- `use-question-alignments.ts` — shared React hook computing alignment data per question
- `index.ts` — barrel re-export

`token-alignment.ts` is now a barrel re-export of `alignment/` — all existing import paths work unchanged.

#### New: `apps/web/src/lib/marking/mark-registry.ts`
Single source of truth for all 8 annotation mark types. Each entry defines:
- `signal` — domain name (e.g. `"tick"`, `"ao_tag"`)
- `tiptapName` — PM mark extension name (e.g. `"annotationUnderline"`, `"aoTag"`)
- `overlayType` — `"mark" | "tag" | "chain"`
- `buildPayload` — constructs typed payload from tiptap attrs

Derived lookup tables:
- `TIPTAP_TO_ENTRY` — Map for reading PM doc marks
- `SIGNAL_TO_TIPTAP` — Record for building PM doc from TextMarks
- `MARK_SIGNALS` — Set of the 6 physical mark signal names
- `resolveSignal()` — overlay_type + payload → domain signal name

#### New: `packages/shared/src/annotation/types.ts` additions
- `MARK_SIGNAL_NAMES` — const array `["tick", "cross", "underline", "double_underline", "box", "circle"]`
- `MarkSignal` — type derived from the array

All Zod schemas and TypeScript unions derive from this array. Adding a new mark signal = one string addition here.

#### Modified: `apps/web/src/components/annotated-answer/use-derived-annotations.ts`
Replaced `use-mark-sync.ts` (deleted). Contains:
- `deriveAnnotationsFromDoc(doc, alignmentByQuestion, tokensByQuestion)` — pure function, walks PM doc, reverse-maps marks to OCR tokens via `charRangeToTokens()`, returns `StudentPaperAnnotation[]`
- `useDerivedAnnotations(editor, alignmentByQuestion, tokensByQuestion, onChange)` — React hook that calls derivation on every PM transaction, fires `onChange` synchronously (no render-behind)

#### Modified: `apps/web/src/lib/marking/types.ts`
`StudentPaperAnnotation` is now a **discriminated union** on `overlay_type`:
```ts
type StudentPaperAnnotation =
  | (AnnotationBase & { overlay_type: "mark"; payload: MarkPayload })
  | (AnnotationBase & { overlay_type: "tag"; payload: TagPayload })
  | (AnnotationBase & { overlay_type: "comment"; payload: CommentPayload })
  | (AnnotationBase & { overlay_type: "chain"; payload: ChainPayload })
```
Checking `a.overlay_type === "mark"` narrows `a.payload` to `MarkPayload` automatically. Removed ~10 `as` casts from production code.

#### Modified: `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx`
- Receives pre-computed `marksByQuestion`, `alignmentByQuestion`, `tokensByQuestion` as props (from `useQuestionAlignments` hook called in parent)
- Wires `useDerivedAnnotations` hook with `onDerivedAnnotations` callback
- Bubble menu with 7 mark actions (tick, cross, underline, box, circle, chain, AO tag)

#### Modified: `submission-view.tsx`
- Owns `resultsView` state (`"cards" | "sheet"`) and `sheetAnnotations` state
- Computes `effectiveAnnotations`: sheet view → PM-derived, card view → DB
- `handleViewChange` clears stale `sheetAnnotations` when leaving sheet view
- Passes `effectiveAnnotations` to scan overlay components

#### Modified: Component hierarchy threading
`view`/`onViewChange`/`onDerivedAnnotations` props threaded through:
`submission-view.tsx` → `results-panel.tsx` → `results/index.tsx` → `grading-results-panel.tsx`

#### Modified: Overlay components
`MarkOverlay`, `TagOverlay`, `ChainOverlay` now use `Extract<StudentPaperAnnotation, { overlay_type: "..." }>` prop types. Filter predicates use type guards for narrowing.

### What's NOT Built Yet

1. **Persistence (Phase 8)** — Teacher marks exist only in PM state. Switching away from sheet view loses them. Need: `source: "ai" | "teacher"` field, save button, server action to diff + persist.

2. **(Resolved, April 2026)** The FK is now `grading_run_id` (the enrichment_runs row was removed when annotation was folded into the grade Lambda), and the AI-vs-teacher distinction lives on the `source` column.

3. **Real data tests** — All test fixtures are synthetic. Should pull a real submission from Neon and build fixtures from it.

4. **Hover word sync** — Hovering a word on the scan should highlight it in the text editor. Architecture supports it (tokens are the bridge) but not wired yet.

### Architecture Decisions

- **Derive, don't sync**: PM doc is the state. Scan overlay derives from it via transaction listener. No bidirectional syncing.
- **Single mark registry**: One entry per mark type. Three mapping tables derived from it. Eliminates drift risk.
- **Discriminated union**: `overlay_type` discriminates `payload` type. TypeScript narrows automatically at filter/branch points.
- **Shared alignment hook**: `useQuestionAlignments` called once in `GradingResultsPanel`, passed down to both card and sheet views.
- **Barrel re-export**: `token-alignment.ts` re-exports from `alignment/` — zero blast radius on the split.

### Commit History (this session)

1. `0561a80` — feat: derive scan annotations from PM doc state, single mark registry, discriminated union
2. `781fcd0` — refactor: centralise mark signal vocabulary as MARK_SIGNAL_NAMES const
3. `2f2ae83` — refactor: split token-alignment.ts into alignment/ sub-domain folder
4. `93338d8` — refactor: extract useQuestionAlignments hook, deduplicate alignment computation

### Test Coverage

109 tests passing across:
- `apps/web/src/lib/marking/__tests__/token-alignment.test.ts` — 62 tests (alignment, marks, segments, reverse)
- `apps/web/src/components/annotated-answer/__tests__/build-doc.test.ts` — 9 tests (PM doc builder)
- `apps/web/src/components/annotated-answer/__tests__/use-derived-annotations.test.ts` — 14 tests (13 mock + 1 real tiptap schema integration)
- Plus shared/backend unit tests

### Plan File

Full Phase 6 plan with data flow diagrams: `~/.claude/plans/piped-swinging-crab.md`
