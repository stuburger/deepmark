# Build Plan — Annotation Merge Cleanup (2026-04-19)

Follow-up to the refactor that merged the enrichment (annotation) step into the grade Lambda. The merge shipped functional, but left a set of known-dodgy patches, stale names, and misleading UI. This plan picks them up in one coherent sweep.

**Context summary for a fresh chat:** `EnrichmentRun` was dropped. Annotations now run inside `student-paper-grade.ts` per-question (`grade → annotate` inside the `Promise.all` map). The `StudentPaperEnrichQueue`, its DLQ, and the `student-paper-enrich*` handlers are deleted. `StudentPaperAnnotation` now references `grading_run_id` instead of `enrichment_run_id`. Three new columns on `GradingRun`: `annotation_llm_snapshot`, `annotation_error`, `annotations_completed_at`. Data was migrated surgically on both Neon branches (`stuartbourhill` and `production`) — no loss. `db:push` was run against the DB after the Prisma schema change.

The merge PR deliberately kept scope tight and left the items below for this follow-up.

---

## Phase 1 — Correctness

These aren't cosmetic. Do them first.

### 1.1. `annotations_completed_at` is misleading on failure

**Problem.** `packages/backend/src/processors/student-paper-grade.ts` (in `completeGradingJob`) always sets `annotations_completed_at: new Date()` — even when `annotation_error` is non-null. A `completed_at` timestamp on a failed run is a lie; any future consumer that sorts by it or treats it as "was annotation ever attempted" will be misled. `deriveAnnotationStatus` happens to check `annotation_error` first so the status is correct — but that's a happy coincidence.

**Fix.** Only set `annotations_completed_at` when `annotationError === null`. Leave it null on failure.

```ts
// In completeGradingJob's gradingRun.update:
annotations_completed_at: annotationError ? null : new Date(),
annotation_error: annotationError,
```

**Acceptance.** Force an annotation failure (e.g. temporarily throw in `annotateOneQuestion`) and confirm the resulting `GradingRun` row has `annotation_error` set and `annotations_completed_at = NULL`.

---

### 1.2. `persistAnnotations(jobId, jobId, ...)` — same arg twice

**Problem.** The call site passes `jobId` twice because `grading_run_id === submission_id` by migration convention. That invariant lives nowhere in the types. If it ever breaks (e.g. two grading runs per submission) every annotation gets the wrong FK silently.

**Fix.** Tighten the signature so callers don't have to know the invariant. Two options:

- **(Preferred) Look up the submission from the grading run inside the helper:**
  ```ts
  export async function persistAnnotations(
    gradingRunId: string,
    groups: PendingAnnotation[][],
  ): Promise<number> {
    const gr = await db.gradingRun.findUniqueOrThrow({
      where: { id: gradingRunId },
      select: { submission_id: true },
    })
    // ... write with submission_id: gr.submission_id
  }
  ```
  Adds one DB round-trip per call (1 per grading job, not per annotation — fine).

- **(Alternative) Keep both args but assert equality at runtime** with a thrown error. Ugly; prefer the lookup.

**Acceptance.** `persistAnnotations` has a single-arg signature; the grade handler no longer passes `jobId` twice.

---

### 1.3. "Re-annotate" button now triggers a full re-grade — rename/relabel

**Problem.** `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/submission-view.tsx:148` calls `triggerEnrichment(jobId)`. That server action now pushes to `StudentPaperQueue` and re-runs grading + annotation together. Whatever the button's label is ("Re-annotate" / "Generate annotations" / similar), it lies.

**Fix.**
1. Rename the server action: `triggerEnrichment` → `triggerRegrade` in `apps/web/src/lib/marking/stages/mutations.ts`. Update the exported type `TriggerEnrichmentResult` → `TriggerRegradeResult` in `apps/web/src/lib/marking/types.ts`.
2. Find the button in `submission-view.tsx` (and its wiring through `submission-toolbar.tsx` via `onReAnnotate` / `onGenerateAnnotations` props — grep for both). Rename props + the user-visible label to "Re-mark" / "Re-run marking" / similar.
3. Consider whether the button is even still needed: if there's already a "re-run" flow elsewhere, drop this one.

**Acceptance.** No prop, function, type, or label in the UI says "enrichment" or "annotate" when the action is really a full re-grade.

---

### 1.4. Event log shows phantom entries

**Problem.** `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/event-log.tsx:80-82` renders `"Enrichment started"` / `"Enrichment complete"` for job events of those types. The enrich handler was the only emitter of those events — it's deleted — so new submissions never produce them. Old submissions still will.

