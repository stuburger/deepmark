# Build Plan — Kitchen-Sink Collaborative Annotation

> Snapshot: 2026-04-24. The "full nine yards" version of the Yjs annotation
> build. Replaces the diff-based server persistence model with a **live,
> collaboratively-edited Y.Doc hosted in Hocuspocus on ECS**, persisted to S3,
> projected into Neon via an S3-event-triggered Lambda. Lambdas (enrichment,
> OCR backfills) act as headless Yjs clients so the Y.Doc is the one source
> of truth for the annotated document. Supersedes `build-plan-yjs-indexeddb.md`
> for the collaborative path; the IndexedDB-only plan remains a valid fallback
> if we decide this is too much for the timeline.

## Why

All three problems from the IndexedDB plan (autosave race, single-tab, no
collab future) plus two structural wins that fall out of going collab-first:

1. **Single source of truth.** The Y.Doc in Hocuspocus is the canonical
   document state. Teachers, enrichment Lambda, and analytics all read/write
   against the same CRDT. No diff, no tombstone registry, no "ingest hook"
   to get right — deletions are just ops in the doc, and CRDT merge handles
   concurrent writers natively.
2. **Real collaboration from day one.** Same-submission co-editing across
   devices and users (e.g. moderation: two teachers annotating the same
   script at once) is included for free. Awareness/cursors can be added
   as a post-demo polish item without architectural change.

The IndexedDB-only plan is faster to ship (~1 day) but forecloses on
real-time collab and keeps AI ingestion as a client-side problem. This plan
takes ~3–5 days but gives us the collab substrate and structurally removes
the hardest step (Y-4 of the IndexedDB plan) by moving AI annotation ingest
server-side.

## Scope

**In scope:**
- Shared infra layer: VPC, ECS cluster, Hocuspocus service — shared across
  non-prod stages via a reserved `shared` stage; production gets its own.
- `packages/collab-server/` — Hocuspocus server with OpenAuth JWT auth and
  S3-backed persistence.
- Projection Lambda: S3 `ObjectCreated` → decode Y.Doc → upsert
  `student_paper_annotations` rows in Neon.
- Enrichment Lambda refactor: connect to Hocuspocus as a headless client,
  apply AI annotation ops, disconnect. Replaces direct DB writes for
  annotations.
- Web client: `HocuspocusProvider` + `IndexeddbPersistence` both attached to
  the Y.Doc. IndexedDB stays as offline cache + multi-tab sync.
- Deletion of server-side diff persistence path (`saveAnnotationEdits`,
  `useAnnotationSync`, `useDerivedAnnotations`, `diffAnnotations`).

**Out of scope (deferred):**
- Multi-task Hocuspocus with Redis-backed awareness (y-redis extension).
  Single Fargate task covers us until we see real concurrency need.
- Awareness UI (live cursors, presence indicators). Works out of the box
  via Yjs awareness protocol; we just don't render it yet.
- Moving non-prod infra into its own SST app. Reconsider when we have a
  second product app or independent infra deploy cadence.
- VPC peering to Neon (still accessed over public internet; Neon's
  private-networking is paid and unnecessary at this scale).
- Snapshot history / time-travel UI.

## Architecture

```
┌─ browser ─────────────┐        ┌─ ECS Fargate ────────┐        ┌─ storage ──┐
│ Y.Doc                 │        │ Hocuspocus           │        │            │
│ + y-indexeddb         │ <────> │ - onAuthenticate     │ <────> │ S3 (snap)  │
│ + HocuspocusProvider  │   WSS  │   → OpenAuth verify  │        │            │
│ + tiptap Collab ext   │        │ - Database ext       │        └──────┬─────┘
└───────────────────────┘        │   → S3 read/write    │               │ event
                                 │ (single task,        │               ▼
┌─ enrichment lambda ───┐        │  public subnet,      │        ┌─ projection ┐
│ headless Y.Doc client │ <────> │  no NAT)             │        │ Lambda      │
│ applies AI ops        │   WSS  └──────────────────────┘        │ → Prisma    │
└───────────────────────┘                                        │   upsert    │
                                                                 └──────┬──────┘
                                                                        ▼
                                                                     Neon
```

