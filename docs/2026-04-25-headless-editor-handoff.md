# Headless Editor + Phase E.5 Handoff — 2026-04-25

Session context for the next chat picking up where this one left off. Goes beyond `docs/all_in.md` because the architecture changed materially after Phase E.5 — the doc-write path is now a real headless ProseMirror editor, not the `updateYFragment` JSON-mutation pattern the original plan described.

## Executive summary

Three big workstreams landed in this session:

1. **Phase E.5 cleanup pass** (all 12 items from `docs/all_in.md`'s punch list) — closed.
2. **Architecture pivot: headless ProseMirror EditorView + ySyncPlugin in the Lambda** — closed and verified end-to-end against a live local Hocuspocus.
3. **Infra + tooling fixes that surfaced in (2)** — collab-server switched to Node, local dev mode wired correctly, missing IAM/SST links on the OCR Lambda — closed.

Phase F (production migration via `backfill-yjs-seeds.ts`) is still pending and needs to be written against the new architecture (not the original plan's `updateYFragment`-based approach).

## What changed and why

### 1. Phase E.5 cleanup (committed earlier in session)

All 12 punch-list items from `docs/all_in.md` "Phase E.5 detailed":

| # | Item | Result |
|---|---|---|
| E.5-1 | Delete 9 web barrel re-exports | 11 files removed, 9 consumers migrated to `@mcp-gcse/shared` |
| E.5-2 | Extract `loadTokensByQuestion` | New `packages/backend/src/lib/collab/load-tokens.ts` |
| E.5-3 | Wrap projection snapshot decode in try/catch | `annotation-projection.ts` logs `submissionId`/`key` and rethrows for SQS retry |
| E.5-4 | Move grading helpers to sibling folder | New `packages/backend/src/processors/student-paper-grade/annotations-to-ydoc.ts` |
| E.5-5 | `await` skeleton seed | `student-paper-extract.ts` no longer fires-and-forgets |
| E.5-6 | Unify segment builders | New `packages/shared/src/editor/segment-text.ts`; both call sites are thin wrappers |
| E.5-7 | Delete dead `connectAndMutate` | `headless-client.ts` removed; `buildSubmissionDocumentName` lives in `document-name.ts` |
| E.5-8 | Named `BindingMetadata` helper | (Subsequently deleted in §2 — `updateYFragment` no longer used) |
| E.5-9 | Tighten `MARK_SIGNALS` type | `ReadonlySet<MarkSignal>` + new `isMarkSignal` type-guard |
| E.5-10 | Replace `as` casts at snapshot boundary | `BboxSchema` Zod tuple parses bbox column |
| E.5-11 | Drop `noForEach` biome-ignore | `derive-annotations.ts` switched to `childCount`/`child(i)` |
| E.5-12 | Document Lambda's null `answer_char_*` fields | Inline comment in `load-tokens.ts` |

220/220 unit tests passing throughout.

### 2. Headless ProseMirror EditorView refactor (the big one)

**Why** Stuart originally asked for "the Lambda is a real PM editor". I'd built it via `@tiptap/y-tiptap`'s `updateYFragment` JSON-mutation pattern instead — CRDT-correct but not actually PM transactions, no ySyncPlugin binding, weaker concurrency story with live teacher edits. Stuart called this out, we pivoted.

**Verification gates** (read-only spike, all green):

1. ySyncPlugin populates initial doc from a non-empty fragment ✓
2. Our `"ai"` origin propagates to Y update events; `ySyncPluginKey` doesn't leak ✓
3. Per-dispatch granularity: 3 transactions → 3 Y updates → 3 reader applies ✓ (also: reader's final doc has all 3 marks visible)
4. Cold-start under 500 ms budget — measured **~25 ms** (jsdom DOM install + schema build + view construction) ✓

**New files** (`packages/backend/src/lib/collab/`):

- `headless-dom.ts` — idempotent `ensureHeadlessDom()` installs happy-dom globals on first call. Switched from jsdom to happy-dom because jsdom's `default-stylesheet.css` runtime asset fails to bundle through esbuild and throws ENOENT in Lambda.
- `headless-editor.ts` — `HeadlessEditor` class wrapping `HocuspocusProvider` + `Y.Doc` + `ySyncPlugin` + `EditorView`. Exposes `editor.transact((view) => ...)`. Also exports `createHeadlessView(doc)` for tests.

**Rewritten files**:

- `y-doc-ops.ts` — four ops (`insertQuestionBlock`, `setAnswerText`, `applyOcrTokenMarks`, `applyAnnotationMark`) now take `view: EditorView` and dispatch real PM `Transaction`s. ~150 lines of `readBlocks`/`writeBlocks`/`extract*`/`emptyBindingMetadata` machinery deleted.
- `y-doc-seed.ts` — `withCollabSession` → `withHeadlessEditor`. `fillAnswerTexts` and `applyAnnotationMarks` do **one transact per question** (not one bulk transact), so the teacher's editor fills in block-by-block.
- `editor-schema.ts` — `emptyBindingMetadata` removed (no more `updateYFragment`).
- `student-paper-extract.ts` and `student-paper-grade/annotations-to-ydoc.ts` — call sites take `editor` instead of `session`. Otherwise unchanged.

**Deleted**:

- `packages/backend/src/lib/collab/session.ts` (replaced by `headless-editor.ts`)
- jsdom + `@types/jsdom` from `packages/backend/package.json` (replaced by happy-dom)

**Schema change** (in both `packages/shared/src/editor/extensions.ts` and `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx`):

Top-level doc content stays as `(paragraph | questionAnswer | mcqTable)+` — I tried switching to `*` to allow truly empty docs, but that broke the browser editor with `TextSelection endpoint not pointing into a node with inline content (doc)` because PM can't init a selection in a doc with no inline content. Reverted to `+`. The fallout — ySyncPlugin auto-fills empty fragments with a placeholder paragraph — is handled in `insertQuestionBlock`: if the doc currently consists only of an empty paragraph, the new `questionAnswer` *replaces* it instead of appending after.

**Tests** (`packages/backend/tests/unit/`):

- `helpers/test-editor.ts` — new `createTestEditor()` returns `{ doc, view, cleanup }`, used by both ops + roundtrip tests.
- `y-doc-ops.test.ts` and `fragment-roundtrip.test.ts` — rewritten to exercise the view-based API. 51 unit tests pass.

### 3. Live Hocuspocus integration test

**File** `packages/backend/tests/integration/headless-editor-roundtrip.test.ts`

Two test cases against a real Hocuspocus instance:

1. Writer dispatches three transacts → reader observes three Y updates → final reader state matches writer byte-for-byte (text content, tick mark with `source: "ai"`).
2. Two writers + one reader, disjoint annotations → both marks land. CRDT merge confirmed.

**Run command:**

```bash
AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
  bunx vitest run --project=backend:integration \
    tests/integration/headless-editor-roundtrip.test.ts
```

Both pass in ~3 s. Last run: `2 passed (2)`.

**Bug discovered + fixed during integration testing**: `@hocuspocus/provider` v4.x's `websocketProvider:` constructor form is silently broken under Node — the provider attaches but never connects, never auths, never syncs, no events fire. The `url:` form (passing `WebSocketPolyfill` as a sibling option) works fine. Both `HeadlessEditor.open` and the test reader now use the url-form. **Do not** revert to the websocket-form — it took a probe script to figure this out, and the failure mode is total silence.

### 4. Infra fixes

#### `infra/collab.ts` — three-branch deploy shape

Original code only wired up the local dev process when `isPermanentStage` was true (which is never true for `sst dev` on a personal stage). Rewritten to gate on `$dev` first:

```ts
if ($dev) {
  // sst dev — spawn a local Hocuspocus process, no cloud resources
  new sst.x.DevCommand("HocuspocusDev", {
    dev: { command: "bun run dev", directory: "packages/collab-server", autostart: true },
    link: [scansBucket, authUrlLink, collabServiceSecret],
  })
}

export const collabServer = $dev
  ? new sst.Linkable("HocuspocusServer", { properties: { url: localCollabUrl } })
  : isPermanentStage
    ? new sst.aws.Service(...)            // permanent stage: real ECS deploy
    : new sst.Linkable("HocuspocusServer", { properties: { url: sharedCollabUrl } })  // PR preview: shared
```

`$dev` cannot use the `Service` constructor with `dev: { command }` because `Service` requires a `cluster:` and constructing one provisions a real VPC + ECS cluster (~$6/mo NAT per dev stage). `sst.x.DevCommand` is the right primitive for "local-only dev process, no cloud graph nodes."

#### `packages/collab-server/` — Bun → Node + tsx

`@hocuspocus/server` v4.x hard-imports `crossws/adapters/node`, which explicitly throws under Bun. So the collab server can't run on Bun, neither in dev nor production.

- `package.json`: `"dev": "tsx watch src/index.ts"`, `"start": "tsx src/index.ts"`. `tsx` moved to `dependencies` (not devDeps) so `bun install --production` includes it.
- `Dockerfile`: install layer uses `oven/bun:1.2-slim`, runtime layer uses `node:22-slim`, `CMD ["node", "--import", "tsx", "src/index.ts"]`.

#### `infra/queues.ts` — missing links on the OCR Lambda

`studentPaperOcrQueue.subscribe` was missing `collabServer` and `collabServiceSecret` from its link list. The grading queue had them already. This is why grading partially worked (the grading Lambda *did* have the links) but OCR didn't — `withHeadlessEditor` crashed at `Resource.CollabServiceSecret.value` because the resource wasn't bound to that function.

Symptom in the SST dev log: `"CollabServiceSecret" is not linked in your sst.config.ts to st-StudentPaperOcrQueueSubscriberBbznmdFunctionFunction-…`.

Added: `collabServer`, `collabServiceSecret`, plus `environment: { STAGE: $app.stage }` so `buildSubmissionDocumentName` resolves correctly.

## Verification status

| Layer | Status | How to verify |
|---|---|---|
| Unit tests (backend, shared, web) | 220/220 ✓ | `bunx vitest run --project=backend:unit --project=web:unit --project=shared:unit` |
| Typecheck (all packages incl. web) | clean | `bunx turbo typecheck --filter='!@mcp-gcse/db'` and `cd apps/web && bunx tsc --noEmit` |
| Biome | 11 pre-existing errors, none new | `bunx biome check packages/backend/src/ packages/shared/src/ apps/web/src/` |
| Headless editor live integration | 2/2 ✓ | command above |
| End-to-end pipeline (OCR → grade → projection → browser shows) | **NOT FULLY VERIFIED YET** | restart `sst dev`, trigger a grading on a fresh submission |

## Outstanding issues

### 1. Browser SQL warning from `@neondatabase/serverless`

```
WARNING: Running SQL directly from the browser can have security implications…
```

Three files import runtime (non-type) values from `@mcp-gcse/db`:

- `apps/web/src/lib/admin/usage/queries.ts:4` — `import { Prisma } from "@mcp-gcse/db"`
- `apps/web/src/lib/exam-paper/paper/mutations.ts:9`
- `apps/web/src/lib/marking/submissions/queries.ts:11`

CLAUDE.md is explicit: *"Never import runtime values from `@mcp-gcse/db` into client components — only `import type`."* The `Prisma` namespace one is most likely a `import type` candidate (only used for types like `Prisma.JsonValue`, `Prisma.InputJsonValue`). The other two need to be inspected — even if they're called only from server actions, Next.js can bundle them into client-reachable graphs through transitive imports.

### 2. Tombstone registry for regrade (pre-existing, called out in `docs/all_in.md`)

Currently `applyAnnotationMark` adds; nothing removes. On regrade, old AI marks accumulate alongside new ones. Teacher deletes of AI marks reappear on re-run. Mark deduplication on identical ranges merges (PM default behavior, no `excludes: ""` set), so pure idempotent regrade doesn't visibly duplicate — but variant outputs accumulate.

Fine for alpha, needs fixing before paid rollout.

### 3. Phase F migration script — `packages/backend/scripts/backfill-yjs-seeds.ts`

**Not written.** The original plan in `docs/all_in.md` describes a `prosemirrorJSONToYXmlFragment` one-shot bulk seed. With the architecture pivot, the cleaner path now is to use `HeadlessEditor` itself: open a session per legacy submission, dispatch the PM transactions equivalent to `seedSkeleton` + `fillAnswerTexts` + `applyAnnotationMarks` from the existing DB rows, close. Same write path the live Lambdas use, no parallel code path to maintain.

This needs to be written and run once per stage before the new system can fully replace the old.

### 4. Schema / mark `excludes: ""`

Annotation marks (`tick`, `cross`, etc.) in `packages/shared/src/editor/annotation-marks.ts` don't have `excludes: ""` set. Default PM behavior: two marks of the same type on the exact same range merge into one. In practice no current consumer hits this (annotations on the same range are rare), but worth flagging — if AI ever annotates the same span with two distinct annotationIds, only one survives.

## Where to start next

1. **Confirm end-to-end works after the queue link fix.** Restart `sst dev`, trigger an OCR + grading on a fresh submission, watch the SST dev console. Expected:
   - No `Headless editor session failed` warns from `student-paper-extract` or `student-paper-grade`.
   - Browser shows the document populating progressively (skeleton → text → marks).
   - `student_paper_annotations` rows appear in Neon within ~5 s of grading complete (projection Lambda picks up the S3 snapshot).
2. If (1) works, **write Phase F migration script** (item 3 above).
3. **Investigate the Neon SQL browser warning** (item 1) — separate from the collab work, but visible in current logs.

## Files of interest

- `docs/all_in.md` — original plan (now partially superseded by the architecture pivot — see §2 above for the corrections).
- `docs/collab-verification.md` — manual smoke test guide (referenced by all_in.md, exists in working dir).
- `packages/backend/src/lib/collab/headless-editor.ts` — the new heart of the Lambda → Y.Doc write path.
- `packages/backend/src/lib/collab/y-doc-ops.ts` — the four ops (real PM transactions).
- `packages/backend/tests/integration/headless-editor-roundtrip.test.ts` — live integration test, the canonical "does this thing actually work" check.
- `infra/collab.ts` — the three-branch deploy shape (dev / permanent / PR preview).

## Open repository state

`git status` at handoff time will show:

- Modified: `infra/queues.ts`, `infra/collab.ts`, `infra/shared.ts` (reverted), several files under `packages/backend/src/lib/collab/`, `packages/backend/src/processors/`, `packages/shared/src/editor/`, `apps/web/src/components/annotated-answer/`.
- New: `packages/backend/src/lib/collab/{headless-dom,headless-editor,document-name,load-tokens}.ts`, `packages/backend/src/processors/student-paper-grade/annotations-to-ydoc.ts`, `packages/backend/tests/unit/helpers/test-editor.ts`, `packages/backend/tests/integration/headless-editor-roundtrip.test.ts`, `packages/shared/src/editor/segment-text.ts`, this file.
- Deleted: `packages/backend/src/lib/collab/{session,headless-client,write-ai-annotations}.ts`, `packages/backend/src/lib/annotations/persist-annotations.ts`, plus the 11 web barrel re-exports.

Nothing committed yet — Stuart hasn't asked for a commit, and the end-to-end path hasn't been confirmed working yet.
