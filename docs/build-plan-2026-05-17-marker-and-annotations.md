# Build plan — Marker focus + annotations from descriptor evaluations

**Date**: 2026-05-17
**Companion to**: `docs/build-plan-2026-05-15-marking-accuracy.md` (PR-A/B/C, shipped).
**Status**: Architecture agreed, not started.

---

## TL;DR

PR-A/B/C shipped the canonical LoR extraction + per-AO descriptor evaluations + grounded annotation prompt. The smoke test (Pearson English Lang P1, May 2025) proved multi-AO grading works end-to-end on a real script: Q6 graded as AO5=12/24 (L3) + AO6=6/16 (L2) = 18/40 with rich descriptor_evaluations carrying verbatim evidence quotes.

What's not great: annotations. Q4 produced one empty-chain placeholder. Q6's first paragraph carries no annotations even though the marker awarded marks for content there. The annotation LLM is being asked to bridge clean evidence quotes to noisy OCR tokens in one call, and it's failing on harder scripts.

This plan addresses three architectural improvements, in dependency order. None require DB schema changes.

1. **Multi-mode marker** — parallel per-AO LLM calls for heavy multi-AO questions (Q5/Q6 type). Single call for everything else.
2. **Level − 1 sandwich check** — small prompt change in the marker to evaluate Level below the candidate too. Counters the upward-bias the bank eval shows.
3. **Annotations: LLM editorial + deterministic resolution** (Option C from our discussion) — the annotation LLM stops touching OCR tokens; it picks anchor text from clean prose; deterministic code maps text → tokens.

Expected impact: better repeatability on multi-AO grading, fewer L1→L2 over-promotions, no more empty-chain annotation bugs, on-script marks anchored on the actual evidence the marker used.

---

## Where we are

**Shipped (PR-A/B/C, commits `7f10d55`, `abd18e3`, `00c6782`, `cd33c4f`):**

- Bundle extraction handles shared assessment grids + parallel multi-AO grids (Pearson English Lang Sec B works).
- `MarkScheme.ao_allocations` JSONB stores canonical AO weights.
- Pure deterministic `renderLoRMarkScheme()` produces canonical content markdown.
- LoR marker iterates `ao_allocations`, emits `ao_awards[]` with `descriptor_evaluations[]` (verbatim evidence quotes, met/not-met decisions).
- `ao_awards` flows through Yjs attrs and projection.
- Annotation prompt consumes `descriptor_evaluations` for grounded LoR annotations.
- 72-exemplar Exemplar Reference Bank + journal at `docs/eval-journal/lor-marker.md`.

**Smoke test 2026-05-16, submission `026647e3-0100-4c83-8536-67b9d0641c8f`:**

- Bundle extraction ✓: Q5/Q6 multi-AO surfaces as `[{AO5, 24}, {AO6, 16}]`, Section B `any_n_of(1)`.
- Marker ✓: Q6 grades 12+6=18/40, both AO awards carry 6 descriptor_evaluations each with real evidence.
- Annotations ✗: Q4 returns one empty-chain placeholder (schema accepts degenerate items). Q6 has 10 annotations, all carry AO codes and quality, BUT they don't anchor on the marker's actual evidence quotes — the annotation LLM is picking its own spans.

---

## What we agreed on this round

1. **Don't decide everything in one mode.** Multi-mode marker with a heuristic (`ao_count`, `total_marks`).
2. **Don't annotate every bullet.** Real examiners under-annotate; target ~5-10 marks per question.
3. **Not-met annotations split by type**:
   - Anchorable weakness (specific text in the answer) → on-script cross/circle
   - Local absence (gap in a specific paragraph) → margin pin at end of paragraph
   - Global absence (whole-response shortfall) → EBI panel only, no on-script mark
4. **Annotation engine = LLM editorial + deterministic resolution** (Option C). The LLM picks anchor TEXT from clean prose; the LLM also decides which evaluations are worth marking on-script; deterministic code maps the chosen text spans to OCR tokens and bboxes. No LLM math, no regex extraction, no string matching against noisy OCR.