Non-prod stages share the same Hocuspocus service. Isolation is per-document:
`${stage}:submission:${submissionId}`. Production runs its own service in
its own VPC.

## Summary

| # | Item | Effort | Scope |
|---|---|---|---|
| K-1 | Shared infra: `shared` stage, VPC, cluster, get-or-create pattern | 0.5 d | `infra/shared.ts`, `sst.config.ts` |
| K-2 | `packages/collab-server/` skeleton + S3 persistence + OpenAuth hook | 0.5 d | new package |
| K-3 | SST `Service` construct, ALB + domain, `dev.command` for local | 0.5 d | `infra/collab.ts` |
| K-4 | Web client `useYDoc` with HocuspocusProvider + IndexedDB | 0.5 d | new `apps/web` hook |
| K-5 | Tiptap `Collaboration` extension swap; delete `setContent` dance | 0.5 d | `annotated-answer-sheet.tsx` |
| K-6 | Enrichment Lambda as headless client; service-token auth | 0.5 d | `processors/student-paper-enrich.ts` |
| K-7 | Projection Lambda: S3 event → `student_paper_annotations` upsert | 0.5–1 d | new queue + processor |
| K-8 | Delete server diff persistence path | 0.5 d | ~6 files |
| K-9 | Verification: multi-tab, multi-device, cross-stage isolation, failure cases | 0.5 d | manual QA + feature flag |

**Target total:** 3–5 focused days. Sequencing allows stop-and-ship after
K-6 (collab works end-to-end); K-7 and K-8 are cleanup.

**Recommended order:** K-1 → K-2 → K-3 → K-4/K-5 (parallel) → K-6 → K-7 → K-8 → K-9.

---

## K-1 — Shared infrastructure

### Problem

ECS needs a VPC. DeepMark is fully serverless today; adding containerised
services requires VPC + cluster scaffolding. We want this once, shared across
non-prod stages to avoid 5-min VPC provisioning per PR preview and N×
ALB/Fargate cost.

### Fix

Reserved `shared` stage of the same SST app owns the VPC and cluster.
Other non-prod stages `.get()` them. Production creates its own.

```ts
// infra/shared.ts
const isProd = $app.stage === "production"
const isShared = $app.stage === "shared"

export const vpc =
  isProd || isShared
    ? new sst.aws.Vpc("Vpc", { az: 2 })  // no NAT — tasks run in public subnets
    : sst.aws.Vpc.get("Vpc", SHARED_VPC_ID)

export const cluster =
  isProd || isShared
    ? new sst.aws.Cluster("Cluster", { vpc })
    : sst.aws.Cluster.get("Cluster", SHARED_CLUSTER_NAME)
```

**Bootstrap:** `AWS_PROFILE=deepmark npx sst deploy --stage=shared` once.
Outputs the VPC ID and cluster name — paste into `SHARED_VPC_ID` /
`SHARED_CLUSTER_NAME` constants (or better: SSM Parameter Store under
`/deepmark/shared/*`, read at deploy time).

**No NAT.** Tasks go in public subnets with security groups restricting
inbound to ALB SG only. Saves $33/mo (managed NAT) or $3/mo (EC2 NAT) per
AZ and is appropriate because the service is internet-facing by design.

### Files
- New: `infra/shared.ts`
- Update: `sst.config.ts` — register the shared module

### Acceptance
- `sst deploy --stage=shared` provisions VPC + cluster once
- Subsequent `sst deploy --stage=<personal>` reuses them via `.get()`
- `sst remove --stage=<personal>` never touches the shared VPC/cluster

### Risks
- **Stale shared VPC IDs in code.** If we rebuild `shared` from scratch,
  all consuming stages need to redeploy with the new ID. Mitigate by
  sourcing IDs from SSM rather than hardcoding.
- **Single shared service = shared availability.** If the shared
  Hocuspocus task crashes, all non-prod stages lose collab. Fine for
  non-prod; prod has its own task.

---

## K-2 — Collab server package

### Problem

Nothing in the repo runs a Hocuspocus server today. We need a containerised
long-running Node service that validates OpenAuth JWTs on connect, loads
Y.Doc snapshots from S3, and persists snapshots back on debounced write.

### Fix

New `packages/collab-server/` package. Minimal Hocuspocus setup with the
`Database` extension pointed at S3.

