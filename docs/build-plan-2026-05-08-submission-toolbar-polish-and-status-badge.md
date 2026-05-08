# Build Plan — Submission Toolbar Polish + Combined Status Badge

**Date:** 2026-05-08
**Scope:** Three tiers of follow-up work on the submission editor that came out of the 2026-05-08 IA review session. Tier 1 is toolbar chrome polish (cohesive PR). Tier 2 is the architectural one — collapse `StagePips` + `Confirm` + `Score`/`Grade` into a single state-aware status widget. Tier 3 is independent polish items that can ship individually.

---

## Background

The 2026-05-08 session reorganised the submission editor's IA: editor identity bar, `Talk to DeepMark` chat panel, AO sidebar md fallback, full-width editor, Row 2 rearchitecture, etc. (See git log for `feat(submission-editor): Talk to DeepMark + chat panel shell` and the follow-up commits.)

Several issues remained or surfaced during the review. This plan picks them up.

The current state of the toolbar (`apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/submission-toolbar.tsx`):

- **Row 1 (h-9, identity + workflow):** Breadcrumb · StudentNameEditor · VersionSwitcher · `ml-auto` · Read-only badge · Prev/Next · Avatars · Share · Confirm · Close
- **Row 2 (h-11, submission state):** Bookmark · StagePips · Score · Grade · `ml-auto` · LlmSpend(admin) · Feedback · DownloadPdf · ReRun · ReScan

---

## Tier 1 — Toolbar chrome polish (one cohesive PR)

Goal: row chrome feels intentional, items don't bounce, controls cluster by purpose.

### A — Vertical padding on both rows

Both rows feel cramped — buttons and avatars touch the row borders. Add `py-1` (4px) to the existing `h-9` / `h-11` rows so contents have breathing room. May need to drop the explicit `h-9` / `h-11` and let content + padding determine height; verify the chrome bar still aligns visually with ScanPanel header (which is `h-9` flat).

**Files:** `submission-toolbar.tsx` (Row 1 + Row 2 outer divs).

### B — Avatar far-right, Share to its left

Row 1 right cluster currently goes: `[readOnly] · [Prev/Next] · Avatars · Share · Confirm · Close`. Avatars sandwiched between Prev/Next and Share is arbitrary.

New order: `[readOnly moves to Row 2 — see #1 below] · [Prev/Next] · Share · Avatars · Confirm · Close`. Avatars become the rightmost identity-cluster element before the workflow CTAs.

**Files:** `submission-toolbar.tsx` (reorder JSX in Row 1's right cluster).

### C — Prev/Next stability + button styling

**Two issues:**

1. **Bouncing**: as the Confirm button text flips between "Confirm marking" (16ch) and "Confirmed" (9ch), the right cluster reflows and Prev/Next shift horizontally. Disorienting.
2. **Don't look like buttons**: `variant="ghost"` renders Prev/Next as text-only. Per design system they should look like secondary buttons (visible border, subtle elevation).

**Fix:**
- Switch Prev/Next to `variant="outline"` (or `secondary`) so they have a visible border. Keep the icon-only treatment on `<sm` (already present).
- Pin the Confirm button width with `min-w-[10rem]` (or similar) so the text swap doesn't change horizontal layout.
- If Tier 2 ships first, this stability problem partially disappears because the combined status widget can have a fixed width.

**Files:** `submission-toolbar.tsx`.

### #1 — Read-only badge moves to Row 2 left

It's *access state* (a property of the user's permissions on this submission), not a workflow action. After Bookmark/Score/Grade moved to Row 2, the badge's continued presence in Row 1 right cluster is incoherent. Move it to the start of Row 2 left cluster — same axis as everything else there ("what's the state of this submission?").

**Files:** `submission-toolbar.tsx` (move JSX from Row 1 to Row 2, before Bookmark).

### Acceptance criteria for Tier 1

