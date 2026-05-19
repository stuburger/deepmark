# Build plan — persist grading payload to the DB (Option C, hybrid)

**Date:** 2026-05-19
**Owner:** Stuart
**Status:** Proposed
**Related:**
- Unblocks `docs/build-plan-2026-05-18-annotation-llm-phrase-anchoring.md` (rework needs structured grading payloads available outside the PM doc)
- Builds on the existing `marking_results` table — extends the dual-write pattern already in place for most LoR fields

## Context

`packages/shared/src/editor/question-answer-node-schema.ts:16-72` defines the `questionAnswer` block node, which carries the entire per-question grading payload as PM node attributes. Most of these fields are already mirrored to the `marking_results` row written by the grading Lambda, but **four are PM-doc-only** today:

| Field on `questionAnswer.attrs` | In `marking_results` today? |
|---|---|
| `awardedScore` | ✓ (`total_score`) |
| `markingMethod` | ✓ (via `mark_schemes.marking_method`) |
| `llmReasoning` | ✓ |
| `feedbackSummary` | ✓ |
| **`whatWentWell`** | **✗** |
| **`evenBetterIf`** | **✗** |
| `markPointsResults` | ✓ (jsonb) |
| `levelAwarded` | ✓ |
| `whyNotNextLevel` | ✓ |
| `capApplied` | ✓ |
| **`aoAwards`** | **✗** |
| **`teacherOverride`** | **✗** |
| **`teacherFeedbackOverride`** | **✗** |

### Why this is a problem

The PM doc is the SOURCE OF TRUTH for what teachers see and edit; the DB row is the queryable mirror. The dual-write was applied consistently for most fields, but skipped for these four. Concrete consequences we've hit (or will hit):

1. **Evals can't access AO awards.** The annotation eval suite needed `ao_awards` to drive LoR fixtures; had to be hand-authored because no SQL query could reach the data. (Documented in `docs/build-plan-2026-05-18-annotation-llm-phrase-anchoring.md`.)
2. **Teacher-override analytics blocked.** "What's the AI/teacher disagreement rate per AO?" requires parsing every Yjs doc. Untenable at scale.
3. **Annotation pipeline depends on in-memory `GradingResult`.** Re-running annotation against historical data needs reconstructing AO awards from the doc — expensive and error-prone.
4. **CLAUDE.md schema rule violated.** Quote: *"Structure ONLY what you'll programmatically operate on. Mark counts (sum, percent), **AO codes (group, aggregate)**, marking method (dispatch)… — these earn typed columns and Zod fields."* AO codes are explicitly called out.

### What "the DB is canonical for queries; the doc is canonical for edits" means

- **Grader writes to BOTH** the `marking_results` row AND the PM doc on completion. They start identical.
- **Teacher edits write to BOTH** the doc (immediately, via Yjs) AND the DB row (via the projection Lambda watching doc changes). This pattern already exists for `awardedScore` / `feedbackSummary` overrides — we'd extend it.
- **Conflict resolution:** the doc always wins. The DB row is a projection. If they diverge, the projection re-syncs from the doc, never the other way.

This is *not* a from-scratch redesign — it's making the existing dual-write pattern complete.

## Goal

Land typed columns + projection logic for the four PM-doc-only fields so that:

1. Every `marking_results` row contains a complete grading payload after the grade Lambda finishes.
2. Teacher overrides land in the DB row within seconds of the edit (via the existing projection path).
3. Annotation pipeline can read its inputs from the DB row, not just an in-memory `GradingResult`.
4. SQL queries can answer questions like "how often does the teacher override AI marks?", "which AO descriptors are most often not-met at Level 3?", "what's the WWW/EBI distribution for Q6 across all English papers?"

## Non-goals

- Removing fields from the PM doc. The doc stays canonical for editing. We're adding mirrors to the DB, not moving fields out.
- Backwards compatibility for older `marking_results` rows. Pre-launch — re-grade if needed.
- Migrating the existing `mark_points_results` jsonb shape (already works).
- Building the analytics dashboards that consume this data. Out of scope; we're just laying the data foundation.

