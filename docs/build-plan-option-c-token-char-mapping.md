# Option C — LLM-authored per-token char mapping

**Goal:** Replace the client-side Levenshtein+positional-fill heuristic in `apps/web/src/lib/marking/alignment/align.ts` with an LLM-emitted mapping produced at attribution time and persisted on each token row. This removes the remaining heuristic from the bbox → ProseMirror alignment path.

**Status (2026-04-19):** Prompt, schema, and eval are merged. The eval passes on production Q02 fixture data with `gemini-2.5-flash` — 100% coverage of LLM-corrected tokens, 1.6% wrong-word rate, 99% monotonic ordering. Wiring into the live pipeline is the next step; not done yet because Option A (spatial sort) already solves the production failure for the common case.

## Current shape — what's in place

- `packages/backend/src/lib/scan-extraction/map-tokens-to-chars-prompt.ts` — schema + prompt. Uses **word-index** output (not raw char offsets) because LLMs are unreliable at char arithmetic over long answers.
- `packages/backend/src/lib/scan-extraction/map-tokens-to-chars.ts` — `mapTokensToChars({ answerText, tokens, llm })`. Post-processes word_index → char offsets via `splitAnswerWords`.
- `packages/backend/tests/integration/map-tokens-to-chars-eval.test.ts` — model-parameterised eval with `MODEL_OVERRIDE`. No DB access.
- `packages/backend/tests/integration/fixtures/q02-char-mapping/fixture.ts` — 149 real tokens + answer_text from production submission `cmo67pmym000002juduby8kc3` (Subhaan Baig, AQA Business).

Call-site key: `token-char-mapping`. Seed this in `llm_call_sites` when wiring (see Step 1).

## Wiring plan

### Step 1 — seed the call-site config

Add `token-char-mapping` to the LLM config seed (in whatever module currently seeds `llm_call_sites`):

```ts
{
  key: "token-char-mapping",
  models: [
    { provider: "google", model: "gemini-2.5-flash", temperature: 0.1 },
    // fallback — only if we see real failures in prod
    // { provider: "anthropic", model: "claude-sonnet-4-6", temperature: 0.1 },
  ],
}
```

Flash is the right default: eval shows it handles Q02 cleanly at ~$0.005 per script, and structured output failure modes are well-understood. Keep it single-entry until we have data suggesting otherwise.

### Step 2 — call the mapper from `attributeScript`

In `packages/backend/src/lib/scan-extraction/attribute-script.ts`, after the deterministic fill step (section 6, where token `question_id`s get persisted), add a per-question mapping pass:

```ts
// After tokens have their question_id populated but before regions are built,
// ask the LLM to map each question's tokens → char offsets in that question's
// answer_text. Parallelize across questions.

const perQuestionMappings = await Promise.all(
  validQuestionIds.map(async (qid) => {
    const qTokens = allTokens
      .filter((t) => t.question_id === qid)
      .sort(/* already spatial — same order as attribution saw */)
    const answer = answerTextById.get(qid) ?? ""
    if (qTokens.length === 0 || answer.length === 0) return { qid, mapping: null }

    const { mappings } = await mapTokensToChars({
      answerText: answer,
      tokens: qTokens.map((t) => ({
        text_raw: t.text_raw,
        text_corrected: t.text_corrected,
      })),
      llm,
    })

    return { qid, mappings, tokenIds: qTokens.map((t) => t.id) }
  }),
)
```

Three design points worth flagging:

1. **Per-question, not per-script.** Running the mapper on each question's token subset bounds output size (8–150 tokens per call instead of 500+), keeps latency parallelizable, and lets us fall back gracefully on a per-question basis. Parallelism is safe: questions don't share tokens after the deterministic fill.

2. **Skip MCQ.** `is_mcq` questions have their answer_text set by `resolveMcqAnswers` (a separate OCR pass). The mapper should be bypassed for those — highlighting a single letter doesn't need this.

3. **The mapper is non-critical.** If it fails or returns malformed data, attribution should still succeed. Wrap the call in a try/catch and log a `token_char_mapping_failed` event to `ocr_runs.job_events`. The client already has the Option A fallback (spatial-sorted fuzzy alignment) — it'll use that if `answer_char_start` is null.

