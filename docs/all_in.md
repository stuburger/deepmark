# All-In: Server-Side Y.Doc Authoring

_Target doc path after plan approval: `docs/all_in.md`_

## Context

After landing K-1 through K-9 of the kitchen-sink collab plan, the web client
is still doing the backend's job of populating the Y.Doc:

- On every first-open, `annotated-answer-sheet.tsx` runs `setContent(buildAnnotatedDoc(...))`
  inside a `ydoc.transact("seed")`. That's how text, OCR tokens, and
  AI annotations reach the Y.Doc.
- AI annotations also live in a parallel `ai-annotations` Y.Map sidecar
  (K-6), written by `write-ai-annotations.ts` and read by the K-7 projection
  Lambda. Two storage channels for the same data.
- The K-7 projection only handles AI annotations — teacher edits made via
  the Collaboration extension never reach Neon, so analytics silently miss
  them.
- Client-side seeding has racey edge cases: teacher opening before grading
  completes gets the placeholder seeded forever; two tabs opening a fresh
  submission at the same ms can double-seed.

This plan moves authoring to the backend and makes the Y.Doc's doc fragment
the single source of truth. The document "comes to life" through a stream
of additive Yjs transactions from the OCR and grading Lambdas — skeleton
appears first, text fills in per-question, annotation marks land as grading
completes. Teachers who have the submission open live see the updates in
real time via Hocuspocus sync. K-7 projection is upgraded to walk the doc
fragment, which yields teacher-edit projection to Neon for free.

## Architecture

```
OCR Lambda                                  Teacher browser
  ├─ connect(submission X)                    ├─ HocuspocusProvider syncs
  ├─ tx: seed empty question blocks    ──▶    │
  ├─ tx: set answer text (per page)    ──▶    │ ops arrive live,
  ├─ tx: apply ocrToken marks          ──▶    │ doc fills in
  └─ disconnect                               │

Grading Lambda                                │
  ├─ connect(submission X)                    │
  ├─ tx: apply annotation marks q1     ──▶    │ marks appear
  ├─ tx: apply annotation marks q2     ──▶    │ progressively
  ├─ …                                        │
  └─ disconnect                               │

            Hocuspocus (ECS, prod)            │
            debounces ~2s → S3 snapshot ─────▶│
                                              ▼
                                    S3 ObjectCreated event
                                              │
                                              ▼
                                  Projection Lambda
                                    ├─ Y.applyUpdate(bytes)
                                    ├─ fragment → PM JSON POJO
                                    ├─ JSON → PM Node → annotations[]
                                    └─ upsert student_paper_annotations
```

One storage channel (the doc fragment). Additive-only Yjs ops. Teacher edits
merge naturally via CRDT — no clobbering.

## Recommended approach

### Extension split (Plan agent recommendation "(A)")

Custom tiptap extensions have a schema part and a runtime part. Schema
(name/attrs/content/group) moves to `@mcp-gcse/shared`. Runtime
(`addNodeView`, `parseHTML`, `renderHTML`, keyboard shortcuts) stays in
`apps/web/`. Both sides import the same shape config from shared, so
`getSchema(...)` produces byte-identical schemas on web and Lambda.

Confirmed via node_modules read: `@tiptap/core` is side-effect-free, has
no module-load DOM access, and `getSchema()` never reads `addNodeView`.
Safe to run in a Lambda.

### Progressive writes

OCR and grading Lambdas open a long-lived `CollabSession` and apply
additive transactions as work completes:

- **At OCR start**: insert an empty `questionAnswer` block for every
  question on the exam paper. All questions visible as skeleton immediately.
- **During OCR** (per page or per question): once an answer's text and
  OCR tokens are ready, locate the matching question block, insert the
  text, apply `ocrToken` marks over each word's range.
- **During grading** (per question): once a question grades, locate its
  text and apply annotation marks (`tick` / `cross` / `annotationUnderline`
  / etc.) with `source: "ai"` attr. Teacher-added marks carry
  `source: "teacher"`.

