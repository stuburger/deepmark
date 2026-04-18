# Build Plan — Yjs + IndexedDB Annotation Doc

> Snapshot: 2026-04-17. Replaces the diff-based server persistence model with
> a Yjs CRDT doc persisted to IndexedDB in the browser. Solves the autosave
> race structurally, unlocks multi-tab sync for free, and sets up the
> collaborative-editing future (y-websocket swap). Demo scope — no server-side
> Yjs infra in this plan.

## Why

The current model has three coupled problems:

1. **Autosave race** (open). Editor state is a subset of DB state during
   initial load; `diffAnnotations` treats missing IDs as deletes and soft-
   deletes AI annotations. Root-caused this session; 31 rows restored; no fix
   shipped.
2. **Single-tab only**. Teacher opening the same submission in two tabs
   races against itself.
3. **Collaborative dead-end**. The diff-based persistence can't be extended
   to multi-writer without a conflict model — which is exactly what a CRDT
   gives us.

Yjs + y-indexeddb + y-prosemirror collapses all three. Teacher edits become
CRDT ops on a local Y.Doc, persisted to IndexedDB, automatically synced
across tabs via BroadcastChannel. AI annotations apply as idempotent ops
keyed by annotation ID. The race disappears because there's no diff — only
explicit operations.

## Scope

**In scope (demo):**
- Replace tiptap's `content: doc` + `setContent` pattern with a
  `Y.XmlFragment`-bound editor via `@tiptap/extension-collaboration`
- Persist the Y.Doc to IndexedDB via `y-indexeddb`
- Ingest AI annotations from the existing DB → React Query pipeline as
  idempotent Yjs transactions keyed by annotation ID
- Delete the server-side teacher-edit persistence path
  (`saveAnnotationEdits`, `useAnnotationSync`, `diffAnnotations`)

**Out of scope (deferred):**
- y-websocket server + awareness (Y-7 below, roadmap)
- Server-side reads of teacher-edited annotations for export/analytics
- Schema rollback of the `source` / `deleted_at` / `submission_id` columns
  added this session — leave them; they still describe AI rows correctly and
  cost nothing

## Summary

| # | Item | Effort | Scope |
|---|---|---|---|
| Y-1 | Add deps + `useYDoc(submissionId)` lifecycle hook | 1 h | 1 new file |
| Y-2 | Replace tiptap content binding with `Collaboration` | 2 h | `annotated-answer-sheet.tsx` |
| Y-3 | y-indexeddb provider + loading state | 1 h | hook from Y-1 |
| Y-4 | Idempotent AI annotation ingestion | 3–4 h | new `apply-ai-annotations.ts` |
| Y-5 | Delete server persistence path | 1 h | ~6 files |
| Y-6 | Multi-tab verification + rollback escape hatch | 1 h | manual QA + feature flag |
| Y-7 | *(deferred)* y-websocket server for real-time collab | 3–5 d | new infra + provider swap |

**Target total (demo slice, Y-1 through Y-6):** 1 focused day, 2 at most.
Collaborative (Y-7) is a separate project.

**Recommended order:** Y-1 → Y-3 → Y-2 → Y-4 → Y-5 → Y-6. Land Y-1..Y-3
together so the editor can still render (just without AI marks) before Y-4
layers ingestion in.

---

## Y-1 — Y.Doc lifecycle hook

### Problem

Nothing owns the Y.Doc's lifetime. It needs to live as long as a submission
view is mounted, survive navigations between submissions (separate docs),
and be torn down cleanly to release the IndexedDB handle.

### Fix

```ts
// apps/web/src/components/annotated-answer/use-y-doc.ts
export function useYDoc(submissionId: string): {
  doc: Y.Doc | null
  persistence: IndexeddbPersistence | null
  synced: boolean
}
```

- Creates a `Y.Doc` keyed by `submissionId`
- Attaches `IndexeddbPersistence('deepmark-annotations-' + submissionId, doc)`
- Resolves `synced` when `persistence.once('synced')` fires (first-load cache
  hydration is complete)
- Tears down on unmount: `provider.destroy()` then `doc.destroy()`
- Re-creates on `submissionId` change (no doc reuse across submissions)