---

## The three open architectural questions, resolved

### Q1: Mode heuristic

```
mode(ao_count, total_marks):
  ao_count <= 1                          → "single"  # single-skill LoR
  ao_count >= 5                          → "single"  # too many AOs to fan out
  total_marks < 20                       → "single"  # not heavy enough
  ao_count in [2..4] AND marks >= 20     → "multi"   # Q5/Q6 case
```

`single` = current PR-B behaviour (one LLM call, all AOs in one prompt). `multi` = N parallel LLM calls, one per AO, composed by the orchestrator.

Lives in code. Per-question override possible later via marker config. NOT in the mark scheme (the mark scheme captures examiner skill; the mode is our execution choice).

### Q2: Level − 1 sandwich check

Today the marker evaluates `candidate Level + next Level` descriptors. Confirmation bias: once the model names "I think L3", L3 descriptors are evaluated with a bias toward "met". Bank eval pattern (35/72 exact, 20 near, all leniency direction, never demotion) is consistent with this.

Fix: extend the prompt to evaluate `Level − 1 + candidate Level + next Level`. If Level − 1 descriptors aren't mostly met, drop the candidate. This makes the awarded Level the OUTPUT of a sandwich check rather than a starting point biased to be confirmed.

Boundary handling: candidate = L1 → evaluate L1 + L2 only. Candidate = top Level → evaluate Level − 1 + top Level.

Cost: ~50% more descriptors evaluated per call (3 Levels instead of 2). Modest. Expected eval impact: fewer L1 → L2 promotions.

### Q3: Annotation engine — Option C

The annotation LLM call stays, but with a **redefined job**.

**Input:**
- The marker's `ao_awards` with descriptor_evaluations (already structured, already carry clean evidence quotes)
- The clean `student_answer` text
- The full mark scheme content (for AO context)

**Output (per evaluation the LLM considers worth marking):**
- `should_anchor: bool` — judgement call: is this worth a mark on-script, or summary-only?
- `anchor_text: string` — a verbatim substring of `student_answer`. LLM CHOOSES the right span (can be the marker's evidence quote, a shorter sub-quote, or a different illustrative phrase).
- `signal: "tick" | "cross" | "underline" | "double_underline" | "box" | "circle"` — LLM picks based on met-ness and AO context.
- `ao_category` / `ao_quality` / `reason` / `comment` — same fields as today.

**Deterministic resolution layer** (no LLM, no regex):
1. For each annotation the LLM returned, `indexOf(anchor_text, student_answer)` to find char range.
2. If found: use existing `alignTokensToAnswer` map to find tokens covering that range.
3. If NOT found (LLM hallucinated the quote): log + drop the annotation. Don't fall through to an empty-chain placeholder (that's the Q4 bug — fix in the schema, see PR-D2).
4. Apply annotation mark on the doc at the resolved token span.

**Density target:** instruct the prompt to pick the ~5-10 most informative annotations per question, not exhaustively mark every met descriptor. Editorial judgement is the LLM's job.

**Not-met handling:**
- Anchorable weakness → LLM emits with `anchor_text` set to the weakness span (`should_anchor: true`).
- Local absence with a relevant quote → LLM emits with `anchor_text` set to a quote near where the gap occurs (`should_anchor: true`, `signal: circle`, comment describes the absence).
- Global absence → LLM emits with `should_anchor: false`. The descriptor's `evidence` (gap description) still flows into `what_went_well` / `even_better_if` arrays for the EBI panel — no on-script mark.

---

## PR breakdown

### PR-D1 — Multi-mode marker (per-AO calls for heavy multi-AO questions)

**Scope:** marker behaviour. Composes the existing single-call into N parallel calls when the heuristic says so.