```ts
// packages/collab-server/src/index.ts
import { Server } from "@hocuspocus/server"
import { Database } from "@hocuspocus/extension-database"
import { Resource } from "sst"
import { verifyOpenAuthToken } from "./auth"
import { loadSnapshot, saveSnapshot } from "./persistence"

const server = new Server({
  port: Number(process.env.PORT ?? 1234),
  async onAuthenticate({ token, documentName }) {
    const claims = await verifyOpenAuthToken(token)
    if (claims.role === "service") return { userId: "service", role: "service" }
    const [, submissionId] = documentName.split(":").slice(-2)
    await assertCanAccessSubmission(claims.userId, submissionId)
    return { userId: claims.userId, role: claims.role }
  },
  extensions: [
    new Database({
      fetch: ({ documentName }) => loadSnapshot(documentName),
      store: ({ documentName, state }) => saveSnapshot(documentName, state),
    }),
  ],
})

server.listen()
```

S3 key layout: `yjs/{documentName}.bin` where `documentName` is
`{stage}:submission:{submissionId}`. `saveSnapshot` writes
`Y.encodeStateAsUpdate(doc)` bytes; `loadSnapshot` returns bytes or `null`.

`Dockerfile`:

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --production
COPY src ./src
EXPOSE 1234
HEALTHCHECK --interval=30s CMD bun run src/health.ts || exit 1
CMD ["bun", "src/index.ts"]
```

`package.json` dev script: `bun --hot src/index.ts` — clients auto-reconnect
on restart, Hocuspocus replays state from S3.

### Files
- New: `packages/collab-server/package.json`
- New: `packages/collab-server/Dockerfile`
- New: `packages/collab-server/src/index.ts`
- New: `packages/collab-server/src/auth.ts` (OpenAuth JWT verify)
- New: `packages/collab-server/src/persistence.ts` (S3 read/write)

### Acceptance
- `bun run dev` (from `packages/collab-server`) starts the server on :1234
- A test client using `HocuspocusProvider` with a valid OpenAuth token
  connects, syncs, and changes persist across reconnect
- Invalid / missing token → connection rejected with clear error

### Risks
- **Y.Doc item size in S3.** Merged snapshots are small (KB-scale) for our
  use case; no concern. If they ever exceed a threshold we define, we can
  split into delta logs — but not needed for demo.
- **`bun --hot` state loss on restart.** Clients reload from S3 within a
  few seconds; their IndexedDB also holds state. No data loss, brief
  reconnect blip.

---

## K-3 — SST Service deploy

### Problem

Need to actually deploy the collab server to AWS (for non-shared stages,
`.get()` the shared one) and run it locally in `sst dev` without redeploying
the container on every change.

### Fix

```ts
// infra/collab.ts
import { cluster } from "./shared"
import { scansBucket } from "./storage"

const isProd = $app.stage === "production"
const isShared = $app.stage === "shared"

export const collabServer =
  isProd || isShared
    ? new sst.aws.Service("HocuspocusServer", {
        cluster,
        image: { context: "./packages/collab-server" },
        link: [scansBucket, Resource.OpenAuthIssuer],
        loadBalancer: {
          ports: [{ listen: "443/https", forward: "1234/http" }],
          domain: { name: isProd ? "collab.deepmark.app" : "collab.dev.deepmark.app" },
        },
        dev: {
          command: "bun run dev",
          directory: "packages/collab-server",
          url: "http://localhost:1234",
          autostart: true,
        },
        scaling: { min: 1, max: 4, cpuUtilization: 70 },
        cpu: "0.25 vCPU",
        memory: "0.5 GB",
        health: { path: "/health" },
      })
    : sst.aws.Service.get("HocuspocusServer", SHARED_SERVICE_NAME)
```

`Resource.HocuspocusServer.url` is now a first-class resource for both the
Next.js app and the enrichment Lambda. In `sst dev` it resolves to
`http://localhost:1234`; deployed it's the ALB domain. Clients swap
`http→ws` / `https→wss` at the call site.

**Task placement:** public subnets with public IPs so tasks reach OpenAuth
issuer + S3 without NAT. SG locks inbound to the ALB SG only. Exact prop
name is SST-version-dependent (`publicAssignIp` / `assignPublicIp`) —
confirm at implementation time.

