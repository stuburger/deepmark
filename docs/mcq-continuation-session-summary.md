# Session Summary — MCQ Marking + Multi-page Answer Continuation

Date: 2026-04-17
Working branch: `main` (local, uncommitted)
Production Neon branch: `br-icy-pond-abpt3tg9` (project `snowy-bar-65699801`)

## The Journey

Started investigating an MCQ mismarking bug on a handout-style paper, branched into two structural issues:

1. **MCQ answer extraction** from handouts where students tick a pre-printed checkbox rather than writing the letter.
2. **Multi-page answer attribution** where a single answer spans multiple pages and the continuation page has no visible question number.

Plus several incidental fixes along the way (BoundingBoxViewer runtime error, db:push backfill, empty-page attribution crash).

## Problem 1 — MCQ marking on handout-style papers

**Symptom**: Q01.1 on exam paper `cmnp5y7cz000002jo8trqwpx4` submission `cmnw6cw79000002lemqe93fg8` was marked 0/1 with `student_answer = "D"` when correct was `"C"`.

**Root cause**: On handout pages, the 4 option letters `A/B/C/D` are all pre-printed. Cloud Vision tokenises all four as 1-char tokens; the tick itself isn't tokenised (not text). The attribution LLM had to guess which of the four near-identical letter tokens represented the student's selection, and guessed wrong.

**Fix shipped**: **OCR is the source of truth for MCQ answer text.** Gemini OCR already describes marks correctly in prose (`"01.1: [Cross mark in checkbox C]"`) — we just weren't using that signal. Added a structured `mcq_selections` field to the OCR schema and a new pure module to override MCQ answer text from OCR.

### Files touched

- `packages/backend/src/lib/scan-extraction/gemini-ocr.ts` — added `mcq_selections` (and later `questions_on_page`) to `TranscriptSchema`; `HandwritingAnalysis` gains `mcqSelections` + `questionsOnPage`. Exported `OcrMcqSelection`, `OcrQuestionOnPage` types.
- `packages/backend/src/lib/scan-extraction/resolve-mcq-answers.ts` — **NEW** pure module, sibling to `reconstruct-answers.ts`. Single responsibility: given base answers + per-page OCR selections + question seeds, overrides MCQ `answer_text` from OCR. Falls back to token-reconstructed text when OCR has no selection. Uses `normalizeQuestionNumber` for format tolerance.
- `packages/backend/src/lib/scan-extraction/reconstruct-answers.ts` — exports `ReconstructedAnswer` type (surfaced for sharing with resolver).
- `packages/backend/src/processors/student-paper-extract.ts` — calls `resolveMcqAnswers` between token reconstruction and `extracted_answers_raw` persistence. Processor stays a thin orchestrator.
- `packages/backend/src/lib/scan-extraction/vision-attribute-prompt.ts` — removed the old `McqFallbackSchema` and `buildMcqFallbackPrompt` (fallback was poorly-scoped).
- `packages/backend/src/lib/scan-extraction/vision-attribute.ts` — removed `runMcqFallback` function and all MCQ-specific processing additions from an earlier failed attempt.
- `packages/shared/src/llm/types.ts` — removed `vision-attribution-mcq-fallback` LLM config entry.

### Tests added

- `packages/backend/tests/unit/resolve-mcq-answers.test.ts` — **NEW**, 8 unit tests covering: single-page override, fallback when OCR is empty (preserves token-reconstructed handwritten MCQs), multi-page last-non-empty precedence, empty-selection no-op, non-MCQ passthrough, multi-label join, no-MCQ-seeds short-circuit, Q-prefix / format normalisation.

### Verification

- Production submission `cmo21j99f000002kypmjqcdah` on exam `cmnp5y7cz…`: Q01.1 = "C", Q01.2 = "B", Q01.3 = "A" — **all correct, full marks**.

## Problem 2 — Multi-page answer attribution (Q02 continuation)

**Symptom**: Q02 on exam paper `cmo1n4g3s000102lbvirlzyl6` is a 12-mark extended writing question. Student's answer spans pages 5 and 6. Page 6 has no visible question number (opens mid-sentence with `"is to franchise. This is because…"`). Attribution correctly picks up the short page-5 snippet but attributes **zero tokens on page 6** — leaving ~138 tokens worth of answer orphaned.

**Root cause**: Attribution runs per-page, statelessly. On page 6, the LLM sees 15 questions as candidates and 138 tokens but no question-number anchor, so it abstains.

### Attempts log

1. **Attempt A (rejected)** — Add previous-page transcript to every attribution prompt + continuation instruction. Caused regression across all pages (pages 2-4 went from 52/125/119 tokens attributed → 0). Reverted.
2. **Attempt B — shipped**: Extend OCR to classify `questions_on_page` per page as `fresh_start` / `continuation` / `both`. Attribution uses the list as a **candidate shortlist** — filter the question list to only the hinted subset. Primary prompt unchanged.

