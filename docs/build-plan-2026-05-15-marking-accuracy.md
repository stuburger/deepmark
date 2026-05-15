# Build plan — Marking accuracy: LoR multi-skill, structured extraction, descriptor justifications

**Date**: 2026-05-15
**Context budget when written**: 55% on Opus 4.7 — saved as handoff before further drift.
**Companion to**: the new "Marking accuracy is sacred" section in CLAUDE.md (commit `ca5d430`).

---

## TL;DR

We're rebuilding the LoR marking path to (1) handle multi-skill mark schemes (Pearson/AQA English Lang Sec B and similar — parallel AO grids summed for the total), (2) ground every Level + mark in discrete, auditable descriptor evaluations (no holistic judgements), and (3) make the bundle extractor a deterministic skill compiler so the same MS always produces byte-identical `MarkScheme.content` markdown.

Three PRs, in order:
- **PR-A** — Schema discipline + bundle prompt + canonical markdown renderer. Unblocks Edexcel English extraction. No grading behaviour change (yet).
- **PR-B** — LoR marker rewrite. Iterates `ao_allocations`. Emits `ao_awards[]` with `descriptor_evaluations[]` per AO. Single-skill is just `ao_awards.length === 1`. Same prompt path.
- **PR-C** — Annotation pass consumes `descriptor_evaluations.evidence` for grounded annotations anchored to verbatim student quotes.

UI changes to the marking dialog (`marking-job-dialog.tsx`) and the question editor (`unified-question-dialog.tsx`) are **explicitly deferred** — justification data is stored and renderable later, but neither dialog needs structural changes for PR-A/B/C.

---

## Where we paused

We're mid-architectural-conversation. **No code from this plan has been written yet.** Last work shipped:
- `ca5d430` — CLAUDE.md with the new "Marking accuracy is sacred" block

The last few non-architectural commits (the marking-accuracy work *before* this plan starts):
```
ca5d430 docs(claude.md): add 'Marking accuracy is sacred' principles
37efdc6 refactor(grading): extract computeTotals to pure helper with unit tests
22c4c9b test(marking): cover choice-aware partition + paper-totals helpers
12b0504 refactor(marking): partitionResultsByChoice — name the choice-aware glue
9cae549 feat(marking): "Not chosen" pill + choice-aware awarded sum in listings
5c879ab feat(grading): choice-aware paper totals with anomaly logging
f1c67b6 fix(paper-setup): classifier handles 'student script with printed QP cover' trap
d9292c1 fix(marking): paper totals reflect section.choice
7b4266d fix(grading): linker default uses choice-aware section ceiling
1a168dd feat(shared): section-choice primitive for any_n_of handling
29632d4 feat(paper-setup): stimulus pack as 4th wizard slot end-to-end
0c4943b feat(bundle): model either/or sections with choice.kind
bbcfd81 fix(authz): handle nullable batch.exam_paper_id in assertBatchAccess
```

13 commits unpushed at time of writing. Stuart pushes manually (agent's git identity can't push).

---

## The trigger — Q5 smoke test failure

Stuart ran a wizard smoke test uploading the Edexcel English Lang Paper 1 (1EN0/01, May 2025, P76048A) bundle: QP + MS + insert + scripts. Bundle extraction failed:

```
Bundle validation failed: Level-of-response question "5" has no levels
```

Session: `cmp6w2hp60000aow3m6mmq77k`.

---

## The discovery — Pearson MS structural quirks

Investigating Pearson's MS layout for Section B (Q5/Q6 — 40-mark creative writing):

1. **Shared assessment grids printed elsewhere**. The Q5 block has indicative content + "(40 marks)" + one instruction:
   > *"Refer to the writing assessment grids at the end of this section when marking Question 5 and Question 6."*

   The actual level descriptors live in a separate table **at the end of the MS** that's referenced by both Q5 and Q6.