**Touches:**
- `packages/shared/src/grading/grader.ts` — `gradeSingleResponseLoR` splits into `gradeSingleAo` × N when mode=multi, then composes results.
- `packages/shared/src/grading/prompts/lor.ts` — supports rendering for ONE AO at a time (existing single-dimension code path already renders cleanly when `aoAllocations.length === 1`; reuse it for per-AO).
- `packages/shared/src/grading/types.ts` — `LoREvaluationMode` type.
- `packages/backend/src/lib/grading/grader-config.ts` — wire the mode heuristic.
- Renderer change: `renderLoRMarkScheme` gains an optional `dimensionFilter` arg so the per-AO call sees only its AO's content section. Pure function, byte-identical for default behaviour. Renderer unit tests updated.

**Eval:**
- Re-run the Exemplar Reference Bank — all 72 exemplars (single-skill — no change in behaviour expected) PLUS the smoke-test Q6 re-graded with mode=multi.
- New eval assertion: for `mode=multi`, the two AO calls produce independent `ao_awards` and the composed total matches the sum.
- Journal entry: tag the run with the mode used.

**Gate:** AQA Business bank doesn't regress. Q6 produces 2 AO awards with non-trivial `descriptor_evaluations` density per AO.

**Cost note:** ~1.5× LLM tokens per Q5/Q6-class question (the rest of the bank is unchanged).

### PR-D2 — Schema tightening + Level − 1 sandwich check

**Scope:** prompt + Zod schema tightening, no shape changes.

**Touches:**
- `packages/shared/src/grading/prompts/lor.ts` — instruction now says "evaluate Level − 1, candidate Level, and next Level descriptors." Boundary cases (L1 or top Level) handled in the prompt text.
- `packages/backend/src/lib/annotations/annotation-schema.ts` — `AnnotationPlanItemSchema` tightened so an item must have EITHER `signal + reason` OR `chain_type + trigger_phrase`. Zod discriminated union. Items matching neither are rejected at parse time.
- `packages/backend/src/lib/annotations/payload-builder.ts` — drops the implicit chain fallback when no signal is set. If neither shape matches, the item is filtered out (this is the Q4 empty-chain fix).
- Tests: extend `annotation-prompt.test.ts` for the L1 / top-Level boundary cases; add unit test that the tightened schema rejects degenerate items.

**Eval:**
- Re-run bank. Expectation: exact-Level match count goes UP (Level − 1 check counters the leniency). Trap catch stays at 17/17.

**Gate:** No level fails (|Δ|≥2). Trap catch still perfect. Bank journal entry shows the improvement.

### PR-D3 — Annotation engine rewrite (Option C: editorial LLM + deterministic resolver)

**Scope:** the meaty one. Annotation LLM job description changes; new resolver module; LoR projection path swaps.

**Touches:**
- `packages/backend/src/lib/annotations/annotation-prompt.ts` — rewritten for the new job. No more OCR token list in the prompt. No more `<OCRTokens>` block. The descriptor_evaluations section becomes the primary input. Prompt asks for editorial choices, not token math.
- `packages/backend/src/lib/annotations/annotation-schema.ts` — schema shifts to `anchor_text` (verbatim student_answer substring) instead of `anchor_start` / `anchor_end` token indices.
- New: `packages/backend/src/lib/annotations/resolve-anchor.ts` — pure function `resolveAnchor(anchor_text, student_answer, alignment) → { startTokenId, endTokenId, bbox, pageOrder } | null`. No regex. `indexOf` for the lookup. Log + drop on miss.
- `packages/backend/src/lib/annotations/llm-annotations.ts` — calls `resolveAnchor` for each LLM-emitted annotation; drops misses with structured log; converts to `PendingAnnotation` only when resolution succeeds.
- `packages/backend/src/processors/student-paper-grade/annotations-to-editor.ts` — unchanged interface; the new annotation path delivers the same `PendingAnnotation` shape.
- Tests: `tests/unit/resolve-anchor.test.ts` — verbatim hit, no match, multi-match (use first), substring overlap edges.
- Tests: `tests/unit/annotation-prompt.test.ts` — extend to the new schema shape.

