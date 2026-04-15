# Token-Answer Alignment Session Summary (2026-04-14/15)

## Overview

Refactored the backend token-answer alignment pipeline from an over-engineered vision-based LLM call + Levenshtein fallback to a text-only, chunked, parallel LLM approach. Added comprehensive eval tests and fixed the admin LLM settings sync behaviour.

---

## What Changed

### 1. Text-Only Parallel LLM Alignment (was vision + Levenshtein)

**Before:** `alignAndPersistTokenOffsets` was a monolithic function that sent page images (vision call) to the LLM, defaulted to Levenshtein fuzzy matching (`USE_LLM_MAPPING = false`), read from and wrote to the DB, and grouped by question+page.

**After:** Pure alignment logic with no DB access. Text-only LLM calls (no image needed — the Gemini-transcribed `student_answer` is already the ground truth). The processor boundary owns DB reads and writes.

**Files created:**
- `packages/backend/src/lib/scan-extraction/align-tokens-to-answer-core.ts` — Pure types + functions (`AlignableToken`, `QuestionTokenGroup`, `TokenOffsetUpdate`, `mapMappingsToOffsets`, `splitWithOffsets`, `formatTokenList`, `formatAnswerWords`). No infra imports, directly testable.
- `packages/backend/src/lib/scan-extraction/align-tokens-to-answer-prompt.ts` — `MappingSchema` (Zod), `buildMappingPrompt()` with optional `PositionHint` for chunked calls. Sibling file convention matching `vision-attribute-prompt.ts`.

**Files rewritten:**
- `packages/backend/src/lib/scan-extraction/align-tokens-to-answer.ts` — Exports `alignTokensToAnswers(questions, llm?)`. Chunks large token lists (>100 tokens) into parallel LLM calls. Re-exports types and pure functions from core. No DB access.

**Files modified:**
- `packages/backend/src/processors/student-paper-extract.ts` — Processor boundary now owns: DB read (attributed tokens), grouping (`buildQuestionGroups`), calling `alignTokensToAnswers`, and persisting (`persistTokenOffsets`). Removed `pages` argument.
- `packages/shared/src/llm/types.ts` — `token-answer-mapping` call site: `input_type: "text"`, model `gemini-2.5-flash-lite` primary with `gemini-2.5-flash` fallback.

**Removed from `align-tokens-to-answer.ts`:**
- `USE_LLM_MAPPING` flag
- `levenshteinAlign()`, `normalizedDistance()`, `MAX_DISTANCE`, `LOOK_AHEAD`
- `findPrimaryPage()`, `PageEntry` type
- All DB access, image fetching, `Resource` import, `CorrectedPageToken` import

### 2. Token Chunking

Large token lists (>100 tokens per question) are automatically split into chunks and processed in parallel via `Promise.all`. Each chunk gets the full answer text plus a position hint ("beginning", "middle (~50% through)", "end") to help the LLM anchor its mappings.

**Why:** A 641-token answer timed out with a single LLM call (structured output generating 641 JSON entries). Chunking into 7 parallel calls of ~92 tokens each completes in ~11 seconds with flash-lite.

**Validation:** The LLM occasionally returns extra or missing mappings. The code filters to valid `token_index` values, deduplicates, and produces null offsets for any unmapped tokens rather than crashing.

### 3. Model Selection: gemini-2.5-flash-lite

Eval results comparing flash vs flash-lite on the same fixtures:

| Test | flash (time) | flash-lite (time) | flash (mapped) | flash-lite (mapped) |
|------|-------------|-------------------|----------------|---------------------|
| MCQ (2 tokens) | 2.3s | 0.6s | 50% | 100% |
| Short list (14 tokens) | 7.7s | 1.4s | 50% | 100% |
| Medium noisy (90 tokens) | 40s | 7.6s | 96% | 98% |
| Long written (64 tokens) | 18s | 7.1s | 48% | 100% |
| Very long (641 tokens, 7 chunks) | 119s | 10.9s | 62% | 79% |
| **Total suite** | **206s** | **32s** | — | — |

Flash-lite is 6.4x faster, maps more tokens, costs ~40x less per token, and maintains 95-100% ordering. Flash is a reasoning model which is overkill for fuzzy word alignment.

### 4. Eval Tests

**Unit tests** (`packages/backend/tests/unit/align-tokens-to-answer.test.ts`) — 14 tests:
- `splitWithOffsets`: 7 cases (normal, multi-space, whitespace, punctuation, empty, single word)
- `mapMappingsToOffsets`: 7 cases (happy path, junk tokens, text_corrected logic, preserve existing correction, OCR split, out-of-range index, out-of-bounds word index)