2. **Dual-AO parallel grids**. That "writing assessment grids" section contains **two separate grids**:
   - **AO5 grid**: 5 levels, 0–24 marks — Content / structure / register
   - **AO6 grid**: 5 levels, 0–16 marks — Vocabulary / SPaG

   Final mark = AO5 award + AO6 award. Markers can award **different Levels per AO** for the same response (common pattern: "rich content but typos" = Level 5 AO5 + Level 2 AO6).

Gemini correctly identified Q5 as `level_of_response` but couldn't populate `levels: []` because:
- Levels weren't co-located with the question (shared grid)
- Even if it had found them, our schema's flat `levels: array` can't honestly represent two parallel AO grids (Level 3 in AO5 ≠ Level 3 in AO6 — different scales, independent rankings)

So it emitted `levels: null` and the validator rejected.

---

## Key insight — "AQA vs Pearson" is the wrong axis

This isn't about boards. It's about **question type**:

| Pattern | Examples | Structure |
|---|---|---|
| **Single-skill LoR** | English Literature (all boards), History essays, Geography case studies, Biology/Chemistry 6-markers, OCR History | One grid, one Level award, one total |
| **Multi-skill LoR** | AQA English Lang Sec B, **Pearson English Lang Sec B (this paper)**, Religious Studies "Evaluate", Edexcel Business "Evaluate" 12-markers, A-level humanities essays, MFL extended writing | Multiple parallel grids, one Level award **per dimension**, marks summed |

Both AQA and Pearson use both patterns. The difference between AQA's "one combined grid with two mark columns" and Pearson's "two separate grids" is **purely cosmetic** — same marking process, same final-total math, just different page layout.

So the variable is the **question's mark scheme**, not the board.

---

## Decisions and their reasoning

Captured in detail so we don't relitigate.

### Decision 1: No new marking_method enum value

We considered `level_of_response_multi_ao` as a separate value. Rejected.

**Why**: the *act* of LoR marking is the same — assess against descriptors, award levels. Dimensionality is a **property of the question's MS**, not a new method. Adding the enum value proliferates downstream branching without representing a real architectural distinction. The LLM call shape is the same; the marker just iterates dimensions.

### Decision 2: `ao_allocations` becomes the canonical dimensionality field

Promote the existing `ao_allocations: Array<{ ao_code, marks }>` from "metadata Gemini optionally fills in" to "the field the LoR marker iterates."

- Single-skill: `ao_allocations.length === 1` (or `0` for subjects with no printed AO weights — same code path)
- Multi-skill: `ao_allocations.length >= 2`
- N-dimensional (A-level Eng Lang AO5+AO6+AO7): `length >= 3`

**Why this absorbs new subjects without schema changes**:

| Subject | `ao_allocations` | Schema change needed? |
|---|---|---|
| English Lit Section A | `[{AO2, 20}]` | None |
| English Lang Section B (this paper) | `[{AO5, 24}, {AO6, 16}]` | None |
| RS "Evaluate" 12-marker | `[{AO1, 6}, {AO2, 6}]` | None |
| Edexcel Business "Evaluate" | `[{Knowledge, 3}, {Application, 3}, {Analysis, 3}, {Evaluation, 3}]` | None |
| A-level Eng Lang creative | `[{AO5, X}, {AO6, Y}, {AO7, Z}]` | None |
| AQA Combined Science 6-marker | `[]` (no printed weights) | None |

### Decision 3: Structured extraction → deterministic markdown rendering

For LoR, `content` becomes canonical and stable. Pattern:

```
        Bundle extraction (LLM)
                 │
                 ▼
  ┌──────────────────────────────────┐
  │ Structured intermediate (Zod):    │
  │   - indicative_content (md)       │
  │   - ao_dimensions[] {             │
  │       ao_code, marks,             │
  │       levels[] {                  │
  │         level, range, bullets[] } │
  │     }                             │
  │   - marker_notes (md, free)       │
  │   - extras (md, catch-all)        │
  └──────────────────────────────────┘
                 │
                 ▼ renderMarkScheme(intermediate)   ← pure TS function
                 │   (deterministic, unit-tested)
                 ▼
  ┌──────────────────────────────────┐
  │ content: canonical markdown       │
  │   (persisted; consumed by marker) │
  └──────────────────────────────────┘
```