### Files
- New: `infra/collab.ts`
- Update: `sst.config.ts` — register `infra/collab.ts`

### Acceptance
- `sst deploy --stage=shared` provisions VPC + cluster + Hocuspocus service
- `sst dev --stage=<personal>` starts Hocuspocus locally in a tab, no AWS
  deploy needed
- `wscat -c wss://collab.dev.deepmark.app -H "Authorization: Bearer <jwt>"`
  completes the Yjs handshake
- `Resource.HocuspocusServer.url` is reachable from a linked Lambda

### Risks
- **ALB WebSocket stickiness.** Target group cookie-based stickiness pins a
  client to a task. Single-task deploys don't need it but we should enable
  it now so scaling out later doesn't introduce a bug.
- **Certificate provisioning delay.** ACM cert for `collab.deepmark.app`
  can take a few minutes on first deploy. Expected; not a blocker.

---

## K-4 — Web client: `useYDoc` with HocuspocusProvider

### Problem

Nothing owns the Y.Doc lifecycle on the client. It needs to live as long
as the submission view is mounted, be bound to a Hocuspocus connection, and
also persist locally in IndexedDB as offline cache + multi-tab sync.

### Fix

```ts
// apps/web/src/components/annotated-answer/use-y-doc.ts
export function useYDoc(submissionId: string): {
  doc: Y.Doc | null
  provider: HocuspocusProvider | null
  synced: boolean
}
```

- Creates a `Y.Doc` keyed by `submissionId`
- Attaches `IndexeddbPersistence('deepmark-annotations-' + submissionId, doc)` first (hydrates from cache instantly)
- Attaches `HocuspocusProvider` second (syncs with server)
- Resolves `synced` when **both** persistence have emitted `synced`
- Tears down on unmount: `provider.destroy()` → `indexeddb.destroy()` → `doc.destroy()`
- Re-creates on `submissionId` change

Both providers attach to the same `Y.Doc`. Yjs merges the two update streams
natively — IndexedDB gives fast first paint, HocuspocusProvider catches up
with server state.

Document name sent to Hocuspocus: `${stage}:submission:${submissionId}`.
Stage comes from a build-time constant or a public env var; stages are
isolated at the doc-name level, not network level.

Token: fetched from an existing OpenAuth-authenticated server action, passed
into the provider config. Expires handling: on `onAuthenticationFailed`,
refetch token and reconnect.

### Files
- New: `apps/web/src/components/annotated-answer/use-y-doc.ts`
- New: `apps/web/src/lib/collab/get-collab-token.ts` — server action returning OpenAuth JWT
- Update: `apps/web/package.json` — add `yjs`, `y-indexeddb`, `@hocuspocus/provider`, `@tiptap/extension-collaboration`

### Acceptance
- Hook returns `{ doc: null, synced: false }` on first render
- Transitions to `{ doc, synced: true }` after IndexedDB replay + Hocuspocus sync
- Opening the same submission in two tabs: edits in one appear in the other within ~200ms
- Going offline: local edits persist; on reconnect, they flush to Hocuspocus and sync to other tabs

### Risks
- **Token expiry mid-session.** Need auto-refresh path. `onAuthenticationFailed` + token refresh + reconnect.
- **Clock skew / stage mismatch.** If a client builds with `NEXT_PUBLIC_STAGE=dev` but hits the prod Hocuspocus, doc names won't match and nothing loads. Single source of truth: read `Resource.HocuspocusServer.url` and infer stage.

---

## K-5 — Tiptap `Collaboration` extension swap

### Problem

`annotated-answer-sheet.tsx` currently drives content via `content: doc` +
a `useEffect` that calls `editor.commands.setContent(...)` with
cursor/focus/IME preservation. With Yjs, the editor binds to a
`Y.XmlFragment` and all that dance goes away.

### Fix

Same as Y-2 from the IndexedDB plan, but `ydoc` comes from the
HocuspocusProvider-backed hook. Swap `content`/`setContent`/`History` for
`Collaboration.configure({ document: ydoc, field: "doc" })`.

Delete:
- `content: doc` prop
- Stage-transition `useEffect` that calls `setContent`
- `lastDocFpRef`, cursor preservation, IME guard
- `History` extension (conflicts with Yjs undo manager)

