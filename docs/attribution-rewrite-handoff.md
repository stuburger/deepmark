# Attribution Rewrite — Session Handoff

**Date**: 2026-04-17
**Branch**: `main` (local, uncommitted)
**Status**: Failing eval suite in place; implementation not started.

## The problem

The current per-page stateless attribution (`packages/backend/src/lib/scan-extraction/vision-attribute.ts`) is fundamentally broken for multi-page answers. Each page gets an independent LLM call with no cross-page context, so continuation pages (mid-sentence, no visible question label) can't be resolved and the model abstains.

**Failure cases confirmed in production:**

| Submission | Branch | Failure |
|---|---|---|
| `cmo2yobtb000002jxw56aukng` (Aaron Brown) | `br-icy-pond-abpt3tg9` (prod) | Q02 spans p5-6-7. Page 6 gets 0/187 tokens attributed. Page 1 (cover) gets 4 false-positive tokens to Q1. |
| `cmo09672v00005nw315h5grbf` (Kai Jassi) | `br-round-dawn-abu36m2h` (stuartbourhill) | Currently *correct* (02.5 on p2-3 works), but is used as ground-truth ceiling for regression tests. |

The OCR-hint-driven band-aid (`questionsOnPageByOrder`) reduces but doesn't fix the failure — flaky at ~50% in production even when hints are correct.

## The design direction (agreed)

Replace per-page stateless classification with **script-level holistic attribution**, inspired by the old answer-regions-first flow:

```
Phase 1 — Region detection (vision task, whole-script LLM call):
  Input:  all page images + all question prompts + token metadata
  Output: { questionId: [{ page, tokenStartIdx, tokenEndIdx }] }
  LLM reads the whole script and returns token-INDEX ranges per question.

Phase 2 — Token → range alignment (deterministic):
  For each range: mark tokens in [start, end) with that questionId.
  Pure code, trivially testable, no LLM.
```

**Key design constraints that fell out of discussion:**

1. **Holistic, not label-only.** Labels aren't always present or legible. The model must reason semantically — question prompts, content coherence, continuation by argument flow — not just look for printed "Q02" markers.
2. **Token-index ranges, not bboxes.** The historical answer-regions approach used bboxes and regions overlapped, so Phase 2's alignment became guessing. Token-index ranges `[start, end)` on a reading-ordered token list make overlap post-parse-checkable. Invalid outputs get rejected + retried.
3. **Bbox hulls are *derived*** from assigned tokens, not an input to attribution.
4. **No mocking in tests — use real LLMs as evals.** Attribution is inherently an LLM-dependent behavior; tests are as much eval as test. Flakiness shows up as test flakiness, which is the signal we want.

## What got built this session

### Fixtures (real production data)

`packages/backend/tests/integration/fixtures/attribution/`

| Dir | Source | Pages | Tokens | Purpose |
|---|---|---|---|---|
| `aaron-brown/` | prod, `cmo2yobtb…` | 7 | 1697 | Q02 continuation p5-6-7; p1 cover |
| `kai-jassi/` | stuartbourhill, `cmo09672v…` | 3 | 458 | 02.5 continuation p2-3; dense p2 (4 answers) |

Each fixture contains:
- `page{N}.jpg` — real page images pulled from S3
- `tokens.json` — all Cloud Vision tokens (text_raw + bbox + indices), WITHOUT `question_id` (that's what we're testing)
- `fixture.ts` — typed metadata: user/exam/section IDs, questions, pages, expectations

Shared infra: `shared-types.ts`, `load-fixture.ts` (seed + cleanup).

### Stub entry point

`packages/backend/src/lib/scan-extraction/attribute-script.ts`

```ts
export async function attributeScript(_args: AttributeScriptArgs): Promise<void> {
  throw new Error("attributeScript: not yet implemented...")
}
```

Args shape is already defined (questions, pages, s3Bucket, jobId, tokens, optional pageTranscripts, optional llm). Next chat implements this.

### Evals

`packages/backend/tests/integration/attribution-evals.test.ts`

`describe.each(FIXTURES)` runs the full suite per fixture. Single `beforeAll` calls `attributeScript` once; each eval queries DB state.

| Eval | What it asserts | Aaron | Kai |
|---|---|---|---|
| 1 | Continuation answer reaches every page it spans (per-page `minTokens` + `minCoverage`) | Q02 p5/p6/p7 | 02.5 p2/p3 |
| 2 | Per page, each question's tokens form ONE contiguous spatial run (catches historical overlap) | all pages | all pages |
| 3 | Non-answer pages (cover/template) attract 0 tokens | p1 | — |
| 4 | Dense multi-answer pages: each answer ≥10 tokens (catches collapse) | — | p2: 02.2/02.3/02.4/02.5 |

**Thresholds are based on real data inspection via Neon MCP** — see in-file comments for per-page rationale. Key numbers:

- Aaron p6 (pure continuation, all handwriting): `minTokens: 150, minCoverage: 0.9`
- Aaron p7 (handwriting + footer): `minTokens: 75, minCoverage: 0.85`
- Kai p3 (pure 02.5 continuation): `minTokens: 60, minCoverage: 0.9`

Tests currently fail at `beforeAll` with "not yet implemented" — 8 skipped tests, 2 failed suites (one per fixture). Correct "red" state.

## How to run the evals

```bash
cd packages/backend
AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
  bunx vitest run tests/integration/attribution-evals.test.ts
```

Typecheck + biome are clean (`bun typecheck`, `bunx biome check tests/integration/attribution-evals.test.ts tests/integration/fixtures/attribution/ src/lib/scan-extraction/attribute-script.ts`).