Hocuspocus debounces internally (~2s default). Many transactions collapse
to few S3 writes.

### Mark storage

Annotation marks live as ordinary PM marks on text nodes in the doc
fragment — no more `ai-annotations` Y.Map sidecar. `source: "ai" | "teacher"`
attr discriminates origin. Projection extracts both kinds.

### Projection (K-7 rewrite)

Use existing `yXmlFragmentToProsemirrorJSON` + `deriveAnnotationsFromDoc`
to convert Y.Doc bytes to annotation rows in four steps:

```ts
const ydoc = new Y.Doc()
Y.applyUpdate(ydoc, bytes)                                             // S3 → Y.Doc
const json = yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment("doc")) // → POJO
const node = getSchema(editorExtensions).nodeFromJSON(json)            // → PM Node
const rows = deriveAnnotationsFromDoc(node)                            // → POJO[]
await db.$transaction(...)                                             // → Neon rows
```

`deriveAnnotationsFromDoc` already exists in
`apps/web/src/components/annotated-answer/use-derived-annotations.ts` and is
the same function the client uses. It moves to shared; the Lambda and the
web hook both import from there.

## Files

### Move verbatim to `packages/shared/src/editor/`

| From | Reason |
|---|---|
| `apps/web/src/components/annotated-answer/build-doc.ts` | The pure JSON builder. Zero runtime deps. |
| `apps/web/src/components/annotated-answer/annotation-marks.ts` | Pure mark definitions (no React). |
| `apps/web/src/components/annotated-answer/ocr-token-mark.ts` | Same. |
| `apps/web/src/components/annotated-answer/paragraph-node.ts` | Same. |
| `apps/web/src/lib/marking/alignment/{align,marks,types}.ts` | Used by build-doc. Pure. |
| `apps/web/src/lib/marking/mark-registry.ts` | `SIGNAL_TO_TIPTAP` lookup. Pure. |
| `deriveAnnotationsFromDoc` from `use-derived-annotations.ts` | → `derive-annotations.ts`. Hook stays in web. |

### Split shape ↔ view

Each custom node becomes two files: `<name>-schema.ts` in shared (pure
`Node.create({name, attrs, content, group})`) and `<name>.ts` in web
(`...sharedSchema.extend({ addNodeView, parseHTML, renderHTML, addKeyboardShortcuts })`).

- `apps/web/src/components/annotated-answer/question-answer-node.ts`
- `apps/web/src/components/annotated-answer/mcq-table-node.ts`
- `apps/web/src/components/annotated-answer/mcq-answer-node.ts`

### New `@mcp-gcse/shared` aggregator

- `packages/shared/src/editor/extensions.ts` — exports `editorExtensions`
  array used by `getSchema()` on both sides.

### New backend helpers

- `packages/backend/src/lib/collab/editor-schema.ts` — `getSchema(editorExtensions)` wrapper.
- `packages/backend/src/lib/collab/session.ts` — `CollabSession` class: opens
  a long-lived `HocuspocusProviderWebsocket` + `HocuspocusProvider`, yields
  the live `Y.Doc`, cleans up on close. Replaces per-call `connectAndMutate`.
- `packages/backend/src/lib/collab/y-doc-ops.ts` — incremental ops:
  - `insertQuestionBlock(fragment, { questionId, questionNumber, maxScore, ... })`
  - `setAnswerText(fragment, questionId, text)`
  - `applyOcrTokenMarks(fragment, questionId, tokens)`
  - `applyAnnotationMark(fragment, questionId, markSpec)`
  All implemented via `@tiptap/y-tiptap` against the Lambda-side schema.

### Modified Lambdas

- `packages/backend/src/processors/student-paper-extract.ts` — open `CollabSession`
  at entry, seed skeleton from exam-paper questions, then per-page
  `setAnswerText` + `applyOcrTokenMarks` as reconciliation + attribution complete.