## Schema design — Option C (hybrid)

Per CLAUDE.md "Structure what you'll programmatically operate on", the split is:

| Field | New column | Type | Rationale |
|---|---|---|---|
| `aoAwards` | `ao_awards` | `jsonb` | Multi-AO, multi-descriptor — too nested for flat columns. Queryable via jsonb path operators (`ao_awards @> '[{"ao_code": "AO5"}]'`). |
| `whatWentWell` | `what_went_well` | `text[]` | Postgres array. Short strings, fixed shape. |
| `evenBetterIf` | `even_better_if` | `text[]` | Same as above. |
| `teacherOverride` | split into 4 cols: `teacher_override_score` (int), `teacher_override_reason` (text), `teacher_override_set_by` (text → user id), `teacher_override_set_at` (timestamp) | mixed | Each is queryable individually. The override is an audit-trail concept; structure earns its keep. |
| `teacherFeedbackOverride` | `teacher_feedback_override` | `text` | Simple text field. |

**Why jsonb for `ao_awards` specifically:** the shape varies per question (single AO vs multi-AO), and `descriptor_evaluations` is a variable-length nested array. Flat columns would explode (`ao1_level_awarded`, `ao1_awarded_marks`, `ao1_descriptor_1_met`, …) and break for any future board that uses different AO codes. The Zod schema in `packages/shared/src/grading/schemas.ts` already validates the shape; we trust the LLM output via Zod parse, not via schema columns.

**Why not a single `grading_payload jsonb` blob (Option B):** loses query power — and we explicitly want to be able to filter on `teacher_override_set_at IS NOT NULL`, group by AO code, etc. The hybrid earns its columns.

### Index recommendations

- `marking_results(teacher_override_set_at)` partial index `WHERE teacher_override_set_at IS NOT NULL` — for "which results have been overridden" queries.
- GIN index on `marking_results(ao_awards jsonb_path_ops)` — for AO-code lookups.

Both are cheap; add at column-add time.

## Change scope

### 1. Prisma schema

`packages/db/prisma/schema.prisma`:

```prisma
model MarkingResult {
  // ... existing columns
  ao_awards                   Json?    @db.JsonB
  what_went_well              String[]
  even_better_if              String[]
  teacher_override_score      Int?
  teacher_override_reason     String?
  teacher_override_set_by     String?
  teacher_override_set_at     DateTime?
  teacher_feedback_override   String?

  @@index([teacher_override_set_at])
  @@index([ao_awards(ops: JsonbPathOps)], type: Gin)
}
```

Push via `bun db:push` per the project's no-migrate convention.

### 2. Grader write path

`packages/backend/src/lib/grading/grade-questions.ts`:

The grader already produces `GradingResult` with all the fields. The lambda's incremental DB write path (`updateMarkingResult` or similar) needs to include the new fields.

```ts
await db.markingResult.upsert({
  where: { ... },
  create: {
    // existing fields
    ao_awards: r.ao_awards ?? [],
    what_went_well: r.what_went_well ?? [],
    even_better_if: r.even_better_if ?? [],
    // teacher_override_* stay null at grade time
  },
  update: { /* same */ },
})
```

### 3. Projection Lambda — doc → DB write back

When the teacher edits override fields in the doc, the projection path mirrors them into the DB row. Pattern already exists for `teacherOverride.score` on the projection side; extend to cover `teacherFeedbackOverride` and any AO override.

Verify the projection diff logic in `packages/backend/src/processors/` correctly flattens `teacherOverride` (object) into the 4 columns. Add unit tests.

### 4. Annotation pipeline — read from DB

`packages/backend/src/lib/annotations/annotate-result.ts` and friends:

Today the annotation pipeline relies on an in-memory `GradingResult`. After this change, it can also be invoked from a queue/cron with just a `marking_result_id` — load row, build a synthetic `GradingResult`, run annotation. Useful for re-running annotation against historical data.

This isn't strictly required for the LoR eval fixture work, but it's the payoff that proves the migration was worth it.

### 5. Unit tests

