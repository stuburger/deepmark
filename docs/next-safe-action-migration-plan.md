# next-safe-action Migration Plan

**Status:** ready to execute
**Owner:** Stuart
**Estimate:** ~2.5 days focused work
**Branch strategy:** single feature branch, single PR

This document is the source of truth for the migration. Read it before starting any conversion. Update it if a decision changes mid-migration.

---

## 1. Why we're doing this

Two problems with the current authz layer:

1. **Silent omission.** Every server action manually does `requireSessionUser()` + `assertXxxAccess(...)`. The authz doc lists five places this was forgotten before review caught them. There is no type-level enforcement that an action runs through the authz path.
2. **Fragile call-site shape.** The hand-rolled `Result<T>` pattern means server-side validation errors collapse into a single string and surface as toasts even when they should appear inline next to a form field.

Adopting [`next-safe-action`](https://next-safe-action.dev/) gives us:

- **No path to define an action without going through the wrapper.** Forgetting auth becomes a typecheck error.
- **Composable middleware** with a typed `ctx` that flows from layer to layer.
- **Three return channels** — `data`, `serverError`, `validationErrors` — instead of one collapsed `Result<T>`.
- **Zod input validation at the boundary** as part of the action signature.

---

## 2. Locked decisions

These were debated during planning. Re-read before changing.

| # | Decision | Resolution |
|---|---|---|
| D1 | Return shape | **Native safe-action shape** (`{ data, serverError, validationErrors }`). Drop `Result<T>` from server actions. ~150 call sites updated to read the native shape — same diff size as adapting, cleaner destination. |
| D2 | Hooks | **Keep TanStack Query.** Server actions are called directly inside `mutationFn`/`queryFn`. Do **not** adopt `useAction`, `useOptimisticAction`, or `@next-safe-action/adapter-tanstack-query` (the latter is v0.1.x — too young to bet on). |
| D3 | API route handlers | **In scope.** Build a parallel `routeHandler({ resource, role }, async (ctx, req) => Response)` wrapper that reuses the same middleware functions. Same auth model across both transports. |
| D4 | `embedText` | **Move out of `"use server"`.** Today any logged-in client can call it and burn embedding credits. Relocate to a non-RPC server-only module. |
| D5 | `commitBatchService` | **Audit on day 1, before mass conversion.** If only called by other server-side code, drop `"use server"` from its module. If genuinely an RPC, wrap as `resourceAction(batch, editor)`. |
| D6 | Library version | `next-safe-action@8.x` (latest stable, supports Next 14 App Router). Pin exact version. |
| D7 | Zod schemas | **Required for every action that takes args.** Defines input shape and source of typed `validationErrors`. Colocated in the action file. |
| D8 | Logging | **Middleware injects `log` into ctx with `userId` pre-bound.** Action handlers replace `log.info(TAG, "x", { userId: session.user.id, ... })` with `ctx.log.info("x", { ... })`. Standardises log shape; impossible to forget userId. |
| D9 | Lint rule | **In this PR.** Custom ESLint rule: no `auth()` calls outside `lib/authz/*` and `app/**/{page,layout}.tsx`; no exported async functions in `"use server"` modules that aren't built from an action client. |
| D10 | Asserts as exceptions | Middleware **throws typed errors** (`AccessDeniedError`, `NotFoundError`, `AuthRequiredError`) and `handleServerError` maps them to user-facing `serverError` strings. No `Result` in the internal assert path. |
| D11 | `commenter` role | **Drop from Prisma enum.** No product semantics. Generate a `bun db:push` migration, remove from `ResourceGrantRole`, drop its rank from `roles.ts`. |
| D12 | `effective-access.ts` split | **In this PR**, as part of step 4 cleanup. By then the middleware is its only consumer. Split into `principal.ts` / `effective-roles.ts` / `assertions.ts` / `where-clauses.ts`. |
| D13 | `ResourceGrantRepository` | **Extract to `@mcp-gcse/shared`** as an interface, with thin Prisma-backed implementations on each side (web + backend). Removes the duplication between `effective-access.ts` and `collab-authz.ts`. |
| D14 | Forms with `validationErrors` | **All forms in this PR** if count is ≤15. Count during pre-kickoff verification. If higher, scope to forms in domains being heavily touched, ticket the rest. |
| D15 | CLAUDE.md | **Substantive rewrite** of "Server Actions — Result Pattern", "Frontend Error Handling", and "Forms" sections. Document the action-client convention, the lint rule, and the new validation-error pattern. |

---

## 3. Pre-kickoff verification

These run **before** writing any code. Each is a small task with a clear answer.

- [ ] **V1 — Confirm `next-safe-action@8.x` works with our Next 14 setup.** Install in a scratch branch, build the app, run `bun typecheck`. Roll back the install once verified.
- [ ] **V2 — `commenter` data check.** Run via Neon MCP on the `stuartbourhill` branch, then on `development` and `production` branches if accessible:
  ```sql
  SELECT principal_email, principal_user_id, role, resource_type
  FROM resource_grants
  WHERE role = 'commenter';
  ```
  Expected: zero rows. If rows exist, plan a backfill (probably remap to `viewer`) before the enum drop.
- [ ] **V3 — Form count.** Grep for `useForm` from `react-hook-form`:
  ```bash
  grep -rn "useForm<" apps/web/src --include="*.tsx" | wc -l
  ```
  If ≤15, all forms get `validationErrors` wiring. If >15, define a scope for this PR.
- [ ] **V4 — `commitBatchService` audit.** `grep -rn "commitBatchService"` across `apps/web/src` and `packages/`. Determine: is it called by any client component, or only server-to-server? Decision falls out of D5.
- [ ] **V5 — API route inventory.** Confirm the 7 known routes are still all of them:
  ```bash
  find apps/web/src/app/api -name "route.ts" | sort
  ```
- [ ] **V6 — Existing test baseline.** Run `bun test:unit` and capture the pass count (currently 150). Run the integration suite if SST shell is available. This is our "is anything broken" reference for every step.

---

## 4. What we're building

### 4.1 Directory layout (final state)

```
apps/web/src/lib/authz/
  action-client.ts          # NEW — the six action clients
  route-handler.ts          # NEW — parallel wrapper for /api routes
  errors.ts                 # NEW — AccessDeniedError, NotFoundError, AuthRequiredError
  handle-server-error.ts    # NEW — maps thrown errors to user-facing serverError strings
  middleware/
    require-session.ts      # NEW — extends ctx with { user }
    require-admin.ts        # NEW — asserts systemRole === "admin"
    require-resource.ts     # NEW — reads metadata, asserts role on resource
    require-resources.ts    # NEW — multi-resource version
    attach-access-where.ts  # NEW — for scoped lists, attaches accessWhere to ctx
    attach-logger.ts        # NEW — log with userId pre-bound
  principal.ts              # SPLIT FROM effective-access.ts — AuthUser + loadAuthUser
  effective-roles.ts        # SPLIT FROM effective-access.ts — effectiveExamPaperRole, effectiveSubmissionRole
  assertions.ts             # SPLIT FROM effective-access.ts — assertXxxAccess (now internal to middleware)
  where-clauses.ts          # SPLIT FROM effective-access.ts — examPaperAccessWhere, submissionAccessWhere, etc.
  roles.ts                  # UNCHANGED
  index.ts                  # UPDATED — re-exports the action clients and route-handler

packages/shared/src/authz/
  resource-policy.ts        # UNCHANGED
  resource-grant-repository.ts  # NEW — ResourceGrantRepository interface (D13)

packages/backend/src/
  collab-authz.ts           # UPDATED — uses shared ResourceGrantRepository

apps/web/src/lib/server-only/  # NEW directory (or similar)
  embeddings.ts             # MOVED from lib/embeddings.ts (D4)

eslint-rules/                  # NEW
  no-raw-auth.js
  use-server-must-use-action-client.js
  index.js

eslint-rules/__tests__/        # NEW
  no-raw-auth.test.js
  use-server-must-use-action-client.test.js
```

### 4.2 The action clients

```ts
// lib/authz/action-client.ts
import { createSafeActionClient } from "next-safe-action"

const baseClient = createSafeActionClient({
  handleServerError,
  defineMetadataSchema: () => metadataSchema,
})

export const publicAction        = baseClient
export const authenticatedAction = baseClient.use(requireSession).use(attachLogger)
export const adminAction         = authenticatedAction.use(requireAdmin)
export const resourceAction      = authenticatedAction.use(requireResource)
export const resourcesAction     = authenticatedAction.use(requireResources)
export const scopedAction        = authenticatedAction.use(attachAccessWhere)
```

### 4.3 The conversion pattern

Before:

```ts
"use server"
export async function updateQuestion(
  questionId: string,
  input: UpdateQuestionInput,
): Promise<UpdateQuestionResult> {
  const session = await requireSessionUser()
  if (!session.ok) return { ok: false, error: session.error }
  const access = await assertQuestionAccess(session.user, questionId, "editor")
  if (!access.ok) return { ok: false, error: access.error }

  log.info(TAG, "updateQuestion called", { userId: session.user.id, questionId })
  // ... actual work
  return { ok: true, embeddingUpdated: true }
}
```

After:

```ts
"use server"

const updateQuestionInput = z.object({
  questionId: z.string(),
  input: z.object({
    text: z.string().trim().optional(),
    points: z.number().int().min(0).optional(),
  }),
})

export const updateQuestion = resourceAction
  .metadata({
    resource: { type: "question", role: "editor", id: (i) => i.questionId },
  })
  .inputSchema(updateQuestionInput)
  .action(async ({ parsedInput: { questionId, input }, ctx }) => {
    ctx.log.info("updateQuestion called", { questionId })
    // ... actual work
    return { embeddingUpdated: true }
  })
```

Call site before:

```tsx
const result = await updateQuestion(questionId, input)
if (!result.ok) { toast.error(result.error); return }
toast.success("Saved")
```

Call site after:

```tsx
const result = await updateQuestion({ questionId, input })
if (result?.serverError) { toast.error(result.serverError); return }
if (result?.validationErrors) { /* inline field errors via setError */ return }
toast.success("Saved")
```

### 4.4 The route handler wrapper (D3)

```ts
// lib/authz/route-handler.ts
type RouteHandlerOptions<TResource extends ResourceType> = {
  resource?: { type: TResource; role: ResourceRole; id: (req: NextRequest, params: ...) => string }
}

export function routeHandler<TResource extends ResourceType>(
  options: RouteHandlerOptions<TResource>,
  handler: (ctx: RouteHandlerCtx, req: NextRequest, params: ...) => Promise<Response>,
): (req: NextRequest, params: ...) => Promise<Response>
```

Reuses `requireSession`, `requireResource`, `attachLogger` from the action middleware. Throws same typed errors; route-handler-side maps them to HTTP responses (401, 403, 404).

---

## 5. Execution sequence

The PR is built in five steps. **Do not skip the test gate at the end of each step.**

### Step 1 — Plumbing (no behavior change)

- [ ] Install dependencies: `bun add next-safe-action zod` (zod likely already present).
- [ ] Create `lib/authz/errors.ts` with `AccessDeniedError`, `NotFoundError`, `AuthRequiredError`. Each carries a user-facing message.
- [ ] Create `lib/authz/handle-server-error.ts` mapping known error classes to `serverError` strings; logs unknown errors with stack.
- [ ] Create the middleware files: `require-session`, `require-admin`, `require-resource`, `require-resources`, `attach-access-where`, `attach-logger`. Each is ≤50 lines. Each throws typed errors on failure (per D10).
- [ ] Create `lib/authz/action-client.ts` with the six clients.
- [ ] Create `lib/authz/route-handler.ts` (D3).
- [ ] **Tests written in this step:**
  - [ ] `lib/authz/__tests__/middleware.test.ts` — unit tests for each middleware in isolation. At least: success path, missing session, wrong role, resource not found, admin bypass.
  - [ ] `lib/authz/__tests__/handle-server-error.test.ts` — error class → serverError mapping; unknown errors return generic "Something went wrong"; stack is logged once.
  - [ ] `lib/authz/__tests__/route-handler.test.ts` — typed errors map to correct HTTP status codes.
- [ ] **Test gate:**
  - [ ] `bun typecheck` (web + backend) passes.
  - [ ] `bun test:unit` passes (150 baseline + new middleware tests).
  - [ ] `bun check` clean.
  - **No actions converted yet. Existing behavior unchanged.**

### Step 2 — Spike (one action per shape)

Convert one action per shape end-to-end. For each: convert the action, update its call sites to native shape, run tests, manually exercise in dev server. **The spike is the gate** — if any shape feels wrong, fix the API before continuing.

| Shape | Spike target | Why this one |
|---|---|---|
| `resourceAction` | `marking/scan/queries.ts → getJobScanPages` | Common query pattern, exercised on the marking page. |
| `resourcesAction` | `exam-paper/similarity.ts → consolidateQuestions` | Two-resource assert; visible on the exam-paper detail page. |
| `scopedAction` | `exam-paper/paper/queries.ts → listExamPapers` | Listing query with `accessWhere`; on the home dashboard. |
| `authenticatedAction` | `users/queries.ts → getCurrentUser` | Simplest; no resource, no input. |
| `adminAction` | `admin/llm-queries.ts → listLlmCallSites` | Admin-only path; isolated UI. |
| `publicAction` | `actions.ts → logout` | No-auth public; verifies the bare client works. |

For each spike:
- [ ] Convert the action.
- [ ] Update its Zod schema (D7).
- [ ] Update all call sites to native shape and object args.
- [ ] Run `bun typecheck` and `bun test:unit`.
- [ ] Open dev server, exercise the path manually.
- [ ] Confirm logs include `userId` (D8).
- [ ] Commit each spike separately so we can revert one without losing the others.

**Test gate after step 2:**
- [ ] All spike actions are working in the dev server.
- [ ] At least one spike's call site uses `validationErrors` (likely `consolidateQuestions` if it has form-style input, otherwise pick another for a follow-up form-wiring spike).
- [ ] **Stop and review the API.** Does the metadata shape feel right? Are middleware errors mapped to good user messages? Is the call-site code legible? Adjust before mass conversion.

### Step 3 — Mass conversion, domain by domain

Order chosen so the smallest blast radius goes first. Within each domain: convert all its actions, run typecheck + unit tests + relevant integration tests, manually exercise the affected UI in the dev server, commit.

| Order | Domain | Actions | Notes |
|---|---|---|---|
| 1 | `users/`, `notifications/`, `collab/`, `actions.ts` | 6 | Low-risk leaf actions. |
| 2 | `admin/` | 9 | Isolated UI; no user-facing impact if broken. |
| 3 | `sharing/` | 6 | Recently written, well-typed; small surface. |
| 4 | `mark-scheme/` | 3 | Small. |
| 5 | `pdf-ingestion/` | 12 | Critical upload flow — exercise carefully. |
| 6 | `batch/` | 14 | Batch-staging UI — exercise drag-and-drop, classification. |
| 7 | `exam-paper/` | 13 | Includes `consolidateQuestions` (already done in spike). |
| 8 | `marking/` | 27 | Largest blast radius. Save for last. |

For each domain conversion:
- [ ] Convert all actions in the domain.
- [ ] Update all call sites within the domain plus any external call sites (these will be flagged by typecheck).
- [ ] Wire `validationErrors` to forms in the domain (per D14).
- [ ] Run `bun typecheck`.
- [ ] Run `bun test:unit`.
- [ ] Run the integration test suite if available: `AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- bun test:integration --project web:integration`.
- [ ] Manually exercise the domain's UI in the dev server. Hit the golden path and at least one error path (forbidden access, validation error).
- [ ] Commit the domain's conversion as one commit.

**Domain-specific test additions:**
- [ ] When converting `marking/scan/queries.ts`: ensure the existing SSE integration test (`apps/web/tests/integration/sse-route.test.ts`) still passes. This is critical.
- [ ] When converting `sharing/actions.ts`: verify the shared `resource-policy` unit tests still pass without modification (they should — the policy module is untouched).
- [ ] When converting `marking/submissions/`: spot-check that `getStudentPapersForClass` still asserts both paper-viewer and per-submission-viewer correctly. Add a unit test for this if one doesn't exist.

### Step 4 — Sweep

- [ ] **D5 resolution:** apply the verdict from V4. If `commitBatchService` is internal-only, move out of `"use server"`. If RPC, wrap as `resourceAction`.
- [ ] **D4 resolution:** move `embedText` out of `"use server"`. Place it in `apps/web/src/lib/server-only/embeddings.ts` (or `packages/backend/src/lib/embeddings.ts` if shared with Lambda processors — confirm during this step). Update its callers.
- [ ] **D11 resolution:** drop `commenter` from the Prisma enum. Run `bun db:push --accept-data-loss` if V2 confirmed zero rows. Update `ResourceGrantRole`, `roleRank`, `rolesAtLeast`. Remove from `INVITE_ROLES` array (already done in this branch).
- [ ] **D12 resolution:** split `effective-access.ts`:
  - Move `AuthUser`, `loadAuthUser` → `principal.ts`.
  - Move `effectiveExamPaperRole`, `effectiveSubmissionRole`, `loadResourceGrants` → `effective-roles.ts`.
  - Move `assertExamPaperAccess`, `assertSubmissionAccess`, `assertBatchAccess`, `assertStagedScriptAccess`, `assertPdfIngestionJobAccess`, `assertQuestionAccess`, `assertMarkSchemeAccess`, `examPaperIdForQuestion` → `assertions.ts`.
  - Move `examPaperAccessWhere`, `submissionAccessWhere`, `principalWhere`, `grantedResourceIds`, `readableExamPaperIdsForUser`, `directlyGrantedSubmissionIdsForUser` → `where-clauses.ts`.
  - Update `lib/authz/index.ts` to re-export from the new files. External imports (`@/lib/authz`) should continue to work unchanged.
  - Delete `effective-access.ts`.
- [ ] **D13 resolution:** extract `ResourceGrantRepository` interface to `packages/shared/src/authz/resource-grant-repository.ts`. Update `effective-roles.ts` (web) and `collab-authz.ts` (backend) to use thin Prisma implementations. Remove `loadResourceGrants` duplication.
- [ ] **D9 resolution:** add the ESLint rule. Two rules:
  - `no-raw-auth`: ban `auth()` imports outside `lib/authz/*` and files matching `app/**/{page,layout}.tsx`.
  - `use-server-must-use-action-client`: every exported async function in a `"use server"` module must be assigned the result of an action client (`publicAction`, `authenticatedAction`, `adminAction`, `resourceAction`, `resourcesAction`, `scopedAction`).
  - Both rules have unit tests in `eslint-rules/__tests__/`.
  - Wire them into `biome.json` or a parallel ESLint config (project uses Biome primarily, but custom rules need ESLint).
- [ ] **D15 resolution:** rewrite the relevant CLAUDE.md sections. New canonical examples; lint rule documented.

**Test gate after step 4:**
- [ ] `bun typecheck` clean.
- [ ] `bun test:unit` clean.
- [ ] `bun check` clean.
- [ ] `bun lint` (or whatever invokes the new ESLint rules) clean. **There should be zero violations** because we just finished migrating everything. If there are violations, fix them before continuing.
- [ ] `bun db:push` applied locally; verify the schema looks right with `bun db:studio`.

### Step 5 — Final verification

- [ ] **Full typecheck:** `bun typecheck` (both web and backend).
- [ ] **Full unit suite:** `bun test:unit`. Pass count should be ≥ baseline + new middleware tests + new lint-rule tests.
- [ ] **Integration suite:** `AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- bun test:integration`. SSE route test must pass; attribution evals must remain green (this PR doesn't touch the extract pipeline, but verify).
- [ ] **Format / lint:** `bun check`. `bun lint` for ESLint rules.
- [ ] **Manual smoke through major flows:**
  - [ ] Sign in (Google + GitHub).
  - [ ] Upload a question paper PDF.
  - [ ] Upload a mark scheme PDF, verify auto-link.
  - [ ] Upload a student-script PDF, drag-segment in batch staging, commit.
  - [ ] Trigger a marking job; verify OCR + grading complete.
  - [ ] Open the marked submission, verify scan + annotations render.
  - [ ] Apply a teacher override, verify it persists.
  - [ ] Share a submission with a second user (use a second browser); verify the second user can view but not edit if `viewer`.
  - [ ] Try to access another user's submission directly via URL; verify 403/redirect.
  - [ ] Edit a question on the exam-paper detail page, verify the change persists.
  - [ ] Consolidate two similar questions, verify the result.
  - [ ] Submit a form with an invalid value, verify the error appears **inline next to the field**, not as a toast (this is the new validation-error wiring paying off).
- [ ] **Log inspection:** tail the dev server logs during the smoke test. Every action should log with `userId` populated.

---

## 6. Inventory — all 72 in-scope actions

Re-verify each action's resource resolver and minimum role during conversion. The roles below are inferred from current implementations and **must be confirmed per action**.

### 6.1 `resourceAction` (44)

**`exam-paper/`**
- `paper/queries.ts → getExamPaperDetail` *(paper, viewer)*
- `paper/mutations.ts → updateExamPaperTitle` *(paper, editor)*
- `paper/mutations.ts → updatePaperSettings` *(paper, editor)*
- `paper/mutations.ts → updateLevelDescriptors` *(paper, editor)*
- `paper/mutations.ts → deleteExamPaper` *(paper, owner)*
- `questions/queries.ts → getQuestionDetail` *(question, viewer)*
- `questions/mutations.ts → updateQuestion` *(question, editor)*
- `questions/mutations.ts → deleteQuestion` *(question, editor)*
- `questions/mutations.ts → reorderQuestionsInSection` *(section→paper, editor)*
- `questions/mutations.ts → reorderSections` *(paper, editor)*
- `unlinked-schemes.ts → getUnlinkedMarkSchemes` *(paper, viewer)*
- `similarity.ts → getSimilarQuestionsForPaper` *(paper, viewer)*

**`batch/`**
- `lifecycle/queries.ts → getActiveBatchForPaper` *(paper, viewer)*
- `lifecycle/mutations.ts → commitBatch` *(batch, editor)*
- `upload/queries.ts → getBatchIngestJob` *(batch, viewer)*
- `upload/mutations.ts → addFileToBatch` *(batch, editor)*
- `upload/mutations.ts → triggerClassification` *(batch, editor)*
- `upload/mutations.ts → createBatchIngestJob` *(paper, editor)*
- `scripts/mutations.ts → updateStagedScript` *(stagedScript, editor)*
- `scripts/mutations.ts → updateStagedScriptPageKeys` *(stagedScript, editor)*
- `scripts/mutations.ts → createEmptyStagedScript` *(batch, editor)*
- `scripts/mutations.ts → deleteStagedScript` *(stagedScript, editor)*
- `scripts/mutations.ts → splitStagedScript` *(stagedScript, editor)*

**`pdf-ingestion/`**
- `queries.ts → getActiveIngestionJobsForExamPaper` *(paper, viewer)*
- `queries.ts → getPdfDocumentsForPaper` *(paper, viewer)*
- `queries.ts → getExamPaperIngestionLiveState` *(paper, viewer)*
- `queries.ts → checkExistingDocument` *(paper, viewer)*
- `queries.ts → archiveExistingDocument` *(paper, editor)*
- `upload.ts → createLinkedPdfUpload` *(paper, editor)*
- `metadata.ts → extractPdfMetadata` *(pdfIngestionJob, owner)*
- `job-lifecycle.ts → getPdfIngestionJobStatus` *(pdfIngestionJob, viewer)*

**`mark-scheme/`**
- `manual.ts → createMarkScheme` *(question, editor)*
- `manual.ts → updateMarkScheme` *(markScheme, editor)*
- `autofill.ts → autofillMarkScheme` *(question, editor)*

**`marking/`**
- `annotations/queries.ts → getJobAnnotations` *(submission, viewer)*
- `evaluation.ts → evaluateStudentAnswer` *(submission, editor — verify)*
- `listing/queries.ts → listSubmissionsForPaper` *(paper, viewer)*
- `listing/export.ts → exportSubmissionsForPaper` *(paper, viewer)*
- `pdf-export/export-action.ts → exportClassReport` *(paper, viewer)*
- `scan/queries.ts → getJobScanPages` *(submission, viewer)*
- `scan/queries.ts → getJobPageTokens` *(submission, viewer)*
- `stages/queries.ts → getJobStages` *(submission, viewer)*
- `stages/mutations.ts → triggerGrading` *(submission, editor)*
- `stages/mutations.ts → retriggerGrading` *(submission, editor)*
- `stages/mutations.ts → retriggerOcr` *(submission, editor)*
- `stats/queries.ts → getExamPaperStats` *(paper, viewer)*
- `submissions/queries.ts → getStudentPaperJob` *(submission, viewer)*
- `submissions/queries.ts → getStudentPaperJobForPaper` *(submission, viewer)*
- `submissions/queries.ts → getSubmissionVersions` *(submission, viewer)*
- `submissions/queries.ts → getTeacherOverrides` *(submission, viewer)*
- `submissions/queries.ts → getSubmissionFeedback` *(submission, viewer)*
- `submissions/mutations.ts → updateStudentName` *(submission, editor)*
- `submissions/mutations.ts → linkStudentToJob` *(submission, editor)*
- `submissions/mutations.ts → deleteSubmission` *(submission, editor)*
- `submissions/mutations.ts → updateExtractedAnswer` *(submission, editor)*
- `submissions/mutations.ts → upsertSubmissionFeedback` *(submission, editor)*
- `overrides/mutations.ts → upsertTeacherOverride` *(submission, editor)*
- `overrides/mutations.ts → saveQuestionFeedbackBullets` *(submission, editor)*
- `overrides/mutations.ts → deleteTeacherOverride` *(submission, editor)*

**`sharing/`**
- `actions.ts → listResourceGrants` *(resource, viewer)*
- `actions.ts → updateResourceGrantRole` *(resource via grant, owner)*
- `actions.ts → revokeResourceGrant` *(resource via grant, owner)*
- `actions.ts → listSubmissionGrants` *(submission, viewer)*

### 6.2 `resourcesAction` (5)

- `exam-paper/similarity.ts → consolidateQuestions(keep, discard)` *(both questions, editor)*
- `exam-paper/unlinked-schemes.ts → linkMarkSchemeToQuestion(qId, msId)` *(both, editor)*
- `batch/scripts/mutations.ts → bulkUpdateStagedScriptStatus(ids[])` *(all stagedScripts, editor)*
- `marking/submissions/queries.ts → getStudentPapersForClass(paperId, ids[])` *(paper viewer + each submission viewer)*
- `sharing/actions.ts → shareResourceWithEmails(resource, ...)` *(resource, owner)*
- `sharing/actions.ts → shareSubmissionsWithEmails(ids[], ...)` *(all submissions, owner)*

### 6.3 `scopedAction` (3)

- `exam-paper/paper/queries.ts → listExamPapers` *(paper, viewer)*
- `marking/listing/queries.ts → listMySubmissions` *(submission, viewer)*
- `exam-paper/paper/queries.ts → listCatalogExamPapers` *(currently authenticated; confirm whether catalog should be `scopedAction` or `publicAction` during conversion)*

### 6.4 `authenticatedAction` (8)

- `exam-paper/paper/mutations.ts → createExamPaperStandalone`
- `pdf-ingestion/metadata.ts → requestMetadataUpload`
- `pdf-ingestion/metadata.ts → createExamPaperWithIngestion`
- `pdf-ingestion/metadata.ts → createExamPaperWithMultipleIngestions`
- `pdf-ingestion/upload.ts → createPdfIngestionUpload`
- `users/queries.ts → getCurrentUser`
- `collab/get-collab-token.ts → getCollabToken`
- `notifications/push.ts → getVapidPublicKey`
- `notifications/push.ts → registerPushSubscription`

### 6.5 `adminAction` (9)

- `admin/queries.ts → getDashboardData`
- `admin/queries.ts → listQuestions`
- `admin/queries.ts → listExemplarAnswers`
- `admin/usage/queries.ts → getUsageAnalytics`
- `admin/llm-queries.ts → listLlmCallSites`
- `admin/llm-mutations.ts → updateLlmCallSiteModels`
- `admin/llm-mutations.ts → bulkUpdateLlmCallSiteModels`
- `admin/llm-mutations.ts → seedLlmCallSites`
- `admin/llm-mutations.ts → resetLlmCallSiteToDefault`

### 6.6 `publicAction` (3)

- `actions.ts → login`
- `actions.ts → loginWithGoogle`
- `actions.ts → logout` *(technically authenticated but trivially so)*

### 6.7 Resolved separately

- `embeddings.ts → embedText` — moved out of `"use server"` (D4)
- `batch/lifecycle/mutations.ts → commitBatchService` — audit per V4 (D5)

### 6.8 Route handlers (D3)

- `app/api/scans/[...path]/route.ts` — already returns 404; convert to `routeHandler.public()` to make it explicit
- `app/api/callback/route.ts` — public (auth callback)
- `app/api/logout/route.ts` — authenticated
- `app/api/pdf-ingestion-jobs/[jobId]/document/route.ts` — `routeHandler.resource(pdfIngestionJob, viewer)`
- `app/api/submissions/[jobId]/events/route.ts` — `routeHandler.resource(submission, viewer)` (SSE stream)
- `app/api/submissions/[submissionId]/scan-pages/[pageOrder]/route.ts` — `routeHandler.resource(submission, viewer)`
- `app/api/batch/[batchId]/staged-scripts/[scriptId]/scan-pages/[pageOrder]/route.ts` — `routeHandler.resource(stagedScript, viewer)` *(or batch, viewer)*

---

## 7. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Positional → object args breaks ~150 call sites | High | Codemod (jscodeshift) generated against the inventory. Each domain conversion runs the codemod for its actions; eyeball the diff. |
| Resource resolver wrong for some action | Medium | Step 3 includes "manually exercise the affected UI" per domain. Resource resolvers go through code review; tests cover critical paths. |
| Native shape exposes edge cases (e.g., Next redirect, streaming) | Medium | Step 1 builds the wrapper against a list of expected cases. Spike (step 2) hits each shape. Discover gaps in step 2, not step 3. |
| Logging shape changes break log queries | Low | `attachLogger` middleware preserves the existing `log.info(TAG, msg, fields)` signature exactly, just with `userId` injected. |
| Optimistic mutations behave differently | Low | Server action signature change is the only thing TanStack Query sees. Not touching `useMutation`. |
| ESLint rule has false positives | Medium | Build the rule against the converted codebase at the end of step 3. By then there should be zero violations to false-positive against. |
| Some exported function from a `"use server"` module is genuinely *not* meant to be an action (`embedText`, `commitBatchService`) | Medium | Already flagged (D4, D5). Pre-kickoff verification (V4) resolves the unknown. Lint rule catches the rest. |
| `commenter` enum drop fails because data exists | Low | Pre-kickoff verification (V2) checks. If rows exist, backfill them to `viewer` before the enum drop. |
| `next-safe-action` doesn't compose with our middleware shape (e.g., metadata typing) | Low | Step 1 spike validates the API end-to-end with all six clients. Discover early. |
| Forms refactor for `validationErrors` is bigger than expected | Medium | V3 counts forms upfront. If >15, scope to forms in heavily-touched domains; ticket the rest. Don't blow the PR open. |
| `@next-safe-action/adapter-tanstack-query` becomes attractive mid-migration | Low | Explicitly out of scope per D2. Any team member tempted to add it must reopen this plan first. |

---

## 8. Acceptance criteria

The PR is mergeable when **all** of these are true:

- [ ] All 72 in-scope actions are built from `next-safe-action` action clients.
- [ ] All 7 API route handlers are built from the `routeHandler` wrapper.
- [ ] Zero raw `auth()` calls outside `lib/authz/` and `app/**/{page,layout}.tsx`.
- [ ] Zero exported async functions in `"use server"` modules that aren't built from an action client (verified by `bun lint`).
- [ ] ESLint rules `no-raw-auth` and `use-server-must-use-action-client` are present, tested, and enforce zero violations.
- [ ] Server actions return the native `next-safe-action` shape; `Result<T>` is no longer used for server-action returns. (Internal helpers can still use Result-style patterns where appropriate; this is about the action surface.)
- [ ] All forms in scope (per D14) wire `validationErrors` to inline field errors via `setError`.
- [ ] `embedText` is no longer in a `"use server"` module.
- [ ] `commitBatchService` is either wrapped or moved out of `"use server"` per V4.
- [ ] `commenter` is removed from the `ResourceGrantRole` enum; schema pushed; `roles.ts` updated.
- [ ] `effective-access.ts` is split into `principal.ts`, `effective-roles.ts`, `assertions.ts`, `where-clauses.ts`.
- [ ] `ResourceGrantRepository` interface is in `@mcp-gcse/shared`; web and backend each provide a thin Prisma implementation.
- [ ] `bun typecheck` passes for both web and backend.
- [ ] `bun test:unit` passes; pass count ≥ baseline (150) + new middleware/lint tests.
- [ ] `bun test:integration --project web:integration` passes.
- [ ] `bun check` and `bun lint` are clean.
- [ ] CLAUDE.md sections "Server Actions — Result Pattern", "Frontend Error Handling", and "Forms" are rewritten to match the new convention.
- [ ] Manual smoke test (step 5) passes end-to-end including the inline-validation-error check.
- [ ] Logs include `userId` for every action invocation.

---

## 9. Out of scope (explicitly)

These are tempting to fold in but are **not** part of this PR:

- Adopting `useAction`, `useOptimisticAction`, or `@next-safe-action/adapter-tanstack-query`.
- Rewriting CLAUDE.md sections beyond the three named in D15.
- Changing the marking engine, OCR pipeline, or any business logic.
- Adopting a new ORM, validation library, or auth provider.
- Refactoring how MCP tools (`packages/backend/src/tools/`) handle auth.
- Page-level auth gating in `page.tsx`/`layout.tsx` (a `requirePageSession` helper is a separate concern).
- The OpenAuth issuer (`packages/backend/src/auth.ts`) — only the GitHub-name fix already landed.

---

## 10. Open questions to resolve during execution

- **Q1:** Does `next-safe-action`'s middleware support async resource-id resolvers cleanly, or do we need to load the resource inside the middleware separately? Resolved during step 1.
- **Q2:** How does `next-safe-action` interact with Next.js `redirect()` / `notFound()` calls inside an action? Resolved during step 2 spike (e.g., when `logout` redirects).
- **Q3:** Where exactly does `embedText` move? `apps/web/src/lib/server-only/embeddings.ts` vs `packages/backend/src/lib/embeddings.ts` — depends on whether the web app and backend Lambda processors share the same implementation. Resolved during step 4.
- **Q4:** Does the codebase have any actions that take a `FormData` argument (Next.js form-action style)? Checked during step 2; if yes, they need a different schema integration.

---

## 11. Reference

- next-safe-action docs: https://next-safe-action.dev/
- Project authz module today: `apps/web/src/lib/authz/`
- Pure policy module: `packages/shared/src/authz/resource-policy.ts`
- Collab authz Lambda: `packages/backend/src/collab-authz.ts`
- Prior rollout review: `docs/access-sharing-rollout-review.md`
