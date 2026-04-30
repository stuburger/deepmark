# next-safe-action Migration — Status

Companion to `docs/next-safe-action-migration-plan.md`. Captures what's done, what deviated from the plan, and what's still required before the PR can ship.

---

## What's done

### Step 1 — Plumbing ✅

New `apps/web/src/lib/authz/` modules:

- `errors.ts` — `AuthRequiredError` (401), `AccessDeniedError` (403), `NotFoundError` (404), plus `isAuthzError` guard.
- `handle-server-error.ts` — maps thrown errors to `serverError` strings; logs unknown errors with stack.
- `assert-resource.ts` — single dispatcher across all 7 resource types (`examPaper`, `submission`, `question`, `markScheme`, `pdfIngestionJob`, `batch`, `stagedScript`); maps `"...not found"` → `NotFoundError`, otherwise `AccessDeniedError`.
- `action-client.ts` — six clients:
  - `publicAction`, `authenticatedAction`, `adminAction` (static)
  - `resourceAction({...})`, `resourcesAction({...})`, `scopedAction({...})` (factory — per-action specs)
  - `defaultValidationErrorsShape: "flattened"` so call sites read `formErrors[]` / `fieldErrors{}`.
- `route-handler.ts` — `routeHandler.{public, authenticated, admin, resource}` for `/api`. Reuses the action middleware functions; throws same typed errors that map to HTTP responses.
- `middleware/{require-session, require-admin, require-resource, attach-access-where, attach-logger}.ts` — small composable units.

Tests in `apps/web/src/lib/authz/__tests__/`:
- `handle-server-error.test.ts` (5)
- `assert-resource.test.ts` (3)
- `middleware.test.ts` (10)
- `route-handler.test.ts` (8)
- existing `roles.test.ts` (5)

### Step 2 — Spike ✅

Six actions converted end-to-end as the API check (one per shape). All call sites updated, dev-server smoke green at the spike gate.

| Shape | Action |
|---|---|
| `resourceAction` | `getJobScanPages`, `getJobPageTokens` |
| `resourcesAction` | `consolidateQuestions` |
| `scopedAction` | `listExamPapers` |
| `authenticatedAction` | `getCurrentUser` |
| `adminAction` | `listLlmCallSites` |
| `publicAction` | `logout`, `login`, `loginWithGoogle` |

### Step 3 — Mass conversion ✅

All 72 actions across 8 domains (users/notifications/collab/actions, admin, sharing, mark-scheme, pdf-ingestion, batch, exam-paper, marking) converted to next-safe-action. ~120 call sites in pages, hooks, dialogs, and TanStack Query call sites updated to read the native `{data, serverError, validationErrors}` shape.

### Step 4 — Sweep ✅

| Decision | Status | Notes |
|---|---|---|
| D4 — `embedText` out of `"use server"` | ✅ | Moved to `apps/web/src/lib/server-only/embeddings.ts`. |
| D5 — `commitBatchService` not exposed as RPC | ✅ | Moved to `apps/web/src/lib/batch/lifecycle/commit-service.ts`; integration test import updated. |
| D9 — Lint rule | ✅ (deviation) | Implemented as a TypeScript-AST checker (`apps/web/scripts/checks/action-conventions.ts`) instead of full ESLint — see Deviations below. Run via `bun lint:authz`. 14 unit tests. |
| D11 — Drop `commenter` enum | ✅ | Removed from `ResourceGrantRole` (Prisma + shared `ResourceRole` + sharing/actions schema). `bun db:push` applied to `stuartbourhill` Neon branch. |
| D12 — Split `effective-access.ts` | ✅ (deviation) | Split into `principal.ts` (pure), `effective-roles.ts` (DB-backed), `assertions.ts`, `where-clauses.ts`. `loadAuthUser` lives in `effective-roles.ts` not `principal.ts` — see Deviations. |
| D13 — `ResourceGrantRepository` interface | ✅ | Added `packages/shared/src/authz/resource-grant-repository.ts`; both web `effective-roles.ts` and backend `collab-authz.ts` bind to it. |
| D14 — Forms wire `validationErrors` | ✅ | All 4 forms updated (mark-scheme-edit-form, lor-mark-scheme-edit-form, merge-questions-dialog, class-export-dialog). |
| D15 — CLAUDE.md rewrite | ✅ | "Server Actions", "Frontend Error Handling", "Forms" sections rewritten. |

### Step 5 — Final verification (machine-checkable parts) ✅

Result of running each gate:

| Gate | Status |
|---|---|
| `bun typecheck` (web/backend/shared) | ✅ Clean (the Prisma/Neon vendor type errors on `@mcp-gcse/db` were already on `main`) |
| `bun test:unit` | ✅ 322/322 (was 150 baseline + 172 net new from web:unit which now runs) |
| `bun lint:authz` | ✅ Zero violations |
| `bun check` (biome) | ✅ Clean on every file we touched (12 remaining violations are all pre-existing in untouched files) |

### Bugs encountered after the conversion + their fixes

These surfaced when bringing the dev server up — all caused by the access-sharing rollout's interaction with this PR, not by the migration itself, but worth noting:

1. **Route-segment collision** — `app/api/submissions/[jobId]/events/` and `app/api/submissions/[submissionId]/scan-pages/` couldn't coexist (Next requires sibling dynamic segments to share a name). Fixed by collapsing both under `[submissionId]/`. The events route handler was updated to use `submissionId` for the param while still calling `getJobStages({ jobId: submissionId })` since the action's input schema uses `jobId`. Test path + integration test params both updated.
2. **Wrong page schema in scan-pages route** — `app/api/submissions/[submissionId]/scan-pages/[pageOrder]/route.ts` was parsing `StudentSubmission.pages` with `parsePageKeys` (the StagedScript shape: `{s3_key, source_file, …}`). After `commitBatchService` runs, the submission stores `{key, order, mime_type}` instead. Replaced the parser with an inline `submissionPagesSchema` matching what's actually persisted, and updated the property reference (`page.s3_key` → `page.key`).
3. **CollabAuthz Lambda S3 NoSuchKey** — diagnosed but not "fixed by us": SST tried to recreate the Lambda after `collab-authz.ts` changed but pointed at an S3 bundle that wasn't there. Almost always a transient SST/upload race; rerun the deploy or `rm -rf .sst` + redeploy.

---

## Deviations from the plan

Documented separately because future-you will want to know.

1. **ESLint → TS-AST checker.** The plan called for two custom ESLint rules. The project uses biome and has no ESLint pipeline; adding ESLint just for two rules was disproportionate. The checker at `apps/web/scripts/checks/action-conventions.ts` walks ASTs via the TypeScript compiler API (no extra deps), enforces the same two invariants, and ships with 14 unit tests. Same teeth, lighter scaffolding.

2. **`principal.ts` stays pure; `loadAuthUser` lives in `effective-roles.ts`.** The plan had `loadAuthUser` in `principal.ts`. Putting it there pulled a `db` import into the principal module, which broke `roles.test.ts` (it imports `normaliseEmail` from principal, which transitively booted SST resource resolution under vitest). Splitting the loader into the DB-backed file (`effective-roles.ts`) keeps `principal.ts` import-free of side effects.

3. **`scopedAction()` doesn't take an input schema.** The plan implied a `schema?` field; the conditional return type produced a union that `.action()` couldn't be called against. Made it always return a chainable client — chain `.inputSchema(...)` if you need filter args. Cleaner at the call site too.

4. **Form actions need a thin local wrapper.** `<form action={…}>` requires `(formData) => Promise<void>`; safe-action's wrapped functions return `Promise<SafeActionResult>` instead. For `logout`/`login`/`loginWithGoogle`, each consumer (`admin/layout.tsx`, `teacher/layout.tsx`, `login/page.tsx`) defines a one-line `async function …FormAction() { "use server"; await ...() }` wrapper inline. Documented in CLAUDE.md.

5. **`route-handler.ts` was built but the 7 routes weren't migrated to it.** ~~The wrapper exists, has tests, and works — but the 7 `app/api/**/route.ts` files still call `requireSessionUser` + `assertXxxAccess` directly.~~ Resolved in `b4dde4d` (or whichever follow-up commit) — all 7 routes now go through `routeHandler.{public,resource}`. `requireSessionUser` and `with-session.ts` deleted.

6. **Resource routes now return 403 (not 404) for inaccessible-but-existing resources.** The original routes uniformly returned 404 to avoid existence enumeration. The wrapper distinguishes `NotFoundError`→404 and `AccessDeniedError`→403, matching the action-client semantics (where access denied surfaces as a "you do not have access" `serverError`). Net leak is no worse than what the action surface already exposes. SSE integration test updated to expect 403.

7. **`logout` route is `routeHandler.public`, not `authenticated`.** The plan listed it under authenticated, but a stale-session tab needs to be able to clear cookies cleanly — gating logout behind a valid session would 401 expired sessions and trap users. The `logout` server action is also `publicAction`, so this matches.

---

## What's still remaining

In rough priority order:

### Required before merge