### Files
- `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx`
- `apps/web/src/app/.../grading-results-panel.tsx` — gate on `synced` before rendering sheet

### Acceptance
- Editor renders immediately when `synced=true`
- Stage transitions re-render only affected nodes (React Profiler confirms)
- Cursor/IME/focus preserved across concurrent remote updates with zero custom handling

### Risks
- **PM schema → Yjs round-trip.** `questionAnswer`, `mcqTable`, `ocrToken`,
  annotation marks — all need to survive. Write an isolated round-trip
  unit test before integrating: `apps/web/src/components/annotated-answer/__tests__/y-doc-roundtrip.test.ts`.
- **Undo behaviour.** y-prosemirror's undo manager undoes the local user's
  ops only, not remote ops. This is correct but a behaviour change.
  Verify with a two-tab test.

---

## K-6 — Enrichment Lambda as headless Yjs client

### Problem

AI annotations are produced by `processors/student-paper-enrich.ts`.
Currently this writes rows directly to `student_paper_annotations`.
In the collab architecture, that row-write is no longer the primary
path — the Y.Doc is. Row writes become a projection (see K-7).

### Fix

Enrichment Lambda connects to Hocuspocus as a headless Yjs client, applies
AI annotation ops inside a `ydoc.transact(..., "ai")`, and disconnects.
Same code path as the browser; CRDT merge handles any concurrent teacher
edits.

```ts
import { HocuspocusProviderWebsocket, HocuspocusProvider } from "@hocuspocus/provider"
import WebSocket from "ws"
import * as Y from "yjs"
import { Resource } from "sst"

async function applyAiAnnotations(submissionId: string, annotations: Annotation[]) {
  const wsUrl = Resource.HocuspocusServer.url.replace(/^http/, "ws")
  const socket = new HocuspocusProviderWebsocket({ url: wsUrl, WebSocketPolyfill: WebSocket })
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: `${STAGE}:submission:${submissionId}`,
    token: await mintServiceToken(),
    document: new Y.Doc(),
  })
  await once(provider, "synced")
  provider.document.transact(() => {
    for (const ann of annotations) applyAnnotationMark(provider.document, ann)
  }, "ai")
  // Wait for the update to flush to server before disconnecting
  await provider.sendStateless("flush")
  await provider.destroy()
  socket.destroy()
}
```

**Service token:** OpenAuth issuer mints a JWT with `role: "service"` that
bypasses per-user ACL checks. Short TTL (5 min), minted fresh each invocation.

**Seed case:** on a brand-new submission, the Y.Doc in Hocuspocus is empty.
The first Lambda to connect (typically OCR completion) seeds the document
skeleton (question blocks + OCR tokens) via the same transact mechanism.
Subsequent AI annotation application just adds marks to existing text ranges.

### Files
- Update: `packages/backend/src/processors/student-paper-enrich.ts` — replace DB writes with headless client writes
- Update: `packages/backend/src/processors/student-paper-extract.ts` — seed Y.Doc skeleton on OCR completion
- New: `packages/backend/src/lib/collab/headless-client.ts` — reusable `connectAndTransact` helper
- New: `packages/backend/src/lib/collab/service-token.ts` — OpenAuth service-token minting

### Acceptance
- Run enrichment on a submission → Y.Doc in Hocuspocus reflects new AI annotations within seconds of Lambda completion
- Client already open on that submission sees annotations appear without reload
- Two concurrent enrichment runs on the same submission: CRDT merges cleanly; no duplicates
- Kill the Lambda mid-write: SQS retry → annotations apply correctly (idempotent by annotation ID)

### Risks
- **Lambda cold start + WS handshake latency.** ~500ms–1s overhead per invocation. Acceptable for enrichment (not a hot path).
- **Service token scope creep.** `role: "service"` bypasses ACL. Keep the minting path tightly scoped to the enrichment code path; audit-log every service-token issuance.
- **Flush timing.** Need to ensure the update actually reached the server before disconnecting. Hocuspocus provider has a `sendStateless` / awaitable flush pattern; verify at implementation time.

---

## K-7 — Projection Lambda: Y.Doc → `student_paper_annotations`

### Problem