- `packages/backend/tests/unit/grading-result-projection.test.ts` (new or extended): verify the in-memory `GradingResult` → DB row mapping is lossless.
- `packages/backend/tests/unit/teacher-override-projection.test.ts` (new): verify Yjs doc override → DB column projection.

## Backfill

**Decision: don't backfill.** Pre-launch, no real users, no historical data worth preserving. Re-grade if needed.

If backfill becomes useful later (e.g. for a demo), the path is:
1. Iterate `marking_results` rows where `ao_awards IS NULL`.
2. Load the corresponding submission's PM doc snapshot from S3 (or Hocuspocus persistence).
3. Parse `questionAnswer` node attrs.
4. Write back to the DB row.

Estimated 100 LOC; ship if/when needed.

## Order of operations

| Step | Risk | Effort |
|---|---|---|
| 1. Add columns to schema; `bun db:push` | Low | 5 min |
| 2. Update grader write path to populate new columns | Low | 15 min |
| 3. Update projection path to mirror teacher overrides | Medium | 30 min — depends on existing projection diff structure |
| 4. Add unit tests for both projections | Low | 30 min |
| 5. Validate end-to-end: grade a fresh submission, verify all fields populated; teacher edits override, verify DB updates | Medium | 30 min |
| 6. Update LoR eval fixture loader to source `ao_awards` from DB instead of hand-author | Low | 15 min |
| 7. (optional) Add typed read path for annotation pipeline | Low-Medium | 60 min |

**Total estimate: 2-3 hours of focused work, no LLM cost.**

## Acceptance criteria

1. **Grade a fresh submission** (Pearson English Lang Q6 or similar LoR). After the grade Lambda finishes:
   - `marking_results.ao_awards` is non-null and contains the same data as the PM doc's `aoAwards` attr.
   - `what_went_well` / `even_better_if` arrays match the doc's `whatWentWell` / `evenBetterIf` arrays.
   - `teacher_override_*` columns are all null (no override yet).
2. **Teacher applies an override** through the editor:
   - PM doc `teacherOverride` attr updates immediately (Yjs propagation).
   - Within ~3s, `marking_results.teacher_override_score` / `_reason` / `_set_by` / `_set_at` columns reflect the override.
3. **SQL queries that didn't work before now do:**
   - `SELECT COUNT(*) FROM marking_results WHERE teacher_override_set_at IS NOT NULL` returns the override count.
   - `SELECT id, ao_awards FROM marking_results WHERE ao_awards @> '[{"ao_code": "AO5", "level_awarded": 2}]'` returns matching rows.
4. **LoR annotation eval fixture loader** is rewritten to pull `ao_awards` from `marking_results` via SQL instead of hand-authoring. New fixture for Jaufferdeen Q6 (or equivalent) lives as JSON + a `fixture.ts` reference, not a TS literal.
5. **No regression** in existing tests — `bun test:unit`, `bun test:integration`, attribution evals, annotation evals all green.

## Files to touch

| File | Change |
|---|---|
| `packages/db/prisma/schema.prisma` | Add 7 new columns + 2 indexes on `MarkingResult` model |
| `packages/backend/src/lib/grading/grade-questions.ts` (and/or `complete-grading-job.ts`) | Include `ao_awards`, `what_went_well`, `even_better_if` in the DB upsert |
| `packages/backend/src/processors/` (projection path — locate exact file when starting) | Extend the doc-attr → DB-row diff to cover teacher overrides |
| `packages/backend/tests/unit/projection-diff.test.ts` (existing) | Add cases for the new fields |
| `packages/backend/tests/unit/` | New test file for teacher-override projection if not already covered |
| `packages/backend/tests/integration/fixtures/annotations/` | After landing, rewrite LoR fixture loader to query DB instead of literal TS |

**Files explicitly NOT touched:**
- `packages/shared/src/editor/question-answer-node-schema.ts` — PM doc remains source of truth for edits; we're not removing fields.
- `packages/shared/src/grading/schemas.ts` — Zod schema unchanged; the grader still produces the same `GradingResult` shape.
- Front-end editor components — they keep reading from the PM doc.