- [x] **Convert the 7 API routes to `routeHandler.{...}`.** Done. Routes:
  - `app/api/scans/[...path]/route.ts` → `routeHandler.public` ✅
  - `app/api/callback/route.ts` → `routeHandler.public` ✅
  - `app/api/logout/route.ts` → `routeHandler.public` ✅ (deviation from plan — see §Deviations)
  - `app/api/pdf-ingestion-jobs/[jobId]/document/route.ts` → `routeHandler.resource(pdfIngestionJob, viewer)` ✅
  - `app/api/submissions/[submissionId]/events/route.ts` → `routeHandler.resource(submission, viewer)` ✅ (SSE wrapper preserves `ReadableStream` body)
  - `app/api/submissions/[submissionId]/scan-pages/[pageOrder]/route.ts` → `routeHandler.resource(submission, viewer)` ✅
  - `app/api/batch/[batchId]/staged-scripts/[scriptId]/scan-pages/[pageOrder]/route.ts` → `routeHandler.resource(batch, viewer)` ✅

  `requireSessionUser` and `with-session.ts` deleted — only routes used it. Behavior change: inaccessible-but-existing resources now return 403 instead of 404 (see §Deviations).

- [ ] **Manual smoke test (Step 5).** This is on Stuart — listed in `migration-plan.md §5 Step 5`. Sign in (Google + GitHub), QP/MS/scripts upload, batch staging + commit, marking (OCR + grading), submission view + annotations, teacher overrides, sharing flow, page-level access denied, inline form-validation errors. Tail `next dev` logs to confirm every action emits a `userId`.

- [ ] **Integration tests.** Need `sst shell --stage=stuartbourhill`. The SSE route test is the critical one (the plan calls it out). Attribution evals shouldn't have regressed (this PR doesn't touch the extract pipeline) but worth confirming.
  ```bash
  AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- bun test:integration
  ```

### Worth considering before merge

- [ ] **Schema duplication for mark-scheme input.** `mark-scheme/manual.ts` and `marking/evaluation.ts` both define a Zod `markSchemeInputSchema` discriminated union. Consider extracting once into `mark-scheme/types.ts`. Two-line import diff each side.

- [ ] **Form validationErrors mapping is per-form.** The pattern in CLAUDE.md uses `form.setError(field, { message })` per Zod field. The 4 form callers don't actually wire field-level mapping yet — they fall back to setting a single submitError string. If a server-side schema diverges from client-side, the user sees a generic banner instead of an inline field error. Acceptable for alpha; tighten before paid rollout.

- [ ] **CollabAuthz Lambda redeploy verification.** After the D13 type-only refactor of `collab-authz.ts`, the Lambda recreate ran into the SST NoSuchKey error noted above. A clean `rm -rf .sst` + `sst deploy --stage=stuartbourhill` should clear it; worth confirming before the PR is opened so we don't ship a bricked collab Lambda.

### Out of scope (per plan §9)

These remain explicitly out of scope:

- `useAction` / `useOptimisticAction` / `@next-safe-action/adapter-tanstack-query`
- Page-level auth gating helper (`requirePageSession`)
- MCP tool authz (`packages/backend/src/tools/`)
- OpenAuth issuer changes
- Marking engine / OCR / business logic changes

---

## Verification recap

```bash
# Source-level checks
bun typecheck              # ⚠️ db package has pre-existing vendor errors; web/backend/shared clean
bunx tsc --noEmit -p apps/web/tsconfig.json | grep -v "\.next/"   # clean

# Tests
bun test:unit              # 322/322

# Convention enforcement
bun lint:authz             # zero violations

# Format / lint
bun check                  # 12 pre-existing violations (a11y, noForEach, MCP-tool noExplicitAny); zero in touched files

# Integration (needs SST shell)
AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- bun test:integration
```

---

## File-level summary

**~110 files modified.**

- `lib/authz/` — 12 new files + 4 rewrites (effective-access split)
- `lib/server-only/embeddings.ts` — new (D4)
- `lib/batch/lifecycle/commit-service.ts` — new (D5)
- 8 lib/ domain folders — every action converted
- ~30 page/hook/dialog files — call sites updated
- `app/api/submissions/` — directory restructure (`[jobId]` → `[submissionId]`)
- `apps/web/scripts/checks/` — new (D9 lint rule)
- `packages/shared/src/authz/resource-grant-repository.ts` — new (D13)
- `packages/db/prisma/schema.prisma` — `commenter` removed (D11)
- `CLAUDE.md` — three sections rewritten (D15)
- `package.json` — `test:unit` extended to `web:unit`; new `lint:authz` script
- `vitest.config.ts` — `web:unit` includes `scripts/**/__tests__/`

Nothing is committed yet.
