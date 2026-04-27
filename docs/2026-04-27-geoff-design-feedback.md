# DeepMark prototype feedback — 27 Apr 2026

Geoff — spent a couple of hours with the prototypes in `geoff_ui_claude_design/`. Broadly really like the direction; a handful of things below to push on, plus a component-uniformity audit at the end which I think is *good news* — the system is tighter than the file count suggests.

---

## Per-prototype reactions

**`deepmark_dashboard_textured.html` — 👍 the canonical dashboard**
Genuinely love this. Crisp, clear, the texture earns its keep at full bleed. Default the sidebar to *collapsed* — when it's open by default it eats space the recent-papers grid wants.

**`DeepMark Prototype.html` — 👎 too centered**
The 900px box adrift in the middle reads as "demo screenshot," not "tool I work in all day." Teachers will be on 1440–1920px screens, often with two windows side-by-side. Negative space is fine; *bunched-to-the-middle* negative space is precious.

**`deepmark_dashboard_v3.html` — 👎 the marker animation is aesthetically nice but factually wrong**
This pretends marking is one paper at a time being chewed through with an ETA. In reality our pipeline is parallel: OCR fan-out → token reconciliation → grading per-question via SQS → annotation. Scripts and questions complete out of order. ETAs would be unreliable *and* the whole job is fast enough that teachers don't care. Two principles:
- Show **state**, not narrative. "Extracting 8/24 · Grading 3/24 · Done 13/24" beats "Estimated 2:14 remaining."
- Per-script linear bar is fine, but only if it's bound to a real monotonic phase counter — never interpolated time.
- The loader visual itself is great. Keep it. Use it as a "something's happening" indicator, not a progress oracle.

**`deepmark_confirmed_v2.html` — 👍 script content, dialog is fine**
Dialog-as-a-destination works in our codebase: the live `MarkingJobDialog` already does this with a `?job=...` nuqs param, so it's linkable, survives refresh, and you don't lose the parent page's state. The substantive issues with this prototype are *content*, not surface:
- It's tight — Rhys Taylor's content felt cramped. Worth widening the answer column.
- AO tags are 2–3 words each but don't connect spatially to the text they relate to. We already have word-level bounding boxes — clicking an AO tag should highlight the matching span; hover should tether. 
- there isnt much space for "productivity" - and we want editing to feel familiar as possible to a skill they already have: using google docs/word. allows us to have a small bit of "complexity" (its not, they know this stuff) as long as it is familiar
- No space for the teacher to add their own marks. We already ship score overrides server-side; the UI has to surface "amend this," "add note," "override score" inline.