## Risks and watch-outs

- **Projection lag for teacher overrides.** The Yjs → DB projection happens in the projection Lambda; latency is ~1-3s. Acceptable for analytics but not for transactional reads. Document this in the eval fixture loader if it polls.
- **Type drift between `GradingResult.ao_awards` (Zod) and `marking_results.ao_awards` (jsonb).** Mitigation: the load path re-parses with the Zod schema (`packages/shared/src/grading/schemas.ts`) at read time. A schema mismatch surfaces as a parse error, not a silent corruption.
- **Override semantics — partial override.** What does `teacher_override_score` mean if the teacher overrides per-AO but not the total? Current PM doc shape stores total only. Defer per-AO override to a follow-up; today's `teacherOverride` is total-score-only.
- **Yjs persistence subtlety.** Some PM doc attrs are set via Yjs `Map.set()` directly; the projection path needs to listen to those specific transactions. Verify against existing pattern for `awardedScore` overrides before extending.
- **GIN index size.** A GIN on `ao_awards jsonb_path_ops` will grow with submission count. Probably fine pre-launch; revisit if write throughput suffers post-launch.

## Out of scope

- Per-AO teacher overrides (today only total-score override exists).
- Migrating `mark_points_results` to a different shape (already works).
- Building analytics dashboards on top of the new columns.
- Soft-delete / audit-log of overrides (only current state is mirrored).
- Multi-revision history of marks (PM doc has Yjs history; DB is current-state only).

## Why now (and why not sooner)

This is the cleanest moment:
- Pre-launch, so no historical data to backfill.
- The annotation eval fixture work this session surfaced the gap concretely. We KNOW what we want to query.
- The phrase-anchoring rework (`docs/build-plan-2026-05-18-annotation-llm-phrase-anchoring.md`) is the next big piece of work; doing it on top of complete DB persistence is much cleaner than re-deriving AO awards from PM docs.

Wait too long and:
- Real submissions accumulate, backfill becomes mandatory.
- Annotation pipeline gets more entangled with the in-memory `GradingResult` shape.
- Teacher-override analytics question gets answered with "we don't track that" until a quarter goes by.

## Open questions for Stuart

1. **Index strategy:** add GIN on `ao_awards` now, or wait until query patterns surface? Recommended: add now, it's cheap.
2. **Backfill of in-flight submissions:** any submissions you want to preserve? Recommended: none, re-grade if needed.
3. **Read path for annotation pipeline:** rewrite to load from DB row (step 7), or keep in-memory `GradingResult` flow as today? Recommended: keep in-memory for the live grading path (no extra DB hop); add a DB-loaded variant for re-run / replay scenarios.
4. **Should `teacherOverride` projection use a separate `teacher_overrides` table** (with submission_id, question_id FK, audit columns) instead of inline columns? Recommended: inline for now, normalise later if multi-revision audit is needed.

---

| When | What | Why |
|---|---|---|
| this turn | Build plan written to `docs/build-plan-2026-05-19-grading-payload-db-persistence.md` | Stuart asked for a build plan to capture Option C (hybrid schema) so we can return to it after the LoR fixture work. Self-contained — covers schema design, change scope, backfill stance, acceptance criteria, and 4 open questions for resolution at implementation time. |
| Pre-existing (`question-answer-node-schema.ts:16-72`) | `questionAnswer` block node carries 13 grading-related attrs; 4 are PM-doc-only | The exact list of what's missing from `marking_results`. Documented in the plan so the next agent doesn't re-derive it. |
| Pre-existing (CLAUDE.md "Structure ONLY what you'll programmatically operate on") | AO codes called out explicitly as data deserving typed columns | The plan cites this as the justification for promoting `ao_awards` to a column (hybrid; not a single grading_payload jsonb blob). |
| **Open — next** | Build LoR eval fixture with hand-authored `ao_awards` for now (per Stuart's earlier ack); execute this plan as a separate session when ready | Plan supersedes the "hand-authored is forever" implication — the fixture loader will be rewritten to source from DB once this lands. |