- Intermediate is **extraction-time only** — never persisted
- Same intermediate → byte-identical markdown
- New subject quirks land in `extras` catch-all; renderer appends them at the end
- No schema migration for board variability

**Why not let Gemini emit markdown freehand?** ~95% of runs would be fine, but failures are silent (a missing "**Level 4**" header in one run vs the next produces unrecoverable grading drift). Deterministic rendering guarantees layout.

**Why not store the structured intermediate forever?** That's the lossy-decomposition trap — new subjects break the schema. By treating the intermediate as ephemeral and the markdown as canonical, the schema is allowed to evolve without migrations.

### Decision 4: Holistic judgements are forbidden

Point-based marking is repeatable because the decision is decomposed (one met/not-met per mark point). LoR today is holistic (one Level pick + one mark-within-band). Holistic = subjective = drifts across runs by ±3-5 marks.

**Fix**: port the point-based discipline to LoR. Every Level award must be the OUTPUT of discrete descriptor evaluations:

```ts
type DescriptorEvaluation = {
  descriptor: string      // verbatim text from the MS markdown
  met: boolean            // discrete decision
  evidence: string        // verbatim quote (met) or gap description (unmet)
                          //   Zod min length ~20 — forces the LLM to engage
}
```

The marker evaluates each descriptor at the **awarded Level and the next Level** (not all 5 Levels — that's wasteful and isn't what human examiners do). Mark within band is derived from evidence strength.

**Expected impact on repeatability**: ±1 mark per AO per run (vs current ±3-5 on holistic).

### Decision 5: WWW/EBI/Feedback are derived, not separately emitted

Today the marker generates `feedback_summary`, `what_went_well`, `even_better_if` as independent narrative fields. Quality varies; not traceable to mark scheme.

**Post-rewrite**: derive these from descriptor evaluations.
- WWW = the met descriptors + their evidence quotes
- EBI = the next-Level descriptors that weren't met
- Feedback = composed from these grounded inputs, not freeform

### Decision 6: Annotations consume descriptor evaluations

The annotation pass currently runs from `feedback_summary` + `what_went_well` + `even_better_if`. Annotations are placed where the LLM thinks "this is worth a mark" — ungrounded.

**Post-PR-C**: annotations are generated **one per descriptor evaluation**. For each met descriptor with a verbatim evidence quote → anchor an annotation on that exact token span saying "✓ Level 4 AO5 — Secure imaginative voice". For each unmet descriptor → gap annotation at the relevant location.

This is materially better because:
1. **Grounded anchoring**: precise token target instead of "scan and decide"
2. **Mark-scheme traceability**: every annotation references a specific descriptor
3. **Deterministic density**: count = sum of evaluations across AOs; predictable, no LLM-judged "is this worth annotating?"

### Decision 7: UI changes deferred

For both `marking-job-dialog.tsx` (graded submission view) and `unified-question-dialog.tsx` (MS editor):

- Store the justification data
- Render it later

The richer `content` markdown will flow through naturally in `unified-question-dialog.tsx` (it already renders `ms.content`). New `ao_allocations` is data to display as a badge eventually but not in scope.

The "Not chosen" pill and per-AO mark display are PR-D territory, deferred.

---

## The architecture — concrete shapes

### `packages/shared/src/editor/types.ts`

Extend `GradingResult` with optional `ao_awards`:

```ts
export type DescriptorEvaluation = {
  descriptor: string
  met: boolean
  evidence: string
}

export type AoAward = {
  ao_code: string | null            // null = single-skill / no-AO-printed
  level_awarded: number | null      // null = no level grid (rare; some sub-AOs)
  awarded_marks: number
  descriptor_evaluations: DescriptorEvaluation[]
  why_not_next_level: string | null
}

export type GradingResult = {
  // ... existing fields ...
  ao_awards?: AoAward[]
}
```