- `packages/backend/src/processors/student-paper-grade.ts` — open `CollabSession`
  at grading start, `applyAnnotationMark` per question as it grades. **Delete**
  the `writeAiAnnotationsToYDoc` call.
- `packages/backend/src/processors/annotation-projection.ts` — rewrite to use
  the `Y.Doc → POJO → node → annotations` chain above. Upsert all rows (not
  filtered to `source: "ai"`).

### Deletes

- `packages/backend/src/lib/collab/write-ai-annotations.ts` — replaced by
  progressive marks in the doc fragment.
- The seed `useEffect` in `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx`.
  Editor becomes a pure reader of the Y.Doc.
- `useAnnotationCacheSync` callback plumbing in submission-view becomes
  unnecessary once the scan viewer reads from the Y.Doc directly via an
  observer — but that's out of this plan's scope. Keep the existing PM-state
  derivation for now; it still works.

### Mark schema change

Add `source: "ai" | "teacher"` attr to every annotation mark definition in
`packages/shared/src/editor/annotation-marks.ts`. Lambda transactions set
`"ai"`; client `applyAnnotationMark` (in `apps/web/src/components/annotated-answer/apply-annotation-mark.ts`)
sets `"teacher"`. Projection uses it for the Neon `source` column.

### Migration script

- `packages/backend/scripts/backfill-yjs-seeds.ts` — iterates every existing
  submission whose Y.Doc in S3 either doesn't exist or has an empty
  fragment. For each: loads DB data (grading_results, annotations,
  tokens, etc.), calls `buildAnnotatedDoc` once for the full state, opens a
  `CollabSession`, applies the JSON via `prosemirrorJSONToYXmlFragment` in a
  single `"backfill"` transact, disconnects. Run once per stage:
  `bun sst shell --stage=production -- bun packages/backend/scripts/backfill-yjs-seeds.ts`.

### Dependency additions

- `packages/shared/package.json` — `@tiptap/core`, `prosemirror-model`,
  `prosemirror-state`, `prosemirror-transform`.
- `packages/backend/package.json` — `@tiptap/core`, `@tiptap/y-tiptap`,
  `@tiptap/pm` (yjs is already there from K-6).

## Execution order

Land in phases so each step deploys cleanly and can be verified before
proceeding.

1. **Phase A — Shared schema package.** Move files to
   `packages/shared/src/editor/`, split nodes, export `editorExtensions`,
   update web imports. Web builds and runs unchanged.
   _Verify_: `bun typecheck`, `bun check`, web builds, teacher can still
   open an existing submission and see AI annotations.