`synced=false` is the gate for applying the initial AI-annotation seed in
Y-4. Applying before sync would double-apply what IndexedDB is about to
replay.

### Files

- New: `apps/web/src/components/annotated-answer/use-y-doc.ts`
- New: `apps/web/package.json` — add `yjs`, `y-indexeddb`,
  `@tiptap/extension-collaboration`

### Acceptance

- Hook returns `{ doc: null, synced: false }` on first render, transitions
  to `{ doc, synced: true }` after IndexedDB replay
- Opening and closing the same submission in the same tab reuses the
  IndexedDB store (verified by seeing prior edits)
- Navigating submission A → B → A still shows A's edits

### Risks

- IndexedDB is per-origin. Incognito mode or a cleared browser loses teacher
  edits. Demo-acceptable; flag in the UI as "Edits saved in this browser"
  toast on first edit.

---

## Y-2 — Replace tiptap content binding with `Collaboration`

### Problem

`annotated-answer-sheet.tsx` currently drives content via `content: doc` +
a `useEffect` that calls `editor.commands.setContent(doc, { emitUpdate: false })`
with cursor/focus preservation and an IME guard. This whole dance exists
because the editor is rebuilt on every stage transition.

With Yjs, the editor's content lives in a `Y.XmlFragment` on the Y.Doc.
Tiptap's `Collaboration` extension binds them. The `setContent` dance goes
away entirely — the editor reflects whatever's in the fragment, and updates
propagate as CRDT ops.

### Fix

```ts
import Collaboration from "@tiptap/extension-collaboration"

const { doc: ydoc, synced } = useYDoc(submissionId)

const editor = useEditor(
  {
    immediatelyRender: false,
    editable: true,
    extensions: [
      Document.extend({ content: "(questionAnswer | mcqTable)+" }),
      Text,
      HardBreak,
      // History is REPLACED by y-prosemirror's undo manager; remove here
      QuestionAnswerNode,
      McqTableNode,
      ...annotationMarks,
      OcrTokenMark,
      ReadOnlyText,
      AnnotationShortcuts.configure({ onMarkAppliedRef }),
      HoverHighlightPlugin.configure({ onAnnotationHoverRef }),
      ydoc ? Collaboration.configure({ document: ydoc, field: "doc" }) : null,
    ].filter(Boolean),
    // content prop REMOVED — Yjs owns the content
    editorProps: { ... },
  },
  [ydoc], // re-create editor if doc identity changes (submission switch)
)
```

Delete:
- `content: doc` prop
- The `useEffect` that syncs `doc` → `setContent` (lines 234–262 of
  `annotated-answer-sheet.tsx`)
