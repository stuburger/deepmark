# Build plan — token alignment accuracy

**Date:** 2026-05-18
**Owner:** Stuart
**Status:** Proposed
**Related:** `355d993` (Levenshtein rip and subsequent restoration), `7bc53cc` (annotation prompt now consumes labelled clean text), CLAUDE.md "Fuzzy text matching — bounded use only"

## Context

After today's session (2026-05-18) the pipeline is back to:

- **Extract LLM** authors a polished `student_answer` per question (with corrections, paragraph breaks, punctuation) — this is what the grader reads.
- **`alignTokensToAnswer`** (`packages/shared/src/editor/alignment/align.ts`) runs at consumer load time. It walks OCR tokens and clean-text words with a single advancing cursor, fuzzy-matching via Levenshtein (`MAX_DISTANCE = 0.4`, `LOOK_AHEAD = 8`). Unmatched tokens get a positional fill against any remaining free words.
- **Consumers** (editor seed, PDF export, scan overlay, annotation labelling) call `alignTokensToAnswer(answer, tokens)` whenever they need to project per-token char positions into `student_answer`.

Annotation positioning is approximate by design — the grader-facing text is the source of truth, and a highlight landing one word off is visually unfortunate but not a correctness issue.

## The accuracy problem

Smoke test on submission `ad38b32f-cf38-4363-ad90-10d3f37c2aaf` (Jaufferdeen A, Pearson English Lang P1, stuartbourhill branch) surfaces the structural failure mode of the current aligner:

**Vision misreads the first word of paragraph 12 — student wrote "No matter what..." but Vision tokenises it as `"to"`.** The clean text is `"No matter what, I had to get there by 8pm maximum."` so the token sequence `to matter what I had to get there by 8pm maximum .` aligns greedily:

| Step | Token | Look-ahead window | Best match | Result |
|---|---|---|---|---|
| 1 | `to` | `[No, matter, what,, I, had, to, get, there]` | `to` @ index 5 (distance 0) | **Cursor jumps to 6** — wrong |
| 2 | `matter` | `[get, there, by, 8pm, maximum.]` | no match within threshold | dropped |
| 3 | `what` | same window | no match | dropped |
| 4 | `I` | same | no match | dropped |
| 5 | `had` | same | no match | dropped |
| 6 | `to` | same | `by`? no — drops to positional fill | dropped |
| 7 | `get` | same | `get` @ index 6 | locks in |

A single Vision misread on a short common word corrupts the rest of that paragraph's alignment. Positional fill then crams the unmatched tokens into whatever free words remain, almost certainly the wrong ones.

### Observed pattern

Stuart's observation: **the first paragraph of any answer is mostly accurate; subsequent paragraphs degrade and become spotty.**

This is structural. Greedy fuzzy alignment with a forward-only cursor cannot recover from an early bad match. Drift compounds:

- The cursor moves to a wrong position
- Common short words (`to`, `the`, `a`, `is`, `on`, `in`) appear many times in the answer and Levenshtein picks the closest by distance, which is now the wrong occurrence
- Repeated paragraph openings ("As I…", "I…", "The…") create the same ambiguity at the start of every paragraph

## Goal

Reduce annotation positioning drift in long handwritten answers so that:

- A Vision misread on a common short word doesn't propagate beyond the word it appears in
- Later paragraphs are aligned with similar accuracy to the first paragraph
- The grader's text quality is unchanged (this is pure alignment-layer work; the marker's `student_answer` input is not touched)

## Non-goals

- Improving Vision OCR accuracy (out of our control)
- Changing the extract LLM prompt or the annotation LLM prompt
- Improving marker/grader text quality (already addressed by reverting to LLM-authored `answer_text` earlier today)
- Pixel-perfect annotation positioning (we accepted approximate as the design)

## Approach — six ideas ranked by impact

### 1. Paragraph-anchored alignment (highest impact, recommended first)

**What:** Split BOTH the clean text and the tokens into paragraphs. Align each paragraph's tokens against its own paragraph's words. Bounded scope = bounded drift.

**Why it helps:** The "later paragraphs degrade" pattern goes away by construction. A misalignment in paragraph 2 cannot leak into paragraph 3.

**Implementation sketch:**

