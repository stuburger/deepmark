# Build Plan — Annotation Merge Polish (2026-04-19, follow-up)

Follow-up to `docs/build-plan-2026-04-19-annotation-cleanup.md`. That plan landed the correctness + naming sweep after the enrichment→grade merge. During that work a handful of weak spots were deliberately left alone — this plan picks them up.

**Context summary for a fresh chat.** The `EnrichmentRun` model and `StudentPaperEnrichQueue` are gone. Annotations run inside `packages/backend/src/processors/student-paper-grade.ts` per-question, in the same `Promise.all` as grading. Per-question annotation lives in `annotateOneResult` inside `packages/backend/src/lib/grading/grade-questions.ts`. The folder `packages/backend/src/lib/annotations/` holds prompts, schema, deterministic helpers, LLM helpers, persist, data-loading, types. The web stage key is `annotation` everywhere; the UI pip cluster still shows 3 pips (OCR / Grading / Annotation).

All items below were validated by `bun typecheck` + unit tests in the parent chat. Everything compiled before and compiles after — these are pure improvements.

---

## Phase 1 — Misfiled code (DDD)

### 1.1. Move annotation helpers out of `lib/grading/`

**Problem.** `packages/backend/src/lib/grading/grade-questions.ts:173` defines `annotateOneResult` and `packages/backend/src/lib/grading/grade-questions.ts:226` defines `isRecoverableAnnotationError`. Both are annotation concerns — they only live in the grading file because `gradeAndAnnotateAll` is the single in-flight point that ties the two together. As a result, `grade-questions.ts` is ~440 lines and crosses a domain boundary.

**Fix.** Extract to `packages/backend/src/lib/annotations/annotate-result.ts`. Export `annotateOneResult` (plus its `AnnotateOneResultArgs` type) and keep `isRecoverableAnnotationError` as an internal helper in the same file. Update the import in `grade-questions.ts`.

Expected shape:

```ts
// packages/backend/src/lib/annotations/annotate-result.ts
import type { AnnotationContext } from "./data-loading"
import { deterministicMcqAnnotation, pointBasedAnnotations } from "./deterministic-annotations"
import { annotateOneQuestion } from "./llm-annotations"
import type { PendingAnnotation } from "./types"
import type { GradingResult } from "@/lib/grading/grade-questions"
import type { MarkScheme } from "@/lib/grading/question-list"
import { logger } from "@/lib/infra/logger"
import type { LlmRunner } from "@mcp-gcse/shared"

type AnnotateOneResultArgs = { ... }
export async function annotateOneResult(args: AnnotateOneResultArgs): Promise<PendingAnnotation[]> { ... }
function isRecoverableAnnotationError(err: unknown): boolean { ... }
```

Watch for the circular-import risk: `annotate-result.ts` imports `GradingResult` from `lib/grading/grade-questions.ts`, and `grade-questions.ts` will import `annotateOneResult` back. TypeScript handles type-only circulars fine, but keep the `GradingResult` import as `import type` to be safe.

**Acceptance.** `grade-questions.ts` is under 400 lines. `annotateOneResult` is exported from `lib/annotations/`. `bun typecheck` and unit tests green.

---

### 1.2. Split `completeGradingJob` into focused sub-functions

**Problem.** `packages/backend/src/processors/student-paper-grade.ts:231` `completeGradingJob` is ~90 lines doing six things:

1. Compute totals
2. Update `student_name` on submission (if OCR extracted one)
3. Persist annotations, track failure as `annotationError`
4. Update the `GradingRun` row (status, results, summary, annotation bookkeeping)
5. Log the `grading_complete` event
6. Persist per-question answer rows
7. Check/trigger batch completion

One function, many reasons to change.

**Fix.** Split into (roughly):

