# 2026-04-27 — Cleanup handoff

All outstanding items in this doc were closed in the 2026-04-27 follow-up
session. Captured here for future audit; safe to delete once nothing in the
codebase still benefits from the breadcrumbs below.

---

## What's already done (audit trail)

### From 2026-04-26 → 2026-04-27 (initial migration session)

- **#3** Dispatchers consolidated in `@mcp-gcse/shared`.
  - Moved `editor-ops.ts` (570 LOC) from `packages/backend/src/lib/collab/`
    to `packages/shared/src/editor/editor-ops.ts`.
  - Backend's `editor-ops.ts` shrunk to a 23-line named re-export.
  - Web's `headless-edit.ts` shrunk 326 → 186 lines; deleted
    `dispatchTeacherOverride`, `dispatchQuestionFeedbackBullets`,
    `findQuestionBlock`, `findMcqTable`, `WebTeacherOverride`. Re-exported
    under the legacy `dispatch*` names for `mutations.ts`.
- **#4** Shared `UngradedBadge` component
  (`apps/web/src/components/ungraded-badge.tsx`) with `shape: "pill" |
  "rect"`. Used by `score-override-editor.tsx` (pill) and
  `mcq-table-view.tsx` (rect).
- **#5** `DocOpsProvider` consolidates write ops. Was: every doc-edit
  callback drilled through 5 files. Now: one `DocOpsProvider` at
  `submission-view` level, NodeViews call `useDocOps()`. Adding a new doc
  op is a one-file change.
- **#6** `resolveTeacherOverride` helper
  (`apps/web/src/lib/marking/overrides/resolve.ts`). Pure function with 7
  unit tests pinning the precedence (doc wins over PG, `score: null`
  falls through, `teacherFeedbackOverride` beats embedded `feedback`,
  etc.). Used by both `question-answer-view.tsx` and `mcq-table-view.tsx`.
- **#8** Stale "migration step 2/3" comment in `question-answer-view.tsx`
  was removed during the doc-as-truth rewrite.

### From 2026-04-27 (this follow-up session)

- **#1** STAGE env on the web tier. `STAGE: $app.stage` added to
  `infra/web.ts`; the `NEXT_PUBLIC_STAGE ?? STAGE ?? "dev"` band-aid in
  `headless-edit.ts` collapsed to `process.env.STAGE ?? "dev"`. Needed
  `sst dev` restart to pick up the new env var.
- **#2** `DocTeacherOverride` folded into `TeacherOverrideAttrs`. The
  local type in `resolve.ts` is gone; `resolveTeacherOverride`,
  `mcq-table-view.tsx`, `question-answer-view.tsx`, and the resolve unit
  tests all import the shared shape from `@mcp-gcse/shared`.
- **#7** Mark colours hoisted to CSS variables in `globals.css`
  (`--mark-tick-bg`, `--mark-cross-bg`, `--mark-circle-bg`, etc.).
  `annotation-marks.css` references the variables instead of restating
  hex literals — single source of truth for editor visuals + future
  scan-side decorations + dark-mode.
- **#9** `OrganicMarkingLoader` extracted to
  `apps/web/src/components/marking-loader.tsx`. `useDocHasQuestionBlocks`
  extracted to
  `apps/web/src/components/annotated-answer/use-doc-has-question-blocks.ts`.
  `grading-results-panel.tsx` shrunk by ~110 lines.
- **#10 + #11** ScanPanel toggle props consolidated into
  `useScanViewSettings()` (new file
  `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/use-scan-view-settings.ts`).
  ScanPanel went from 12 toggle props (6 boolean + 6 callback) to 2
  (`settings`, `toggle`). `inspectMode: boolean` became `viewMode:
  "focus" | "inspect"` — the union slots into the same settings object
  and extends cleanly. Side-effect of the refactor: desktop now exposes
  the inspect/zoom toggle UI (previously hidden, with the result that
  `handleTokenHighlight` always discarded highlights — a latent bug).
- **Minor #1** `effectiveScore as number` cast in
  `score-override-editor.tsx` removed; `displayNode` is now built via
  `if/else if/else` so the `null` case narrows naturally.
- **Minor #2** `CLAUDE.md` Tech Stack table got an "Editor / Yjs" row
  plus a callout under "Editor / Yjs — TipTap version skew" capturing
  the cursor → caret rename trap and the
  `collaboration-carets__*` CSS class change.

## How to use this doc

Nothing left to do. If a new cleanup session is needed, start a fresh doc
with the new items — don't extend this one. The audit trail above plus the
prior session's plans are enough to reconstruct the trail:

- `docs/2026-04-25-session-handoff.md` (prior session)
- `docs/build-plan-doc-as-source-of-truth.md` (the migration plan that
  drove most of these changes)