```ts
// In packages/shared/src/editor/alignment/align.ts

export function alignTokensToAnswer(
  answer: string,
  tokens: PageToken[],
): TokenAlignment {
  // 1. Split clean text into paragraphs by "\n" (or "\n\n").
  const cleanParagraphs = splitParagraphs(answer)
  //    Each paragraph keeps its absolute char offset into `answer`.

  // 2. Group tokens into paragraphs spatially.
  //    Use the bbox vertical gap heuristic (median line height per question
  //    * 1.5) OR Vision's para_index if it correlates.
  const tokenParagraphs = groupTokensByParagraph(tokens)

  // 3. Align paragraphs 1-to-1 by index. If counts don't match, fall back
  //    to the existing whole-answer aligner so we never make things worse.
  if (cleanParagraphs.length !== tokenParagraphs.length) {
    return alignWholeAnswer(answer, tokens) // current implementation
  }

  // 4. Run the existing Levenshtein walker per paragraph, then rebase the
  //    char offsets back into the global answer.
  const tokenMap: Record<string, { start: number; end: number }> = {}
  for (let p = 0; p < cleanParagraphs.length; p++) {
    const cleanPara = cleanParagraphs[p]
    const paraTokens = tokenParagraphs[p]
    const paraAlignment = alignWholeAnswer(cleanPara.text, paraTokens)
    for (const [tokenId, offset] of Object.entries(paraAlignment.tokenMap)) {
      tokenMap[tokenId] = {
        start: offset.start + cleanPara.absoluteStart,
        end: offset.end + cleanPara.absoluteStart,
      }
    }
  }
  return { tokenMap, confidence: computeConfidence(tokenMap, tokens) }
}
```

**Splitting tokens into paragraphs** — three options:
- (a) Vision's `para_index`: cheap but noisy on handwriting
- (b) Bbox y-gap heuristic: median line height × 1.5 between consecutive tokens
- (c) Combine: trust Vision's `para_index` when paragraph counts match, fall back to bbox gap otherwise

Recommended: start with (b), it was the most promising heuristic in earlier compose-loop experiments.

**Cost:** 60 min implementation. No LLM calls. Adds ~30 lines to `align.ts`.

**Risk:** Mismatched paragraph counts (clean text has 4 paragraphs, tokens detect 3). Mitigation: graceful fallback to the whole-answer aligner — never make things worse.

**Acceptance:** On Jaufferdeen A's submission, paragraph 12 ("No matter what...") aligns correctly even though Vision misreads "No" as "to". Verify by reading the tokens' `answer_char_start/end` after running — token "to" should land on char position of "No" in the clean text (or be skipped if no match), not on the "to" further into the same paragraph.

### 2. Use both `text_raw` AND `text_corrected` (low-hanging fruit, recommended first alongside #1)

**What:** Today `alignTokensToAnswer` uses `text_corrected ?? text_raw`. When a correction exists, raw is thrown away. Try BOTH forms and take the better Levenshtein distance.

**Why it helps:** Sometimes the extract LLM's correction is wrong (over-eager or wrong correction); the raw is a better match. Sometimes the LLM correction is exactly what we need to recover a heavily-misread Vision token. Letting both compete picks the right one per-case.

**Implementation sketch:**

```ts
// In the inner loop of alignTokensToAnswer:
const rawText = token.text_raw.toLowerCase()
const correctedText = token.text_corrected?.toLowerCase()
const candidates = correctedText && correctedText !== rawText
  ? [rawText, correctedText]
  : [rawText]

// For each clean-text word in the search window, take the BEST distance
// across both candidate token forms.
for (let i = wordCursor; i < searchEnd; i++) {
  for (const candidate of candidates) {
    const dist = normalizedDistance(candidate, answerWords[i].word.toLowerCase())
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
}
```

**Cost:** 15 min. Adds 3-4 lines.

**Risk:** Vanishingly small. We're strictly expanding the search space; we can never produce a WORSE match than today.

**Acceptance:** Tokens like `"acade" / text_corrected: "suitcase"` now match `"suitcase"` in clean text via the corrected form. Tokens where `text_corrected` is wrong (e.g. LLM over-corrected) fall back to the raw form's better match.

### 3. Two-pass: anchor on rare/long words first (recommended as follow-up)

**What:** Run alignment in two passes.