Analytics queries, search, and anything that doesn't load the Y.Doc need
flat annotation rows in Neon. The Y.Doc is canonical; SQL is a projection.

### Fix

S3 `ObjectCreated:*` event on `yjs/*.bin` → SQS → Lambda. Lambda downloads
the snapshot, decodes the Y.Doc, walks the ProseMirror tree collecting
annotation marks, upserts rows into `student_paper_annotations`.

```ts
// packages/backend/src/processors/annotation-projection.ts
export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const s3Event = JSON.parse(record.body) as S3Event
    for (const s3Record of s3Event.Records) {
      const { submissionId, stage } = parseKey(s3Record.s3.object.key)
      if (stage !== CURRENT_STAGE) continue  // stage isolation

      const bytes = await downloadS3Object(s3Record.s3.object.key)
      const doc = new Y.Doc()
      Y.applyUpdate(doc, new Uint8Array(bytes))
      const annotations = extractAnnotations(doc, submissionId)

      await prisma.$transaction([
        prisma.studentPaperAnnotation.deleteMany({ where: { submissionId, source: "ai" } }),
        prisma.studentPaperAnnotation.createMany({ data: annotations }),
      ])
    }
  }
}
```

Idempotent: the `deleteMany + createMany` pair produces the same final state
regardless of how many times the event fires.

**Debouncing:** Hocuspocus's `Database` extension debounces writes (default
~2s). So the projection fires at most every ~2s per active document, not
per-keystroke. Additional SQS batching keeps it cheap.

**Teacher edits in projections:** the projection reflects the full Y.Doc
state, including teacher overrides. If we want to distinguish AI vs teacher
annotations in analytics, split by `source` — the mark attrs already carry
origin info when applied (`ydoc.transact(..., "ai")` vs teacher).

### Files
- New: `packages/backend/src/processors/annotation-projection.ts`
- New: `infra/queues.ts` — `AnnotationProjectionQueue` + S3 event notification
- New: `packages/backend/src/lib/annotations/extract-from-ydoc.ts` — PM tree walker

### Acceptance
- Teacher edits annotation → Y.Doc saves to S3 within 2s → projection Lambda fires → `student_paper_annotations` rows match Y.Doc state within ~5s
- Enrichment Lambda writes AI ops → same projection path, rows updated
- Replay the same S3 event 10×: final row state is identical (idempotent)

### Risks
- **Stage cross-contamination.** S3 events fire on any `yjs/*.bin` write. The `stage` prefix filter in the handler guards against a dev stage's Y.Doc hitting the prod Neon branch. Alternatively: scope the S3 notification to `yjs/{stage}/*.bin` using per-stage prefixes.
- **Deletion-reflected-as-tombstone-vs-delete.** `student_paper_annotations.deleted_at` is kept for teacher-deleted AI annotations. Projection sets `deleted_at = now()` on annotations in `source=ai` that are no longer in the Y.Doc, rather than hard-deleting.
- **Large document walks.** Projection scans the whole doc on every write. Acceptable at our scale (docs are small). If it becomes slow, switch to incremental projection based on Y.Doc update deltas.

---

## K-8 — Delete server diff persistence path

### Problem

Once Hocuspocus + projection own the write path, the diff-based server
persistence is dead code that risks confusion and accidental re-wiring.

### Fix

Delete:
- `apps/web/src/lib/marking/annotations/mutations.ts` (`saveAnnotationEdits`)
- `apps/web/src/components/annotated-answer/use-annotation-sync.ts`
- `apps/web/src/components/annotated-answer/use-derived-annotations.ts`
- `diffAnnotations` pure fn + its test
- `onDerivedAnnotations` prop + plumbing through `submission-view`

Keep:
- `getJobAnnotations` server action — still useful for initial bootstrap or fallback reads (e.g. if Hocuspocus is down)
- `student_paper_annotations` schema — unchanged; now populated by projection Lambda rather than direct writes

Scan viewer / bounding box overlay: currently reads from `useDerivedAnnotations`. Replace with a lighter hook that observes the Y.Doc directly (same pattern as `useYDoc` but scoped to mark extraction).

### Files
~6 deletes + ~3 updates (sheet, submission-view, scan-viewer).

