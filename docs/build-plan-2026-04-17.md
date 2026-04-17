# Build Plan — Tier 3 Polish + DDD Cleanup

> Snapshot: 2026-04-17. Tier 1 correctness risks and Tier 2 structural debt
> have been addressed. What remains is polish and domain-boundary cleanup —
> none of it is shipping-critical, but it compounds if left.

## Summary

| # | Item | Effort | Scope |
|---|---|---|---|
| T3-1 | Drop `__never__` sentinel in Prisma where-clauses | 15 min | 2 files |
| T3-2 | Cheaper doc-change fingerprint | 30 min | 1 file |
| T3-3 | Integration test for SSE route | 1–2 h | 1 new test |
| T3-4 | Split `StagePips` into hook + presentation | 30 min | 3 files |
| DDD-1 | Consolidate flat-root `marking/mutations.ts` into sub-domains | 1 h | ~10 files |
| DDD-2 | Move `getJobAnnotations` out of `marking/scan/queries.ts` | 20 min | 3 files |

**Recommended order:** T3-1, T3-4, DDD-2 (cheap wins) → DDD-1 (biggest ripple) → T3-3 (most time, highest infra value) → T3-2 (defer until measured).

---

## T3-1 — Drop `__never__` Prisma sentinel

### Problem

Two places construct a `where.OR` clause that needs to degenerate to "match
nothing" when there's no latest enrichment run. Current pattern:

```ts
OR: [
  latestEnrichmentRun
    ? { enrichment_run_id: latestEnrichmentRun.id }
    : { id: "__never__" },   // sentinel — forces empty match
  { submission_id: sub.id, source: "teacher" },
]
```

`__never__` is a nonsense string that happens not to match any cuid. Ugly,
opaque to readers, and brittle (any future id format change could make it
accidentally match something).

### Fix

Build the `OR` array conditionally:

```ts
const or: Prisma.StudentPaperAnnotationWhereInput[] = [
  { submission_id: sub.id, source: "teacher" },
]
if (latestEnrichmentRun) {
  or.push({ enrichment_run_id: latestEnrichmentRun.id })
}

const rows = await db.studentPaperAnnotation.findMany({
  where: { deleted_at: null, OR: or },
  ...
})
```

### Files

- `apps/web/src/lib/marking/scan/queries.ts` (`getJobAnnotations`)
- `apps/web/src/lib/marking/annotations/mutations.ts` (`saveAnnotationEdits`)

### Acceptance

- No `__never__` string in the codebase (`grep` check)
- Existing unit tests still pass; manually verify a submission with no
  enrichment run still loads

---

## T3-2 — Cheaper doc-change fingerprint

### Problem

`annotated-answer-sheet.tsx` decides whether to call `editor.setContent(doc)`
by comparing `JSON.stringify(doc)` to the last-seen stringification. On every
render. For GCSE-sized answers (few hundred chars) this is fine; for longer
responses with hundreds of marks, it's O(N) busywork per render.

### Fix

Two realistic options, in order of preference:

**Option A: version counter**
Bump a `docVersion` number in the consumer whenever any input to the doc
build changes (annotations, tokens, grading results). Pass it alongside
`doc`. The sync effect compares numbers, not strings.

**Option B: shallow summary**
Hash a compact summary — question count, total mark count, enrichment_run_id,
pageToken count. Cheaper than full stringify, but misses some real changes
(mark sentiment edits without count change).

Recommend **A** — deterministic and cheap.

### Files

- `apps/web/src/components/annotated-answer/annotated-answer-sheet.tsx`
- `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/results/grading-results-panel.tsx` (produces the doc; bumps counter)

### Acceptance

- No `JSON.stringify(doc)` calls on the render path
- Sync still fires when data genuinely changes (covered by the existing
  "add AI annotations mid-edit" manual test)

### Why defer

Actually measure before fixing. Run the profiler on a long answer (2000+
word essay) with the current approach. If it doesn't show up, skip this.

---

## T3-3 — SSE route integration test

### Problem

`apps/web/src/app/api/submissions/[jobId]/events/route.ts` is hand-written
streaming code — ReadableStream, abort handling, adaptive polling, heartbeat.
No automated coverage. The plan's acceptance criterion called for one.

### Fix

Integration test under `packages/backend/tests/integration/` (or wherever
integration tests live — check existing layout). Runs under `sst shell` so
`Resource.NeonPostgres.databaseUrl` is populated.

Test plan:

1. Seed a submission with stages in known states (e.g. OCR done, grading
   generating, enrichment not_started)
2. Open an `EventSource` against the route
3. Assert first event is `snapshot` with expected shape
4. Flip the grading run status in DB → assert `update` event lands within
   ~3s (covers the 2s active poll)
5. Abort the connection → assert server stops polling (inspect logs or
   check connection count)
6. Close within 30s total