### Files touched (Attempt B)

- `packages/backend/src/lib/scan-extraction/gemini-ocr.ts` — added `questions_on_page` Zod array (optional, backwards compatible).
- `packages/backend/src/lib/scan-extraction/vision-attribute.ts` — new `questionsOnPageByOrder?: Map<number, string[]>` arg. Per-page, filters candidate list to the hinted subset (using `normalizeQuestionNumber`). Falls back to full list when no hint. Logs `Using OCR hint to narrow question candidates` when a shortlist is active.
- `packages/backend/src/processors/student-paper-extract.ts` — builds `questionsOnPageByOrder` from `pageOcrResults[i]?.questionsOnPage` and passes through.

### Production result

- Submission `cmo30c4w0000002l78kd6xo96`: 135/138 page-6 tokens attributed to Q02 ✅
- Submission `cmo33id8z000002jlu1m5vklz`: 102/106 page-6 tokens attributed ✅
- Earlier pre-fix submissions `cmo2zrfgt`, `cmo2z0tpl`, `cmo2yobtb`: 0/138 on page 6.

### ⚠️ Known flakiness

The same image/tokens occasionally still produce 0 attributed tokens, even with the hint. Integration test reproduces this deterministically — Claude Sonnet at temp=0.2 returns `assignments: []` on some runs. Not timing-related, not cache-related. Documented in the integration test with retry logic (see below).

### Integration test

- `packages/backend/tests/integration/multi-page-answer-attribution.test.ts` — **NEW**.
- `packages/backend/tests/integration/fixtures/continuation/fixture.ts` — **NEW** (15 questions + 138 page-6 tokens captured from production submission `cmo2zrfgt000002l4h627biyb`).
- `packages/backend/tests/integration/fixtures/continuation/page6.jpg` — **NEW** (real page-6 scan, 113KB JPEG from production S3).
- Two tests:
  - **Test 1** (attribution) — seeds DB with exam paper + submission + real tokens, uploads page 6 image to test S3, passes `questionsOnPageByOrder = {6: ["02"]}`, asserts ≥50% tokens attributed to Q02. **Retries up to 3 times** because of LLM non-determinism. Test 1 was failing in my stuartbourhill stage even with retries — the LLM consistently returned `[]` on this fixture. This needs investigation (see Open Items).
  - **Test 2** (OCR hint emission) — calls `runOcr` on the page 6 image directly, asserts `questionsOnPage` contains at least one `"continuation"` entry. Passes reliably.

## Problem 3 — Cover page + blank page throwing `AttributionError`

**Symptom**: Submission `cmo2yn4jh000002jxmrvxuc3s` failed entire OCR pipeline with `"LLM returned 15 assignment(s) for page 1 but none matched known question IDs"` — but the returned IDs matched expected IDs exactly.

**Root cause**: On a cover page (transcript: just `"6 5 2 0 3 Baig Subhaan"`), the LLM returned all 15 question IDs with empty `token_indices` — which is semantically correct ("no answers on this page"). But the validator filtered out zero-token assignments, threw `AttributionError`, and because each per-page call runs inside `Promise.all`, the first throw rejected all of them and failed the entire OCR run.

**Fix**: `packages/backend/src/lib/scan-extraction/vision-attribute.ts` now distinguishes three empty states:

1. No assignments returned, or all with empty `token_indices` → **skip page with info log**, no throw.
2. Assignments with unknown question_ids (actual LLM bug) → log a warn + `region_attribution_failed` event with accurate reason (`unknown_question_ids`), **don't throw**.
3. Real attributions → process normally.

`AttributionError` retained for genuine infrastructure failures (image fetch, LLM call failure).

## Incidental fixes

### BoundingBoxViewer runtime error

- `apps/web/src/components/BoundingBoxViewer.tsx` — `transformRef.current.wrapperComponent` and `.transformState` don't exist on the runtime ref. Library's `useImperativeHandle` returns `{ instance, ...handlers }`. Fixed to use `transformRef.current.instance.wrapperComponent` + `.instance.transformState`. (TS types in the library are misleading.)

### Auto-pan behaviour

- Same file — when user clicks a text node in ProseMirror, viewer now only pans **vertically** to keep the highlighted token in view. Preserves horizontal position to stop distracting jitter.

### DB backfill for `submission_id` on `student_paper_annotations`

- Executed on production branch `br-icy-pond-abpt3tg9`:
  ```sql
  UPDATE student_paper_annotations AS a
  SET submission_id = gr.submission_id
  FROM enrichment_runs er
  JOIN grading_runs gr ON gr.id = er.grading_run_id
  WHERE er.id = a.enrichment_run_id AND a.submission_id IS NULL;
  ```
- 1390/1390 rows populated, 0 orphans. Unblocks `bun db:push` making the column `NOT NULL`.