### Acceptance
- `grep -r "saveAnnotationEdits" apps/` returns nothing
- `grep -r "useAnnotationSync" apps/` returns nothing
- `grep -r "diffAnnotations" apps/ packages/` returns nothing
- Typecheck clean
- Teacher edit → Y.Doc update → S3 → projection → row in Neon (verify via `mcp__Neon__run_sql`)
- Scan viewer still highlights regions correctly from the Y.Doc

### Risks
- **Hidden consumer.** Typecheck catches missed callers. Low risk.

---

## K-9 — Verification + rollback escape hatch

### Problem

Before committing to deletion of the server diff path (K-8), verify the
collab stack does what we claim. Have a kill-switch for demo-day regressions.

### Fix

**Manual verification checklist:**
1. Teacher opens submission X in tab A, adds a mark. Tab B (same browser) shows the mark within ~200ms (BroadcastChannel).
2. Teacher opens submission X on a second device. Edits in tab A on device 1 appear on device 2 within ~500ms (WebSocket).
3. Tab A deletes an AI annotation. Tab B sees it disappear. Refresh tab A — deletion persists. Re-run enrichment — annotation stays deleted (CRDT op is authoritative).
4. Close all tabs. S3 snapshot persists. New tab shows current state.
5. Two stages (`stuartbourhill` + `geoffwaugh`) editing different submissions concurrently — zero cross-contamination (stage-prefixed doc names).
6. Kill Hocuspocus task mid-edit. ECS restarts task within ~30s. Clients reconnect automatically. No data loss (IndexedDB preserved local state; server state restored from S3).
7. Neon projection: `SELECT * FROM student_paper_annotations WHERE submission_id = '<id>'` reflects current Y.Doc state within ~5s of last edit.
8. Trigger enrichment Lambda on a submission with existing teacher edits. Teacher edits preserved; new AI annotations applied alongside; deleted AI annotations stay deleted.