2. **Phase B — Backend helpers.** Install deps, create
   `editor-schema.ts`, `session.ts`, `y-doc-ops.ts`. Unit tests for each op
   (input: empty fragment + params; expected: correct Y.XmlFragment state
   after apply; round-trip to JSON matches tiptap's own output).

3. **Phase C — Lambda integration.** Wire `CollabSession` into OCR and
   grading Lambdas. Keep `persistAnnotations` path live as a safety net
   during this phase.
   _Verify_: deploy, trigger a test pipeline, watch Hocuspocus task logs
   for transact events, verify devtools `ydoc.getXmlFragment("doc").toJSON()`
   fills in progressively.

4. **Phase D — Projection rewrite.** Swap the projection handler's Y.Map
   reading for the fragment-walk chain. Delete `write-ai-annotations.ts`.
   _Verify_: trigger pipeline end-to-end, `SELECT count(*) FROM student_paper_annotations`
   matches rendered annotations within ~5s of final write.

5. **Phase E — Client cleanup.** Delete the seed `useEffect`. Add `source`
   attr to `applyAnnotationMark`. Delete `persistAnnotations` call from
   `student-paper-grade.ts` (projection is now authoritative).
   _Verify_: fresh upload → teacher opens → sees populated doc → adds a
   teacher mark → reloads → mark persists → Neon has it with source="teacher".

6. **Phase E.5 — Cleanup pass.** Pay down the debt accumulated during the
   transitional phases. See "Phase E.5 detailed" below — it's a punch list,
   not a new architecture step. Run `bun typecheck`, `bun check`, and
   `bunx vitest run --project=backend:unit --project=web:unit
   --project=shared:unit` after each item; behaviour should be unchanged.

7. **Phase F — Migration.** Run `backfill-yjs-seeds.ts` against production.
   Spot-check a handful of existing submissions.

## Phase E.5 detailed — cleanup pass

A self-contained punch list. Each item is independent — work in order or
in parallel, commit after each. No behavioural changes intended; the
verification command after each item is the same:

```bash
bunx turbo typecheck --filter='!@mcp-gcse/db' && \
  bunx biome check && \
  bunx vitest run --project=backend:unit --project=web:unit --project=shared:unit
```

### High priority

#### E.5-1 — Delete the web barrel re-exports
CLAUDE.md forbids barrel re-export files. Phases A → E created nine of
them. Update consumers to import from `@mcp-gcse/shared` directly, then
delete the barrels.

**Delete:**
- `apps/web/src/components/annotated-answer/build-doc.ts` (zero consumers
  after Phase E — should be a free delete)
- `apps/web/src/components/annotated-answer/annotation-marks.ts`
- `apps/web/src/components/annotated-answer/ocr-token-mark.ts`
- `apps/web/src/components/annotated-answer/paragraph-node.ts`
- `apps/web/src/lib/marking/mark-registry.ts`
- `apps/web/src/lib/marking/alignment/types.ts`
- `apps/web/src/lib/marking/alignment/string-utils.ts`
- `apps/web/src/lib/marking/alignment/align.ts`
- `apps/web/src/lib/marking/alignment/marks.ts`

**Then:** rewrite `apps/web/src/lib/marking/alignment/index.ts` to re-export
only the files that remain in web (`reverse.ts`, `segments.ts`,
`use-question-alignments.ts`) and delete `apps/web/src/lib/marking/token-alignment.ts`
(its only purpose was to be a barrel). Update consumers to import from
either `@mcp-gcse/shared` (for the moved bits) or the specific web file
(for the remaining bits).

**Heuristic:** `grep -rn 'from "@/lib/marking/alignment"\|from "@/lib/marking/mark-registry"\|from "@/lib/marking/token-alignment"\|from "@/components/annotated-answer/annotation-marks"' apps/web/`
finds the call sites.

#### E.5-2 — Extract `loadTokensByQuestion`
Identical ~25-line block lives in `student-paper-extract.ts`
(`writeAnswersToYDoc`) and `student-paper-grade.ts`
(`writeAnnotationsToYDocFragment`). Pull it into a single helper:

**Create:** `packages/backend/src/lib/collab/load-tokens.ts`

```ts
import { db } from "@/db"
import type { PageToken } from "@mcp-gcse/shared"

/** Returns DB tokens grouped by `question_id`, only those with a question assigned. */
export async function loadTokensByQuestion(
  submissionId: string,
): Promise<Map<string, PageToken[]>> { ... }
```

Then call it from both processors and delete the inline duplications.

#### E.5-3 — Wrap projection's snapshot decode in try/catch
Currently the chain in `annotation-projection.ts` will throw cryptically
("Invalid input for Node.fromJSON") on a corrupt snapshot, with no
submission_id in the trace.

**Fix:** wrap `deriveAnnotationsFromBytes` body in try/catch; on failure,
`logger.error(TAG, "Failed to decode snapshot", { submissionId, key, error })`
and rethrow OR mark the message as a per-record failure
(`failures.push({ itemIdentifier: record.messageId })`) so SQS retries it
and eventually moves to DLQ. The latter is preferable — corrupt snapshots
shouldn't quietly project as "no annotations" (which would wipe the
submission's rows).

#### E.5-4 — Move grading-side annotation helpers out of the processor
`student-paper-grade.ts` is now ~500 lines, breaking the ~400-line seam
guideline. The natural extraction:

**Create:** `packages/backend/src/processors/student-paper-grade/annotations-to-ydoc.ts`
containing `writeAnnotationsToYDocFragment`, `pendingAnnotationToSpec`,
and `signalFromPending`. The processor stays in
`packages/backend/src/processors/student-paper-grade.ts` and imports them.

(Other processors with helpers — `mark-scheme-pdf/`, `question-paper-pdf/`,
`exemplar-pdf/` — already use this sibling-folder pattern. Match it.)

#### E.5-5 — `await` the skeleton seed
In `student-paper-extract.ts`:

```ts
// before
void withCollabSession(jobId, "seed-skeleton", (session) => seedSkeleton(...))
// after
await withCollabSession(jobId, "seed-skeleton", (session) => seedSkeleton(...))
```

It's <1s and the OCR pipeline that follows is 30s+. The current `void`
makes the OCR "complete" log line lie about ordering and creates a small
race window with the next handler invocation.

### Medium priority

#### E.5-6 — Unify `buildSegmentedContent` and `buildTextContent`
Two implementations of the same boundary-splitting algorithm:
- `packages/shared/src/editor/build-doc.ts` — `buildTextContent`
- `packages/backend/src/lib/collab/y-doc-ops.ts` — `buildSegmentedContent`

Same shape (collect boundaries → sort → slice text → attach covering marks),
different input types (`TextMark` vs `AnnotationMarkRange`).

**Fix:** lift the algorithm into `packages/shared/src/editor/segment-text.ts`
with a generic mark-spec interface that both call sites can satisfy. The
backend `AnnotationMarkRange` becomes a thin wrapper or alias.

#### E.5-7 — Delete dead `connectAndMutate`
`packages/backend/src/lib/collab/headless-client.ts` exports
`connectAndMutate` (no callers since Phase D) and `buildSubmissionDocumentName`
(used by `session.ts`).

**Fix:** move `buildSubmissionDocumentName` into `session.ts` (or a tiny
`document-name.ts`), delete `headless-client.ts` entirely.

#### E.5-8 — Inline `BindingMetadata` should be a named helper
`y-doc-ops.ts` has:

```ts
const meta = { mapping: new Map(), isOMark: new Map() }
updateYFragment(fragment.doc, fragment, pmNode, meta)
```

This duplicates y-tiptap's internal `createEmptyMeta` (which is not
exported). Wrap in a single helper in `editor-schema.ts` so future
y-tiptap shape changes have one place to fix:

```ts
// editor-schema.ts
import type { BindingMetadata } from "..."  // y-tiptap's internal type if exposed
export function emptyBindingMetadata() {
  return { mapping: new Map(), isOMark: new Map() }
}
```

(If y-tiptap doesn't export `BindingMetadata`, hand-define it inline with
a comment pointing at `node_modules/@tiptap/y-tiptap/dist/src/plugins/sync-plugin.d.ts`.)

#### E.5-9 — Fix `MARK_SIGNALS` type
In `packages/shared/src/editor/mark-registry.ts`:

```ts
// before
export const MARK_SIGNALS: ReadonlySet<string> = new Set(MARK_SIGNAL_NAMES)
// after
export const MARK_SIGNALS: ReadonlySet<MarkSignal> = new Set(MARK_SIGNAL_NAMES)
```

Then update `resolveSignal` to drop the runtime cast that the broader
type forced.

### Low priority (defer if short on time)

#### E.5-10 — Replace `as` casts at the snapshot boundary
`yXmlFragmentToProsemirrorJSON(fragment) as JSONContent` and the
`bbox: t.bbox as [number, number, number, number]` casts in token loading
are technically boundary casts. PM's own validation catches the JSON shape
issues; the bbox cast is more questionable. Optional but: define a small
`TokenRowSchema` in `lib/collab/load-tokens.ts` and parse there.