Use `fetch` + manual stream reading rather than a real EventSource —
simpler in Node.

### Files

- New: `packages/backend/tests/integration/sse-route.test.ts` (path TBC)

### Acceptance

- Test passes under `bun test:integration --project backend:integration`
- Runs in under 30s per the CLAUDE.md rule

### Risks

- Real Neon branch required (same as other integration tests). Cost: trivial
- Streaming + Lambda response in dev: `sst dev` runs Next locally, not on
  Lambda, so the test hits a Node HTTP server. Matches dev reality.
  Production-only issues (CloudFront buffering) won't be caught; worth a
  manual smoke test on a dev deploy regardless.

---

## T3-4 — Split `StagePips` into hook + presentation

### Problem

`stage-pips.tsx` does three jobs in one file:

1. Data fetching (`useJobStream` + `useQuery` on `jobStages`)
2. Mutation wiring (re-run OCR / grading mutations + toasts)
3. Layout + child rendering

Hard to test any of them in isolation and hard to reuse the data hook
anywhere else (the new `use-job-query` already reads `jobStages` from cache,
which is a sign this split is already under pressure).

### Fix

Extract:

```ts
// stage-pips.ts
export function useStageData(jobId: string): JobStages | null
export function useStageMutations(jobId: string, onNavigate: (id: string) => void)
```

Keep the existing `StagePips` component as a pure-ish presentation function:
takes `stages`, `ocrMutation`, `gradingMutation`, `onReAnnotate` as props.

### Files

- `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/stage-pips.tsx` (refactor)
- Two new files or a single `stage-pips-hooks.ts` alongside
- Toolbar usage unchanged (props stay the same)

### Acceptance

- Presentation component is pure (only depends on props)
- No behaviour change in the toolbar
- Hooks are individually reusable

---

## DDD-1 — Consolidate flat-root `marking/mutations.ts`

### Problem

The `marking/` domain is mid-migration from flat to nested structure. Right
now:

```
marking/
├── mutations.ts            # flat: retriggerOcr, retriggerGrading, triggerEnrichment, teacher override upsert, ...
├── annotations/
│   └── mutations.ts        # nested: saveAnnotationEdits
└── ...
```

Consumers import from two different paths for conceptually the same kind of
operation. The nested structure is the CLAUDE.md convention for domains that
have grown past flat. Keeping both is the worst of both worlds.

### Fix

Move each function in `marking/mutations.ts` to the sub-domain it belongs
to:

| Function | New location |
|---|---|
| `retriggerOcr`, `retriggerGrading`, `triggerEnrichment` | `marking/stages/mutations.ts` |
| `upsertTeacherOverride`, `deleteTeacherOverride` | `marking/overrides/mutations.ts` (new sub-domain) |
| `updateStudentName` | `marking/submissions/mutations.ts` (new file in existing sub-domain) |
| `updateExtractedAnswer` | `marking/submissions/mutations.ts` |

Delete `marking/mutations.ts` after migration.

### Files

- Source: `apps/web/src/lib/marking/mutations.ts` (deleted at end)
- Destinations: new files under `marking/stages/`, `marking/overrides/`, `marking/submissions/`
- Import updates: wherever these mutations are called (~10 files)

### Acceptance

- No file at `marking/mutations.ts`
- All consumers updated; typecheck clean
- No functional change — purely a file move + re-export

### Risk

High file-count touch; easy to miss an import. Do this in one commit so the
diff is coherent, not a rolling half-migration.

---

## DDD-2 — Move `getJobAnnotations` out of `scan/queries.ts`

### Problem

`marking/scan/queries.ts` owns scan-related reads (page tokens, scan URLs,
OCR analysis). Since the annotation persistence work, it also owns
`getJobAnnotations` — which loads AI annotations from the latest enrichment
run plus teacher-authored rows. That's annotation domain, not scan domain.

### Fix

Move `getJobAnnotations` to `marking/annotations/queries.ts` (new file).
Keep the other reads in `scan/queries.ts`.

### Files

- Source: `apps/web/src/lib/marking/scan/queries.ts` (remove `getJobAnnotations`)
- Destination: `apps/web/src/lib/marking/annotations/queries.ts` (new)
- Import updates: `submission-view.tsx` and anywhere else that imports
  `getJobAnnotations` (~3 files)

### Acceptance

- `scan/queries.ts` no longer imports annotation types
- Imports of `getJobAnnotations` all resolve to the new location

### Note

Pairs naturally with DDD-1 — both are "put things where they belong." Do
together or in close succession.

---

## Recommended sequencing

1. **T3-1** + **T3-4** + **DDD-2** — cheap, low-risk, small file touches
2. **DDD-1** — bigger but landing it stops the mid-migration bleed
3. **T3-3** — most time, but highest long-term reliability value; can happen
   at any point, doesn't depend on the others
4. **T3-2** — only if measured; likely deferrable indefinitely