**Kill switch:** `NEXT_PUBLIC_DEEPMARK_COLLAB_MODE` env flag.
- `collab` (default after ship): HocuspocusProvider active.
- `indexeddb-only`: fall back to IndexedDB-only path (same as the
  IndexedDB-only plan's final state). Server persistence is still gone,
  so this is "local-only editing" mode for the demo.
- `legacy`: revert further to `content: doc` + `setContent` rendering
  with NO persistence. True last-resort rollback.

Delete the flag + dead branches post-demo once the collab path is proven.

### Files
- `apps/web/.env.example` — document `NEXT_PUBLIC_DEEPMARK_COLLAB_MODE`
- `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx` — conditional render by mode

### Acceptance
- All 8 verification steps pass
- Flag switching works without rebuild (env var picked up at boot; clients reload)

---

## Failure handling — reference table

| Failure | Response |
|---|---|
| Hocuspocus task crash | Clients auto-reconnect. ECS restarts task (~30s). IndexedDB + S3 snapshot = no data loss. Buffered client ops flush on reconnect. |
| S3 write fails in `onStoreDocument` | Hocuspocus retries internally. Doc stays in memory + clients have local IndexedDB state. If task dies before retry succeeds, clients resync from their IndexedDB on reconnect (CRDT merge). |
| Projection Lambda fails | SQS retries → DLQ. Analytics is eventually consistent by design. Alert on DLQ depth. |
| Enrichment Lambda fails to connect to Hocuspocus | SQS retry. Headless client is idempotent — replays don't duplicate annotations. |
| Network partition mid-edit (client) | IndexedDB buffers edits. Reconnect replays the accumulated Yjs update. CRDT merges cleanly with server state. |
| Stale OpenAuth token mid-edit | `onAuthenticationFailed` fires → client refetches token → reconnects. Local edits wait in IndexedDB. |
| ECS deploy / rollover | Hocuspocus graceful-shutdown drains connections. Clients reconnect to new task within ~2s. Small interruption, no data loss. |
| Two stages' events cross-contaminate | Doc-name stage prefix + projection-handler stage filter. Defense in depth. |
| Y.Doc grows unbounded | `Database` extension debounce + `Y.encodeStateAsUpdate` produces merged snapshot (tombstoned ops dropped). S3 object stays KB-scale. |
| OCR re-run produces different text | Genuine conflict; teacher edits anchored to old text may be stranded. Documented limitation; PM-level migration is future work. |

---

## Cost estimate

**Shared (one-time, covers all non-prod):**
- VPC: $0
- Fargate 0.25 vCPU / 0.5GB, 24/7: ~$9/mo
- ALB baseline: ~$16/mo
- Public IP (2 AZs, ~$0.005/hr each): ~$7/mo
- **Shared non-prod total: ~$32/mo**

**Production (dedicated):**
- Same as above: ~$32/mo
- Higher when scaling out (Redis for awareness: +$12/mo; extra tasks: +$9 each)

**Per-submission runtime costs:**
- S3 PUT per debounced save (~every 2s while editing): $0.005 / 1000 writes. Negligible.
- SQS + Lambda projection: cents/month.
- Neon writes: within existing plan.

**Total added monthly cost at current scale: ~$64** ($32 shared + $32 prod).

---

## Recommended sequencing

1. **K-1 + K-2 + K-3** — infra + server skeleton. Verify a test client can
   connect/sync/reconnect. ~1.5 days.
2. **K-4 + K-5** (parallel) — client-side Y.Doc + editor swap. Single-user
   editing works end-to-end over WebSocket. Merge-safe: server diff path
   still wired up as fallback. ~1 day.
3. **K-6** — enrichment Lambda as headless client. AI annotations now flow
   via Y.Doc. ~0.5 day.
4. **K-7** — projection Lambda. Analytics rows repopulate from Y.Doc. ~0.5–1 day.
5. **K-8** — delete server diff path. Only after K-6 and K-7 verified. ~0.5 day.
6. **K-9** — verification + flag cleanup. ~0.5 day.

**Stop-and-ship points:**
- After **K-5**: collab editing works for teachers, but enrichment still writes DB rows directly (dual-source). Merge-safe.
- After **K-6**: AI annotations flow via Y.Doc. DB rows potentially out of sync until K-7. Not merge-safe alone — ship together with K-7.
- After **K-7**: full end-to-end. Can demo.
- After **K-8**: point of no return. Do last, only after K-9 passes.

---

## Rollback

**During the build**, any phase before K-8 is revertable — the server diff
path is still live. Simply revert the collab branch and redeploy.

**After K-8**, the server diff path is deleted. Rollback options:
- Flip `NEXT_PUBLIC_DEEPMARK_COLLAB_MODE` to `indexeddb-only` — editing
  works, persists locally only. No cross-device sync but no data loss for
  the teacher actively working.
- True rollback requires reverting K-8's commit + redeploying + running a
  one-shot "flush Y.Doc state to `student_paper_annotations`" script per
  submission so no teacher edits are lost. Prefer the flag.

---

## Open questions / decisions to confirm at implementation time

1. **SST v4 exact prop names** for public-subnet Fargate placement
   (`publicAssignIp` vs `assignPublicIp`) — confirm against latest docs.
2. **Shared-stage ID sourcing**: hardcoded constants vs SSM Parameter Store.
   Lean SSM but constants are fine for initial bootstrap.
3. **Stage prefix source** on the client: build-time constant
   (`NEXT_PUBLIC_STAGE`) vs derivation from `Resource.HocuspocusServer.url`.
   Prefer the latter — one source of truth.
4. **Service-token minting**: add to OpenAuth issuer or do it inline in each
   Lambda via a shared helper. Lean toward shared helper in
   `packages/backend/src/lib/collab/service-token.ts`.
5. **Hocuspocus graceful shutdown config** — default is fine; verify
   `ecs.stopTimeout` aligns with `hocuspocus.quiet` window.

---

## Notes on what stays unchanged

- `student_paper_annotations` schema — unchanged; now populated by projection Lambda instead of direct writes.
- Enrichment *processor* stays the same shape; only the write path changes (headless client instead of DB).
- OCR extraction — unchanged, plus seeds Y.Doc skeleton on completion (K-6).
- SSE + stage transitions — still drive invalidation of other query caches; Y.Doc updates drive the editor directly without React Query.
- `GradingDataContext` — unchanged. Grading scores/overrides are NodeView props, not doc content.
- Scan viewer + bounding box overlay — reads from a new Y.Doc-derived hook instead of `useDerivedAnnotations`.