#### E.5-11 — Fix the test mock that forced the biome-ignore
`apps/web/src/components/annotated-answer/__tests__/use-derived-annotations.test.ts`
mocks PM's `Node` interface with only `forEach` (no `childCount` /
`child(i)`). That's why `derive-annotations.ts` carries a
`// biome-ignore lint/complexity/noForEach: PM Node.forEach is a traversal API`.

If we move the test alongside the function in
`packages/shared/src/editor/__tests__/` (which the verification section of
this plan calls for), this is a chance to either:
- Mock the full PM interface so we can use `for(let i; i<childCount...)`
  in the production code, or
- Use a real PM `Node` (built via `schema.nodeFromJSON`) instead of a
  mock — much more faithful.

#### E.5-12 — Drop unused `PageToken` fields in Lambda construction
The Lambda-side PageToken construction always sets
`answer_char_start: null, answer_char_end: null` because the alignment is
recomputed on demand. Either:
- Define a narrower `PageTokenForAlignment` type in shared (no char-range
  fields) that `alignTokensToAnswer` accepts, or
- Accept the noise and add a comment explaining why those fields are
  always null on the Lambda side.

### Acceptance for the cleanup pass

- All items above completed (or explicitly deferred with a note)
- `bunx turbo typecheck --filter='!@mcp-gcse/db'` clean
- `bunx biome check` clean (the two pre-existing
  `mcq-table-view.tsx` / `useSemanticElements` errors are not part of this
  pass)
- All ~220 unit tests still passing
- `git diff --stat` shows mostly deletions + small refactors, no behavioural
  changes

## Critical files

### To create

- `packages/shared/src/editor/` (new directory)
  - `build-doc.ts`
  - `annotation-marks.ts`
  - `ocr-token-mark.ts`
  - `paragraph-node.ts`
  - `question-answer-node-schema.ts`
  - `mcq-table-node-schema.ts`
  - `mcq-answer-node-schema.ts`
  - `derive-annotations.ts`
  - `mark-registry.ts`
  - `alignment/{align,marks,types}.ts`
  - `extensions.ts` (aggregator)
- `packages/backend/src/lib/collab/editor-schema.ts`
- `packages/backend/src/lib/collab/session.ts`
- `packages/backend/src/lib/collab/y-doc-ops.ts`
- `packages/backend/scripts/backfill-yjs-seeds.ts`

### To modify

- `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx` (delete seed effect)
- `apps/web/src/components/annotated-answer/question-answer-node.ts` (re-extend shared schema)
- `apps/web/src/components/annotated-answer/mcq-table-node.ts` (same)
- `apps/web/src/components/annotated-answer/mcq-answer-node.ts` (same)
- `apps/web/src/components/annotated-answer/apply-annotation-mark.ts` (set `source: "teacher"`)
- `apps/web/src/components/annotated-answer/use-derived-annotations.ts` (re-exports from shared)
- `apps/web/src/components/annotated-answer/build-doc.ts` (becomes a re-export)
- `packages/backend/src/processors/student-paper-extract.ts` (use CollabSession)
- `packages/backend/src/processors/student-paper-grade.ts` (use CollabSession, remove writeAiAnnotations)
- `packages/backend/src/processors/annotation-projection.ts` (fragment walk)
- `packages/shared/package.json` (deps)
- `packages/backend/package.json` (deps)

### To delete

- `packages/backend/src/lib/collab/write-ai-annotations.ts`

## Existing functions / utilities to reuse

- `buildAnnotatedDoc` — migration script uses it verbatim; Lambda helpers
  call into its internals (per-question blocks) for progressive writes.
- `deriveAnnotationsFromDoc` (currently in `use-derived-annotations.ts`)
  — projection Lambda uses unchanged.