- **Pass 1 — high-confidence anchors:** identify tokens that:
  - Have length ≥ 5 characters (less ambiguous than `to`, `is`, `on`)
  - Have distance < 0.15 against a clean-text word (very close match)
  - Target a clean-text word that appears ≤ 1 time within ±20 surrounding words

  Lock these as ANCHORS at known-good positions.

- **Pass 2 — bounded fill:** between consecutive anchors, run Levenshtein for the remaining tokens against the in-between words. Cursor is BOUNDED by anchor positions so it can't drift across them.

**Why it helps:** Long unique words (`pandemonium`, `boarding`, `passport`, `8pm`, `taxi`) anchor the cursor at confident positions. Common short words (`to`, `the`, `a`) slot into the gaps deterministically. Vision misreads on short common words can't propagate beyond the next anchor.

**Implementation sketch:** more invasive than #1/#2 — restructures `alignTokensToAnswer` into a 2-pass routine. ~100 lines.

**Cost:** 90-120 min.

**Risk:** Anchors might be sparse on short answers; need a sensible fallback to single-pass.

**Acceptance:** On Jaufferdeen A's paragraph 12, `8pm` and `maximum` become anchors; the misread `to` (= "No") and surrounding short words get filled deterministically between the start anchor and the next available anchor.

**Defer this** until #1 and #2 ship and we measure their impact. Probably unnecessary if paragraph anchoring is enough.

### 4. Length-gated look-ahead (small tweak)

**What:** Short tokens should only match within a tight window. Long tokens can look further.

```ts
const LOOK_AHEAD = Math.min(8, Math.max(3, tokenText.length * 2))
```

**Why it helps:** Prevents `"to"` matching a `"to"` 7 words away (which is what corrupted paragraph 12 in the smoke test).

**Cost:** 5 min.

**Risk:** Some legitimate matches blocked. Mitigation: tune the threshold.

**Acceptance:** `"to"` (length 2) can only match within 3-4 words ahead. `"pandemonium"` (length 11) keeps full 8-word window.

### 5. Penalise duplicate-match ambiguity (smaller tweak)

**What:** When multiple words within the look-ahead window tie for best distance, the match is ambiguous and should be REJECTED rather than picking the first one.

**Implementation sketch:**

```ts
let bestIdx = -1
let bestDist = Number.POSITIVE_INFINITY
let bestIsAmbiguous = false

for (let i = wordCursor; i < searchEnd; i++) {
  const dist = normalizedDistance(tokenText, answerWords[i].word.toLowerCase())
  if (dist < bestDist) {
    bestDist = dist
    bestIdx = i
    bestIsAmbiguous = false
  } else if (dist === bestDist && bestIdx >= 0) {
    bestIsAmbiguous = true
  }
}

if (bestIdx >= 0 && bestDist <= MAX_DISTANCE && !bestIsAmbiguous) {
  // accept
}
```

**Cost:** 15 min.

**Risk:** Throws away some valid matches. Pairs well with #4 (smaller window = less ambiguity).

### 6. Bigram alignment (heaviest, save for last)

**What:** Match consecutive token PAIRS against consecutive clean-text word pairs. `("No", "matter") → ("to", "matter")` is a strong signal that token `"to"` corresponds to clean word `"No"` because the second word matches perfectly.

**Why it helps:** Recovers Vision misreads on common short words by leveraging the context of the next token.

**Cost:** 2-3 hours. Restructures the aligner significantly.

**Risk:** Higher complexity; harder to reason about edge cases.

**Defer this** unless #1-5 are insufficient.

## Recommended sequencing

| Step | Idea | Effort | Confidence | Notes |
|---|---|---|---|---|
| 1 | #1 Paragraph-anchored | 60 min | High | Biggest single win |
| 2 | #2 Both raw + corrected | 15 min | High | Trivial; always positive |
| 3 | Test against Jaufferdeen A submission | 30 min | — | Verify the "No matter what" sentence aligns; verify later paragraphs no longer degrade |
| 4 | #4 Length-gated look-ahead | 5 min | Medium | Cheap defence against the specific failure mode |
| 5 | (Decision point) Did 1+2+4 fix it? | — | — | If yes, ship. If no, proceed to #3. |
| 6 | #3 Two-pass anchor on rare words | 90-120 min | Medium-High | Heavier but addresses Vision-misread-on-common-word directly |
| 7 | #5 / #6 | — | — | Only if still failing after #1+#2+#3+#4 |