**Fix.** Two options:

- **(Preferred) Keep the historical cases but stop emitting new ones.** Nothing to do in this file — the cases stay so old logs still render. Add a one-line comment that these event types are historical-only post-April-2026.

- **(Aggressive) Remove the cases and accept that old rows show an "unknown event" fallback.** Only do this if we've decided historical logs don't matter.

**Acceptance.** Either (a) old submission logs still render Enrichment entries, or (b) we've chosen to drop historical rendering. Either way, the decision is documented inline.

---

## Phase 2 — Clear naming

These are pure refactors. All should compile and test green with no behavior change.

### 2.1. `triggerEnrichment` → `triggerRegrade`

Covered by 1.3 — done as part of that task.

---

### 2.2. `gradeAllQuestions` → `gradeAndAnnotateAll`

**Problem.** The function in `packages/backend/src/lib/grading/grade-questions.ts` now returns `{ results, annotationsByQuestion }` but is still called `gradeAllQuestions`. The name lies.

**Fix.** Rename the export. Update the one call site in `packages/backend/src/processors/student-paper-grade.ts`. Also consider renaming `GradeAllQuestionsArgs` / `GradeAndAnnotateOutput` to match.

**Acceptance.** `bun typecheck` clean. `grep -r 'gradeAllQuestions'` returns 0 hits.

---

### 2.3. Extract `deriveAnnotationStatus` into shared helper

**Problem.** The logic that maps `{annotations_completed_at, annotation_error, grading.status}` → `AnnotationStatus` is written twice:
- `apps/web/src/lib/marking/submissions/queries.ts` — as a top-level function
- `apps/web/src/lib/marking/stages/queries.ts` — inlined as a ternary chain

**Fix.** Move the function to `apps/web/src/lib/marking/status.ts` (next to the existing `deriveScanStatus`) and import it from both queries. Also check the admin usage query and the event stream — anywhere that derives "is annotation done" should funnel through the same helper.

**Acceptance.** Only one implementation exists; both callers import it.

---

### 2.4. `lib/enrichment/` → `lib/annotations/` (backend)

**Problem.** `packages/backend/src/lib/enrichment/` is stale naming — the domain concept "enrichment" is gone, but the folder that holds `annotation-prompt.ts`, `annotation-schema.ts`, `deterministic-annotations.ts`, `llm-annotations.ts`, `payload-builder.ts`, `persist-annotations.ts`, `token-spans.ts`, `data-loading.ts`, `types.ts` still has the old name.

**Fix.** `git mv packages/backend/src/lib/enrichment packages/backend/src/lib/annotations`. Grep and update all imports (`@/lib/enrichment/...` → `@/lib/annotations/...`). Touch points: `grade-questions.ts`, `student-paper-grade.ts`, plus any internal self-imports inside the folder.

**Acceptance.** `grep -r 'lib/enrichment' packages/` returns 0 hits. Tests + typecheck green.

---

### 2.5. Tighten `MarkSchemeForAnnotation.marking_method`

**Problem.** `packages/backend/src/lib/enrichment/types.ts` (will be `lib/annotations/types.ts` after 2.4) has:
```ts
export type MarkSchemeForAnnotation = {
  description: string
  guidance: string | null
  mark_points: unknown
  marking_method: string   // ← too loose
  content: string
}
```
The source (Prisma `MarkScheme`) has a real `MarkingMethod` enum. The loose type means downstream comparisons (`method === "point_based"`) are stringly-typed against a closed set that TypeScript could enforce.

**Fix.** Import `MarkingMethod` from `@mcp-gcse/db` and use it. Also consider narrowing `mark_points` with a Zod schema at the boundary (would require parsing — scope creep, defer if large).

**Acceptance.** `marking_method` on this type is `MarkingMethod`; all call sites still compile.

---

### 2.6. Narrow the `try/catch` in `annotateOneResult`

**Problem.** `packages/backend/src/lib/grading/grade-questions.ts:annotateOneResult` wraps the annotate call in a blanket `try { ... } catch (err) { log + return [] }`. That includes `TypeError` / `ReferenceError` from real programming bugs — they get swallowed and just produce zero annotations for that question. The original enrichment handler had the same behavior (`Promise.allSettled`), so we preserved it — but a narrower catch would catch LLM-network errors while letting bugs surface.