**Integration eval** (`packages/backend/tests/integration/align-tokens-to-answer.test.ts`) — 6 tests with inline fixtures from real Neon data (submission `cmnp6hbso000002jr0qpbq163`, Ariane AliaZ, AQA Business):

| Test | Fixture | Tokens | Scenario |
|------|---------|--------|----------|
| MCQ | Q01.1 "C" | 2 | Ultra-short, duplicate detection |
| Short list | Q3 "land, labour..." | 14 | Comma-separated, all duplicated |
| Medium noisy | Q01.4 sole trader | 90 | Nonsensical old text_corrected, heavy duplicates |
| Long written | Q6 franchising | 64 | Multi-sentence, ordering validation |
| Very long (chunked) | Q02 12-mark extended | 641 | 7 chunks, page artifacts, garbled OCR |
| Parallel | MCQ + Short + Long | 80 | Concurrent processing, snapshot verification |

**No DB access in tests** — all fixtures are inline. Only infra dependency is LLM API keys via `sst shell`. `MODEL_OVERRIDE` at the top of the file swaps models for comparison.

**Fixture file:** `packages/backend/tests/integration/fixtures/fixture-q02-tokens.ts` — 641 tokens for the very long test case.

Run: `AWS_PROFILE=deepmark npx sst shell -- bunx vitest run --project backend:integration tests/integration/align-tokens-to-answer.test.ts`

### 5. Admin LLM Settings — Sync Defaults Fix

**Problem:** "Sync defaults" only synced metadata (display_name, description, input_type, phase) but intentionally left models untouched. This meant model changes in code never propagated to the DB.

**Fix:** `seedLlmCallSites()` in `apps/web/src/lib/admin/llm-mutations.ts` now:
1. **Creates** new call sites
2. **Updates** existing ones fully (including models)
3. **Deletes** orphaned rows whose key is no longer in `LLM_CALL_SITE_DEFAULTS`

Toast message updated to show created/updated/removed counts.

**Stale row:** `Token Reconciliation` (`vision-token-reconciliation`) exists in the DB but is no longer in defaults — will be cleaned up on next sync.

### 6. CLAUDE.md Update

Added to Code Quality section:

> **Fast by default** — tasks, tests, and LLM calls that should finish quickly must finish quickly. Never increase a timeout to accommodate slow code — fix the underlying problem instead (chunk the work, reduce payload size, parallelise). Integration tests should complete in under 30 seconds each. If an LLM structured-output call takes longer than ~20 seconds, the input is too large — chunk it and run the chunks in parallel.

---

## Design Principles Applied

- **SRP**: Alignment function returns data, processor boundary owns DB side effects
- **Pure core**: `mapMappingsToOffsets()` testable without mocks, no infra imports
- **Convention**: Prompt in sibling file, matching `vision-attribute-prompt.ts` pattern
- **No fallback**: No Levenshtein — if LLM fails, it throws. Frontend Levenshtein in `align.ts` stays for old submissions without precomputed offsets.
- **Fast by default**: Chunk large inputs, never increase timeouts

---

## Files Changed (Complete List)

### New files
- `packages/backend/src/lib/scan-extraction/align-tokens-to-answer-core.ts`
- `packages/backend/src/lib/scan-extraction/align-tokens-to-answer-prompt.ts`
- `packages/backend/tests/unit/align-tokens-to-answer.test.ts`
- `packages/backend/tests/integration/align-tokens-to-answer.test.ts`
- `packages/backend/tests/integration/fixtures/fixture-q02-tokens.ts`

### Rewritten
- `packages/backend/src/lib/scan-extraction/align-tokens-to-answer.ts`

### Modified
- `packages/backend/src/processors/student-paper-extract.ts` — processor boundary owns DB
- `packages/shared/src/llm/types.ts` — call site default updated
- `apps/web/src/lib/admin/llm-mutations.ts` — sync defaults now syncs models + deletes orphans
- `apps/web/src/app/admin/settings/llm-settings-shell.tsx` — toast shows deleted count
- `CLAUDE.md` — added "fast by default" clause

### Not changed
- Frontend alignment code (`use-question-alignments.ts`, `align.ts`, `string-utils.ts`) — unchanged, contract stable
- `vision-reconcile.ts` — dead but still exports `CorrectedPageToken` for `vision-attribute.ts`
- `vision-attribute.ts` — untouched, different pipeline step

---

## To Deploy

1. `bun db:push` — adds `answer_char_start`/`answer_char_end` columns (from previous session, if not already done)
2. Deploy backend + web
3. Admin → LLM Settings → "Sync defaults" — updates Token Correction + Answer Mapping to flash-lite, removes orphaned Token Reconciliation row
4. New submissions will use text-only LLM alignment automatically
5. Old submissions use frontend Levenshtein fallback (no migration needed)