```ts
async function completeGradingJob(args) {
  await updateStudentNameIfExtracted(args)
  const annotationError = await persistAnnotationsBestEffort(args)
  await markGradingRunComplete({ ...args, annotationError })
  await persistAnswerRowsIfLinked(args)
  await notifyBatchIfComplete(args)
}
```

Each helper takes what it actually needs (not the whole bag). Keep the `completeGradingJob` shell as the orchestration point — it reads linearly and documents the full lifecycle at a glance.

**Acceptance.** No helper is longer than ~20 lines. `completeGradingJob` body reads as a sequence of named steps. No behaviour change.

---

## Phase 2 — Loose types

### 2.1. Type `PendingAnnotation.payload` as the shared discriminated union

**Problem.** `packages/backend/src/lib/annotations/types.ts:9`:

```ts
export type PendingAnnotation = {
  ...
  payload: Record<string, unknown>
  ...
}
```

The real shape is the discriminated union `AnnotationPayload | ChainPayload` from `@mcp-gcse/shared`. `Record<string, unknown>` forces the `as Prisma.InputJsonValue` cast in `persist-annotations.ts:29` and prevents type-narrowing at construction sites (deterministic helpers, LLM handler).

**Fix.** Import the union types:

```ts
import type { AnnotationPayload, ChainPayload, OverlayType } from "@mcp-gcse/shared"

export type PendingAnnotation =
  | { overlayType: "annotation"; payload: AnnotationPayload; ... }
  | { overlayType: "chain"; payload: ChainPayload; ... }
```

(Or keep the base-type approach with a discriminated payload, matching the web-side `StudentPaperAnnotation` shape in `apps/web/src/lib/marking/types.ts:113`.)

Audit the constructors — `deterministic-annotations.ts`, `llm-annotations.ts` — and let TS catch any shape drift.