**Fix.** Define (or reuse) a predicate that identifies recoverable error types (SDK timeouts, schema-validation failures, `AbortError`, etc.) and re-throw everything else. Keep the best-effort behavior for the recoverable set.

**Acceptance.** An intentional `throw new TypeError("x")` inside the annotation prompt path fails the grade job visibly, not silently.

---

## Phase 3 — UI consistency

Cosmetic but worth a coherent pass. These all stem from the "enrichment" concept still leaking through UI-layer names.

### 3.1. Stage pips — decide 2 or 3

**Problem.** `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/stage-pips.tsx` renders three pips: OCR, Grading, Enrichment. Since grade and annotate now happen in one Lambda and finish in the same transaction, the grading and "enrichment" pips flip green in lockstep. Visually that's two pips turning green at the same moment.

**Options.**

- **(A) Keep three pips** — the third one still conveys independent annotation-failure status. `annotation_error` can be set while grading succeeded. Recommend this if annotation failure is a state worth surfacing distinctly to teachers.

- **(B) Collapse to two** — OCR + Marking. Simpler. Accepts that annotation failure blends into "marking had a partial failure". If we collapse, also remove the `enrichment` stage from the stages schema (`apps/web/src/lib/marking/stages/schema.ts`, `types.ts`, `phase.ts`, `sse-utils.ts`, `transitions.ts`) — significant touch surface.

**Recommendation.** (A) for now. Teacher trust matters; annotation failure without grading failure is a real state and deserves its own pip. Revisit if user testing shows confusion.

**If keeping (A):** still rename the stage key from `"enrichment"` to `"annotation"` internally — see 3.2.

---

### 3.2. Rename stage key `"enrichment"` → `"annotation"` (web)

**Problem.** Even though the user-visible label is "Annotation" (`apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/stage-pip.tsx:15` maps `enrichment: "Annotation"`), the internal key is still `"enrichment"` throughout the web stages layer.

**Fix.** Global find-and-replace inside `apps/web/src/lib/marking/stages/`: rename the `enrichment` object key to `annotation` in:
- `types.ts` (`StageKey`, `JobStages`)
- `schema.ts` (Zod schema)
- `queries.ts` (build the result object)
- `transitions.ts` (`onEnrichmentComplete` → `onAnnotationComplete`, comparisons `prev.enrichment.status` → `prev.annotation.status`)
- `sse-utils.ts` (stage fingerprint)
- `phase.ts` (comments)
- `use-job-stream.ts` (passes `next.enrichment.status`)

Also update the event stream in `apps/web/src/app/api/submissions/[jobId]/events/route.ts`, the stage-pip component (`stage-pip.tsx`), and `submission-data` hook (`use-submission-data.ts`). And the tests (`stages-transitions.test.ts`, `stages-schema.test.ts`, `stages-derive.test.ts`).

**Acceptance.** `grep -rn '\benrichment\b' apps/web/src/lib/marking` returns only intentional references (e.g. migration notes); internal stage key is `"annotation"` everywhere.

---

### 3.3. Rename UI prop: `enrichmentSnapshot` → `annotationSnapshot`

**Problem.** `LlmSpendButton` takes an `enrichmentSnapshot` prop (`apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/results/llm-snapshot-panel.tsx:204` declares it). Call site in `submission-toolbar.tsx:128` passes `data.annotation_llm_snapshot` — the prop name no longer matches the data.

**Fix.** Rename the prop. Update the panel internals that reference the snapshot.

**Acceptance.** Prop name matches what it receives.

---

### 3.4. Rename UI prop: `onEnrichmentAnnotationClick` → `onAnnotationClick`

**Problem.** `apps/web/src/components/BoundingBoxViewer.tsx` has `onEnrichmentAnnotationClick` — "Enrichment annotation" is redundant (annotations are all annotations now) and stale.

**Fix.** Rename to `onAnnotationClick`. Update callers (`annotated-scan-column.tsx`).

---

### 3.5. Admin usage — stage label "Enrichment" → "Annotation"

**Problem.** Multiple admin-usage files still use `"enrichment"` as a stage key and "Enrichment" as a display label:
- `apps/web/src/lib/admin/usage/queries.ts` — the `stage` union type and the `"enrichment" as const` literal
- `apps/web/src/lib/admin/usage/types.ts` — `enrichment_tokens` field on `UsageByDate`
- `apps/web/src/app/admin/usage/_components/tokens-by-stage-chart.tsx` — `enrichment: "Enrichment"` label
- `apps/web/src/app/admin/usage/_components/usage-over-time-chart.tsx` — `enrichment_tokens` chart config
- `apps/web/src/app/admin/usage/_components/recent-runs-table.tsx` — `enrichment` badge variant
- `apps/web/src/app/admin/usage/page.tsx:39` — description text "OCR, grading, and enrichment"