- `SIGNAL_TO_TIPTAP` (`mark-registry.ts`) — maps annotation signals to
  tiptap mark names on both sides.
- `connectAndMutate` (`headless-client.ts`) — pattern replaced by
  `CollabSession`, but the WebSocket+token plumbing is lifted directly.
- `persistAnnotations` (`persist-annotations.ts`) — deleted after Phase E
  (projection becomes authoritative).
- `yXmlFragmentToProsemirrorJSON` from `@tiptap/y-tiptap` — drives the
  projection's Y → JSON step.
- `prosemirrorJSONToYXmlFragment` from `@tiptap/y-tiptap` — drives the
  migration script's one-shot seed.

## Verification

Four testing layers, ordered by cost and infra dependency. No mocking —
consistent with the existing `attribution-evals` philosophy.

### Layer 1 — Pure unit tests (`packages/shared/src/editor/__tests__/`)

Fast, deterministic, no infra. Run via `bun test:unit`.

- `build-doc.test.ts` — port verbatim from `apps/web/`. Existing coverage
  for grading-complete / skeleton / fallback paths.
- `derive-annotations.test.ts` — port verbatim from
  `use-derived-annotations.test.ts`; the pure function doesn't need React.
- `schema-parity.test.ts` (new) — regression guard. Two assertions:
  (a) `getSchema(editorExtensions).spec` is deterministic across imports;
  (b) it matches a committed snapshot. Any future extension drift shows up
  as a snapshot diff in PR review.

### Layer 2 — Y.Doc op tests, no Hocuspocus (`packages/backend/src/lib/collab/__tests__/`)

Real `Y.Doc` in memory, no WebSocket. Fast, deterministic, exercises the
exact y-tiptap encoding used in production.

- `y-doc-ops.test.ts` — for each helper:
  - `insertQuestionBlock` produces a `questionAnswer` node with correct
    attrs; second call with same `questionId` is a no-op.
  - `setAnswerText` populates the text of the named question only; doesn't
    disturb siblings.
  - `applyOcrTokenMarks` produces `ocrToken` marks with correct ranges and
    attrs.
  - `applyAnnotationMark` attaches the right mark type with `source: "ai"`
    on the specified character range.
- `fragment-roundtrip.test.ts` — assemble a known Y.Doc via the ops,
  convert via `yXmlFragmentToProsemirrorJSON`, round-trip through
  `schema.nodeFromJSON`, feed to `deriveAnnotationsFromDoc`, assert the
  result matches what the equivalent client-side `setContent + derive`
  flow produces. Catches any encoding drift end-to-end.

These cover the bulk of correctness risk — the WebSocket transport layer
is effectively inert plumbing once the ops are right.

### Layer 3 — Live Hocuspocus integration (`packages/backend/tests/integration/`)

Real WebSocket against a deployed stage's Hocuspocus task. Runs via
`AWS_PROFILE=deepmark bunx sst shell --stage=<stage> -- bunx vitest run tests/integration/collab-*.test.ts`.

Isolation: each test generates a random doc name `${stage}:test:${uuid}`.
`afterEach` deletes the S3 snapshot.

- `collab-session.test.ts`:
  - **Write-then-read roundtrip** — writer session applies ops; separate
    reader session sees them after sync. Catches schema drift between
    writer and reader.
  - **Progressive observation** — writer applies ops in sequence (skeleton
    → text → marks); reader's observer sees each stage via `waitFor`.
  - **Two concurrent writers** — simulates OCR + grading running at once;
    disjoint ops merge; no lost data.
  - **Reconnect resilience** — drop the underlying `ws` mid-flight; session
    auto-reconnects; ops after the drop still reach the reader.
  - **Auth — valid token accepts**; **auth — bogus token rejects** with a
    clear error.

### Layer 4 — Pipeline end-to-end (`packages/backend/tests/integration/`)

Real SQS → Lambda → Hocuspocus → S3 → projection → Neon. One test per
happy-path scenario. Tagged `@slow` (1–3 min each), not part of default CI.