## Acceptance criteria

1. **Smoke test fixture**: Run the pipeline against Jaufferdeen A's submission (`ad38b32f-cf38-4363-ad90-10d3f37c2aaf` on stuartbourhill branch). For Q6 paragraph 12:
   - Token `"to"` (the misread "No") aligns to either the "No" position in the clean text OR is skipped entirely. It MUST NOT align to the actual `"to"` further along in the same paragraph.
   - Subsequent tokens (`matter`, `what`, `I`, `had`, `to`, `get`, …) align to their corresponding clean-text positions, NOT crammed into wrong slots by positional fill.

2. **Eval suite still green** (`packages/backend/tests/integration/attribution-evals.test.ts`): 13 passing / 0 failing / 8 skipped, same as today's baseline. No regression on aaron-brown, kai-jassi, ryan-c-typed fixtures.

3. **Snapshot test**: Output snapshots in `packages/backend/tests/integration/output/*.md` should remain identical (they don't exercise alignment — they're driven by extraction). If they change, investigate.

4. **Manual smoke test in the editor UI**: open Jaufferdeen A's Q6 in the marking view and confirm annotation highlights land on or very near the intended words across all paragraphs. "Mostly right" is the target — perfect is not required.

## Files to touch

- `packages/shared/src/editor/alignment/align.ts` — the main aligner (changes for #1, #2, #3, #4, #5)
- `packages/shared/src/editor/alignment/string-utils.ts` — may need to add `splitParagraphs` helper for #1
- `packages/shared/tests/unit/` — add unit tests for the new aligner behaviour (paragraph anchoring, raw/corrected fallback)
- `packages/backend/tests/integration/attribution-evals.test.ts` — verify no regression
- CLAUDE.md — no changes needed; "Fuzzy text matching — bounded use only" rule already covers this work

## Out of scope for this build plan

- Migration of `student_paper_page_tokens.answer_char_start/end` columns out of the schema. They're dead weight after today's revert but harmless. Defer.
- Changes to the extract LLM prompt (already authoring polished `student_answer`)
- Changes to the annotation LLM prompt (already consuming labelled clean text per `7bc53cc`)
- Multi-column / figure-wrap spatial sort improvements (separate concern)

## Risks and watch-outs

- **Paragraph count mismatch (between clean text and tokens)**: clean text has 3 paragraphs but tokens cluster into 4 (or vice versa). Must fall back gracefully to whole-answer alignment rather than mis-aligning paragraph 2 with token-paragraph 3.
- **Single-paragraph answers (Q1, Q2 of any script)**: #1 collapses to the existing aligner. No win, no loss.
- **MCQ answers**: `student_answer` is "A" / "B" / "C" / "D"; only one or zero tokens. The aligner short-circuits for these already; verify the new code path also short-circuits.
- **Vision's `para_index` is unreliable for handwriting**: don't depend on it; use bbox y-gap clustering instead.
- **Levenshtein still has its known calibration issues**: this build plan does NOT eliminate fuzzy matching. It bounds the damage. If we need exact mapping later, that's a separate project (e.g. revisit `mapTokensToChars` or per-token LLM transcription).

---

| When | What | Why |
|---|---|---|
| this turn | Build plan written to `docs/build-plan-2026-05-18-token-alignment-accuracy.md` | Stuart asked for a build plan documenting the six alignment-accuracy ideas. Self-contained so the next agent can execute without re-deriving context. |
| Earlier this session | `alignTokensToAnswer` restored from `355d993~1` | The Levenshtein aligner this plan iterates on. Has known drift problems on long handwritten answers. |
| `7bc53cc` (2026-05-17) | Annotation prompt consumes labelled clean text (not OCR tokens) | The real fix for the Q4/Q6 smoke-test bug. This build plan addresses a DIFFERENT problem — alignment-drift visual artifact in the editor — not annotation correctness. |
| Smoke test 2026-05-18 | Jaufferdeen A submission `ad38b32f-cf38-4363-ad90-10d3f37c2aaf` Q6 paragraph 12 | Reproducible failure: Vision misreads "No" as "to"; Levenshtein then mis-anchors the entire paragraph. Documented in build plan as the canonical test case. |
| **Open — next session** | Implement #1 + #2 + #4 first; test; decide on #3 | Per the recommended sequencing in the build plan. |
