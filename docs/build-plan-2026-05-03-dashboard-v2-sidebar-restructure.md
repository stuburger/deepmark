# Build Plan — Dashboard V2 + Sidebar Restructure (2026-05-03)

Implement Geoff's reworked dashboard from `geoff_ui_claude_design/v2/DeepMark v1 Landing page + sidebar/Dashboard.html`. Two structurally significant changes plus a handful of smaller ones.

**Context summary for a fresh chat.** The DeepMark v1.1 design system is already in place (Phases 1, 2, 4, 6 — see CLAUDE.md "Design System — DeepMark v1.1" section). Tokens, fonts (Geist + Playfair), shadcn re-skin (Button/Badge/Card/Dialog/Sheet/Popover/etc.), sidebar, and the `lint:tokens` guard rail all shipped. The current teacher dashboard at `apps/web/src/app/teacher/page.tsx` was built from the previous v1 prototype (`geoff_ui_claude_design/v2/deepmark-v1-landing-page/Dashboard.html`) — greeting + stats + action stack + 3-col paper grid. This plan replaces it with Geoff's v2 (newer) design which is structurally different.

**Source design files** (read these first):

- `geoff_ui_claude_design/v2/DeepMark v1 Landing page + sidebar/Dashboard.html` — full HTML/CSS prototype (the load-bearing one)
- `geoff_ui_claude_design/v2/DeepMark v1 Landing page + sidebar/screenshots/sidebar-open.png` — slide-over menu rendered
- `geoff_ui_claude_design/v2/deepmark_design_system.html` — system spec (tokens, type, shadows). Geoff's v2 deviates from this in two intentional places: pill border-radius (24px breaks the 10px cap) and greeting font (Lora, not Playfair). Both deviations are explicit.

**Geoff's notes** (verbatim — paste into the doc when handing off, useful tone signal):

> • Reworked the dashboard layout — changes are subtle visually but quite significant structurally.
> • Made the chat input the central anchor of the page (larger, pill-shaped, lighter styling) so the primary interaction is immediately obvious and front-and-centre.
> • Introduced clear visual hierarchy by slightly breaking the angular design system — helps the input stand out without adding clutter.
> • Updated tile states: Active tiles now have a shadow / Inactive tiles are flat → gives quick, low-effort state recognition
> • Built out the sidebar properly: focused purely on product functionality (analytics, reports, settings, upgrade). Removed any "website-style" content — keeping it lean and task-focused
> • Added a top-right shortcut to analytics for quicker access to impact metrics
> • Introduced a mini icon sidebar (collapsed navigation): always accessible shortcuts without opening the full sidebar. Designed to be low-visual-weight and non-intrusive
> • Added a very subtle depth/curvature effect near the mini sidebar to give a slight sense of layering (barely noticeable but improves overall feel)
> • Tweaked spacing and typography for better balance and readability across the page
> • Also changed font of greeting to Lora
> • I still want to do the ink reveal / typewriter. As user logs in it reveals/types 'Good morning, XYZ' smoothly

**Decisions already made** (from Stuart 2026-05-03 — do not relitigate):

| Question | Decision |
|---|---|
| Card hover ✕ / ✓ buttons — what do they do? | Skip in this pass. Linear ticket to Geoff for clarification. |
| Pill 24px radius breaking 10px cap | Add `--radius-pill: 24px` as a single named exception in `globals.css`. Use `rounded-pill`. |
| Sidebar nav items beyond what we have (Analytics, Reports, Help, Settings) | Stub the routes. Each is a "coming soon" page. Linear ticket per missing surface. |
| Recent marking submenu (dynamic per-paper list in slide-over) | Stub — no submenu in this pass. Linear ticket for dynamic version. |
| User profile in sidebar footer (name + role) | Static "Teacher" role. Email-derived name. Linear ticket: collect role during onboarding. |
| Greeting typewriter animation | Build now. CSS / requestAnimationFrame, no library. |
| `/teacher/talk` route | Keep as fallback for deep-links. Chat component is shared between dialog + standalone page. |

---

## What's already in place

Don't rebuild any of this:

- **Tokens.** All DeepMark colours, shadows, radii, fonts in `apps/web/src/app/globals.css`. Spec → shadcn translation is documented in CLAUDE.md.
- **Greeting component.** `apps/web/src/components/ui/greeting.tsx` — currently uses `font-editorial` (Playfair). This plan swaps Playfair → Lora at the token layer; the component stays.
- **Talk to DeepMark chat UI.** `apps/web/src/app/teacher/talk/page.tsx` — full `useChat` wired to `/api/talk` (Anthropic Claude). Stream, stop, error handling, suggestion buttons. Just needs extracting into a reusable component so it can mount in either a Dialog or the standalone page.
- **Dashboard page.** `apps/web/src/app/teacher/page.tsx` — server component fetching `getDashboardData`, renders `<Greeting>` + `<DashboardActions>` + paper grid. Most of this stays, just rearranged.
- **Dashboard query.** `apps/web/src/lib/dashboard/queries.ts` — counts + recent papers. No change needed.
- **Sidebar.** `apps/web/src/components/ui/sidebar.tsx` (shadcn, re-skinned with `shadow-sidebar`). This plan replaces its usage in `apps/web/src/app/teacher/layout.tsx` with a custom IconRail + Sheet pattern. The shadcn `Sidebar` component itself stays in the codebase (other consumers may want it later) but `TeacherLayout` no longer uses it.
- **Sidebar nav.** `apps/web/src/components/teacher-sidebar-nav.tsx` — about to be deleted/replaced.
- **lint:tokens guard.** Will catch any new hex literals. Run after each phase.

---

## Phase 1 — Foundation token additions (≈30 min)

### 1.1. Add `--radius-pill` for the Ask anything input

**File.** `apps/web/src/app/globals.css`

In the `@theme inline` block, alongside the existing radius tokens:

```css
/* Pill radius — intentional break from the 10px cap, used ONLY for the
   "Ask anything" dashboard input per Geoff's v2 design ("slightly breaking
   the angular design system"). Do not introduce other usages without a
   spec change. */
--radius-pill: 24px;
```

This generates `rounded-pill` as a Tailwind utility.

### 1.2. Swap Playfair → Lora for the greeting

Two things to change:

**File.** `apps/web/src/app/layout.tsx` — replace the `Playfair_Display` import and font setup:

```ts
import { Lora } from "next/font/google"

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
})
```

Drop the `playfair` const, drop `${playfair.variable}` from the `<html>` className, add `${lora.variable}`.

**File.** `apps/web/src/app/globals.css` — change the `--font-editorial` definition:

```css
--font-editorial: var(--font-lora), Georgia, serif;
```

The `<Greeting>` component at `apps/web/src/components/ui/greeting.tsx` already uses `font-editorial` — no change needed there. This swap is invisible to consumers.

**Update the CLAUDE.md design system note.** Find the line that says "Playfair for the dashboard greeting only" and change to "Lora for the dashboard greeting only".

### 1.3. Verify

`bun lint:tokens` → green. Eyeball the dashboard greeting — should now render in Lora.

---

## Phase 2 — Sidebar restructure (≈1 day)

The biggest piece. Replace `<Sidebar>` usage in `TeacherLayout` with a two-layer pattern:

1. **`<IconRail>`** — persistent 80px-wide left column (always visible).
2. **`<TeacherNavSheet>`** — slide-over menu (340px wide, opens on hamburger click) using shadcn `<Sheet>`.

### 2.1. Build `<IconRail>`

**New file.** `apps/web/src/components/teacher/icon-rail.tsx`

Spec from `Dashboard.html`:

- Width: 80px, full height
- `padding: 20px 0`
- `border-right: 1px dotted rgba(0, 0, 0, 0.1)` — for this we want a dotted border using a token: use `border-r border-dotted border-border-quiet` (already a utility from Phase 6 of the design system work)
- Buttons: 40px square, transparent bg, `rounded-md`, 18px icon at 1.2px stroke, color `text-ink-tertiary`
- Hover: `bg-primary/15` (teal tint), `text-primary` (full teal)
- Account badge at bottom: 40px circle, `bg-primary` initially BUT in Geoff's design it's a desaturated grey — use `bg-ink-secondary text-paper-white` for the muted look. Hover: scale 1.05, `bg-primary` full. **Anchored at bottom** with `mt-auto`.

