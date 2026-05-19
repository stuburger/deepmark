# Build plan — annotation LLM emits phrase / char range (drop fuzzy from PM insertion)

**Date:** 2026-05-18
**Owner:** Stuart
**Status:** Proposed
**Related:**
- Supersedes urgency of `docs/build-plan-2026-05-18-token-alignment-accuracy.md` (paragraph anchoring becomes follow-up polish, not a critical fix)
- Builds on `7bc53cc` (annotation prompt anchors on labelled clean-text tokens)
- Builds on today's `#2` (raw + corrected forms race in `alignTokensToAnswer`'s inner loop)

## Context

### What the pipeline does today

1. **Extract LLM** authors `student_answer` per question (polished prose with corrections, paragraph breaks, punctuation). Saved to `answers.student_answer`.
2. **Editor seed** (`packages/backend/src/lib/collab/editor-seed.ts`) calls `alignTokensToAnswer(answer, tokens)` once per question and bakes per-word `ocrToken` marks into the PM doc carrying `{ tokenId, bbox, pageOrder }`. **This is the only fuzzy step.** After seeding, every consumer reads exact ocrToken marks from the PM doc.
3. **Annotation LLM** (called per question, after grading) emits annotations anchored by `anchor_token_start_id` / `anchor_token_end_id` against labelled clean text.
4. **`dispatchAnnotationsForQuestion`** (`packages/backend/src/processors/student-paper-grade/annotations-to-editor.ts`) calls `alignTokensToAnswer` AGAIN to build a tokenId→char map, then uses the LLM's token IDs to look up `from`/`to` positions for the PM mark. Populates `scanBbox` / `scanPageOrder` / `scanTokenStartId` / `scanTokenEndId` attrs on the annotation mark.
5. **`deriveAnnotationsFromDoc`** projects PM marks back to `student_paper_annotations` rows. Reads `scanBbox` from the annotation mark if populated; **falls back to bbox-hull of co-located ocrToken marks otherwise** (`derive-annotations.ts:118-140`).
6. **Hover/render consumers** (scan overlay, word hover, PDF export) read ocrToken marks from the PM doc directly.

### The structural problem

`dispatchAnnotationsForQuestion` does **fuzzy alignment on the write path** to translate the LLM's token-ID anchors into PM char positions. If alignment drifts:
- The PM mark lands on the wrong words → the source-of-truth doc is wrong.
- The teacher sees underlines / circles / ticks on the wrong text.
- `deriveAnnotationsFromDoc` reads the wrong `from`/`to` → wrong `student_paper_annotations` rows.

The annotation LLM is already reading clean text (per `7bc53cc`). The token-ID indirection exists only to give the LLM a way to "point at" things. We can replace that mechanism with one that **doesn't require a fuzzy lookup at insert time**.

### Key discovery from this session

Two pieces of architecture make the rework cheap:

1. **`OcrTokenMark` already attaches `{ tokenId, bbox, pageOrder }` to every word in the PM doc.** Schema comment is explicit: "Every word that was aligned to a Cloud Vision token carries this mark… This makes the PM document the single source of truth for the text↔scan mapping — no side-channel lookup table needed." (`packages/shared/src/editor/ocr-token-mark.ts:3-9`)

2. **`deriveAnnotationsFromDoc` already falls back to ocrToken-hull when an annotation mark's `scanBbox` is null** (`packages/shared/src/editor/derive-annotations.ts:118-140`). The `else` branch walks the ocrToken marks under the annotation's char range and computes the bounding-box hull. **This is the exact path the rework needs — already implemented.**

Net: we just stop populating the cached attrs at write time. The fallback path takes over. No new code in the read path.

## Goal

Eliminate the fuzzy step from the write path so that:
- PM mark positions are **exact** (provable via `answer_text.slice(from, to) === phrase`).
- Annotation correctness in the source-of-truth doc is decoupled from alignment quality.
- Alignment errors become a purely visual concern (scan overlay bbox accuracy), governed by CLAUDE.md's "fuzzy matching — bounded use only" allowance for visual aids.

## Non-goals