### Step 3 — persist the result

Schema is already ready: `student_paper_page_tokens.answer_char_start` and `answer_char_end` columns exist (added during an earlier change, currently always null in prod). After the mapper returns:

```ts
await db.$transaction(
  mappings.flatMap(({ tokenIds, mappings: perTokenMappings }) =>
    perTokenMappings.map((m, i) =>
      db.studentPaperPageToken.update({
        where: { id: tokenIds[i] },
        data: {
          answer_char_start: m.char_start,
          answer_char_end: m.char_end,
        },
      }),
    ),
  ),
)
```

Batch via `$transaction` to keep this atomic with the rest of the attribution persist.

### Step 4 — prefer DB offsets in the client

In `apps/web/src/lib/marking/alignment/use-question-alignments.ts`, add a pre-check before calling `alignTokensToAnswer`:

```ts
const precomputed = buildAlignmentFromDbOffsets(qTokens)
const alignment = precomputed ?? alignTokensToAnswer(r.student_answer, qTokens)
```

`buildAlignmentFromDbOffsets` walks tokens, reads `answer_char_start/end`, and returns the same `TokenAlignment` shape iff every non-junk token has non-null offsets. If even one is null (legacy rows, mapper failure), fall back to the heuristic — don't try to mix.

### Step 5 — expand the eval suite

Before merging, extend the eval to cover failure-mode shapes:

1. **Short answer (3 tokens).** Sanity check the mapper doesn't over-complicate simple cases.
2. **Page artifacts.** Inject a fake `"5 | Page"` token and assert the mapper returns `word_index: null`.
3. **Duplicate words.** Q02 has multiple "as", "the", "business" occurrences — current eval already exercises this but add an explicit assertion that two tokens representing different occurrences get different `word_index` values.
4. **A second fixture.** Pull one from another subject (e.g. Kai Jassi's Q02 from the attribution-evals fixture set) so we're not prompt-tuning against a single sample.

Keep the suite runnable by `bunx vitest run tests/integration/map-tokens-to-chars-eval.test.ts` with a single model override at the top of the file.

### Step 6 — run in shadow for one week

Before the client flips to using DB offsets, run the mapper in write-only mode — persist `answer_char_start/end` but keep the client on `alignTokensToAnswer`. Compare the two alignments server-side (log divergences). If divergence stays under 5% across a week of real marking, flip the client.

## Risks

- **Latency.** Eval shows ~60–70 seconds for 149 tokens. Per-question parallelism should keep per-script latency flat at ~5–15 seconds (longest question dominates), but this needs to be confirmed against real multi-question scripts.
- **Cost drift.** Gemini Flash output pricing is ~$0.30/M. At 16k completion tokens per script, that's $0.005/script. If pricing changes or we move to a stronger model later, reassess.
- **Schema rigidity.** The word-index approach collapses a token into a single word index. Hyphenated words, possessives, or punctuation-joined pairs may need two indices — current prompt tells the LLM to pick one but could lose nuance. Monitor misalignments flagged by the shadow comparison in Step 6.
- **Mapper disagreement with attribution.** If the mapper's token→word choices contradict the attribution LLM's `answer_text` authoring (e.g. mapper thinks token N maps to word M but attribution's text flow implies word M+1), we'll see ordering violations. The `ordering > 85%` assertion in the eval catches this; set a stricter threshold (95%+) before shipping to prod.

## Non-goals

- Replacing attribution itself. Attribution stays as-is. This is purely the "which char offset does this token point to" layer.
- Per-character anchoring. Word-level is enough for highlight rendering and annotation anchoring.
- Live/streaming. This runs once at attribution time, then the mapping is static.

## Done criteria

- `ocr_runs.llm_snapshot` shows non-zero `token-char-mapping` calls on new submissions
- `student_paper_page_tokens.answer_char_start` populated on > 95% of attributed tokens
- Client side: no more fuzzy-alignment log entries for submissions where DB offsets are present
- Q02 regression test in `apps/web/src/lib/marking/alignment/__tests__/` still passes (the spatial-sort fallback is still exercised by the `para-order` sub-test)
