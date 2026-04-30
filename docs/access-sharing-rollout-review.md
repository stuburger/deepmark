# Access & Sharing Rollout — Code Review Notes

Written 2026-04-30 after a full session implementing the access/sharing plan.
Hand this to a new conversation to continue or fix-up.

---

## What Was Built

### Database
- `ResourceGrant` model with `resource_type`, `resource_id`, `principal_type`, `principal_user_id`, `principal_email`, `role`, `created_by`, `accepted_at`, `revoked_at`.
- Three enums: `ResourceGrantRole` (`owner` / `editor` / `commenter` / `viewer`), `ResourceGrantResourceType` (`exam_paper` / `student_submission`), `ResourceGrantPrincipalType` (`user` / `team`).
- Indexes on `(resource_type, resource_id)`, `(principal_user_id, resource_type)`, `(principal_email, resource_type)`.
- `User.role` annotated as **global system role only** with `@default(teacher)`. Resource permissions live in `ResourceGrant.role`.
- Backfill script at `packages/db/scripts/backfill-resource-grants.ts` — run it after `db:push` on any new environment.
- **Schema push and backfill have been run** on the `stuartbourhill` stage (10 paper grants, 118 submission grants).

### Auth / Token
- OpenAuth subject (`packages/backend/src/subjects.ts` + `apps/web/src/lib/auth.ts`) now includes `email` alongside `userId`.
- `auth()` in the web app returns `{ userId, email }`.
- New signups default to `role: "teacher"` (was `"admin"` — a pre-existing bug that's now fixed).
- Pending resource grants are attached to a user **at signup only** (in `packages/backend/src/auth.ts`), not on every authenticated request.

### Policy Layer (`apps/web/src/lib/authz/`)
- `with-session.ts` — pure `requireSessionUser()`: authenticates, loads `AuthUser`, no side effects.
- `effective-access.ts` — DB-backed helpers: `effectiveExamPaperRole`, `effectiveSubmissionRole`, `assertExamPaperAccess`, `assertSubmissionAccess`, `assertBatchAccess`, `assertStagedScriptAccess`, `assertPdfIngestionJobAccess`, `assertQuestionAccess`, `assertMarkSchemeAccess`, `examPaperAccessWhere`, `submissionAccessWhere`.
- `AuthUser` has `id`, `email`, `systemRole` (renamed from `role` to avoid confusion with `ResourceGrantRole`).

### Pure Policy Module (`packages/shared/src/authz/resource-policy.ts`)
- No Prisma, no SST — fully testable pure functions.
- `effectiveExamPaperResourceRole` / `effectiveSubmissionResourceRole` — compute effective role from legacy owner fields + grants.
- `grantMatchesPrincipal` — matches on `principalUserId` or normalized `principalEmail`.
- `maxMatchingGrantRole` — strongest grant for a principal.
- `removingOrDowngradingFinalOwner` — final-owner protection guard.
- Consumed by both `apps/web/src/lib/authz/effective-access.ts` and `packages/backend/src/collab-authz.ts`.

### Scan Routes
- Legacy `/api/scans/[...path]` → always returns 404.
- New `/api/submissions/[submissionId]/scan-pages/[pageOrder]` — session + `assertSubmissionAccess(..., "viewer")`, streams from S3.
- New `/api/batch/[batchId]/staged-scripts/[scriptId]/scan-pages/[pageOrder]` — session + `assertBatchAccess(..., "viewer")`, streams from S3.
- `scan-url.ts` provides `submissionScanPageUrl()` and `stagedScriptScanPageUrl()`.

### Boundary Enforcement
Applied `requireSessionUser()` + appropriate assert to all high-priority server actions:
- `exam-paper/paper/queries.ts`, `mutations.ts`
- `exam-paper/questions/queries.ts`, `mutations.ts`
- `exam-paper/unlinked-schemes.ts`
- `pdf-ingestion/queries.ts`, `upload.ts`, `metadata.ts`, `job-lifecycle.ts`
- `batch/upload/queries.ts`, `mutations.ts`, `lifecycle/queries.ts`, `lifecycle/mutations.ts`
- `batch/scripts/mutations.ts`
- `mark-scheme/manual.ts`, `autofill.ts`
- `marking/listing/queries.ts`, `annotations/queries.ts`, `scan/queries.ts`, `stages/queries.ts`, `stages/mutations.ts`, `overrides/mutations.ts`, `stats/queries.ts`, `submissions/queries.ts`, `submissions/mutations.ts`, `evaluation.ts`
- `api/pdf-ingestion-jobs/[jobId]/document/route.ts`
- `api/submissions/[jobId]/events/route.ts`

### Sharing Actions (`apps/web/src/lib/sharing/actions.ts`)
- `shareResourceWithEmails` — owner-only, upserts/creates grants, supports pending email.
- `listResourceGrants` — viewer-readable.
- `updateResourceGrantRole` — owner-only, final-owner protection via `removingOrDowngradingFinalOwner`.
- `revokeResourceGrant` — owner-only, final-owner protection.
- `shareSubmissionsWithEmails` / `listSubmissionGrants` — convenience wrappers for first-pass UI.

### Share Dialog UI (`apps/web/src/components/sharing/share-dialog.tsx`)
- Google Docs-style email input, role dropdown.
- Entry points: `submission-toolbar.tsx` (Share button near collaborator avatars), `submission-table.tsx` (row-level Share action).

### Collab Authorization
- Internal web callback removed entirely.
- New dedicated Lambda: `packages/backend/src/collab-authz.ts`, wired in `infra/authz.ts`.
- `authorizeCollabDocumentAccess(repository, input)` is the testable decision function — takes a `CollabAuthzRepository` interface, no SST imports at module level.
- Collab server calls `COLLAB_AUTHZ_URL` (the Lambda function URL) via `Bearer CollabServiceSecret`.
- `$dev` still runs Hocuspocus locally via `DevCommand`.

### Tests
- `packages/shared/tests/unit/resource-policy.test.ts` — 8 pure policy tests (role ordering, grant matching, cascade, isolation, admin bypass, final-owner).
- `packages/backend/tests/unit/collab-authz.test.ts` — 4 collab handler tests (editor accepted, viewer rejected, no grant rejected, invalid doc rejected).
- `apps/web/src/lib/authz/__tests__/roles.test.ts` — 5 role helper tests.
- `apps/web/tests/integration/sse-route.test.ts` — 2 integration tests (inaccessible submission returns 404, accessible submission returns snapshot); requires `AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill`.

---

## Known Issues / Must Fix Before Ship

### 1. Logic confusion in `effectiveSubmissionRole` (not a bug today, but fragile)

**File:** `apps/web/src/lib/authz/effective-access.ts` lines 100–116

```ts
const direct = await maxRoleFromGrants(user, ResourceGrantResourceType.student_submission, submissionId)
return effectiveSubmissionResourceRole({
    ...
    grants: direct
        ? [{ role: direct, principalUserId: user.id, principalEmail: user.email }]
        : [],
})
```

`maxRoleFromGrants` already collapsed all direct grants into a single resolved role, then we're re-wrapping it as a single synthetic grant. This works today because `grantMatchesPrincipal` on `principalUserId: user.id` will match and return the same role — but it's confused logic.

**Fix:** follow the same pattern used in `packages/backend/src/collab-authz.ts` — load raw grant rows and pass them directly to `effectiveSubmissionResourceRole`. Remove `maxRoleFromGrants` from this path; `effectiveSubmissionResourceRole` calls `maxMatchingGrantRole` internally.

### 2. `exam-paper/similarity.ts` — no access check

`getSimilarQuestionsForPaper(examPaperId)` and `mergeSimilarQuestions(...)` use raw `auth()` with no `assertExamPaperAccess`. A teacher can call these with any `examPaperId`.

**Fix:** add `requireSessionUser()` + `assertExamPaperAccess(session.user, examPaperId, "viewer")`.

### 3. `marking/listing/export.ts` — no access check

`exportSubmissionsForPaper(examPaperId, submissionIds?)` uses raw `auth()`. Returns full grading data for any paper.

**Fix:** add `requireSessionUser()` + `assertExamPaperAccess(session.user, examPaperId, "viewer")`.

### 4. `marking/pdf-export/export-action.ts` — no access check

`exportMarkingPdf(...)` uses raw `auth()`. Check what IDs it takes and add the appropriate assert.

### 5. GitHub signup hardcodes `name: "Admin User"`

**File:** `packages/backend/src/auth.ts` line 98

```ts
name: "Admin User",
```

Should be `gh_user.login`. The data is available from `fetchGithubUser`.

### 6. `ShareDialog` exposes `commenter` role with no product semantics

`commenter` does nothing differently from `viewer` in the current product. Showing it in the invite dropdown is confusing. Remove it from the invite UI until it means something.

---

## Not Started / Out of Scope for This Session

- **Admin/audit polish** — no admin UI for viewing/managing grants across users.
- **Invitation flow** — pending grants work via email matching at signup, but there's no invite email, no accept-link, no token. The schema supports it (`accepted_at`, `principal_email`), but the product flow isn't there yet.
- **Exam paper sharing UI** — `ShareDialog` only exposes submission sharing. Schema + actions support paper sharing already.
- **Bulk sharing** — `shareSubmissionsWithEmails` supports it, but no bulk UI entry point.
- **Other environments** — `db:push` and `backfill:resource-grants` still need to be run on `development` and `production` stages.