- Removing the `OcrTokenMark` system or changing how the editor seeds. The seed-time alignment stays — that's what every visual layer reads.
- Removing the `scanBbox` / `scanPageOrder` / `scanTokenStartId` / `scanTokenEndId` attrs from the annotation mark schema. They stay (Stuart's call) and just go null for AI marks. The teacher-applied flow can still populate them.
- Migrating existing student submissions. Pre-launch — re-grading reseeds annotations cleanly.

## The change

### 1. Annotation LLM schema change

Replace token-ID anchors with a phrase + char-range pair.

**Today** (somewhere in the annotation LLM Zod schema):

```ts
const AnnotationSchema = z.object({
  // ...
  anchor_token_start_id: z.string(),
  anchor_token_end_id: z.string(),
  // ...
})
```

**Proposed:**

```ts
const AnnotationSchema = z.object({
  // ...
  /**
   * The exact substring from student_answer that this annotation covers.
   * Must match `student_answer.slice(char_start, char_end)` exactly. The
   * phrase is both the human-readable anchor AND a verification check.
   */
  phrase: z.string().min(1),
  /** 0-indexed char offset into student_answer where `phrase` begins. */
  char_start: z.number().int().min(0),
  /** Exclusive char offset where `phrase` ends. */
  char_end: z.number().int().min(1),
  // ...
})
```

### 2. Annotation LLM prompt change

Currently the prompt presents the answer with labelled token IDs and asks the LLM to anchor on them. The new prompt:

- Presents the answer as plain clean text (no token labels needed).
- Asks the LLM to emit `phrase` (the exact substring it wants to annotate) plus `char_start` / `char_end`.
- Documents that the phrase must equal `student_answer.slice(char_start, char_end)` — the LLM is told a downstream check will reject mismatches.

The simpler prompt should also improve LLM performance — no token-ID reasoning to learn.

### 3. `dispatchAnnotationsForQuestion` change

**Today** (`packages/backend/src/processors/student-paper-grade/annotations-to-editor.ts:41-54`):

```ts
const alignment = alignTokensToAnswer(args.answerText, args.tokens)
const specs: AnnotationSpec[] = []
for (const ann of args.annotations) {
  const spec = pendingAnnotationToSpec(args.jobId, ann, alignment.tokenMap)
  if (spec) specs.push(spec)
}
```

…where `pendingAnnotationToSpec` reads `tokenMap[a.anchorTokenStartId]` and `tokenMap[a.anchorTokenEndId]` to derive `from`/`to`.

**Proposed:**

```ts
// No alignment call. PM positions come straight from the LLM.
const specs: AnnotationSpec[] = []
for (const ann of args.annotations) {
  const spec = pendingAnnotationToSpec(args.jobId, args.answerText, ann)
  if (spec) specs.push(spec)
}
```

…where `pendingAnnotationToSpec` reads `ann.charStart` / `ann.charEnd` directly and verifies `answerText.slice(charStart, charEnd) === ann.phrase` before accepting.

The new `pendingAnnotationToSpec`:

- Returns `null` (rejects the annotation) when:
  - `phrase` is empty
  - `char_start >= char_end`
  - `char_end > answerText.length`
  - `answerText.slice(char_start, char_end) !== phrase` (LLM hallucinated positions)
- Sets `scanBbox` / `scanPageOrder` / `scanTokenStartId` / `scanTokenEndId` to `null` on the AnnotationSpec attrs (instead of reading from alignment).

### 4. Phrase ambiguity handling

Phrases aren't unique by construction. Mitigation is the cross-check:

- The LLM emits `char_start` + `char_end` + `phrase` together.
- We verify `answer_text.slice(char_start, char_end) === phrase` at insert time.
- If the LLM picked the wrong occurrence, the offsets land on the wrong text and the cross-check still passes (because the slice equals the phrase). Mitigation here is prompt-level: instruct the LLM to use char positions as the canonical anchor (the phrase is verification, not lookup). LLMs reliably emit consistent char offsets when they see numbered/positioned clean text.

A safer alternative if the simple form proves unreliable: include enough leading/trailing context in `phrase` to make it unique (e.g. "ground them on the surrounding sentence boundaries"). Decide after evals.

### 5. `PendingAnnotation` shape change

The DB row that the annotation LLM writes (`student_paper_annotations`-pending, or wherever PendingAnnotation lives) needs the new fields:

- Add: `phrase: string`, `char_start: int`, `char_end: int`
- Keep: `anchor_token_start_id` / `anchor_token_end_id` for now — teacher-applied annotations may still set them; AI annotations leave them null.

## Files to touch

| File | Change |
|---|---|
| `packages/backend/src/lib/annotations/types.ts` (or wherever `PendingAnnotation` is defined) | Add `phrase` / `charStart` / `charEnd` fields. Mark `anchorTokenStartId` / `anchorTokenEndId` as nullable. |
| `packages/backend/src/lib/annotations/llm-annotations.ts` | Update Zod schema and prompt. Remove labelled-token presentation; emit `phrase` + `char_start` + `char_end`. |
| `packages/backend/src/processors/student-paper-grade/annotations-to-editor.ts` | Drop `alignTokensToAnswer` call. `pendingAnnotationToSpec` reads char range from the annotation; verifies `phrase` equality; leaves scan attrs null. |
| `packages/db` (Prisma schema) | Add `phrase` / `char_start` / `char_end` columns to `student_paper_annotations` (or the pending-annotation table). `bun db:push`. |
| `packages/backend/tests/integration/headless-editor-roundtrip.test.ts` (if relevant) | Update fixtures to use the new shape. |

**Files explicitly NOT touched (verified):**
- `packages/shared/src/editor/annotation-marks.ts` — schema unchanged.
- `packages/shared/src/editor/derive-annotations.ts` — fallback path already exists.
- `apps/web/src/components/annotated-answer/use-derived-annotations.ts` — calls `deriveAnnotationsFromDoc`, no change.
- `apps/web/src/components/annotated-answer/hover-highlight-plugin.ts` — reads from ocrToken marks, no change.
- `apps/web/src/lib/marking/alignment/use-question-alignments.ts` — used by PDF export / scan overlay, no change.

## Acceptance criteria

1. **PM positions are provably exact.** For every AI-generated annotation: `student_answer.slice(mark.from, mark.to) === phrase`. Verified by a unit test on `pendingAnnotationToSpec` + an integration assertion in the headless editor roundtrip.

2. **Hover-on-annotation still works.** Open Jaufferdeen A's submission (`ad38b32f-cf38-4363-ad90-10d3f37c2aaf`, stuartbourhill branch) in the marking view. Hover an underlined annotation → scan overlay highlights the corresponding bbox region. (Should work via `deriveAnnotationsFromDoc`'s ocrToken-hull fallback.)