**`deepmark_mark_new_paper_flow.html` — 👍 perfect as a dialog**
Short, scoped, two steps, reversible by closing. This is exactly what dialogs are for. (Heads-up: the grade-boundaries function doesn't currently work in the prototype.)

**`deepmark_script_review_v5.html` — 👍 nice and compact**
Like this one a lot. Worth testing on small screens — that's where the compactness will pay off or fall apart.

**Note on multiple dashboards**
There are at least four dashboard variants in the folder. Worth converging on one as canonical before we start porting — "the other three are dead." My vote is `deepmark_dashboard_textured.html`.

---

## Two principles I want us to agree on

### 1. Page vs Dialog vs Sheet — a heuristic

| Surface | Use when |
|---|---|
| **Page (URL route)** | The surface has its own information architecture below it (sub-routes, nested state, child pages). Dashboard, exam paper detail. |
| **URL-state dialog** | A focused destination tied to a single resource, but the parent context shouldn't unmount. Linkability comes from a nuqs query param (`?job=…`), so the dialog is shareable and survives refresh. The marking-job dialog is the canonical example. |
| **Plain dialog** | Short, scoped, single decision, ≤2 steps, fully reversible by closing. No need to be linkable. "Mark new paper" upload, link mark scheme, edit grade boundaries, delete confirms. |
| **Sheet / Drawer** | Deep context where the user must keep their place but the content is secondary. AO breakdown without leaving the answer; quick previews from a list. |

The thing that distinguishes a "page" from a "URL-state dialog" isn't linkability — both are linkable. It's whether the surface has child IA below it. If you'd want sub-routes inside it (`/x/y/z`), it's a page. If it's terminal — the deepest layer the user navigates to — a URL-state dialog often serves better, because the parent stays mounted (no remounting the dashboard or paper grid every time you close a script).

### 2. Async UX should reflect what the pipeline actually does

Marking is a parallel pipeline, not a sequential agent. Polling will feel sluggish — round-trips are visible to the user. Good news: we already have the infra. The Yjs / Hocuspocus collab work that just shipped gives us a per-submission live channel. Marking processors can write incremental status into the script's Yjs doc; clients are already subscribed and re-render live. No polling, no SSE plumbing, free reconnection. Designs should assume *live state*, not *staged loading*.

---

## Talk to DeepMark — this is bigger than its framing

In `DeepMark Prototype.html` it's a button on the dashboard. I think this could be a *second primary surface* for the whole app, not a sidebar widget!

- Omnipresent (accessible via floating button and ⌘K shortcut - sorry, not sorry)
- **Context-aware** — receives current screen state (`paper_id`, `job_id`, `question_id`, selected script) so the user doesn't re-explain
- Calls server actions as tools — same actions the UI uses (`getMarkingStats`, `applyOverride`, `kickOffMarkingJob`); no parallel API
- Replaces FAQ — must be grounded in product knowledge. Hallucinated help is worse than no help for a marking tool

Worth giving this its own design pass rather than treating it as a button on the dashboard.

---

## Brand colour — drop the purple

The `#6B4FA0` purple reads as "AI default" — it's the meme colour every AI startup ships in 2026 and undercuts our positioning as a *serious tool for teachers*, not a generic chatbot. The rest of the system (paper texture, Playfair, hard offset shadows, DM Mono) does the work of carrying identity already.

**Direction: ink black + a single warm accent.** The brand becomes *typography* and the accent is *punctuation*. Concretely:

- **Ink** — `#1A1A1A`. Not pure `#000`; slightly warm, matches the body-text colour the prototypes already use. Pure black on the paper texture looks printed-on; ink-black breathes.
- **Accent** — **oxblood `#6E1F2A`** (a desaturated fountain-pen-ink red). Same "examiner desk / leather-bound booklet" semantic as a brighter red but dark enough that it doesn't collide with the destructive-error red used in marking UI, and isn't read as another startup colour.

System implication: with brand-as-typography, the brand-tinted soft glow shadow goes away as a primary treatment. Buttons rely on the hard offset shadow alone. Oxblood appears as *punctuation only* — a single primary CTA, the link colour, a badge tint, a status accent — never as a filled chrome surface. Typography + texture do the identity work.

A separate, slightly cleaner red (e.g. `#C23B3B`) lives in the destructive token, used for marking-error states only. Brand red ≠ error red.

---

## Component uniformity audit — actually good news

Across all 10 prototype HTMLs there are 22 distinct button classes, but they cluster into 5 real variants. The naming is verbose; the *underlying system is tight*.

### Buttons: 22 classes → 5 variants

- **Primary (soft glow)** — `.btn-p`, `.btn-download`, `.btn-extract`, `.btn-dl`, `.btn-confirm`, `.btn-ra`
  Filled brand colour, no border, `box-shadow: 2px 2px 8px <brand,0.3>`. Default CTA.
- **Primary hero (hard shadow)** — `.btn-p.lg`, `.btn-begin-review`, `.btn-br`, `.btn-start`, `.btn-cm`
  Same as primary + `3px 3px 0 <brand-dark,0.35>` offset block. Hero / "this is the action" buttons.
- **Secondary outline** — `.btn-s`, `.btn-back-sm`, `.btn-close`, `.btn-done-sm`, `.btn-nav`
  Transparent, `1px solid rgba(0,0,0,0.1)`, neutral grey text.
- **Tile / quick-action** — `.qbtn`, `.qbtn.pr`
  White bg, `3px 3px 0 rgba(0,0,0,0.14)` *black* offset (not brand-coloured). The dashboard quick actions.
- **Neutral muted** — `.btn-review`, `.btn-rv`
  `#6B7280` grey filled. The only non-brand "primary."
- **Icon square** (sub-pattern) — `.x-btn`, `.tb-btn`, `.ftb-btn`, `.rl-view-btn`, `.sb-close`
  24–28px square, no fill, hover bg.
- **`.btn-confirmed` / `.btn-cfmd`** — *not actually a button*. Green tint pill, non-interactive. This is a `Badge`, not a `Button`. Worth renaming to avoid leaking the wrong abstraction into the implementation.

### Sizes: 7 heights → 3 sizes

Heights in the wild: `24, 28, 30, 32, 34, 36, 40px`. Real intent is three sizes:

- **sm** = 28–30px (icon buttons, secondary chrome)
- **md** = 32–34px (default)
- **lg** = 36–40px (hero CTAs, quick-action tiles)

### Tokens — what to extract

```
--radius-sm:  5px      // overwhelming default — inputs, buttons, chips
--radius-md:  8px      // upload zones, callouts
--radius-lg:  10px     // dialogs, big tiles, cards

--shadow-hard:        3px 3px 0 rgba(0,0,0,0.14), 2px 2px 5px rgba(0,0,0,0.12)
--shadow-hard-hover:  4px 4px 0 rgba(0,0,0,0.16), 3px 3px 7px rgba(0,0,0,0.14)
--shadow-float:       0 20px 60px rgba(0,0,0,0.2), 0 6px 20px rgba(0,0,0,0.12)
// no `--shadow-glow` — with ink-black brand, the soft brand-tinted glow
// disappears as a treatment. Hard offset alone carries primary buttons.

--border:         rgba(0,0,0,0.10)   // default
--border-subtle:  rgba(0,0,0,0.08)   // cards / tiles
--border-quiet:   rgba(0,0,0,0.07)   // section dividers, footers
```

### Typography — 4 fonts → 3

- **Inter** — body, buttons, UI (everywhere)
- **Playfair Display** — *only* the greeting (`Good morning, Sarah.`) at 28–32px. Editorial accent.
- **DM Mono** — numbers, eyebrows, page counts, monospace data
- **Montserrat** — only on the wordmark. Drop it, let the logo be a wordmark SVG, remove the font dep.

Font sizes cluster cleanly: `10, 11, 12, 13, 15, 28–32` — six steps. Weights: stick to `400 / 500 / 600 / 700`; drop the stray `300/800/900`.

### Verdict

The system is more uniform than the file-by-file view suggests — Geoff, you've been consistent in the design *language*, just verbose in the class *names*. Mapping cleanly to:

- shadcn `Button` with two new variants (`default-hard`, `tile`)
- `Card` with a hard-shadow option
- A token layer of ~10 CSS variables

…and the 22 bespoke button classes collapse on themselves once the variant + size system exists. That's a much cheaper port than it looks.

---

## What I'd love next

1. Converge the dashboard variants — which one is canonical? (My vote: `deepmark_dashboard_textured.html`.)
2. Re-skin one screen with the ink + oxblood palette so we can see it before committing the rest of the system.
3. A pass on the script reader where AO tags spatially link to the answer text and there's room for teacher overrides/notes.
4. A first stab at "Talk to DeepMark" as its own thing, not a dashboard button.

Anything in here feel off — push back. Most of this is opinion + IA pragmatism, not gospel.
