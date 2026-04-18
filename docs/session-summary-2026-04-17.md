# Session Summary — 2026-04-17

Multi-day session covering: real-time pipeline architecture, teacher-edit
persistence, UI/UX collapse of the phase-switched panels, and DDD cleanup
of the marking domain. Ends with an open race-condition bug on the autosave
path that's been isolated but not yet fixed.

---

## Framing conversations

### Geoff's product feedback (early session)

Core product-direction reset: DeepMark is past prototype but not yet
teacher-trust-ready. The gap isn't capability — it's **annotation language
quality**. The system does the right things (auto-annotation, AO tagging,
level reasoning), but the output reads like an AI summary rather than an
examiner's margin notes. Highest-leverage next move after infra work lands
is a benchmark run on 2-3 real scripts + prompt iteration.

Also established: progressive annotation (always-on editor, layered data
arrival) is the right UX model, not phase-switched panels. Failed/cancelled
should overlay the editor rather than replace it.

### SSE vs polling

Discussed tradeoffs at length. Settled on:

- **Persistent SSE connection** (always open while the view is mounted, closed on tab blur)
- **Adaptive server poll** (2s active / 15s idle) rather than close-on-terminal
- **Auto-reconnect** handled by native EventSource; 15-min Lambda force-close is transparent
- **Cost model**: ~$0.015/hr per connection at 256MB Lambda; trivial at current scale, revisit at ~500 concurrent users

Per-stage invalidation fans out to downstream queries (studentJob, tokens, scan URLs, annotations) when stages flip to `done`, rather than merging all state into one SSE payload.

### Status model consolidation

Two status abstractions coexisted: legacy `MarkingPhase` (derived from payload `status`) and new `JobStages` (per-stage). Collapsed so `JobStages` is the single source of truth, with `MarkingPhase` derived purely as a view enum via `derivePhase(stages, hasExamPaper)`.

---

## What shipped (committed)

### `d5bbcc1` — Auto-pan scan viewer *(authored pre-session, committed by me)*
- `BoundingBoxViewer` pans to centre a single highlighted token
- Outer `AnnotatedScanColumn` scrolls the page into view first
- Swap non-null assertion for optional chaining in `mark-overlay`

### `59c7020` — Real-time pipeline stages + teacher edit persistence

Big bundle. The bulk of phases 1-5 and tier-1/2 fixes:

**Stage status model** (`lib/marking/stages/`)
- `JobStages` type with `StageStatus: not_started | generating | done | failed | cancelled`
- `getJobStages(jobId)` server action
- `derivePhase(stages, hasExamPaper)` as a pure view derivation

**Three-pip toolbar**
- `StagePip` + `StagePips` components with per-pip re-run actions
- Colours: orange / blue-pulsing / green / red / grey
- Replaces the old single phase badge

**SSE transport**
- `/api/submissions/[jobId]/events` route — persistent stream, adaptive polling, 30s heartbeats, abort-aware sleep
- `useJobStream(jobId)` mirrors events into React Query cache
- Closes on tab backgrounding, reopens on focus
- Zod-validated payload with date coercion at the boundary

**Progressive PM rendering**
- Editor created once (`useEditor` deps: `[]`)
- Doc sync via `setContent({ emitUpdate: false })` with **cursor + focus preservation** and IME composition guard
- Unlocked the annotation query gate so text renders before enrichment completes

**Teacher edit persistence (optimistic cache pattern)**
- Schema additions: `source` enum, `deleted_at`, nullable `enrichment_run_id`, `submission_id` FK, `updated_at`
- `diffAnnotations` pure fn with insert/update/soft-delete semantics
- `saveAnnotationEdits` server action with transaction
- `useAnnotationSync` hook — cache is single source of truth; optimistic update via `setQueryData`; mutation with `cancelQueries`/`invalidate` race-prevention
- Eliminated the `sheetAnnotations` separate state

**Fixed pre-existing bug**: `getJobAnnotations` was using `jobId` as `grading_run_id`; actually it's `submission_id`. Rewrote the resolution chain.

**DndContext hydration fix**: added explicit `id` props to the two `DndContext` instances on exam-papers view to stop the accessibility-ID counter drift between server and client render.

### `6aba94c` — Tier-3 build plan + marking-domain cleanup *(Stuart)*

Executed the build plan I wrote earlier + additional review cleanup:
- **T3-1**: dropped the `__never__` Prisma sentinel (conditional OR arrays)
- **T3-3**: SSE route integration test
- **T3-4**: `StagePips` split into `useStageData` / `useStageMutations` + presentation
- **DDD-1**: flat `marking/mutations.ts` migrated into `stages/`, `overrides/` (new sub-domain), `submissions/`
- **DDD-2**: `getJobAnnotations` moved to `marking/annotations/queries.ts`

Plus:
- Shared Prisma client singleton at `lib/db.ts` replacing 31 per-file `createPrismaClient()` calls
- `useSubmissionData` hook consolidates 5 queries + invalidation effects; SubmissionView trimmed 376→260 lines
- 3s annotation polling replaced with SSE-driven invalidation on enrichment transition

---

## What's uncommitted

Changes in the working tree that weren't part of the two big commits:

### My diagnostics + phase-switch collapse
- SSE route: added server-side logs for connection/tick/update tracing
- `useJobStream`: client-side logs for connection/snapshot/update/errors/Zod rejections + stage-transition cache invalidation via new `stages/transitions.ts` module
- `use-question-alignments`: per-question annotation/token/derived-mark diagnostic log
- `results-panel.tsx`: collapsed the phase switch — always render `MarkingResults`; `FailedPanel`/`CancelledPanel` render as banners *above* the editor
- `grading-results-panel.tsx`: removed the empty-state early return; score bar hidden when `total_max === 0`
- `build-doc.ts`: placeholder text "Waiting for student answers…"
- 6 new unit tests for `invalidateOnStageTransitions`

### Stuart's uncommitted backend work
- `packages/backend/src/lib/scan-extraction/` — OCR pipeline changes (continuation handling, MCQ resolver, attribution prompt tweaks)
- `vision-attribute.ts` — per-page question hints for attribution
- New `resolve-mcq-answers.ts` + tests
- `BoundingBoxViewer.tsx` — additional changes

---

## Database changes made this session

All executed against dev branch `br-round-dawn-abu36m2h` via Neon MCP:

1. **Schema push** of `AnnotationSource` enum + new columns on `student_paper_annotations` (happened before session via `bun db:push`)
2. **Backfill of `submission_id`** for 1608 pre-migration AI annotations (`UPDATE ... FROM enrichment_runs JOIN grading_runs`)
3. **Second backfill** of 12 rows from a post-backfill enrichment run — revealed the enrichment processor wasn't populating `submission_id` on insert
4. **Restored 31 erroneously soft-deleted AI annotations** across 2 submissions (see open issue below)

Schema changes still pending push:
- `submission_id String` (NOT NULL) on `student_paper_annotations`
- `submission StudentSubmission @relation(...)` (required)

Enrichment processor fix (`persist-annotations.ts` + handler) now populates `submission_id` on insert, so future rows will satisfy the NOT NULL.

---

## Documentation added

- `docs/build-plan-2026-04-17.md` — tier-3 build plan + DDD cleanup. Executed by commit `6aba94c`.
- `docs/session-summary-2026-04-17.md` — this file.

---

## Open issue: autosave race (not yet fixed)

### Symptom
Stuart reported annotations disappearing from both the PM decorations and the comment sidebar after a page load. Investigation found that `saveAnnotationEdits` had soft-deleted 22 AI annotations from one submission and 9 from another — 31 total — in single-second batch operations. The remaining AI annotations for those submissions were all gone; only teacher annotations survived.

### Root cause
The editor's derived annotation set is a **subset** of what's in the DB during the initial-load window — e.g. because pageTokens haven't fully loaded for every question, alignment fails for those questions, or the attribution on pageTokens doesn't match the annotation's anchor tokens. `saveAnnotationEdits` does a naive diff between editor state and DB state and interprets missing IDs as "teacher deleted these."

### Data recovered
All 31 erroneously-deleted AI annotations restored via Neon MCP update. No data lost.

### Fix not yet implemented
Three designs discussed, not yet chosen:

**Option A** — Client-side "seen set". `useAnnotationSync` tracks `seenIdsRef: Set<string>` that grows as annotations appear in the editor. Save sends both `editorState` and `seenIds`. Server computes deletes as `dbIds ∩ seenIds − editorIds`. Annotations never seen can't be proposed for deletion.

**Option B** — Explicit removal tracking. Instrument every mark-removal path (eraser, keyboard shortcut, toggle-off) to record `removedIds`. Save sends explicit removal list; server deletes only those. Absence from editor for any other reason never triggers a delete.

**Option C** — Server-side safety heuristic. `saveAnnotationEdits` refuses to delete when `editorState.length < dbState.length * 0.5`. Fastest fix but heuristic-based.

Recommended **A** — captures intent ("delete only things the teacher has seen") without instrumenting every removal site. Stuart to confirm direction.

A simpler intermediate fix — gating persistence behind `isEditing` — was proposed and rejected as fragile (teacher could enter edit mode before the editor fully populates, same race).

---

## Other open items from tier-3 build plan

Not yet touched:

- **T3-2** — `JSON.stringify(doc)` fingerprint in `annotated-answer-sheet.tsx` is O(N) per render. Switch to a version counter. Deferred until measured.
- Per-stage PM-transaction progressive rendering (addMark for new marks instead of full `setContent` replace). `setContent` with cursor preservation is a good enough interim; full refactor pending.

---

## Recommended next steps

1. **Fix the autosave race** (Option A or B). Without this, teachers editing a submission can silently lose AI annotations. Blocker for trusting the persistence layer.
2. **Push the `submission_id NOT NULL` schema change** (`bun db:push`). Backfill is done, enrichment processor now populates on insert. Closing the loop.
3. **Commit the diagnostics + phase-switch collapse** once the autosave bug is fixed.
4. **Annotation-quality benchmark run** — Geoff's feedback remains the highest-leverage product move. Pick 2-3 real scripts, audit the enrichment output, iterate the prompt.

---

## Commits on branch ahead of `origin/main`

```
6aba94c refactor: tier-3 build plan + marking-domain cleanup
ac803a1 Revert "feat: add SSR-seeded submission page route"
8322b95 feat: add SSR-seeded submission page route
59c7020 feat: real-time pipeline stages via SSE + teacher edit persistence
d5bbcc1 feat: auto-pan scan viewer to focus highlighted OCR token
```

5 commits (2 feat, 1 revert, 1 feat, 1 refactor). Branch is ahead of `origin/main`; not yet pushed.