`biome.json` has `tests/integration/fixtures/attribution/**/tokens.json` on the ignore list (large data dumps).

## Implementation roadmap (pick up here)

### Step 1 — Phase 1 LLM call: script-level region detection

**Prompt shape (sketch):**

```
Input:
  - N page images (all pages at once)
  - Per-page token list with indices ordered by reading order
  - List of question prompts (question_number, question_text)

Task: For each question, return the token-index range(s) (per page) that
contain the student's answer. Use:
  - question labels when visible
  - content semantics (does this handwriting answer this prompt?)
  - continuation by argument flow (does p6 continue p5's argument?)
  - layout and paragraph flow

Constraints:
  - Per-page ranges must be [start, end) non-overlapping across questions.
  - A question may have zero, one, or multiple ranges (multi-page).
  - Tokens not inside any range stay unassigned.

Output schema (Zod-validated):
  answer_spans: Array<{
    question_id: string
    pages: Array<{ page: number; token_start: int; token_end: int }>
  }>
```

**Validation + retry logic:**
- Post-parse check: per-page ranges must be pairwise disjoint. Overlapping output → reject + retry with an error-feedback prompt.
- Out-of-range indices → filter silently (defensive).
- Empty output → legitimate (blank script), not an error.

### Step 2 — Phase 2 deterministic fill (pure function)

Reads `answer_spans` + `tokens` (ordered reading-order per page) → writes `question_id` on each token row.

Pure, unit-testable without LLM. Likely ~30 lines.

### Step 3 — Wire into the processor

Replace `visionAttributeRegions(...)` call in `packages/backend/src/processors/student-paper-extract.ts` with `attributeScript(...)`.

Keep the downstream bbox-hull region computation — it just consumes `question_id` from token rows now (attribution → hull is already decoupled).

### Step 4 — Iterate until evals pass

Run the suite; debug failing thresholds; tune prompt. Expected iteration points:
- Continuation detection on p6 (Aaron) — the hardest case, currently 0/187
- Dense-page boundary detection on p2 (Kai) — historical overlap failure mode
- Cover/template page suppression on p1 (Aaron) — should stay empty

### Things to think about

1. **Printed-vs-handwriting classification** — the Aaron p5 case (507 tokens, mostly printed Q02 prompt + one handwritten line) needs the LLM to know NOT to attribute printed tokens. Either:
   - The holistic prompt does it implicitly (model just returns a tight range around the handwriting), OR
   - Add an explicit pre-pass that flags printed tokens via QP-template diff
   - Start with implicit; only add explicit if evals demand it.

2. **Prompt size** — 7 pages + 15 questions + 1697 tokens may push token budgets. Mitigations: use token indices (cheap), compact image resolution, batch by "suspected answer neighborhoods" if needed. Claude Opus 4.7 1M context handles this trivially; Sonnet 4.6 might need care.

3. **Flakiness bar** — evals run once per invocation. Expected: Eval 2 (no overlap) should be 100% because enforced by schema validation + retry. Eval 1 (continuation) may need N=3 retries to account for LLM variance; iterate there once implementation is passing 1-shot mostly.

## Open items / decisions deferred

- **Should `attributeScript` write token corrections** (the `text_corrected` field that `visionAttributeRegions` currently produces)? Right now OCR corrections and attribution are fused in one LLM call. Splitting them means a second pass — may regress correction quality. Default plan: keep corrections in the same prompt, just add the span output.
- **Should attribution call emit `region_attribution_*` job events**? Yes — mirror existing events so UI progress stays intact.
- **Decommission `vision-attribute.ts`?** Only after evals are green for ≥5 consecutive runs on both fixtures in production. Keep both flows briefly behind a flag or sequential rollout.

## Key production queries (Neon MCP)

Use Neon MCP tools (not psql) — project `snowy-bar-65699801`, branches:
- `br-icy-pond-abpt3tg9` — production
- `br-round-dawn-abu36m2h` — stuartbourhill

```sql
-- Per-page attribution breakdown for a submission
SELECT page_order, q.question_number, COUNT(*) AS tokens
FROM student_paper_page_tokens t
LEFT JOIN questions q ON q.id = t.question_id
WHERE t.submission_id = '<submission_id>'
GROUP BY page_order, q.question_number
ORDER BY page_order, q.question_number NULLS LAST;

-- Region attribution events for a submission
SELECT jsonb_path_query(job_events::jsonb, '$[*] ? (@.type == "region_attribution_failed")')
FROM ocr_runs WHERE id = '<submission_id>';
```

## File inventory

**New:**
- `docs/attribution-rewrite-handoff.md` (this file)
- `packages/backend/src/lib/scan-extraction/attribute-script.ts` (stub)
- `packages/backend/tests/integration/attribution-evals.test.ts`
- `packages/backend/tests/integration/fixtures/attribution/shared-types.ts`
- `packages/backend/tests/integration/fixtures/attribution/load-fixture.ts`
- `packages/backend/tests/integration/fixtures/attribution/aaron-brown/{fixture.ts, tokens.json, page{1-7}.jpg}`
- `packages/backend/tests/integration/fixtures/attribution/kai-jassi/{fixture.ts, tokens.json, page{1-3}.jpg}`

**Modified:**
- `biome.json` — added `tokens.json` to ignore list

**Unmodified but relevant:**
- `packages/backend/src/lib/scan-extraction/vision-attribute.ts` (current per-page flow — the thing being replaced)
- `packages/backend/tests/integration/multi-page-answer-attribution.test.ts` (narrower regression test for the hint-based band-aid)
- `docs/mcq-continuation-session-summary.md` (the prior session that added `questionsOnPageByOrder`)