Same shape carried via `QuestionGradeAttrs` on the Yjs node (mirror through `gradingResultToAttrs` in `grade-questions.ts:354`).

### `packages/backend/src/processors/paper-bundle/schema.ts`

Bundle Zod stays similar but with three changes:

- **`MarkSchemeBlockSchema.content`** — strict required for `marking_method === "level_of_response"`. The marker reads `content` as primary input.
- **`MarkSchemeBlockSchema.ao_allocations`** — promoted from optional metadata to canonical dimensionality. Always populate when printed AO weights are visible.
- **`MarkSchemeBlockSchema.levels`** — deprecated path. Mark as `.optional()` and don't depend on it downstream. The marker reads `content`, not `levels`.

Add a new **extraction-time intermediate** type (not in the persisted bundle, but used in the LoR extraction prompt):

```ts
const LoRExtractionSchema = z.object({
  indicative_content: z.string(),   // multi-paragraph markdown
  ao_dimensions: z.array(z.object({
    ao_code: z.string(),
    marks: z.number().int(),
    description: z.string(),         // short label
    levels: z.array(z.object({
      level: z.number().int(),
      mark_range: z.tuple([z.number().int(), z.number().int()]),
      descriptor_bullets: z.array(z.string()),
    })),
  })),
  marker_notes: z.string().nullable(),  // caps, exceptions
  extras: z.string().nullable(),         // catch-all for board quirks
})
```

The bundle prompt instructs Gemini to emit this for LoR questions. The renderer converts it to canonical markdown that goes into `mark_scheme.content`.

### `packages/backend/src/processors/paper-bundle/render-mark-scheme.ts` (new)

Pure function:

```ts
export function renderLoRMarkScheme(intermediate: LoRExtraction): string {
  // Deterministic markdown layout:
  //
  // ## Indicative content
  // {indicative_content}
  //
  // ## Assessment dimensions
  //
  // ### {ao_code} — {description} ({marks} marks)
  //
  // **Level 1 (range[0]–range[1] marks)**
  // - {bullet}
  // - {bullet}
  //
  // ...
  //
  // ## Marker notes
  // {marker_notes}
  //
  // {extras (verbatim, no header)}
}
```

Unit-tested for byte-identical output. Renderer is the repeatability guarantee.

### `packages/db/prisma/schema.prisma`

Add one nullable column:

```prisma
model MarkScheme {
  // ... existing columns ...
  ao_allocations Json?  // [{ ao_code: string, marks: int }]
}
```

That's the only migration. Pre-launch additive change — `bun db:push` applies it. No `ao_awards` column on `MarkingResult` yet — defer until analytics needs it; lives in `GradingRun.grading_results` JSONB.

### `packages/backend/src/processors/paper-bundle/validate.ts`

For `level_of_response`: require `content.length > 0` and `points_total > 0`. **Remove** the `levels.length >= 1` check (current source of the Q5 failure).

### `packages/shared/src/grading/level-of-response-marker.ts` (or wherever it lives)

Marker rewrite. Single prompt that iterates `ao_allocations`:

```
For each AO in mark_scheme.ao_allocations (or one virtual entry if empty):
  Identify candidate Level for this AO (skim descriptors against response)
  For the candidate Level and the next Level:
    For each descriptor bullet in that Level:
      Decide: does the response demonstrate this descriptor?
      Output: { descriptor, met: bool, evidence: quote-or-paraphrase }
  Confirm Level award based on evaluations
  Pick mark within band based on strength of evidence

Aggregate: awarded_score = sum(ao_awards[*].awarded_marks)
Derive: WWW = met descriptors with evidence
        EBI = next-Level missed descriptors
```

Structured output enforced via Zod. The LLM cannot return holistic awards.

### `packages/backend/src/lib/annotations/annotate-result.ts`