**Eval:**
- Re-run smoke test against the Pearson submission. Compare annotation count + AO coverage + first-paragraph density vs current baseline.
- New eval assertion: for any LoR question, every persisted annotation carries an `ao_category` AND its `anchor_text` is a verbatim substring of `student_answer`. (We verify the contract the resolver enforces.)
- Manual check: scan the editor view for Q4 and Q6 — confirm Q4 now has multiple annotations, confirm Q6's first paragraph has annotations on the strong-evidence sentences the marker cited.

**Gate:** Q4 produces multiple grounded annotations (no empty-chain). Q6 first paragraph annotates the AO5 opening evidence. Annotation density is ~5-10 per LoR question (not zero, not 30).

**Decision point baked in:** before merging PR-D3, measure `indexOf` hit rate from PR-B/PR-D1 grading runs (one-shot script over the `grading_results` JSONB). If hit rate is >95% across the bank + real scripts, we ALSO have the option to fall back to pure projection (Option A) without an LLM call. PR-D3 ships Option C as the safer default; the data tells us whether to chase the cheaper Option A in a follow-up.

### PR-D4 (deferred) — Per-AO UI surfaces

UI work for surfacing per-AO marks in the marking dialog and unified question dialog. Out of scope for this build plan; ao_awards data is already in JSONB and waiting to be displayed. PR-D-alpha-through-D3 are blocking for marking accuracy; this PR is teacher-experience polish.

---

## Eval discipline (recap)

Per CLAUDE.md, "Marking accuracy is sacred." For each PR:

1. Run the bank suite under `AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- bunx vitest run tests/integration/lor-exemplar-evals.test.ts`.
2. Append a journal entry. Confirm trap catch stays at 17/17. Confirm structural integrity.
3. For PR-D3 specifically: also run the smoke test against the real Pearson script, compare annotations qualitatively.
4. Tighten level-fail threshold (currently ≤2) as marker stabilises.

---

## Subjects impact

Multi-mode marker (PR-D1) only changes behaviour for `ao_count >= 2 AND total_marks >= 20` questions. This is essentially English Language Sec B creative writing + a small handful of A-level humanities papers. Everything else — English Lit, History, Geography, RS, Business, Science, MFL, all point-based questions, all single-skill LoR — runs the existing single-call path. Zero behaviour change for the majority of subjects.

PR-D2 (Level − 1 check) and PR-D3 (annotation rewrite) affect ALL LoR questions across all subjects. The Level − 1 check is universal; the annotation rewrite changes how the on-script marks are placed for any LoR question.

---

## Execution order

1. **PR-D2 first** — small, low-risk, addresses the Q4 empty-chain bug AND the L1→L2 leniency pattern. Lands the schema tightening that PR-D3 depends on.
2. **PR-D1 second** — multi-mode marker. Independent of D2/D3; could parallel-ship.
3. **PR-D3 third** — annotation engine rewrite. Depends on D2's schema tightening. Biggest scope.

Each PR runs the bank eval and appends to the journal before merging.

---

## What's NOT in scope here

- DB schema changes — there are none.
- Mark scheme extraction changes — extraction already produces the canonical `ao_allocations` + `lor_extraction` shape.
- UI surfaces for per-AO marks — deferred to PR-D4.
- Hand-marked English Lang ground truth — still useful, but the AQA Business bank gives us enough signal to validate these changes.
- Annotation density UX — leave it to the LLM's editorial judgement in PR-D3 (target ~5-10), tune via prompt iteration.

---

## Done means

- All three PRs merged
- Bank eval cleanly passes with ≤1 level fail and 17/17 traps
- Smoke test re-run on the Pearson script: Q4 has multiple grounded annotations, Q6 first paragraph annotates the AO5 evidence the marker cited
- Annotation density per LoR question is 5-10 on-script + EBI bullets for global gaps
- Journal entries showing the progression