- `lastDocFpRef`, cursor-preservation block, IME guard — all obsolete
- `History` extension (conflicts with Collaboration's undo)

Keep:
- Progressive rendering is now inherent. When Y-4 applies new AI marks,
  tiptap re-renders the affected text ranges without remounting anything.

### Files

- `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx`

### Acceptance

- Editor renders correctly once `synced=true` and initial content is applied
- Stage transitions no longer cause a full doc replace (observe in React
  Profiler: only affected nodes re-render)
- Cursor / IME composition / focus state are preserved across stage updates
  with no explicit handling — Y.XmlFragment diffs are character-precise

### Risks

- **PM schema compatibility**: y-prosemirror requires node and mark attrs to
  be JSON-serialisable. Verify `questionAnswer`, `mcqTable`, `ocrToken`, and
  every annotation mark survive a doc → Yjs → doc round-trip in isolation
  before Y-4 lands. Test file:
  `apps/web/src/components/annotated-answer/__tests__/y-doc-roundtrip.test.ts`
- **Undo behaviour**: `History` → `y-prosemirror` undo manager is a behaviour
  change. Verify keyboard shortcuts still undo teacher marks only (not AI
  marks applied in other sessions).

---

## Y-3 — y-indexeddb provider + loading state

### Problem

The editor currently renders a placeholder doc while data loads
(`"Waiting for student answers…"`). With Yjs, we also need to wait for the
IndexedDB replay to complete before deciding what AI annotations to apply —
otherwise we double-apply.

### Fix

In `submission-view` (or wherever `AnnotatedAnswerSheet` is rendered):

```ts
const { doc, synced } = useYDoc(submissionId)

if (!synced) {
  return <AnnotationLoadingSkeleton />
}
return <AnnotatedAnswerSheet ydoc={doc} ... />
```

Pass `ydoc` down to the sheet. The placeholder text in `build-doc.ts`
(`"Waiting for student answers…"`) is kept for the separate case of
"synced, but no grading results yet" — i.e. OCR is still running. That's
still a valid branch.

### Files

- `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx` (accept `ydoc` prop)
- `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/results/grading-results-panel.tsx` (gate on `synced`)
- `apps/web/src/components/annotated-answer/build-doc.ts` — placeholder
  block is still used for the "synced + empty" case; no change needed

### Acceptance

- First paint shows a skeleton, not an empty editor
- Subsequent paints (cached in IndexedDB) show content within ~50ms of
  mount (measure in Chrome DevTools)

---

## Y-4 — Idempotent AI annotation ingestion

### Problem

AI annotations are produced by the enrichment processor and stored in
`student_paper_annotations`. They must end up in the Y.Doc without clashing
with teacher edits that are already there, and without duplicating if the
React Query cache refetches.

### Fix

Keep the existing flow:
- `getJobAnnotations` server action reads the latest enrichment run's rows
- React Query `jobAnnotations` cache holds them
- SSE invalidates on enrichment stage transitions

**New:** a bridge hook that applies new AI annotations to the Y.Doc
idempotently.

```ts
// apps/web/src/components/annotated-answer/apply-ai-annotations.ts
export function useApplyAiAnnotations(params: {
  editor: Editor | null
  ydoc: Y.Doc | null
  annotations: StudentPaperAnnotation[]
  gradingResults: GradingResult[]  // needed to know which question each attaches to
  tokens: PageToken[]              // for anchor resolution
  synced: boolean
}) { ... }
```

Algorithm:

1. Wait for `synced=true` AND `editor` ready AND the editor's text content
   is populated (questionAnswer blocks exist with OCR tokens). If any
   prerequisite is missing, return — we'll retry on the next render.
2. Collect the set of annotation IDs **currently present in the Y.Doc** by
   scanning PM marks. Store in a `Set<string>`. This is the source of truth
   for "what's been applied".
3. For each annotation in `annotations`:
   - If its ID is in the set, skip.
   - Otherwise, compute the char range from its anchor tokens (same logic
     as `buildAnnotatedDoc`'s token-range math) and dispatch a single
     `applyAnnotationMark` transaction inside a `ydoc.transact(..., "ai")`
     origin — so it's easy to distinguish from teacher edits in history.
4. AI annotations never *delete* via this path. If an AI annotation was
   removed by the teacher, the teacher's delete wins (it's already a CRDT
   op in the doc). If the enrichment run re-emits the annotation on a
   re-run, the set check means we won't re-add it; a re-run that wants to
   override teacher deletes would need explicit intent (new annotation ID).

Critical property: this hook is **append-only** from the AI side. The race
that motivated this plan was the *diff* inferring deletes. We don't diff
any more.

### Special case: first load with empty Y.Doc

On a brand-new submission (nothing in IndexedDB), the Y.Doc is empty. Step 1
requires "text content populated" — which means we need to seed the
questionAnswer blocks + OCR tokens before step 3 can anchor anything.

Seed flow:
- When `synced=true` AND Y.Doc is empty AND grading results + tokens have
  arrived: do a one-shot `editor.commands.setContent(buildAnnotatedDoc(...))`
  inside `ydoc.transact(..., "seed")`. This sets the skeleton doc (questions,
  text, ocrToken marks) into Yjs as a single op.
- Subsequent stage updates (e.g. more OCR data arriving) become a problem
  here — we can't `setContent` twice without clobbering teacher edits.

**Resolution**: tie the seed to OCR completion, not to arbitrary stage
updates. OCR produces all the text. Once OCR is `done`, seed once. Grading
updates NodeView-level attrs (via `GradingDataContext`), not doc content,
so they don't need a re-seed. Enrichment adds annotation marks via step 3
(incremental).

Edge case: OCR re-run. If OCR is re-triggered and produces different text,
we've got a genuine conflict — teacher edits anchored to old text are
stranded. Accept this for demo; document it. Production fix would be a
proper PM-level migration, out of scope.

### Files

- New: `apps/web/src/components/annotated-answer/apply-ai-annotations.ts`
- `annotated-answer-sheet.tsx` — call the hook; pass `ydoc`, editor,
  annotations, grading results, tokens
- Possibly split `buildAnnotatedDoc` so we can call `buildSeedDoc(ocr-only)`
  separately from the full build — the seed only needs text + ocrToken marks.
  Annotation marks are applied incrementally.

### Acceptance

- Loading a submission with enrichment complete, then refreshing the page,
  shows the same annotations without re-inserting (verify via React
  DevTools that no duplicate marks land on the doc)
- Teacher deletes an AI annotation, refreshes, it stays deleted (the
  delete is in the Y.Doc; the AI annotation ID is still present in the Y.Doc
  set — wait, this is wrong)

**Wait — deletion problem.** If the teacher deletes a mark, the PM op
removes the mark from the text ranges, but the *annotation ID* is no longer
anywhere in the doc. Next AI refetch: ID isn't in the set → we re-add it.

Fix: maintain a `Y.Map<string, "deleted" | "present">` on the Y.Doc as a
tombstone registry. When a teacher removes a mark, also write `deleted` for
its annotation ID. The apply hook's set check becomes:
*skip if ID present OR in tombstone map*.

Implementation: hook PM's `appendTransaction` to watch for removed
annotation marks, write tombstones in the same transaction. Well-defined
PM plugin pattern.

### Risks

- Tombstone registry is subtle. Mis-tracking = regressions (ghost
  annotations reappearing, real annotations getting eaten). Write unit
  tests for: teacher-remove, AI-reapply-after-remove, undo-of-remove,
  re-run-enrichment-with-new-id.
- Anchor resolution requires tokens. If tokens haven't loaded for a
  question yet, its annotations get queued until they do. Make sure the
  hook re-runs on token changes.

---

## Y-5 — Delete server persistence path

### Problem

Once Yjs owns teacher edits, the server-side persistence is dead code. Left
in place, it creates confusion about "where do teacher edits live" and
risks someone accidentally wiring it back up.

### Fix

Delete:
- `apps/web/src/lib/marking/annotations/mutations.ts` (`saveAnnotationEdits`)
- `apps/web/src/components/annotated-answer/use-annotation-sync.ts`
- `apps/web/src/components/annotated-answer/use-derived-annotations.ts` —
  no longer needed (we don't need to derive annotations for server sync;
  the Y.Doc is the source)
- `diffAnnotations` pure fn + its test
- `onDerivedAnnotations` prop on `AnnotatedAnswerSheet` + its plumbing up
  through `submission-view`

Update:
- `getJobAnnotations` — still needed to seed the Y.Doc. Keep.
- `student_paper_annotations` table — keep; it's the authoritative AI
  record. The `source` / `deleted_at` / `submission_id` columns still
  describe AI rows correctly.

### Files

~6 file deletes + 2 file updates (sheet + submission-view).

### Acceptance

- `grep -r "saveAnnotationEdits" apps/` returns nothing
- `grep -r "useAnnotationSync" apps/` returns nothing
- Typecheck clean
- Teacher edit, refresh, edit persists (Y.Doc via IndexedDB)
- Teacher edit, open same submission in new tab, edit appears in new tab
  (BroadcastChannel sync)

### Risks

- If we've missed a consumer of `saveAnnotationEdits`, it becomes a typecheck
  break. Acceptable; typecheck will catch.

---

## Y-6 — Multi-tab verification + rollback escape hatch

### Problem

Before committing, verify the thing actually does what we claim. And have
a kill switch in case demo-day reveals a regression.

### Fix

**Manual verification:**
1. Open submission X in tab A. Add a teacher mark. See it render.
2. Open submission X in tab B. Teacher mark from tab A should appear.
3. In tab B, delete an AI annotation. Tab A should show it disappear.
4. Close both tabs. Open tab C. Both edits persist (IndexedDB survived).
5. Trigger an enrichment re-run. New AI annotations land; teacher edits
   preserved; deleted AI annotations stay deleted (tombstones).

**Kill switch:** `NEXT_PUBLIC_DEEPMARK_YJS_EDITOR` env flag. When `false`,
fall back to the pre-Yjs rendering path (`content: doc` + `setContent`).
Allows a single-config-flip rollback if a demo bug shows up.

Delete the flag + the dead branch after the demo and once the Y-7 plan is
approved.

### Files

- `apps/web/.env.example` — document the flag
- `annotated-answer-sheet.tsx` — conditional render

### Acceptance

- All five manual verification steps pass
- Flag off → old path works, flag on → Yjs path works

---

## Y-7 — *(deferred)* y-websocket for real-time collaboration

### Scope

Replace `y-indexeddb` (single-browser) with `y-websocket` + y-indexeddb
(IndexedDB as offline cache, WebSocket as sync backbone). Enables real-time
co-editing, cursor awareness, and cross-device teacher access.

### Infra

New SST construct:
- `YWebsocketService` — small Node service running the `y-websocket`
  server. Either Fargate (persistent connections, natural fit) or Lambda
  WebSocket API (more fiddly, but already in our AWS toolbox).
- Auth: OpenAuth JWT validated on WebSocket upgrade
- Storage backend: `y-leveldb` on EFS, or `y-redis` for horizontal scaling

### Client

- Swap `IndexeddbPersistence` for `WebsocketProvider` + keep IndexedDB as a
  secondary provider (both attach to the same Y.Doc; Yjs merges ops from
  both sources).

### Enrichment bridge

Two options:
- **(a)** Keep current flow — enrichment writes to DB → client
  applies to Y.Doc. Simpler, works today.
- **(b)** Enrichment Lambda connects to y-websocket as a headless Yjs
  client and writes directly. Lower latency, no double source of truth.
  More moving parts.

Recommend starting with (a) and migrating to (b) if latency is a complaint.

### Timeline

3–5 days. Do it as its own project after demo validation, not part of the
demo build.

---

## Recommended sequencing

1. **Y-1 + Y-3** — scaffold the Y.Doc lifecycle; editor still renders the
   old way (gated by flag). ~2 h.
2. **Y-2 behind flag** — wire Collaboration extension, verify round-trip
   with hardcoded test doc. ~2 h.
3. **Y-4** — the hard one. Seed + incremental AI ingest + tombstones.
   ~4 h plus testing.
4. **Y-5** — delete-fest once Y-4 is stable. ~1 h.
5. **Y-6** — verification + flag cleanup path. ~1 h.

**Stop-and-ship points:**
- After Y-3: revertable no-op. Merge-safe.
- After Y-4: the demo-critical path works. Could ship behind flag.
- After Y-5: point of no return — server path is gone. Only do this after
  Y-4 passes full verification.

## Rollback

If a showstopper surfaces mid-demo:
- Flip `NEXT_PUBLIC_DEEPMARK_YJS_EDITOR=false` (from Y-6) — falls back to
  pre-Yjs rendering path. Teacher edits post-flip won't persist (server
  path is deleted), but at least nothing breaks.