- Row 1 and Row 2 contents have visible padding above and below — nothing touches the borders.
- Prev/Next stay in place when toggling Confirm/Confirmed.
- Prev/Next look like buttons (border, hover affordance).
- Avatar group is the rightmost element before Confirm/Close in Row 1.
- Read-only badge sits at the start of Row 2 (left of Bookmark).
- Typecheck + `bun lint:tokens` + `bun check` clean.

---

## Tier 2 — Combined status badge (architectural)

**Goal:** replace `StagePips` + `Confirm marking` button + `Score`/`Grade` badges with a single state-machine widget that represents "where this submission is in its lifecycle."

### Why this matters

Currently three separate UI elements each show a piece of submission state:
- `StagePips` shows pipeline progress (extraction, grading, annotation) with per-stage dropdowns of LLM stats.
- `Confirm marking` button is the human sign-off action.
- `Score` + `Grade` badges show the final outcome.

These are all phases of the *same* timeline:

```
  Extracting → Grading → Confirm marking → Confirmed
                                                ↑ shows final score + grade
```

They should be one widget. Single source of truth for "what state is this submission in?".

### State machine

```
ExtractionPhase {
  state: "in-progress" | "failed"
  → next: GradingPhase
}
GradingPhase {
  state: "in-progress" | "failed"
  → next: ReadyToConfirm
}
ReadyToConfirm {
  // Grading complete, awaiting human sign-off.
  // Widget shows score+grade alongside the action.
  // Click confirms → Confirmed.
}
Confirmed {
  // Final state. Click un-confirms → ReadyToConfirm.
  // Widget shows score+grade + ✓ badge.
}
```

The phase enum already exists in `apps/web/src/lib/marking/stages/phase.ts` (`MarkingPhase`). The widget reads `phase` and renders the matching state.

### Component shape

New file: `apps/web/src/app/teacher/mark/papers/[examPaperId]/submissions/[jobId]/status-badge.tsx`

```tsx
type Props = {
  phase: MarkingPhase
  isConfirmed: boolean
  totalAwarded: number
  totalMax: number
  gradeBoundaries: GradeBoundary[] | null
  gradeBoundaryMode: "percent" | "absolute" | null
  onConfirm: () => void
  isPending: boolean
  readOnly: boolean
}

function StatusBadge({ phase, isConfirmed, ... }: Props) {
  if (phase === "extracting" || phase === "scan_processing") {
    return <ExtractingState />
  }
  if (phase === "grading") {
    return <GradingState />
  }
  if (phase === "completed" && !isConfirmed) {
    return <ReadyToConfirmState onConfirm={onConfirm} score={...} grade={...} />
  }
  if (phase === "completed" && isConfirmed) {
    return <ConfirmedState onUnconfirm={onConfirm} score={...} grade={...} />
  }
  if (phase === "failed" || phase === "cancelled") {
    return <FailedState />
  }
}
```

Each state renders a button-shaped widget at consistent height (`h-9` to match the row) with a leading state icon, label, and optionally score/grade.

### Visual treatment per state

| State | Icon | Label | Right side | Variant |
|---|---|---|---|---|
| Extracting | `Loader2` (spinning) | "Extracting" | — | `outline` ghost-y |
| Grading | `Loader2` (spinning) | "Grading" | progress nibble (e.g. `8 / 12`) | `outline` ghost-y |
| Ready to confirm | `Check` | "Confirm marking" | `32/43 · Grade 7` | `confirm` (teal SE-shadow) |
| Confirmed | `CheckCircle` (filled) | "Confirmed" | `32/43 · Grade 7` | `outline` with `success-50/success-300/success-800` |
| Failed | `AlertCircle` | "Failed — Retry" | — | `destructive` ghost-y |

Score/Grade always rendered as compact text inside the badge body when in `Ready to confirm` or `Confirmed` — no separate badges floating on the row.

### What gets removed