Icons (top to bottom):

1. Hamburger (toggles `<TeacherNavSheet>`) — Lucide `Menu`
2. Dashboard — Lucide `LayoutDashboard`
3. Schedule / Recent — Lucide `Clock`
4. Clipboard — Lucide `ClipboardList`
5. Analytics — Lucide `BarChart3`
6. Documents — Lucide `FileText`
7. Account badge (initials) — bottom-anchored

Each icon (except hamburger and account badge) is a `<Link>` to its route. The hamburger is a `<button>` that opens the Sheet.

**Routes the icons link to** (most are stubs at this point — see Phase 5):

| Icon | Route | Status |
|---|---|---|
| Dashboard | `/teacher` | exists |
| Recent | `/teacher/mark` | exists (Marking History) |
| Clipboard | `/teacher/exam-papers` | exists (Exam Papers) |
| Analytics | `/teacher/analytics` | stub |
| Documents | `/teacher/reports` | stub |

The active state (current route): apply `bg-primary/15 text-primary` to the matching icon. Use `usePathname()` from `next/navigation` to determine.

### 2.2. Build `<TeacherNavSheet>`

**New file.** `apps/web/src/components/teacher/teacher-nav-sheet.tsx`

Wrap shadcn `<Sheet>` with custom content. The Sheet already uses `shadow-sidebar` from Phase 2. Override:

- Width: 340px (use `className="w-[340px]"` on `SheetContent`, drop the `sm:max-w-sm` constraint)
- Background: needs the dot grid. Either use a wrapper div with `.bg-page-grid` class OR add `bg-background` to SheetContent (shadcn default is `bg-muted` after our re-skin — we want the page bg with grid here, per Geoff's design where the menu reads as continuation of the page).
- Border-radius: `0 5px 5px 0` (right side only) — use `rounded-r-md`

**Page-blur effect** when open. Geoff's design applies `filter: blur(3px)` to the rest of the page when the sheet is open. shadcn's Sheet uses an overlay div with `backdrop-blur-xs` — that's NOT the same effect. We want the *content under* the overlay to blur, not the overlay itself.

Implementation: when the Sheet is open, toggle a class on `<body>` (`teacher-nav-open`). In `globals.css`:

```css
body.teacher-nav-open [data-slot="sidebar-inset"],
body.teacher-nav-open .icon-rail {
  filter: blur(3px);
  transition: filter 0.3s ease;
}
```

The icon rail has `class="icon-rail"`; the main content area is in `[data-slot="sidebar-inset"]`. If we no longer use shadcn `Sidebar` (and we won't — see 2.4), use a plain `<main>` with a `data-teacher-content` attribute and target that.

Toggle the body class via a controlled `<Sheet open={open} onOpenChange={...}>` and a `useEffect`:

```tsx
useEffect(() => {
  document.body.classList.toggle("teacher-nav-open", open)
  return () => document.body.classList.remove("teacher-nav-open")
}, [open])
```

**Menu structure** (from `Dashboard.html` lines 730-867):

```
[Header bar]
DeepMark                                      [✕ close]

[Top section, no label]
▢ Dashboard          (active state on /teacher)
🕐 Recent marking
   └── (submenu — stub for now, no items)
▦ All papers

[Label: INSIGHT]
📊 Analytics
▣ Reports

[Label: TOOLS]
? Help

[Footer block, separated]
[Upgrade to Pro tinted card]
⚙ Settings
[user-avatar] Geoffrey Waugh
              Head of Business
```

For the submenu under "Recent marking" — render a static "Coming soon" line for now, not a chevron toggle. Real dynamic submenu is in a Linear ticket.

For the `INSIGHT` and `TOOLS` labels — use `font-mono text-[9px] uppercase tracking-[0.1em] text-ink-tertiary px-4 pt-3 pb-2`.

For the user profile in the footer:

- Avatar: 36×36 square `rounded-sm`, `bg-primary text-paper-white`, initials from email username.
- Name: 13px medium, `text-foreground`. Derived from `User.name` (fallback: capitalised email username).
- Role: 11px, `text-muted-foreground`. Static `"Teacher"` for now.

The user data needs to be fetched. Since this is a layout-level component and runs on every teacher page, fetching in the layout keeps it cheap. Pass user info as props from `TeacherLayout`:

```tsx
// TeacherLayout
const session = await auth()
if (!session) redirect("/login")
const user = await db.user.findUnique({
  where: { id: session.userId },
  select: { name: true, email: true },
})

// Pass `user` down to <TeacherNavSheet user={user} />
```

### 2.3. Replace `<TeacherSidebarNav>` references

**Delete.** `apps/web/src/components/teacher-sidebar-nav.tsx` — replaced by `IconRail` + `TeacherNavSheet`.

### 2.4. Rewrite `TeacherLayout`

**File.** `apps/web/src/app/teacher/layout.tsx`

Currently uses shadcn `<SidebarProvider>` + `<Sidebar>` + `<SidebarInset>`. Replace with the two-layer pattern:

```tsx
return (
  <div className="grid h-screen grid-cols-[80px_1fr] grid-rows-[auto_1fr_auto] overflow-hidden bg-background">
    <aside className="row-span-3 col-start-1 icon-rail">
      <IconRail user={user} />
    </aside>

    <header className="col-start-2 row-start-1">
      <AppNavbar />
      <TrialBanner />
    </header>

    <main
      data-teacher-content
      className="col-start-2 row-start-2 overflow-auto px-6 pb-6"
    >
      {children}
    </main>

    <TeacherNavSheet user={user} />  {/* portals — can live anywhere */}
    <PushRegistration />
  </div>
)
```

The Sheet's `open` state can either live in `TeacherNavSheet` itself (with the hamburger button living in `IconRail` calling a context) or be lifted to `TeacherLayout`. Cleanest: small client component `<TeacherNavProvider>` that wraps both with React Context. The hamburger calls `setOpen(true)` from context; the Sheet reads `open` from context.

**Sketch:**

```tsx
// teacher-nav-context.tsx
"use client"
const TeacherNavCtx = createContext<{
  open: boolean
  setOpen: (open: boolean) => void
}>({ open: false, setOpen: () => {} })

export function TeacherNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    document.body.classList.toggle("teacher-nav-open", open)
    return () => document.body.classList.remove("teacher-nav-open")
  }, [open])
  return (
    <TeacherNavCtx.Provider value={{ open, setOpen }}>
      {children}
    </TeacherNavCtx.Provider>
  )
}
export const useTeacherNav = () => useContext(TeacherNavCtx)
```

Wrap the layout's children in this provider. `IconRail`'s hamburger button calls `useTeacherNav().setOpen(true)`. `TeacherNavSheet` uses `open` + `onOpenChange` from the same context.

### 2.5. Verify

- `bunx tsc --noEmit` from `apps/web/` → exit 0
- `bun lint:tokens` → green
- Eyeball: icon rail visible on every `/teacher/*` route. Hamburger opens slide-over with the right structure. Page content blurs when open. Active route highlights in the rail.

---

## Phase 3 — Stub routes for missing surfaces (≈30 min)

Per Stuart: stub routes so the IA structure ships now; real implementations in Linear tickets.

**Files to create** (each ~15 lines):

| Route | File |
|---|---|
| `/teacher/analytics` | `apps/web/src/app/teacher/analytics/page.tsx` |
| `/teacher/reports` | `apps/web/src/app/teacher/reports/page.tsx` |
| `/teacher/help` | `apps/web/src/app/teacher/help/page.tsx` |
| `/teacher/settings` | `apps/web/src/app/teacher/settings/page.tsx` |

**Stub template:**

```tsx
import { Sparkles } from "lucide-react"

export default function AnalyticsPage() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-3 px-2 py-24 text-center">
      <Sparkles className="size-8 text-primary" />
      <h1 className="font-editorial text-[clamp(28px,4vw,40px)] leading-[1.1] tracking-[-0.01em] text-foreground">
        Analytics is coming.
      </h1>
      <p className="max-w-[480px] text-[13px] text-muted-foreground">
        Trends across papers, students, AOs, and time. Wire-up in progress.
      </p>
    </div>
  )
}
```

Each stub gets its own copy + matching Sparkles. No data fetching, no auth check (the layout handles it).

---

## Phase 4 — Dashboard updates (≈half day)

Replace `apps/web/src/app/teacher/page.tsx` with the v2 layout. The data query stays — only the rendering changes.

### 4.1. Hero row tweaks

Stats lines lose the "big number" prefix — they're now plain mono lines. Replace `<DashboardStatLine>` with simpler markup inline:

```tsx
<div className="flex flex-col gap-0.5">
  <div className="font-mono text-[10px] tracking-[0.08em] text-foreground">
    {counts.review} script{counts.review === 1 ? "" : "s"} pending review <span className="text-ink-tertiary">·</span>
  </div>
  <div className="font-mono text-[10px] tracking-[0.08em] text-foreground">
    {counts.marking} marking <span className="text-ink-tertiary">·</span>
  </div>
  <div className="font-mono text-[10px] tracking-[0.08em] text-foreground">
    {counts.done} scripts marked <span className="text-ink-tertiary">·</span>
  </div>
</div>
```

(Note: the stats lines no longer use uppercase per the new spec.)

### 4.2. Action stack: Analytics replaces Talk to DeepMark

**File.** `apps/web/src/app/teacher/dashboard-actions.tsx`

Remove the "Talk to DeepMark" button. Add "Analytics":

```tsx
<Button
  variant="secondary"
  className="w-full justify-start"
  render={<Link href="/teacher/analytics" />}
>
  <BarChart3 className="size-3.5" />
  Analytics
</Button>
```

Also note: in the v2 design, all three buttons use `justify-content: flex-start` (icon + label left-aligned, not centered). Add `justify-start` to all three `<Button>` calls.

### 4.3. Build `<AskAnythingPill>`

**New file.** `apps/web/src/app/teacher/ask-anything-pill.tsx`

Centered below the hero row. 600px wide max, 42px tall, pill-shaped.

```tsx
"use client"

import { Mic, Plus } from "lucide-react"
import { useState } from "react"

import { TalkToDeepMarkDialog } from "./talk-to-deepmark-dialog"

export function AskAnythingPill() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[42px] w-full max-w-[600px] items-center gap-3 rounded-pill border border-border bg-card/95 px-4 shadow-tile cursor-text text-left hover:bg-card transition-colors"
      >
        <Plus className="size-3.5 text-ink-tertiary shrink-0" />
        <span className="flex-1 text-[13px] text-ink-tertiary">Ask anything</span>
        <Mic className="size-3.5 text-ink-tertiary shrink-0" />
      </button>

      <TalkToDeepMarkDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
```

This goes between the hero row and the Recent marking section in the dashboard page.

### 4.4. Card state updates

**File.** `apps/web/src/app/teacher/dashboard-paper-card.tsx`

Per Geoff: active tiles have shadow, inactive (Done) are flat.

Update the status mapping so `done` cards drop their shadow:

```tsx
const STATUS_SHADOW: Record<DashboardPaper["status"], string> = {
  marking: "shadow-tile",
  review: "shadow-tile",
  done: "shadow-none",
}

// in className:
cn(
  "...",
  "min-h-[96px] border-[1.5px]",
  STATUS_BORDER[paper.status],
  STATUS_SHADOW[paper.status],
)
```

The Done badge also changes — was filled grey, now transparent with border:

```tsx
// in badge.tsx, status-done variant:
"status-done":
  "font-mono uppercase tracking-[0.06em] text-[9px] bg-transparent text-ink-secondary border-black/15",
```

(The earlier Phase 2 implementation used `bg-black/5 text-black/40 border-black/10` — closer to the v1 spec. The v2 design wants transparent + border. Update.)

### 4.5. Section header rename

"Recent Papers" → "Recent marking". One-line change in `page.tsx`. Also lowercase "view all" → uppercase "VIEW ALL" per the v2 design.

### 4.6. Card hover actions — skip

✕ and ✓ buttons in the top-right of each card on hover. **Skip in this pass** — Linear ticket to Geoff for clarification on what they do.

### 4.7. Verify

Eyeball pass. Compare side-by-side with `Dashboard.html`. The shape should match — slight visual tweaks are expected (we're using Geist not DM Sans, CSS gradient not PNG).

---

## Phase 5 — Talk to DeepMark in Dialog (≈half day)

### 5.1. Extract chat into a shared component

**New file.** `apps/web/src/components/talk/talk-to-deepmark-chat.tsx`

Move the entire body of `apps/web/src/app/teacher/talk/page.tsx` (the `useChat` setup, message rendering, form, suggestions) into this component. It accepts an optional `onClose?: () => void` prop so the dialog version can close on escape. Layout-neutral — no `mx-auto max-w-[720px]` wrapper inside the component; let the parent set bounds.

The component returns the full chat surface. Both consumers (page + dialog) wrap it with their own layout.

### 5.2. Wrap as a dialog

**New file.** `apps/web/src/app/teacher/talk-to-deepmark-dialog.tsx`

```tsx
"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TalkToDeepMarkChat } from "@/components/talk/talk-to-deepmark-chat"

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

export function TalkToDeepMarkDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!max-w-[720px] sm:!max-w-[720px] h-[80vh] grid-rows-[auto_1fr] gap-0 p-0"
        showCloseButton={true}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Talk to DeepMark</DialogTitle>
          <DialogDescription>
            Ask anything about marking, the GCSE syllabus, AOs, or your students' work.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col overflow-hidden">
          <TalkToDeepMarkChat />
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

The dialog uses our existing `<Dialog>` with `shadow-float` + 10px radius from Phase 2. Override the default `max-w-sm` width to give the chat enough room. Set fixed height via `h-[80vh]` so the message list can scroll inside the fixed shell.

### 5.3. Refactor `/teacher/talk/page.tsx`

Slim the page down to:

```tsx
import { TalkToDeepMarkChat } from "@/components/talk/talk-to-deepmark-chat"

export default function TalkToDeepMarkPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-[720px] flex-col px-2 py-6">
      <TalkToDeepMarkChat />
    </div>
  )
}
```

### 5.4. Verify

- `bunx tsc --noEmit` from `apps/web/` → exit 0
- Click "Ask anything" pill on dashboard → dialog opens with chat. Send a message → streams back. Esc closes. Click outside closes.
- Navigate directly to `/teacher/talk` → standalone page loads with same chat.

---

## Phase 6 — Greeting typewriter animation (≈30 min)

Per Geoff: "ink reveal / typewriter. As user logs in it reveals/types 'Good morning, XYZ' smoothly".

**File.** `apps/web/src/components/ui/greeting.tsx`

Update the existing `<Greeting>` to type the greeting one character at a time on first mount. After mount, just render the static greeting. Use `useEffect` + `setInterval` (or `setTimeout` recursion). Keep it lightweight — no animation library.

```tsx
"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type GreetingProps = { name: string; className?: string }

function timeOfDay(hour: number): "morning" | "afternoon" | "evening" {
  if (hour < 12) return "morning"
  if (hour < 18) return "afternoon"
  return "evening"
}

const TYPE_INTERVAL_MS = 32  // ~30 chars/sec
const TYPE_INITIAL_DELAY_MS = 100

export function Greeting({ name, className }: GreetingProps) {
  const [phase, setPhase] = useState<"morning" | "afternoon" | "evening" | null>(null)
  const [typedLength, setTypedLength] = useState(0)

  useEffect(() => {
    setPhase(timeOfDay(new Date().getHours()))
  }, [])

  const fullText = phase ? `Good ${phase}, ${name}.` : `Hello, ${name}.`

  useEffect(() => {
    if (!phase) return
    setTypedLength(0)
    const start = setTimeout(() => {
      const interval = setInterval(() => {
        setTypedLength((n) => {
          if (n >= fullText.length) {
            clearInterval(interval)
            return n
          }
          return n + 1
        })
      }, TYPE_INTERVAL_MS)
      return () => clearInterval(interval)
    }, TYPE_INITIAL_DELAY_MS)
    return () => clearTimeout(start)
  }, [phase, fullText.length])

  // Render the typed prefix + an invisible spacer for the rest, so the
  // layout doesn't shift as text appears.
  const visible = fullText.slice(0, typedLength)
  const hidden = fullText.slice(typedLength)

  return (
    <h1
      className={cn(
        "font-editorial text-[clamp(36px,5vw,52px)] leading-[1.1] font-normal tracking-[-0.01em] text-foreground",
        className,
      )}
      aria-label={fullText}
    >
      <span aria-hidden>{visible}</span>
      <span aria-hidden className="opacity-0">{hidden}</span>
    </h1>
  )
}
```

Notes:
- Reserve space with the invisible suffix so the page doesn't reflow as letters appear.
- `aria-label` exposes the full text immediately to screen readers — they don't get the typewriter, just the answer.
- Plays once per mount (i.e. once per page load on `/teacher`). Doesn't re-play on re-renders.
- Honours `prefers-reduced-motion`? Worth adding: detect the media query and skip the animation if true. One-liner with `window.matchMedia`. Add this — accessibility is cheap here.

```tsx
useEffect(() => {
  if (!phase) return
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  if (reduceMotion) {
    setTypedLength(fullText.length)
    return
  }
  // ... existing typewriter logic
}, [phase, fullText.length])
```

### 6.1. Verify

Reload `/teacher`. Greeting should fade in / type out. Layout should not shift. Honour reduced motion (toggle in macOS Settings → Accessibility → Display → Reduce motion).

---

## Phase 7 — Verify everything (≈15 min)

```bash
cd apps/web && bunx tsc --noEmit  # exit 0 expected
bun lint:tokens                    # green
bun lint:authz                     # pre-existing trial-banner.tsx violation is OK to leave
```

Manual walk:

- Login flow lands on `/teacher` ✓
- Icon rail visible on every `/teacher/*` route ✓
- Hamburger opens slide-over menu, page blurs ✓
- Click outside closes ✓
- Active route highlights in rail ✓
- Dashboard greeting types out in Lora ✓
- Stats lines show real counts ✓
- Action stack: Mark new paper / Resume marking / Analytics ✓
- "Ask anything" pill opens chat dialog ✓
- Stub routes load ✓

---

## Linear tickets to create

All in the **UI** project (`c2b01f45-4a6d-4ad0-b26a-c4730296f8c4`), DeepMark team.

### Discuss with Geoff (label `Discuss with Geoff`)

**Title:** `Dashboard v2: card hover actions (✕ and ✓) — what do they do?`

**Body:**
```
## Question
The v2 dashboard design shows two buttons appearing top-right on each paper card on hover: ✕ and ✓.

Source: geoff_ui_claude_design/v2/DeepMark v1 Landing page + sidebar/Dashboard.html — `.card-actions` in `.paper-card`.

We shipped the dashboard without them in [PR link]. Need to know what they do before wiring up:

- ✕: hide card from dashboard? mark hidden per-user? delete the underlying paper?
- ✓: mark paper as Done? complete review? something else?

## What I need
A one-line description of the intent for each, plus what state should be persisted.

## Out of scope
The rest of the v2 dashboard already shipped (sidebar restructure, Lora greeting, Ask anything pill, card flat-on-done).
```

### New work (no special label)

**Title:** `Sidebar: dynamic "Recent marking" submenu in slide-over`

**Body:**
```
## Context
The v2 sidebar slide-over menu has a "Recent marking" item that should expand to show the user's most recent papers (e.g. "Economics — Paper 2 / 34 scripts"). We shipped a stubbed version with no submenu in [PR link].

## What needs building
1. Query the user's top 3-5 papers with most recent activity (similar to `getDashboardData` recent papers, but slimmer — just title + script count + status icon).
2. Render as a nested submenu under "Recent marking" in `apps/web/src/components/teacher/teacher-nav-sheet.tsx`.
3. Each entry navigates to the paper detail page on click.

## Reference
geoff_ui_claude_design/v2/DeepMark v1 Landing page + sidebar/Dashboard.html — `.sidebar-submenu`
```

**Title:** `Settings: collect "role" / job title during onboarding`

**Body:**
```
## Context
The v2 sidebar footer shows a user profile block with name + role (e.g. "Head of Business"). Today we use a static "Teacher" string because the User table has no role/title field. We shipped this fallback in [PR link].

## What needs building
1. Add a `title` (or `job_title`) string column to the User model.
2. Surface a field on the Settings page (or onboarding flow) for users to set it.
3. Replace the static "Teacher" in `teacher-nav-sheet.tsx` with the real value when present (fall back to "Teacher" when null).

## Out of scope
The full Settings page (separate ticket — currently a stub at /teacher/settings).
```

**Title:** `Stub: build out /teacher/analytics`

**Body:**
```
## Context
Stubbed to support the v2 sidebar nav structure. Currently shows a "coming soon" page at apps/web/src/app/teacher/analytics/page.tsx.

## What's expected
Per Geoff: "Analytics" surface for impact metrics — trends across papers, students, AOs, time periods. Specific charts TBD.
```

(Same template for `/teacher/reports`, `/teacher/help`, `/teacher/settings` — four tickets total. Title each "Stub: build out /teacher/<route>".)

**Title:** `Greeting: optional dashboard typewriter — toggle off in Settings`

**Body:** *(only if Geoff or Stuart asks for opt-out — flag for now, low priority)*

---

## Out of scope (don't include in this build)

- Card hover actions (✕ / ✓) — Linear ticket to Geoff
- Dynamic "Recent marking" submenu — Linear ticket
- Real Analytics / Reports / Help / Settings pages — separate tickets
- "Top-right shortcut to Analytics" mentioned in Geoff's notes — already covered by the Analytics button in the action stack (replaces "Talk to DeepMark"). Confirm visually after build.
- Custom DeepMark icon set (Phase 3 of the design system, parked behind DEE-43..46) — keep using Lucide for now.
- The "subtle depth/curvature effect near the mini sidebar" Geoff mentioned — figure out at build time. Probably a thin gradient or hairline shadow on the right edge of the rail; eyeball against the screenshot.

---

## File inventory (delta)

**Add:**
- `apps/web/src/components/teacher/icon-rail.tsx`
- `apps/web/src/components/teacher/teacher-nav-sheet.tsx`
- `apps/web/src/components/teacher/teacher-nav-context.tsx`
- `apps/web/src/components/talk/talk-to-deepmark-chat.tsx`
- `apps/web/src/app/teacher/talk-to-deepmark-dialog.tsx`
- `apps/web/src/app/teacher/ask-anything-pill.tsx`
- `apps/web/src/app/teacher/analytics/page.tsx` (stub)
- `apps/web/src/app/teacher/reports/page.tsx` (stub)
- `apps/web/src/app/teacher/help/page.tsx` (stub)
- `apps/web/src/app/teacher/settings/page.tsx` (stub)

**Modify:**
- `apps/web/src/app/globals.css` — `--radius-pill`, `--font-editorial` (Lora), body-blur rule
- `apps/web/src/app/layout.tsx` — Lora font import
- `apps/web/src/app/teacher/layout.tsx` — replace shadcn Sidebar with IconRail + Sheet
- `apps/web/src/app/teacher/page.tsx` — v2 layout (stats inline, new section names, AskAnythingPill)
- `apps/web/src/app/teacher/dashboard-actions.tsx` — Analytics replaces Talk to DeepMark, justify-start
- `apps/web/src/app/teacher/dashboard-paper-card.tsx` — Done = flat (no shadow)
- `apps/web/src/app/teacher/talk/page.tsx` — slim down to render `<TalkToDeepMarkChat>`
- `apps/web/src/components/ui/greeting.tsx` — typewriter animation
- `apps/web/src/components/ui/badge.tsx` — `status-done` variant: transparent + border
- `CLAUDE.md` — update font note (Playfair → Lora)

**Delete:**
- `apps/web/src/components/teacher-sidebar-nav.tsx`

**Total scope:** ~20 file touches, ~600-800 LoC net add. Roughly 2 dev-days end to end including verification and the four Linear tickets.