3. **Word-hover still works.** Same submission. Hover an arbitrary word → bbox highlights on the scan. Verifies ocrToken marks are still being read by the inspector.

4. **Attribution eval suite green.** `bunx vitest run tests/integration/attribution-evals.test.ts` — 13 passed / 0 failed / 8 skipped, matching today's baseline. (This suite tests the extract pipeline, not the annotation pipeline, so it should be unaffected.)

5. **Annotation LLM eval (if one exists) green.** Verify no regression on the existing annotation grading evals.

6. **Phrase verification rejects hallucinated positions.** Construct a fixture where the LLM returns `phrase: "foo"` but `char_start`/`char_end` point at "bar". Confirm the annotation is dropped, not silently mis-applied. Log the rejection so we can audit LLM-emission quality.

## Relationship to `build-plan-2026-05-18-token-alignment-accuracy.md`

That plan ranks alignment-accuracy improvements (paragraph anchoring, length-gated look-ahead, etc.) for `alignTokensToAnswer`. Under this rework:

- **Stakes drop substantially.** Alignment quality now only affects ocrToken-mark accuracy (visual bbox on scan overlay) and `deriveAnnotationsFromDoc`'s fallback hull (slightly fuzzy bbox saved to `student_paper_annotations.bbox`). It no longer affects PM mark positions.
- **Item #1 (paragraph anchoring)** still worth doing as follow-up polish but loses urgency.
- **Item #2 (raw + corrected forms)** already shipped today (this morning, before the rework discussion) — keep.
- **Items #3 / #5 / #6** can be skipped entirely. Diminishing returns for visual-only improvements.
- **Item #4 (length-gated look-ahead)** marginal; decide after #1.

