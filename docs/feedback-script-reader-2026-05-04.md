# Script Reader v5 — design feedback to Geoff

Re: `geoff_ui_claude_design/v2/deepmark_script_reader_v5.html`
Date: 2026-05-04

This memo captures **where we'll deviate from the design and why**, plus a few **disagreements with the IA / interaction calls** that we'd like Geoff's input on before we lock implementation.

---

## Decisions we're making (no design block — proceeding)

### 1. We're using the existing button variants as-is

The script reader introduces ~five new button sizes (22, 24, 26, 28, 30, 34px) against our four (24 / 28 / 32 / 34px). The 26px tier alone is used seven times in this one screen and doesn't exist in our system.

**Decision:** infer the closest existing variant (usually `secondary` or `ghost` at `size="sm"` or `size="icon-sm"`) and accept that the rendered chrome will land within ±2px of the mock. Documenting deviations rather than expanding `button-variants.ts` to 14+ sizes for one screen.

**Specific gaps Geoff should be aware of:**
- `.btn-flag` — amber-bordered "warning-toned secondary" — no equivalent in our system. **We'll render it as a standard `secondary` button** (white + neutral border + neutral shadow). The amber accent will be lost. If he wants the amber tone preserved, we'd need a `warning` variant added to the system.
- `.btn-sm` / `.btn-overflow` — small SE-shadowed secondary at 26px — closest is our `secondary` at `size="sm"` (28px). 2px taller than mock.
- `.tool-ico` / `.sent-btn` — 22px icon buttons — closest is `icon-xs` (24px). 2px taller.
- `.ai-mic` / `.ai-send` — 30px square — closest is `icon` (32px). 2px taller.
- `.btn-confirm` (34px) ✅ matches our `confirm` variant directly.
- The hover translate-and-reduce-shadow press behaviour Geoff specifies is more polished than our `active:translate-y-px`. **Worth doing system-wide** as a follow-up — but not in this screen.

### 2. We're not chasing the colour deviations in this implementation

We'll render with our existing tokens (`--teal: #01ADD0`, `--destructive: #C23B3B`, `--paper: #FFFFFF`). Where Geoff's HTML uses `#00B4D4` / `#C04444` etc., we substitute our token equivalents.

**Open questions for Geoff (don't block — we'll proceed and reconcile later):**
- Brand teal: is `#01ADD0` (v1.1 token) still authoritative, or has v2 shifted to `#00B4D4`?
- Destructive red: `#C23B3B` (ours) or `#C04444` (his)?
- AO2 purple — three values floating across files (`#7B52C0`, `#5A2D9E`, `#9B6DD4`). Which is canonical?
- Page background — your latest call was pure white `#FFFFFF`; this file uses cream `#ECEAE4`. Confirming white is locked.

### 3. Lora on the student name → Geist instead

Our hard rule (CLAUDE.md): Lora *only* on the dashboard greeting. Geoff uses Lora at 14px for `.student-name`. **We'll render in Geist 14px medium** to keep the Lora exception sacred. If Geoff wants Lora here, we revisit the rule at the system level rather than per-screen.

---

## Pushback on Geoff's IA / interaction calls

These are places where we'd rather not implement what's in the mock without his input, because we think the design is optimising the wrong thing.

### A. Export should not be hidden in the overflow menu

Geoff buries **Export PDF** and **Share script** inside the `···` overflow menu alongside "Re-run grading."

**Our take:** Export and Share are *not* tertiary actions. For a teacher who's just confirmed a script, the next thing they often want to do is share with a colleague or download a PDF for parents/leadership. Hiding them behind an unmarked overflow trigger optimises for visual quietness over the actual user intent.

**Counter-proposal:** keep **Share** and **Export** as visible icon-buttons in the topbar (alongside Prev/Next), and reserve the overflow menu for *genuinely* tertiary actions (Re-run grading, etc.).

### B. The Flag button is over-prominent vs. Share

The mock dedicates a 34px-high amber-bordered button to **Flag** (with its own dropdown of "Review later" / "Share with colleague"). Meanwhile **Share** itself is hidden in the overflow.

**Issues:**
1. **Share is a known, universally-recognised action.** Replacing the share *icon* with a flag pattern teachers haven't seen before forces them to learn a new mental model for a familiar task.
2. **"Share with colleague" appears in the flag dropdown** — semantically that's just sharing, not flagging. Conflating them in the same control is confusing.
3. **The flag button takes more visual weight than the confirm CTA at the same height** because of the amber border accent. Confirm should be the dominant action.

**Counter-proposal:**
- Promote **Share** to a visible icon-button (same affordance as Prev/Next).
- Demote **Flag** to a smaller secondary button next to Share — same size as Share, neutral chrome (no amber).
- Drop the **"Share with colleague"** option from the flag dropdown — it doesn't belong there.

### C. "Review later" — defer to post-v1

The flag button's "Review later" feature is genuinely useful (a teacher's "I'll come back to this script" pile) but it implies new state we don't track today (per-script flagged status, a flagged-scripts queue/view). **Defer to post-launch.** For v1 the flag button can simplify to a single-action "Flag for review" toggle without the dropdown.

---

## Things from the mock we're definitely keeping

These are wins worth banking:

- **Prev / Next navigation buttons** in the topbar — significant UX upgrade over having to go back to the submissions list. Plus the keyboard shortcuts (← / →).
- **`⌘K` to focus the AI co-marker** + **`⌘↵` to confirm marking** — universal shortcuts, easy to learn.
- **AO crosslight** — clicking a highlighted span in the script lights up the corresponding AO annotation card on the right (and vice-versa). Excellent affordance for tracing why a mark was awarded.
- **Page thumbnails on the left** — quick navigation across a multi-page script. Aligned with the v2 design language (white tiles + SE shadow + active teal border).
- **Floating editing toolbar in topbar2** — surfaces AO tag / mark / cross / circle tools without pulling the user away from the response text.
- **Sentiment toggle** (Positive / Neutral / Negative) on expanded AO items — enables the eventual "softness/strictness slider" Tier 3 work to surface ground-truth signal.
- **Progress rail** at the very top — single-pixel bar showing how many scripts in the batch are confirmed. Quiet but informative.
- **Inline mark override** — clicking the score pill opens an inline numeric input. Much better than navigating to a separate edit screen.
- **WWW / EBI / FB tag pattern** on each question, with expand-on-click panels for the long-form rationale.

---

## Open question for Geoff

The script reader introduces a **new dark surface** for the floating editing toolbar (`rgba(28,24,36,0.84)` + backdrop blur). Should this surface be added to the design system as a token (`--toolbar-bg`?) so it's reusable, or is the editing toolbar a one-off?

Same question for the **AI co-marker bar** — its 26px pill radius differs from our existing `--radius-pill: 24px`, and it has its own composite (1.5px teal border + soft float shadow + larger pill). One-off, or canonical "AI input" surface?

---

## Implementation plan once Geoff signs off

1. Build the script-reader page using existing tokens (white paper, our teal, Geist throughout, our radius/shadow scale, our button variants).
2. Render the layout structure faithfully (3-column body: pages left / script centre / AO panel right; topbar1 + topbar2 + AI bar bottom).
3. Adopt the prev/next + keyboard shortcuts + AO crosslight + inline mark override.
4. Substitute Share/Export/Flag IA per "Pushback" above (subject to Geoff's response).
5. Skip "Review later" flagging.
6. Document remaining deviations in a follow-up Linear ticket so the v2 reconciliation pass can address them all together.