- `StagePips` component usage in `submission-toolbar.tsx` (the component file itself can stay until we're sure nothing else consumes it; mark for cleanup).
- Per-stage stat dropdowns (the popover content driven by `LlmRunSnapshot`) — admin can still see them via `LlmSpendButton` which stays.
- Standalone `Confirm marking` button.
- Standalone `ScoreBadge` + `GradeBadge` rendering in the toolbar (the `<ScoreBadge>` / `<GradeBadge>` components can stay for use elsewhere — e.g. the submission table — but the toolbar uses them only inside `StatusBadge`).

This subsumes #6 from the IA review (Score+Grade redundancy) — they're now part of the combined widget.

### Where the widget lives

Currently `Row 2 (submission state)` contains: Read-only · Bookmark · StagePips · Score · Grade · `ml-auto` · …actions.

After:
- Read-only · Bookmark · **StatusBadge** · `ml-auto` · …actions

The widget replaces three elements with one. Row 2 becomes more legible.

The `Confirm marking` button leaves Row 1 right cluster entirely. Row 1 becomes pure identity + lightweight workflow (Prev/Next/Share/Avatars/Close):

- Row 1: Breadcrumb · Student · v(N) · `ml-auto` · Prev/Next · Share · Avatars · Close
- Row 2: Read-only · Bookmark · **StatusBadge** · `ml-auto` · LlmSpend(admin) · Feedback · DownloadPdf · ReRun · ReScan

This actually fixes Tier 1's #C (Prev/Next stability) **for free** since the variable-width Confirm button is gone from Row 1.

### Implementation order

1. Build `<StatusBadge>` as a standalone component with stories for each state (Extracting / Grading / ReadyToConfirm / Confirmed / Failed). Test visually first before wiring.
2. Wire it into `submission-toolbar.tsx` Row 2, in the same slot StagePips currently occupies.
3. Remove StagePips usage; verify `LlmSpendButton` still renders for admins.
4. Remove standalone Confirm button from Row 1.
5. Remove ScoreBadge + GradeBadge usage from Row 2.
6. Verify `confirmMutation` from `submission-toolbar.tsx` is still called via `StatusBadge`'s onConfirm — pass it through as a prop.

### Files

- New: `submission-toolbar/status-badge.tsx` (or co-located in the submissions folder).
- Modified: `submission-toolbar.tsx`.
- Verify still-referenced: `submission-toolbar-controls.tsx` (where `ScoreBadge` / `GradeBadge` live), `stage-pips.tsx`, `stage-pips-hooks.ts`. If they're unused after this change, delete; otherwise leave for the submission table consumer.

### Acceptance criteria

- Single status widget visible in Row 2 left cluster, replacing StagePips + Confirm + Score + Grade.
- All four lifecycle states (Extracting / Grading / Confirm marking / Confirmed) render with the matching visual treatment per the table above.
- Confirming flips the widget to `Confirmed` state with an instant optimistic update (existing `confirmMutation` logic).
- Unconfirming flips back. Score/Grade visible in both Confirm-ready and Confirmed states.
- Failed/cancelled phases render an appropriate state, not a blank widget.
- Per-stage stat dropdowns are gone (admin still has `LlmSpendButton` for cost/model details).
- Typecheck + lint clean.

---

## Tier 3 — Independent polish items

These don't depend on each other or on Tiers 1/2 — pick individually.

### #2 — AnnotationToolbar disabled buttons clutter

The floating dark pill in the editor identity bar always shows all 11 buttons (Bold/Italic/Underline + 7 AO marks + Eraser). When the cursor isn't in a `questionAnswer` node, the 8 mark/eraser buttons are visible-but-disabled. Visual noise.

**Fix:** in `apps/web/src/components/annotated-answer/annotation-toolbar.tsx`, hide the entire annotation cluster (not just disable) when `!annotationContextOk`. Formatting buttons (Bold/Italic/Underline) stay visible since they're context-independent.

```tsx
{annotationContextOk && (
  <>
    <Divider />
    {actions.map(...)}
    <Divider />
    {/* eraser */}
  </>
)}
```

The pill shrinks accordingly when out of `questionAnswer` context — visually communicates "you can't apply marks here".

### #3 — Keyboard shortcut discoverability

Step 2 of the 2026-05-08 session removed the "Select text · 1–7" hint from the floating toolbar. New users can hover each button to see its shortcut in the tooltip, but no overall cheat-sheet exists.

**Fix:** add a `?` icon at the right end of the pill (after the eraser divider). Click opens a small popover listing all keyboard shortcuts:

- `⌘B` / `⌘I` / `⌘U` — Bold / Italic / Underline
- `1`–`7` — Annotation marks (with their action names)
- `Esc` — clear marks in selection (or whatever the eraser shortcut is)

Lucide icon: `HelpCircle` or `Keyboard`.

### #4 — Context chips navigate back to question

In `chat-panel.tsx`, `<ContextChipBadge>` shows `Q002 ×` but clicking the chip body does nothing. Click should scroll back to the corresponding question in the editor.

**Fix:**
- Pass `scrollToQuestion` callback (already exists in `submission-view.tsx` via `useScrollToQuestion`) down to `ChatPanel` as `onChipClick: (questionNumber: string | null) => void`.
- `ContextChipBadge` invokes it on body click (the `×` button stops propagation so dismiss isn't accidentally triggered).
- Skip if `chip.questionNumber === null` ("Selection" chips outside any question — no anchor to scroll to).

**Files:** `submission-view.tsx`, `chat-panel.tsx`.

### #5 — AO sidebar empty state

`comment-sidebar.tsx` returns `null` when `positioned.length === 0`. At lg+ this leaves a 208px empty column. Either:

**Option A** — placeholder content: a small "No annotations yet" message with a hint about how marks become annotations.

**Option B** — collapse to zero width when empty: the editor expands to fill. More aggressive.

Option A is safer — the empty column is a known anchor; collapsing it creates layout shift when annotations appear. Go with A.

```tsx
if (positioned.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
      <MessageSquare className="h-6 w-6 text-muted-foreground/40 mb-2" />
      <p className="text-xs text-muted-foreground">No annotations yet</p>
      <p className="text-[10px] text-muted-foreground/70 mt-1">
        Apply a mark with 1–7 to add one.
      </p>
    </div>
  )
}
```

**Files:** `apps/web/src/components/annotated-answer/comment-sidebar.tsx`.

### #6 — Score + Grade redundancy

**Subsumed by Tier 2.** No separate work needed once `StatusBadge` consolidates them.

---

## Other parked items (cross-reference)

These were flagged earlier in the session but are out of scope for this plan. Listed here so they don't get lost:

- **Latest-submission-per-student dedup in batch progress count.** `getAdjacentSubmissions` currently counts every non-superseded submission. If a student is uploaded twice (two `staged_script_id`s), they're counted twice. Fix would dedupe by `student_id` (with `student_name` fallback) when computing `totalCount` and `confirmedCount`. See `apps/web/src/lib/marking/submissions/queries.ts:692`.
- **Mobile Chat tab.** Currently mobile has Scan/Results tabs only; no Chat. The selection bubble is suppressed on mobile (good), but there's no way to reach the chat at all. Either add as a third tab or leave for post-MVP.
- **Editor full-width line length on very wide screens.** The 2026-05-08 session dropped `max-w-[210mm]` per user request. At 1920px+ widths, prose lines exceed comfortable reading length. Reconsider if user feedback flags it.

---

## Suggested running order

1. **Tier 1 batch** as one cohesive PR — A + B + C + #1 ship together so the toolbar feels coherent. Half a day.
2. **Tier 2 — `StatusBadge`** as a focused PR. Roughly a day if the visual treatment is signed off up front.
3. **Tier 3 picks** individually as time allows.

Tier 2 is where the IA payoff is biggest — it collapses three separate UI elements into one truthful representation of submission state, and incidentally fixes the Prev/Next bouncing problem. Worth doing soon after Tier 1.