**Fix.** Rename stage key and token field to `"annotation"` / `annotation_tokens`. Update labels to "Annotation".

**Note.** `LlmCallSite.phase` in Prisma schema still documents `"enrichment"` as a valid phase (comment on `schema.prisma:784`). That's a call-site classifier for which LLM prompts have which config — the annotation prompts may or may not still be tagged `phase: "enrichment"` in the DB. Check `db.llmCallSite.findMany()` and update phase values there too if they exist. If we don't use `phase` for filtering anywhere load-bearing, this is cosmetic; if we do, coordinate the rename with the DB row update.

**Acceptance.** Admin dashboard still renders correctly; stage chip reads "Annotation" not "Enrichment".

---

### 3.6. Delete stale reference in `IMPLEMENTATION-NOTES.md`

`apps/web/src/lib/marking/alignment/IMPLEMENTATION-NOTES.md:98` talks about `enrichment_run_id: "teacher"`. The field was renamed to `grading_run_id` and the teacher flag lives in the `source` column. Update or delete that note.

---

## Phase 4 — Hardening (optional but recommended)

### 4.1. Verify LLM snapshot isolation between grading and annotation runners

**Why.** The grade Lambda creates two `LlmRunner` instances (one for grading, one for annotation) and writes them to separate `GradingRun` columns (`llm_snapshot`, `annotation_llm_snapshot`). In theory each runner only records the call sites it actually used. In practice I didn't verify that — if the `LlmRunner` implementation accidentally tracks all known call sites per runner, the grading snapshot could contain annotation-only call sites (and vice versa), inflating admin analytics.

**Fix.** Run a grading job against a real LoR paper. Inspect the resulting `GradingRun` row: `llm_snapshot.selected` should only list call sites that grading actually uses (`grading:lor`, `grading:point_based`, `grading:mcq`, `grading:examiner_summary`, etc.); `annotation_llm_snapshot.selected` should only list annotation call sites. If they overlap, tighten the runner scope.

**Acceptance.** Documented observation that the two snapshots are disjoint.

---

### 4.2. Targeted test for `deriveAnnotationStatus`

After 2.3 extracts the helper, add a unit test covering: `{ annotations_completed_at: non-null, annotation_error: null }` → "complete"; `{ annotation_error: non-null }` → "failed"; `{ grading.status: "processing" }` → "processing"; and the `null` grading case → `null`.

---

## Phase 5 — Verification

Run once after everything above lands:

1. `bun typecheck` — backend and web clean.
2. `bun check` — no new biome violations vs. baseline.
3. `bun test:unit` — all pass.
4. `bun test:integration` (web + backend projects) — all pass.
5. Real end-to-end: grade a fresh LoR paper via the UI. Confirm:
   - Stage pips transition correctly (OCR → Marking → Annotation, or OCR → Marking if you collapsed).
   - Annotations render on the scan.
   - `GradingRun` row has both `llm_snapshot` and `annotation_llm_snapshot` populated.
   - Admin usage dashboard shows the new stage name.
   - `Re-mark` button (post-rename) re-runs grading + annotation.
   - Event log entries render for a new submission (no phantom Enrichment entries unless historical).

---

## What's explicitly NOT in this plan

- Grader emits an annotation plan directly (the bigger cognitive-task-merge refactor discussed before the minimal merge landed). That's a separate design conversation.
- WWW / WW / EBI feedback-format schema change. Separate PR.
- Passing `why_not_next_level` / `cap_applied` into the annotation prompt. Separate PR — addresses the original drift concern.
- Attribution eval changes. Untouched; evals still gate `student-paper-extract.ts` changes only.

---

## Suggested PR split

Three coherent PRs, in order:

- **PR A (correctness):** 1.1, 1.2, 1.3, 1.4. Small, merge-ready.
- **PR B (backend naming):** 2.1–2.6 together. Most of the `git mv` happens here. Single typecheck/green pass at the end.
- **PR C (UI naming):** 3.1–3.6 + Phase 4 + Phase 5. Largest surface; do after B to avoid double-touching files.

If Phase 3.1 goes the collapse-to-2-pips route, split that out as its own PR — it's the only item with actual semantic behavior change.