Annotation prompt receives `result.ao_awards`. For each award:
- For each met descriptor with `evidence`: find the evidence quote in tokens, anchor annotation
- For each unmet descriptor: gap annotation at the relevant paragraph boundary
- Annotation text includes ao_code + Level + descriptor summary

---

## PR breakdown

### PR-A — Schema + renderer + extraction unblock

**Scope**: extraction-side discipline. No grading behaviour change. Edexcel English fixture passes extraction.

**Touches**:
- `packages/db/prisma/schema.prisma` — add `MarkScheme.ao_allocations Json?`
- `packages/backend/src/processors/paper-bundle/schema.ts` — strict content for LoR, deprecate levels
- `packages/backend/src/processors/paper-bundle/prompts.ts` — instruct Gemini on shared-grid resolution + intermediate emission + ao_allocations always-populate
- `packages/backend/src/processors/paper-bundle/render-mark-scheme.ts` (NEW) — pure renderer
- `packages/backend/src/processors/paper-bundle/validate.ts` — content-based LoR validation
- `packages/backend/src/processors/paper-bundle/persist.ts` — write `ao_allocations` to MarkScheme; ensure rendered markdown goes to `content`
- `packages/backend/tests/integration/paper-bundle-evals.test.ts` — assertions for English fixture (content non-empty, ao_allocations populated, AO5+AO6 sums to 40)
- `packages/backend/tests/unit/render-mark-scheme.test.ts` (NEW) — byte-identical rendering

**Evals to run + gate on**:
- `bunx vitest run tests/integration/paper-bundle-evals.test.ts` under `sst shell --stage=stuartbourhill`
- AQA Business fixture: pass (no regression)
- Edexcel English fixture: **must now pass** (currently fails on Q5)
- Renderer unit tests: green

**Required**:
- Stuart: `AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- bun db:push` to apply the migration

### PR-B — LoR marker rewrite

**Scope**: marker behaviour change. Single-skill must not regress; multi-skill becomes correct.

**Touches**:
- `packages/shared/src/editor/types.ts` — extend `GradingResult` with `ao_awards?: AoAward[]`
- `packages/shared/src/grading/level-of-response-marker.ts` — single prompt iterates dimensions; produces `ao_awards`
- `packages/shared/src/grading/grader.ts` (if exists) — schema for marker output includes ao_awards
- `packages/backend/src/lib/grading/grade-questions.ts:354` — `gradingResultToAttrs` carries `ao_awards`
- `packages/shared/src/collab/editor-schema.ts` (or similar) — `QuestionGradeAttrs` includes `ao_awards`
- `packages/backend/src/lib/grading/projection.ts` (or similar) — projection mirrors `ao_awards` to `GradingRun.grading_results`

**Evals to run + gate on**:
- **Regression eval** (must-have): AQA Business fixture re-graded with new marker, asserts ±1 mark vs known-good baseline. This is the "we didn't break single-skill" gate.
- **Multi-skill correctness eval** (must-have, blocks PR-B from shipping to users): hand-marked English Lang Q5/Q6 scripts (3 students minimum). Per-AO awards within ±1 Level. **Requires Stuart or a teacher to hand-mark first** — no shortcut.
- **Repeatability eval**: same input twice → grades within ±1 mark per AO across runs.

**Open**: how many descriptors to evaluate? Awarded Level + next Level = 6-8 evaluations per AO. Acceptable token cost.

### PR-C — Grounded annotations

**Scope**: annotation generation pulls from `descriptor_evaluations.evidence`.

**Touches**:
- `packages/backend/src/lib/annotations/annotate-result.ts` — prompt change: iterate ao_awards.descriptor_evaluations, anchor on evidence
- `packages/backend/src/lib/annotations/prompts.ts` (if separate)
- Annotation schema (if any structured fields tag back to descriptor index)
- `packages/backend/tests/integration/annotation-evals.test.ts` (or similar) — fixture: graded submission with multi-skill mark scheme, asserts each met descriptor produces an annotation anchored on its evidence text