The recommended sequencing in that plan (#2 → #1 → #4 → test) **is replaced** by:
1. Ship this rework
2. Verify visual quality is acceptable on real submissions
3. If unacceptable, return to #1 (paragraph anchoring)

## Out of scope

- Removing `scanBbox` / scan-attr columns from the PM mark schema. Stuart wants to confirm the approach works first. The attrs go null for AI marks; teacher marks unaffected.
- Removing the `student_paper_annotations.bbox` denormalised column. Still populated via `deriveAnnotationsFromDoc` (just via fallback). Consider removing in a future cleanup.
- Touching the editor-seed alignment path. Still uses `alignTokensToAnswer`; still bakes ocrToken marks. Unchanged.
- Migrating existing annotations. Pre-launch — re-grade reseeds them.

## Risks and watch-outs

- **LLM emits inconsistent (phrase, char_start, char_end) triples.** Mitigation: hard reject via the slice-equality check. Log rejections; if rejection rate is high, tighten the prompt (or fall back to phrase-only with `indexOf` + occurrence index).
- **LLM emits an empty phrase or zero-length range.** Mitigation: schema validation rejects (`min(1)` on `phrase`, `char_end > char_start` invariant in `pendingAnnotationToSpec`).
- **LLM picks the wrong occurrence of a duplicate phrase.** Cross-check passes but annotation lands wrong. Mitigation: prompt-level — instruct LLM to extend phrase context until unique, OR fall back to occurrence-index in a follow-up.
- **`student_paper_annotations.bbox` accuracy drops slightly.** Today the bbox is sourced from the annotation LLM's chosen tokens (anchor IDs). Post-rework it's sourced from the ocrToken-hull fallback in `deriveAnnotationsFromDoc`. Both go through some flavour of alignment; the fallback uses the seed-time alignment which is the same source. Should be equivalent. Verify on real submissions.
- **The annotation LLM was already reading labelled clean text** (`7bc53cc`). The prompt change is incremental: drop the labels, ask for char positions. Lower risk than a from-scratch prompt rewrite.

## Verification plan

1. Implement the schema + prompt + dispatch changes.
2. Re-grade Jaufferdeen A's submission on stuartbourhill branch.
3. Inspect the rendered PM doc — confirm annotation marks land on the right phrases.
4. Inspect the scan overlay — confirm hover-on-annotation highlights the right bboxes (via fallback).
5. Run the full eval suite.
6. Manual hover sweep across a few submissions (Aaron Brown, Kai Jassi, Jaufferdeen A) — verify both word-hover and annotation-hover are unchanged.

---

| When | What | Why |
|---|---|---|
| this turn | Build plan written to `docs/build-plan-2026-05-18-annotation-llm-phrase-anchoring.md` | Stuart asked for a self-contained plan capturing the rework so a future agent / chat can pick it up cold. |
| Pre-existing (`packages/shared/src/editor/ocr-token-mark.ts:3-9`) | Per-word OcrTokenMark in PM doc carries tokenId/bbox/pageOrder; doc IS source of truth for text↔scan mapping | Foundation that makes the rework cheap. No new mechanism needed. |
| Pre-existing (`packages/shared/src/editor/derive-annotations.ts:118-140`) | `deriveAnnotationsFromDoc` has bbox-hull fallback when `scanBbox` is null on annotation mark | The exact read path the rework relies on. Already implemented. |
| Pre-existing (`docs/build-plan-2026-05-18-token-alignment-accuracy.md`) | Token alignment accuracy plan | Superseded on urgency: under this rework, alignment errors become visual-only. #1 paragraph anchoring relegated to follow-up polish. |
| **Open — next** | Implement the rework in two files (`llm-annotations.ts` + `annotations-to-editor.ts`) + DB column add | Stuart's call when to start. Build plan ready as the handoff. |