**Acceptance.** `lib/annotations/persist-annotations.ts:29` no longer needs `as Prisma.InputJsonValue` for typing reasons (Prisma's JSON constraint may still require it; a narrower helper is acceptable). Construction sites pass typed payloads.

---

### 2.2. Propagate `MarkingMethod` to the prompt builder

**Problem.** The previous cleanup tightened `MarkSchemeForAnnotation.marking_method` from `string` to `MarkingMethod` (`lib/annotations/types.ts:27`), but the downstream prompt builder still uses the loose type:

```ts
// packages/backend/src/lib/annotations/annotation-prompt.ts:21
markingMethod: string
```

So the type tightening stops at the call site; the prompt function still accepts anything stringy.

**Fix.** Replace `string` with `MarkingMethod` on the prompt builder's argument type. Import from `@mcp-gcse/db`.

**Acceptance.** `bunx tsc --noEmit` rejects `markingMethod: "banana"` at the prompt call site.

---

### 2.3. Parse `mark_points` at the annotation boundary

**Problem.** `MarkSchemeForAnnotation.mark_points: unknown` (`lib/annotations/types.ts:25`). The LLM handler calls `parseMarkPointsFromPrisma(markScheme.mark_points)` each time to turn it into a typed `MarkPoint[]`. The type lies about the actual shape after parse.

**Fix.** Either:

- **(Preferred) Parse once upstream.** Do the parse in `loadAnnotationContext` / the call site that builds `MarkSchemeForAnnotation`, and type the field as `MarkPoint[]`. The LLM handler then just reads a typed array.
- **(Alternative) Narrow the field with a Zod schema.** Defer — the upstream parse is less invasive.

Audit: the same `parseMarkPointsFromPrisma` call also exists in `lib/annotations/llm-annotations.ts:51` — would be removed.

**Acceptance.** `mark_points` is typed as `MarkPoint[]` end-to-end inside the annotation domain.

---

## Phase 3 — Duplication

### 3.1. Shared `ANNOTATION_BOOKKEEPING_SELECT` for grading-run reads

**Problem.** Two queries hand-write the same Prisma select shape:

- `apps/web/src/lib/marking/submissions/queries.ts` (look for the `grading_runs` include with `annotation_error`, `annotations_completed_at`, `annotation_llm_snapshot`)
- `apps/web/src/lib/marking/stages/queries.ts:37-45`

Future field additions (e.g. `annotation_cost`, `annotation_started_at`) need to remember to touch both.

**Fix.** Extract a shared Prisma select helper in `apps/web/src/lib/marking/status.ts` (or a new `apps/web/src/lib/marking/selects.ts`):

```ts
export const ANNOTATION_BOOKKEEPING_SELECT = {
  status: true,
  error: true,
  started_at: true,
  completed_at: true,
  annotation_error: true,
  annotations_completed_at: true,
  annotation_llm_snapshot: true,
} as const satisfies Prisma.GradingRunSelect
```

Import from both call sites. The `satisfies` keeps it narrow without losing the literal types.

**Acceptance.** Adding a field to annotation bookkeeping requires touching one file. `bun typecheck` clean.

---

## Phase 4 — Recoverable-error guesswork

### 4.1. Verify `isRecoverableAnnotationError` against real SDK errors

**Problem.** `packages/backend/src/lib/grading/grade-questions.ts:226` (will move under 1.1) re-throws `TypeError` / `ReferenceError` / `SyntaxError` / `RangeError` on the theory those are programming bugs. But the theory is unverified. If `@ai-sdk/google` or Zod emits a `TypeError` for a malformed LLM response (plausible — deep object accesses on undefined values, schema narrowing after bad coerce), the whole grade job crashes instead of losing one question's annotations.

The previous behaviour (blanket catch) was too loose; the new behaviour may be too tight. We don't know which side we're on.

**Fix.**

1. **Observation step.** Intentionally force annotation failures against a real LoR paper and inspect the error types:
   - Malformed prompt (truncated mid-token).
   - Zod schema mismatch (change the LLM response schema to require an impossible field).
   - Gemini timeout (set the SDK timeout to 1ms).
   - Malformed JSON (inject a bad parse in `llm-annotations.ts`).

   Log the `err.constructor.name` for each. This is the ground truth.

2. **Refine the predicate.** Based on the observation, one of:
   - Keep the current logic if the SDK only throws `Error` / `ZodError` for transient issues.
   - Whitelist specific error class names (e.g. `"AbortError"`, `"ZodError"`, `"APIError"`) instead of blacklisting a few programming-bug classes. Whitelist is safer — unknown error types default to "recoverable = false" and surface bugs.

3. **Unit test.** Add `packages/backend/src/lib/annotations/__tests__/annotate-result.test.ts`:

```ts
describe("isRecoverableAnnotationError", () => {
  it("re-throws programming errors", () => { ... })
  it("swallows SDK timeouts", () => { ... })
  it("swallows Zod validation errors", () => { ... })
  it("swallows generic Errors (safe default)", () => { ... })
  // Or: it("re-throws unknown error classes (whitelist approach)", ...)
})
```

**Acceptance.** The predicate is documented with comments citing the observed error classes. A unit test pins the behaviour. The observation notes live as a code comment on the predicate (so the next person doesn't redo the archaeology).

---

## Phase 5 — UX clarity

### 5.1. Distinguish `triggerRegrade` vs `retriggerGrading` for teachers

**Problem.** The Re-run dropdown (`apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/results/re-run-menu.tsx`) now offers:

- **Re-scan** — `retriggerOcr`, creates new submission version
- **Re-grade** — `retriggerGrading`, creates new submission version
- **Re-run marking** — `triggerRegrade`, in-place on current submission

The two "re" options have subtly different semantics. A teacher who clicks "Re-grade" and then sees "Re-run marking" as a separate option will be confused about which to use. No label difference communicates the version-creation behaviour.

**Fix.** Pick one of:

- **(Preferred) Collapse.** Delete `triggerRegrade` + the "Re-run marking" menu item. Teachers regrade via "Re-grade" which already produces a new superseded version (the safer, history-preserving default). The in-place path was a carryover from the old dedicated enrichment queue — with annotation folded in, there's no longer a reason to support both.

- **(Alternative) Label the difference.** Rename menu items to communicate version behaviour:
  - "Re-grade (new version)" — creates history
  - "Re-run marking (same version)" — destructive, overwrites

  Less clean but keeps the in-place option if there's a use case (e.g. a 5th iteration during active debugging where the teacher doesn't want another version).

**Recommendation.** Collapse. The in-place option was an artefact of queue design; it doesn't serve a teacher workflow that "Re-grade" can't cover.

**Acceptance.** Either a single re-run path exists, or the two paths are labelled with their versioning semantics.

---

### 5.2. Rename `onAnnotationClick` → `onGradedRegionClick`

**Problem.** `apps/web/src/components/BoundingBoxViewer.tsx:53` has two click props that are both "about annotations":

- `onAnnotationClick?: (questionNumber: string) => void` — triggered by clicks on grading-result region overlays (the awarded-score boxes)
- `onMarkClick?: (questionId: string) => void` — triggered by clicks on per-mark overlays (ticks, crosses, etc.)

The previous cleanup renamed `onEnrichmentAnnotationClick` → `onMarkClick` to avoid the name collision, but it left `onAnnotationClick` as-is. That name is still misleading — "annotation" now canonically means the mark overlays, not the grading regions.

**Fix.** Rename `onAnnotationClick` → `onGradedRegionClick` (plus the matching prop on `ScanPanel`, `AnnotatedScanColumn`, and `GradingAnnotationOverlay`). That name describes what the click actually targets (a graded answer region), separate from mark clicks.

Watch surface: ~8 files based on the previous grep.

**Acceptance.** No prop in the scan-viewer chain is called "annotation" unless it refers to a `StudentPaperAnnotation`. Callers pass through consistently.

---

## Phase 6 — Verification

Run once after everything above lands:

1. `bun typecheck` — backend and web clean.
2. `bun check` — no new biome violations above the current baseline (note: there's already a pre-existing floor of unrelated issues in `packages/backend/src/tools/**`).
3. `bun test:unit` + `bunx vitest run --project web:unit` — all pass. The new `annotate-result.test.ts` from 4.1 runs.
4. Manually grade a real LoR paper and confirm:
   - Annotations render on the scan as before.
   - Forcing an annotation failure (e.g. temporarily throw an `Error` in `annotateOneResult`) leaves the grade intact and flips `annotation_status` to `"failed"` in the UI.
   - Forcing a `TypeError` (whitelist dep — see 4.1) surfaces as a job failure, not a silent empty-annotations result.

---

## What's explicitly NOT in this plan

- Grader emits an annotation plan directly (bigger cognitive-task-merge refactor). Still a separate design conversation.
- WWW / WW / EBI feedback-format schema change. Separate PR.
- Passing `why_not_next_level` / `cap_applied` into the annotation prompt. Separate PR.
- Collapsing the 3-pip stage cluster to 2 (OCR + Marking). Earlier plan's 3.1 option B. Still not recommended until user testing justifies it.

---

## Suggested PR split

Three coherent PRs:

- **PR A (DDD + types):** 1.1, 1.2, 2.1, 2.2, 2.3. Largest surface — single typecheck pass at the end. Most of the risk is in 2.1 (discriminated payload) and 2.3 (upstream mark_points parse).
- **PR B (dedup + errors):** 3.1, 4.1. Small. 4.1 is the only item with an observability/verification step — do it on a dev branch with live LLM calls.
- **PR C (UX):** 5.1, 5.2. Pure renames + a deletion. No behaviour change if 5.1 picks the "collapse" option; the deleted path had no teachers relying on it.

If 5.1 goes the "collapse" route, call that out in the PR description — the change is user-visible even though the code change is small.