- `progressive-pipeline.test.ts`:
  - Create a fixture submission (small, 2–3 questions, 3 pages).
  - Enqueue OCR.
  - Open a reader on the submission's Y.Doc.
  - Assert via `waitFor` that the Y.Doc fills in progressively: skeleton
    → text → annotation marks.
  - Assert that Neon's `student_paper_annotations` matches the Y.Doc
    state within ~5s of the final write.
- `teacher-edit-projection.test.ts`:
  - Open an already-seeded submission as a "teacher" session (user token).
  - Apply a mark with `source: "teacher"`.
  - Wait for projection.
  - Assert a Neon row with `source='teacher'` for that submission.
- `migration-backfill.test.ts`:
  - Find a legacy submission with no Y.Doc snapshot in S3.
  - Run `scripts/backfill-yjs-seeds.ts` for that submission.
  - Open a reader; derive annotations; compare count + IDs against the
    DB state that fed the backfill.

### Test helpers (`packages/backend/tests/integration/helpers/collab.ts`)

Shared utilities to keep tests readable:

```ts
export async function openSession(docName: string, token?: string): Promise<TestSession>
export async function openReader(docName: string): Promise<TestReader>
export async function waitFor(fn, opts): Promise<void>
export function collectTextNodes(json): string[]
export function collectAnnotationMarks(json): Mark[]
export async function cleanupSnapshot(docName: string): Promise<void>
```

### Running the suites

```bash
# Fast: layers 1 + 2
bun test:unit

# Integration, including live Hocuspocus: layer 3
AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
  bunx vitest run tests/integration/collab-*.test.ts

# Slow end-to-end: layer 4
AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
  bunx vitest run tests/integration/progressive-pipeline.test.ts \
                tests/integration/teacher-edit-projection.test.ts \
                tests/integration/migration-backfill.test.ts
```

### Manual smoke test (updated `docs/collab-verification.md`)

Alongside automated tests, run these manually before a demo:
1. Fresh upload of a new submission → teacher opens mid-OCR → sees skeleton
   → text fills in → marks appear, all without refresh.
2. Teacher deletes an AI mark, refreshes, delete persists.
3. Re-run grading → AI marks re-applied, teacher deletion preserved (if
   tombstones land in follow-up — out of scope for this plan).
4. `SELECT count(*) FROM student_paper_annotations WHERE submission_id = '<id>'`
   matches rendered annotation count within 5s. Both `source='ai'` and
   `source='teacher'` rows present.
5. Run migration on test stage against an existing submission that had
   no Y.Doc snapshot → open → sees full doc with AI annotations.

### Rollback
- The kill-switch from K-9 (`NEXT_PUBLIC_DEEPMARK_COLLAB_MODE=indexeddb-only`)
  still works. No WebSocket → no progressive updates land → teacher only sees
  what was in Y.Doc at last save. Acceptable degraded mode.
- A phase can be rolled back in isolation up through Phase E. Phase F
  (migration) writes durable Y.Doc state; it's forward-only.

## Known trade-offs / out-of-scope

- **Tombstone registry** (open item #1) — still not addressed. Deleted AI
  marks can reappear on re-run. Separate follow-up.
- **ACL in collab-server** (open item #6) — the Lambda's service token
  bypasses user ACL; user-level checks still TODO.
- **Scan viewer → Y.Doc direct observer** — the current PM-state
  derivation via `useDerivedAnnotations` + `useAnnotationCacheSync` keeps
  working after this plan. A future cleanup moves the scan viewer to an
  `ydoc.observeDeep` listener directly, removing the cache-sync detour.
- **Concurrent pipeline invocations** — two Lambdas writing to the same
  Y.Doc at once is fine (CRDT), but a second "skeleton" write could double
  blocks. Mitigation: each op helper checks for an existing block before
  inserting (idempotent upsert pattern).