### Stale test cleanup

- Deleted `packages/backend/tests/unit/align-tokens-to-answer.test.ts` and `packages/backend/tests/unit/transcript-pre-correct.test.ts` — both referenced modules that no longer exist in the source tree.

## Current state of files on disk

All changes uncommitted. To see: `git status` from repo root. Notable:

- Added: `packages/backend/src/lib/scan-extraction/resolve-mcq-answers.ts`
- Added: `packages/backend/tests/unit/resolve-mcq-answers.test.ts`
- Added: `packages/backend/tests/integration/multi-page-answer-attribution.test.ts`
- Added: `packages/backend/tests/integration/fixtures/continuation/` (fixture.ts + page6.jpg)
- Modified: many files under `packages/backend/src/lib/scan-extraction/`, `packages/backend/src/processors/student-paper-extract.ts`, `packages/shared/src/llm/types.ts`
- Modified: `apps/web/src/components/BoundingBoxViewer.tsx`

Verification: `bun typecheck` clean, `bunx biome check` clean, `bun test:unit` passes (**42 tests, 5 files**).

## Open items for next session

### 1. Integration Test 1 consistently fails locally

The attribution test fails in Stuart's `stuartbourhill` stage with `0/138` attributed, even after 3 retries. But the same code in production `deepmark-production` with the same image achieves `135/138` sometimes. Something environmental differs between the two stages:

- Both use same Claude Sonnet 4.6 model + same prompt + same temp=0.2.
- Both fetch the same image (verified S3 upload works in test).
- Both receive the same tokens fixture (copied from production).

Hypotheses worth investigating:

- Is there a Claude API client cache or anything stage-dependent?
- Could the `sst shell` Resource resolution pick different API keys per stage that behave differently?
- Does Claude respond differently to repeated identical prompts in quick succession (rate-limit-like behaviour)?
- Is there any subtle prompt difference (trailing whitespace, line ordering) between what test code builds vs what production code builds?

### 2. Flakiness in the fix itself

Even in production, attribution on continuation pages is non-deterministic at ~50% success rate. Options to improve reliability:

- **Drop temperature to 0** for `vision-attribution` — currently 0.2.
- **Retry in the main pipeline**: if a page has many tokens + OCR hint + 0 attributions, retry once.
- **Deterministic fallback**: if single-candidate hint + 0 attributions → attribute all non-trivial tokens to that question. Stuart said "I don't like this solution" earlier but might reconsider given the flakiness.
- **Specialised prompt for continuation pages**: when a single [CONTINUATION] candidate is the only hint, use a focused prompt that says "identify junk vs content, everything else is this one question". Simpler task than general attribution.

### 3. Production debugging

A quick way to check live behaviour without redeploying: query `ocr_runs.job_events` for `region_attribution_failed` events, count per-day. Also worth adding a `region_attribution_empty` event when a page with ≥20 tokens + OCR hint returns 0 — that gives a live flakiness metric.

## Key queries for continuity

Production Neon MCP tool calls (branch `br-icy-pond-abpt3tg9`, project `snowy-bar-65699801`):

```sql
-- MCQ answer text for a submission
SELECT jsonb_path_query(extracted_answers_raw::jsonb,
  '$.answers[*] ? (@.question_id == "<question_id>")')
FROM ocr_runs WHERE id = '<submission_id>';

-- Q02 attribution count per page
SELECT page_order,
       COUNT(*) AS total_tokens,
       COUNT(*) FILTER (WHERE question_id = 'cmo1n4wqk000e02l1wnzqb8dh') AS q02_attributed
FROM student_paper_page_tokens
WHERE submission_id = '<submission_id>'
GROUP BY page_order ORDER BY page_order;

-- Region attribution failures
SELECT jsonb_path_query(job_events::jsonb, '$[*] ? (@.type == "region_attribution_failed")')
FROM ocr_runs WHERE id = '<submission_id>';
```

## Key file paths

- `packages/backend/src/lib/scan-extraction/gemini-ocr.ts` — OCR schema + `runOcr`
- `packages/backend/src/lib/scan-extraction/vision-attribute.ts` — attribution flow + `questionsOnPageByOrder`
- `packages/backend/src/lib/scan-extraction/vision-attribute-prompt.ts` — attribution prompt builder
- `packages/backend/src/lib/scan-extraction/resolve-mcq-answers.ts` — MCQ answer overlay
- `packages/backend/src/lib/scan-extraction/reconstruct-answers.ts` — token → answer text (non-MCQ)
- `packages/backend/src/processors/student-paper-extract.ts` — orchestrator
- `packages/backend/tests/integration/multi-page-answer-attribution.test.ts` — integration test
- `packages/backend/tests/integration/fixtures/continuation/` — test fixtures
- `packages/backend/tests/unit/resolve-mcq-answers.test.ts` — unit tests for resolver