If a showstopper surfaces post-Y-5 and needs actual rollback:
- Revert Y-5's commit.
- Re-wire `saveAnnotationEdits` path.
- Teacher edits made during the Yjs window remain in IndexedDB; migrate by
  running a one-shot "flush Y.Doc to DB" script per submission.

Prefer the flag path. That's why Y-6 exists as a first-class item.

## Notes on what stays unchanged

- `student_paper_annotations` schema — unchanged; still the AI-authoritative
  store. `submission_id NOT NULL` push from the session summary still goes
  ahead independently.
- Enrichment processor — unchanged. Still writes AI annotations on enrichment
  run completion.
- SSE + stage transitions — unchanged. Still drive invalidation of
  `jobAnnotations` query, which triggers Y-4's apply hook.
- `GradingDataContext` — unchanged. Grading scores/overrides are NodeView
  props, not doc content; they don't touch Yjs.
- Scan viewer + bounding box overlay — unchanged. Still reads from derived
  state via `useDerivedAnnotations` — wait, we're deleting that in Y-5. The
  derivation needs to move: instead of observing PM transactions, read from
  the Y.Doc directly (or keep the PM observer and just remove the server
  sync half of `use-derived-annotations`). Likely the latter is simpler —
  keep the PM observer, drop the sync side effect.
