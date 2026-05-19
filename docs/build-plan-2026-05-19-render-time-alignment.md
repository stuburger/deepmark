# Build plan — alignment is render-time only; tear out per-word OcrTokenMark cache

**Date:** 2026-05-19
**Owner:** Stuart
**Status:** Proposed
**Related:**
- Closes the architectural arc started in `docs/build-plan-2026-05-18-annotation-llm-phrase-anchoring.md` (PM positions exact via indexOf)
- Builds on `docs/build-plan-2026-05-18-token-alignment-accuracy.md` (anchor-first aligner)
- Surfaces what the phrase-anchoring rework should have done from the start: alignment is fuzzy + visual, never persisted

## Context

The phrase-anchoring rework eliminated fuzzy alignment from the **annotation write path** (LLM emits phrase → `indexOf` → exact PM positions). What it did *not* do was eliminate the parallel cache layer that bakes alignment into Y-doc state at editor seed:

`packages/backend/src/lib/collab/editor-seed.ts:142-156`:

```ts
const alignment = alignTokensToAnswer(answer.text, answer.tokens)
const tokenSpecs: OcrTokenSpec[] = []
for (const t of answer.tokens) {
  const offset = alignment.tokenMap[t.id]
  if (!offset) continue
  tokenSpecs.push({ id: t.id, bbox: t.bbox, pageOrder: t.page_order, charStart: offset.start, charEnd: offset.end })
}
if (tokenSpecs.length > 0) {
  applyOcrTokenMarks(view, q.questionId, tokenSpecs)
}
```

`applyOcrTokenMarks` adds an `ocrToken` PM mark with `{ tokenId, bbox, pageOrder }` over every word range. Result: each word in the PM doc carries a hidden side-channel of OCR data.

### Why this is the wrong shape

1. **It's a cache, not a source of truth.** The schema comment claims it's "the single source of truth for the text↔scan mapping." The actual source-of-truth data lives in:
   - `answers.student_answer` (DB) — the canonical answer text
   - `student_paper_page_tokens` (DB) — every token with `question_id`, `bbox`, `confidence`, etc.
   The per-word marks are a snapshot of one `alignTokensToAnswer` run, persisted into Y-doc state.

2. **Stale-mark accumulation.** `editor-seed` runs on every editor open. `setAnswerText` is idempotent (no-op if text exists), but `applyOcrTokenMarks` is additive — it never clears existing marks. The Y-doc grows extra `ocrToken` marks per seed, and `resolveTokenAtCursor` returns the FIRST mark it finds (the OLDEST). This explains the symptom Stuart observed on `cmpcna0km00012zw3poayeq4s` Q2: opening apos of `'then I wept'` highlighted line-1 "feels" because an old (pre-refactor) alignment was still authoritative.

3. **Drift across aligner versions.** Every time `alignTokensToAnswer` improves (today's anchor-first pass; tomorrow's paragraph-anchored fix), existing Y-docs preserve OLD alignment artefacts indefinitely.

4. **Mismatch with what the rest of the codebase already does.** `useQuestionAlignments` in `apps/web/src/lib/marking/alignment/use-question-alignments.ts` ALREADY calls `alignTokensToAnswer` at render time and memoises the result. The data path "tokens + answer → tokenMap" is established. We just need cursor/hover to use that path instead of reading PM marks.

### What Stuart actually asked for (verbatim, earlier this session)

> "i wouldnt change the pm schema just yet - at least not until we've confirmed this is a valid approach. **just dont write the marks around each word**."

The instruction was clear; the rework didn't honour it. This plan closes that gap.

## Goal

Eliminate `OcrTokenMark` as a persisted side-channel. Achieve:

- PM doc contains only text + user-visible annotation marks (tick, cross, underline, …). No hidden per-word marks.
- Cursor hover, selection hover, scan-overlay rendering, and DB projection all compute alignment at the consumer via `alignTokensToAnswer(answer, tokens)` — memoised per question per session.
- Existing Y-docs are cleaned of stale `ocrToken` marks at the next seed (one-shot strip).
- The `OcrTokenMark` schema *stays in place* (Stuart's call) so prosemirror nodes that mention it don't crash; it's just never applied or read.

## Non-goals

- Remove `OcrTokenMark` from the schema (defer; will be cleanup once we verify no one reads it).
- Move alignment off of `alignTokensToAnswer` (this is the runtime, anchor-first version already deployed).
- Touch the `student_paper_page_tokens` table or any other DB-resident token storage. Those remain canonical.
- Re-run grading or re-OCR for any submission. The change is rendering-layer only.

## The change — six steps

### 1. Add a centralised "where is the cursor / range pointing in token-space" helper

`packages/shared/src/editor/alignment/cursor-resolution.ts` (new file):

```ts
import type { TokenAlignment } from "./types"

/** The single token whose alignment range contains `charPos`, or null. */
export function tokenIdAtChar(
  charPos: number,
  alignment: TokenAlignment,
): string | null { … }

/** Every tokenId whose alignment range overlaps [charFrom, charTo). */
export function tokenIdsInRange(
  charFrom: number,
  charTo: number,
  alignment: TokenAlignment,
): string[] { … }
```

Unit-tested directly with constructed `TokenAlignment` inputs. ~30 LOC. No new dependencies.

### 2. Switch `useTokenHighlight` to runtime alignment

Today (`apps/web/src/components/annotated-answer/use-token-highlight.ts`):
- `resolveTokenAtCursor` reads `ocrToken` mark at cursor position
- `resolveTokensForRange` walks `nodesBetween(from, to)` collecting `ocrToken` mark token IDs
- `resolveTokensForAnnotation` walks the whole doc looking for ocrToken marks under nodes with a given annotationId

After:
- Inputs change: hook needs the per-question `TokenAlignment` from `useQuestionAlignments` (passed as a prop or read from a context the marking view already constructs)
- `resolveTokenAtCursor(editor, pos, alignment)` → `tokenIdAtChar(charOffsetInAnswer, alignment)`
- `resolveTokensForRange(editor, from, to, alignment)` → `tokenIdsInRange(charFromInAnswer, charToInAnswer, alignment)`
- `resolveTokensForAnnotation(editor, annotationId, alignment)` → walk annotation marks to find the char range with that annotationId, then `tokenIdsInRange(charRange, alignment)`

The trickiest part is converting PM positions to "char offset into the answer" — the PM doc has block wrappers, but the answer block's text content has its own indexing. There's likely already a helper for this (the existing `resolveTokensForRange` uses `nodesBetween` so it gets text positions cheaply). One small helper: `pmPosToAnswerChar(state, pos)` walks the question block and returns the char offset relative to that block's text content.

### 3. Switch `deriveAnnotationsFromDoc` projection to runtime alignment

Today (`packages/shared/src/editor/derive-annotations.ts:118-140`):
- For each annotation mark, checks `attrs.scanBbox != null`. If yes → use cached attrs; if no → walk co-located `ocrToken` marks under the annotation's char range and compute bbox hull.

After:
- Function signature gains required `answer: string` and `tokens: PageToken[]` args.
- Inside, build the alignment once: `const alignment = alignTokensToAnswer(answer, tokens)`.
- For each annotation, derive bbox from the alignment + the annotation's char range via `tokenIdsInRange` → look up bboxes of those tokenIds from the `tokens` array → compute hull.
- The "use cached `scanBbox`" branch is still available for AI marks that have it populated (per Stuart's "keep schema, populate scan attrs for now" instruction). It's an optimisation/compat path; the runtime path is the canonical one.

Callers update:
- `apps/web/src/components/annotated-answer/use-derived-annotations.ts` — passes `answer + tokens` through.
- Projection lambda (locate exact path during implementation) — already loads tokens per submission; just plumb them into the call.

### 4. Stop applying `OcrTokenMark` at editor seed; strip existing ones

`packages/backend/src/lib/collab/editor-seed.ts`:

```diff
- if (answer.tokens.length === 0) continue
- const alignment = alignTokensToAnswer(answer.text, answer.tokens)
- const tokenSpecs: OcrTokenSpec[] = []
- for (const t of answer.tokens) {
-   const offset = alignment.tokenMap[t.id]
-   if (!offset) continue
-   tokenSpecs.push({
-     id: t.id,
-     bbox: t.bbox,
-     pageOrder: t.page_order,
-     charStart: offset.start,
-     charEnd: offset.end,
-   })
- }
- if (tokenSpecs.length > 0) {
-   applyOcrTokenMarks(view, q.questionId, tokenSpecs)
- }
+ // One-shot strip of any legacy ocrToken marks left in the Y-doc from a
+ // prior seed (pre-render-time-alignment migration). Idempotent — runs
+ // every seed; no-op once the doc is clean.
+ clearOcrTokenMarks(view, q.questionId)
```

Add `clearOcrTokenMarks` to `packages/shared/src/editor/editor-ops.ts`:

```ts
export function clearOcrTokenMarks(view: EditorView, questionId: string): void {
  const { state, dispatch } = view
  const block = findQuestionBlock(state.doc, questionId)
  if (!block) return
  const markType = state.schema.marks.ocrToken
  if (!markType) return
  const tr = state.tr
  let removed = false
  block.node.descendants((node, pos) => {
    if (!node.isText) return
    if (!node.marks.some((m) => m.type === markType)) return
    const from = block.start + pos
    const to = from + node.nodeSize
    tr.removeMark(from, to, markType)
    removed = true
  })
  if (removed) dispatch(tr)
}
```

`applyOcrTokenMarks` itself can stay defined but becomes dead code (no callers). Leave for one cycle, delete in the schema-cleanup follow-up.

### 5. Refresh consumers' tests

- `apps/web/src/components/annotated-answer/__tests__/use-derived-annotations.test.ts` — fixtures pass `answer + tokens` instead of relying on inline ocrToken marks.
- `packages/backend/tests/unit/editor-ops.test.ts` — add a test for `clearOcrTokenMarks`; remove (or skip) tests asserting `applyOcrTokenMarks` adds marks if we keep that function around.
- `packages/backend/tests/unit/fragment-roundtrip.test.ts` — same: pass new args.
- `apps/web/src/components/annotated-answer/__tests__/build-doc.test.ts` — if it asserts the presence of ocrToken marks, update assertions.

### 6. Schema retained, but unused

Per Stuart's instruction, `OcrTokenMark` itself stays defined in `packages/shared/src/editor/ocr-token-mark.ts` and registered in `extensions.ts`. No mark of type `ocrToken` is ever created or read after this change lands. The schema entry becomes inert — kept for one cycle so existing Y-doc state doesn't reject the schema when loading.

Once the prod environment is verified, the schema entry + the mark file + `applyOcrTokenMarks` + `OcrTokenSpec` type can all be deleted. That's a follow-up PR.

## Files to touch

| File | Change |
|---|---|
| `packages/shared/src/editor/alignment/cursor-resolution.ts` | **NEW** — `tokenIdAtChar`, `tokenIdsInRange` + unit tests |
| `packages/shared/src/editor/editor-ops.ts` | Add `clearOcrTokenMarks` |
| `packages/backend/src/lib/collab/editor-seed.ts` | Drop the `applyOcrTokenMarks` call; replace with `clearOcrTokenMarks` |
| `packages/shared/src/editor/derive-annotations.ts` | Add `answer` + `tokens` args; compute bbox from runtime alignment instead of from co-located ocrToken marks |
| `apps/web/src/components/annotated-answer/use-token-highlight.ts` | Take `alignment` prop; switch resolvers to `tokenIdAtChar` / `tokenIdsInRange` |
| `apps/web/src/components/annotated-answer/use-derived-annotations.ts` | Pass `answer + tokens` to `deriveAnnotationsFromDoc` |
| Marking view (caller of `useTokenHighlight`) | Wire `alignment` from `useQuestionAlignments` through to the hook |
| Projection lambda — `packages/backend/src/processors/` (locate at implementation time) | Pass tokens per question into `deriveAnnotationsFromDoc` |
| `packages/backend/tests/unit/editor-ops.test.ts` | Test `clearOcrTokenMarks`; update fragment-roundtrip if it pinned on ocrToken marks |
| `apps/web/src/components/annotated-answer/__tests__/use-derived-annotations.test.ts` | Reshape fixtures; assert runtime-alignment-derived bbox |

**Files explicitly NOT touched:**
- `packages/shared/src/editor/ocr-token-mark.ts` — schema stays
- `packages/shared/src/editor/extensions.ts` — schema registration stays
- `packages/shared/src/editor/alignment/align.ts` — runtime aligner unchanged
- `packages/shared/src/editor/annotation-marks.ts` — annotation mark schema unchanged
- `student_paper_page_tokens` table — canonical token storage unchanged

## Acceptance criteria

1. **Fresh editor session on a submission produces a PM doc with no `ocrToken` marks.** Inspect via DOM: zero `<span data-token-id=…>` elements.
2. **Cursor hover on any word in any question lights up the correct token bbox on the scan.** Same behaviour the user sees today, just computed at render. Spot-check Jaufferdeen Q2 'then I wept' — opening apos should highlight line-2 of the scan, not line-1's "feels".
3. **Selection over a range of text lights up all token bboxes in that range.** Same.
4. **Annotation hover highlights the bboxes the LLM annotated.** Routes through `useDerivedAnnotations` → runtime-aligned `bbox`. Should match the annotation's intended text.
5. **`student_paper_annotations.bbox` populated correctly by the projection.** Re-grade a submission; verify the DB rows have non-null, sensible bboxes.
6. **Existing submissions cleared of stale marks.** Open the marking view for `cmpcna0km00012zw3poayeq4s`; verify the symptom Stuart reported (line-2 apos → line-1 "feels" highlight) is gone after the first seed runs the strip.
7. **`bun typecheck` clean; backend + shared unit suites green; annotation evals 15/16 (same baseline).**

## Risks

- **Y-doc schema-load incompatibility.** Removing the `OcrTokenMark` schema entry while existing Y-docs still contain ocrToken marks could break doc loading. Mitigation: keep the schema entry registered (this plan does); only the *application* of marks goes away. Once docs are clean (post step 4), the schema can be safely removed in a follow-up.
- **Tests pinning on ocrToken marks in PM fixtures.** Some `__tests__` build PM docs with ocrToken marks and assert structural invariants on them. They'll fail. Mitigation: reshape fixtures to use new `deriveAnnotationsFromDoc` signature with `answer + tokens`; assertions become "expected bbox derived from runtime alignment matches X."
- **Projection lambda needs to load tokens.** Today the projection has the PM doc; it would need to also load `student_paper_page_tokens` filtered by submission/question. Adds one DB hit per projected question. Acceptable — the projection lambda is per-submission and already loads per-question state.
- **Race: editor seed runs while a user is hovering.** Stripping ocrToken marks mid-hover could momentarily produce a null hover state. Mitigation: the strip transaction is atomic; the next transaction (the user's input) will re-resolve. UX cost is negligible.
- **Stale annotation `scanBbox` attrs on existing PM marks.** Annotation marks created BEFORE the rework have `scanBbox` populated. The `deriveAnnotationsFromDoc` "cached attrs" branch still uses them. That's fine — they don't need to match the new alignment exactly because they're cached snapshots of when the annotation was inserted. Acceptable per Stuart's "keep schema, accept some divergence" stance.

## Out of scope

- Removing `OcrTokenMark` schema entry (defer to a cleanup PR after this lands and bakes).
- Removing `applyOcrTokenMarks` and `OcrTokenSpec` type (same — they'll be dead code once step 4 ships, but leaving them for one cycle lets us roll back without schema thrash).
- Reworking the `student_paper_annotations.bbox` column (Option C territory — separate plan).
- Removing the `scanBbox` / `scanPageOrder` / `scanTokenStartId` / `scanTokenEndId` attrs from the annotation mark schema (Stuart's explicit hold).

## Sequencing — recommended order of commits

1. **Add cursor-resolution helpers + tests.** Pure addition, zero behavioural impact. Safe to land alone.
2. **Add `clearOcrTokenMarks` + unit test.** Same — pure addition.
3. **Switch `deriveAnnotationsFromDoc` to take `answer + tokens`.** Behavioural change but the cached-attrs path still works, so existing AI marks render correctly. Verify the projection lambda still functions end-to-end.
4. **Switch `useTokenHighlight` to runtime alignment.** Word hover now reads `tokenMap` instead of marks. Spot-check in the UI.
5. **Drop `applyOcrTokenMarks` call from `editor-seed`; replace with `clearOcrTokenMarks`.** This is the moment per-word marks STOP being written. After this, fresh seeds produce clean docs.
6. **Verify acceptance criteria + commit.**

If any step breaks something, the previous step's behaviour is recoverable — incremental rollback works because the OcrTokenMark mechanism stays in place until step 5.

## Estimated effort

| Step | Effort |
|---|---|
| 1. cursor-resolution.ts + tests | 30 min |
| 2. clearOcrTokenMarks + test | 15 min |
| 3. deriveAnnotationsFromDoc signature change | 60 min (includes finding + plumbing the projection lambda) |
| 4. useTokenHighlight switch | 30 min |
| 5. editor-seed: drop apply, add clear | 10 min |
| 6. Tests cleanup + acceptance | 45 min |

**Total: ~3 hours focused work**, no LLM cost.

## Why now

- The phrase-anchoring rework is half the story. PM positions are exact, but the cache layer that was supposed to disappear is still there.
- The stale-mark symptom on `cmpcna0km00012zw3poayeq4s` Q2 is a concrete user-visible bug that this plan eliminates by construction.
- Pre-launch — no real users — there's never a cheaper time to tear out a persisted side-channel.
- Every future improvement to `alignTokensToAnswer` (paragraph anchoring, confidence weighting, future tweaks) automatically takes effect for every consumer the moment it ships. No Y-doc invalidation dance.

---

| When | What | Why |
|---|---|---|
| this turn | Build plan written to `docs/build-plan-2026-05-19-render-time-alignment.md` | Stuart asked for a plan. Self-contained; ready to execute. |
| Pre-existing (`apps/web/src/lib/marking/alignment/use-question-alignments.ts`) | Already memoises `alignTokensToAnswer` per question | The render-time alignment hook already exists. We're just routing consumers through it instead of through cached PM marks. |
| Pre-existing (`packages/shared/src/editor/alignment/align.ts`) | Anchor-first aligner with LIS-filtered monotonicity | Same aligner runs at the consumer — the alignment quality the rework already shipped is what feeds all the consumers. |
| **Open — next** | Stuart's call when to execute. ~3 hours of focused work across 6 small commits. | Each commit is rollback-safe; the cache mechanism stays in place until the final step removes it. |