**Evals**:
- Annotation density tracks evaluation count (deterministic, predictable)
- Annotation text references descriptor (auditable)

---

## Eval strategy — the safety net

Per the new CLAUDE.md principle: evals are how we assert accuracy, not schema validation. Required eval coverage:

### Already exists
- `packages/backend/tests/integration/paper-bundle-evals.test.ts` — AQA Business + Edexcel English (currently failing on Q5)
- Various existing eval files in `packages/backend/tests/integration/` (attribution, segmentation, etc.)

### Must add for PR-A
1. **Renderer byte-identical test** (unit, fast, deterministic)
2. **English fixture LoR assertion**: Q5 extracts with `content` containing "AO5" + "AO6", `ao_allocations.length === 2`, marks sum to 40

### Must add for PR-B
3. **Single-skill regression**: AQA Business question (level_of_response if any exists) graded with new marker, awarded score within ±1 of known-good. **Need to capture the known-good first.** Suggest: before changing the marker, run the current marker against the AQA Business fixture and snapshot the grading_results to a "baseline" file. After the change, re-run and diff.
4. **Multi-skill correctness**: 3+ hand-marked English Lang Q5/Q6 scripts. Per-AO awards within ±1 Level. **Hand-marking is real teacher labour, not a shortcut.**
5. **Repeatability**: same input twice through the new marker, grades within ±1 mark per AO.

### Must add for PR-C
6. **Annotation grounding**: graded submission with multi-skill MS, every annotation has an `ao_code` + descriptor reference, met-descriptor annotations anchor on evidence text.

### Cost
- Bundle eval: ~$0.10/run
- Marker eval (per student script): ~$0.30-$0.50
- Annotation eval: ~$0.20
- Full suite: ~$3-$5 per run if running all three students for marker + annotations

---

## Open questions

Things we haven't decided. Don't relitigate without re-reading.

1. **Override editor UX for multi-dim marks**. When a teacher disagrees with "AO5 L3 13/24 + AO6 L2 6/16 = 19/40", do they override total, per-dim, or both with constraints? Deferred. UI surface change, doesn't affect grading correctness.

2. **Per-AO feedback rendering**. The marking dialog currently shows one feedback box. With multi-skill, should it show per-AO feedback? Or one total feedback with AO tags? Deferred — Stuart's call.

3. **Adjacent Level evaluation**. Marker evaluates "candidate Level + next Level." Does it also need to evaluate "candidate Level - 1" to justify why it didn't go lower? Pros: more rigour. Cons: more tokens. Current call: just candidate + next. Revisit if eval shows the boundary is unclear.

4. **AQA Combined Science 6-mark questions**. These use a simplified LoR (3 levels, no AO breakdown). `ao_allocations.length === 0` — marker treats as single virtual dimension. Confirm in PR-B eval; the architecture should handle it.

5. **Re-grading of papers already extracted under the old shape**. Pre-launch — wipe + re-extract. No backwards-compat path.

---

## File-by-file reference (current state)

These are the files most relevant to the work. Useful when picking up cold.

### Extraction side
- `packages/backend/src/processors/paper-bundle.ts` — the Lambda handler; currently calls `validateBundle` which rejects Q5
- `packages/backend/src/processors/paper-bundle/schema.ts` — Zod schema; `MarkSchemeBlockSchema` has the `levels` array we're deprecating, `ao_allocations` we're promoting
- `packages/backend/src/processors/paper-bundle/prompts.ts` — `PAPER_BUNDLE_PROMPT`; currently has "Refer to writing assessment grids" gap (doesn't tell Gemini to resolve shared grids)
- `packages/backend/src/processors/paper-bundle/validate.ts` — currently rejects `level_of_response` without levels array
- `packages/backend/src/processors/paper-bundle/persist.ts` — writes MarkScheme rows
- `packages/backend/tests/integration/paper-bundle-evals.test.ts` — eval suite

### Grading side
- `packages/backend/src/processors/student-paper-grade.ts` — the grade Lambda, calls `gradeAndAnnotateAll`
- `packages/backend/src/lib/grading/grade-questions.ts` — `gradeOneQuestion` is the per-question grading entry; `gradingResultToAttrs` maps to Yjs
- `packages/backend/src/lib/grading/grader-config.ts` — `createMarkerOrchestrator` wires the markers
- `packages/shared/src/grading/...` — `MarkerOrchestrator`, `LevelOfResponseMarker`, `LlmMarker`, `DeterministicMarker` (need to confirm exact paths in shared package)

### Annotation side
- `packages/backend/src/lib/annotations/annotate-result.ts` — `annotateOneResult`, currently reads from `feedback_summary` etc.
- `packages/backend/src/processors/student-paper-grade/annotations-to-editor.ts` — dispatches annotations to the editor

### Types
- `packages/shared/src/editor/types.ts` — `GradingResult` lives here; this is where we add `ao_awards`
- `packages/shared/src/collab/...` — Yjs node attrs (`QuestionGradeAttrs`); needs `ao_awards` too

### UI (deferred but worth knowing)
- `apps/web/src/app/teacher/exam-papers/[id]/marking-job-dialog.tsx` — the marking surface; **no changes needed for PR-A/B/C**
- `apps/web/src/app/teacher/exam-papers/[id]/questions/[question_id]/unified-question-dialog.tsx` — the MS editor; **no changes needed for PR-A/B/C** (richer `content` markdown flows through naturally)
- `apps/web/src/components/annotated-answer/question-answer-view.tsx` — already has the "Not chosen" pill from earlier choice work; future home for per-AO display

### Existing primitives we built recently (refresher)
- `packages/shared/src/section-choice.ts` — `resolveSectionResults` + `sectionExpectedMax` for any_n_of sections (the choice work shipped earlier this session)
- `apps/web/src/lib/marking/choice-aware-results.ts` — `partitionResultsByChoice` (apps/web glue)
- `packages/backend/src/lib/grading/compute-totals.ts` — pure choice-aware totals + anomaly logging
- `packages/backend/tests/unit/compute-totals.test.ts` — 11 unit tests

These don't need changes for marking accuracy work, but they're the existing pattern of "primitive + tests + thin adapter" that PR-A/B/C should follow.

---

## Recommended execution order

If picking up cold:

1. **Read CLAUDE.md's "Marking accuracy is sacred" block.** Internalise the principles.
2. **Start PR-A.** It's the schema + extraction discipline. Lowest risk, unblocks the English fixture.
3. **Run paper-bundle-evals after PR-A.** Both AQA Business and Edexcel English must pass.
4. **Pause before PR-B for hand-marking.** Stuart (or a teacher) needs to hand-mark 3+ English Lang scripts before we can assert multi-skill correctness. This is real teacher labour, not a shortcut.
5. **PR-B with the hand-marked fixtures as the gate.** Don't ship multi-skill grading to teachers without the ±1-Level-per-AO eval green.
6. **PR-C after PR-B.** Annotation rewrite is purely additive — consumes data PR-B produces.

UI changes (PR-D territory) come after PR-C, decoupled.

---

## Final notes

- **Don't add `level_of_response_multi_ao`** as a separate enum value. The act is the same; dimensionality is data.
- **Don't store level descriptors as structured DB fields.** They live in `content` markdown. Future board quirks land there too.
- **Don't ship multi-skill grading without hand-marked ground truth.** Repeatability is the moat. A marker that drifts ±5 marks per AO is worse than no multi-skill marker at all.
- **Pre-launch flexibility is a feature, not a free pass.** Every structured field we add now becomes load-bearing. Add on demand, when a real consumer needs it.

If you're picking this up and something here feels wrong: check the conversation history before changing course. The decisions were debated; the reasoning is in the commit history and the CLAUDE.md block.
