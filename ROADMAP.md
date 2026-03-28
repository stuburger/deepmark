# DeepMark Roadmap

> **North Star**: Scan → Upload → Auto mark → Teacher tweak → Print → Hand back. No friction. No confusion. No extra steps.
>
> **MVP definition**: A teacher can upload 30 papers, wait, skim/tweak, hit print and hand them back to students, and the script looks rigorously marked.

---

## Phase 1 — Core Product
> Build this before showing it to anyone. The product must do what it says.

### 🖊️ Argument Detection

- [ ] **[Argument Detection] Return annotations as structured JSON**
  Extend the `LlmMarker` / `Grader` grading prompt to return argument annotations alongside the mark: connectives (because, therefore, leads to, this means, as a result, ultimately, drawback, limitation, however, on the other hand), reasoning chains (contiguous spans forming a Point → Evidence → Explanation sequence), and evaluation signals (however, on the other hand, it depends, ultimately). Each annotation must reference the OCR transcript word index so it can be matched to a bounding box on the page image.

- [ ] **[Argument Detection] Show connectives, chains and evaluation language on the marked script**
  As a teacher reviewing a marked script, I can see connective words **boxed** directly on the student's handwriting, chains of reasoning **underlined**, and evaluation language **tagged** — so I can see at a glance how well the student is building and extending arguments, without reading every word myself.

### 🏷️ AO Tagging

- [ ] **[AO Tagging] Promote AO1/AO2/AO3 to first-class structured fields**
  Promote AO1 / AO2 / AO3 from free-text strings embedded in the LoR prompt to first-class structured fields on `GradingResult` — `{ ao1: "met" | "partial" | "not_met", ao2: ..., ao3: ... }` — so they can be rendered as visual tags, aggregated for the class CSV, and displayed on the annotated script without string parsing.

- [ ] **[AO Tagging] Show AO mini-tags on the marked script**
  As a teacher, I can see AO1 / AO2 / AO3 mini-tags embedded on the marked script next to the relevant passage — not buried in a text block at the bottom — so I understand which objectives each part of the answer is meeting.

### 📄 Annotated PDF Engine *(the core product)*

- [ ] **[Annotated PDF] Build the server-side PDF compositor**
  Build a server-side annotated PDF generator that takes the original scanned page images + the stored annotation data (ticks, crosses, underlines, margin comments, boxed connectives, AO tags, marks) and composites them into a print-ready PDF. Output must be legible in black and white on a poor-quality school printer. This replaces the current jsPDF text report.

- [ ] **[Annotated PDF] Download a marked script that looks like a real examiner marked it**
  As a teacher, when I click "Download marked script" I receive a PDF that looks like a thoroughly marked paper — my student's handwriting is visible, with tick/cross marks, underlines, boxed connectives, AO tags, and margin comments overlaid exactly where they belong on the page.

- [ ] **[Annotated PDF] Per-answer summary block in the PDF**
  As a teacher, at the end of each answer in the annotated PDF I can see a summary block showing: mark awarded, level, a one-sentence justification ("Clear application, some analysis → Level 2"), and an AO snapshot (AO1 ✓ / AO2 ✓✓ / AO3 ~) — so I can quickly confirm the mark is right before printing.

- [ ] **[Annotated PDF] Student summary page as the last page of the PDF**
  As a teacher, the last page of the annotated PDF is a summary page for that student: total mark, AO breakdown, 2–3 strengths, 2–3 targets, and "why this level / why not next level" — ready to hand back to the student as a feedback sheet.

### 📦 Bulk Upload

Two supported input modes — both must arrive in the same upload screen with no mode-switching:

**Mode 1: Multiple PDFs — one file per student script**

- [ ] **[Bulk Upload] Upload up to 30 individual PDFs in one action**
  As a teacher, I can drag and drop up to 30 PDFs (one per student) onto a single upload screen and have each file automatically assigned to its own marking job — with no per-script setup required. This is the typical output from a school scanner set to "one file per scan".

- [ ] **[Bulk Upload] Create N jobs from N files in a single server action**
  Accept N PDFs in one file picker action, create N `StudentPaperJob` rows in a single server action, upload pages to S3 in parallel, and enqueue OCR for all jobs simultaneously. Handle partial failures — if 2 of 30 fail to upload, the other 28 continue.

**Mode 2: Single PDF — all scripts combined into one file**

- [ ] **[Bulk Upload] Upload one combined PDF and split into individual student scripts**
  As a teacher, I can upload a single PDF that contains all 30 student scripts (e.g. straight from a document feeder that produces one file) and have the system automatically detect where each script starts and ends, splitting it into separate jobs for marking.

- [ ] **[Bulk Upload] Detect script boundaries within a combined PDF**
  Build a script-boundary detection step that runs before OCR on a multi-script PDF. Detection strategy to be confirmed — options include: blank page separator, fixed page count per script (teacher-specified), or LLM-assisted detection of question header patterns. Teacher must be able to review and correct the detected splits before marking begins.

**Shared**

- [ ] **[Bulk Upload] Live progress view for a batch**
  As a teacher who has uploaded a batch, I can see a live progress view — which scripts are queued, OCR-ing, marking, and done — so I know the system is working and approximately when I can come back to review.

- [ ] **[Bulk Upload] Retry a single failed script without restarting the batch**
  As a teacher, if one script in my batch fails I am told clearly which one failed and given a one-click option to re-upload just that script — without restarting the whole batch.

### ✏️ Teacher Mark Override

- [ ] **[Mark Override] Click any mark and change it inline**
  As a teacher reviewing a marked script, I can click any awarded mark and type a different number — totals, the summary block, and the summary page all update instantly — so overriding a mark feels like correcting a mistake on paper, not navigating a settings screen.

- [ ] **[Mark Override] Edit any annotation inline — no modals, no save button**
  As a teacher, I can click any margin comment, AO tag, or annotation on the marked script and edit it inline — click, type, done — with no modal, no save button, and no mode switch required.

### 📊 Class CSV Export

- [ ] **[CSV Export] Download class markbook-ready CSV after a batch**
  As a teacher, after a batch has been marked I can download a single CSV file containing: student name, total mark, AO1 / AO2 / AO3 scores, and mark-per-question — formatted so I can paste it directly into my school markbook without any reformatting.

---

## Phase 2 — Beta Ready
> Before inviting the first real teachers. Operational basics and legal.

### 🚨 Error Monitoring & Analytics

- [ ] **[PostHog] Integrate PostHog into the Next.js app**
  Install and configure PostHog for both error monitoring and user analytics. Wire up session recording, error capture, and pageview tracking. PostHog replaces Sentry for error monitoring and covers analytics in one integration.

- [ ] **[PostHog] Instrument key teacher actions as events**
  Track the events that matter: batch uploaded, OCR complete, marking complete, script downloaded, mark overridden, CSV exported. This gives visibility into where teachers drop off and whether the core flow is being completed.

- [ ] **[Monitoring] Surface queue failures in the teacher UI with a retry action**
  Ensure backend queue failures (OCR stuck, grading failed) surface to the teacher in the UI as a clear, actionable error with a retry button — not a silent spinner or a job that disappears.

### 📧 Transactional Email

- [ ] **[Email] Notify teacher when batch is ready to review**
  As a teacher, I receive an email when my batch has finished marking and is ready to review — so I can upload scripts, close the tab, and come back when it's done rather than sitting watching a progress bar.

- [ ] **[Email] Integrate Resend and wire to job completion events**
  Integrate Resend (transactional email) and trigger a "batch complete" email on `StudentPaperQueue` job completion. Include a direct deep-link to the batch review page in the email.

### 🧭 Onboarding

- [ ] **[Onboarding] Empty state — guided path for a first-time teacher**
  As a teacher logging in for the first time, I see a clear guided starting point — not a blank screen. The path from "I just signed in" to "I have uploaded my first batch" requires no more than 3 clicks and no guesswork.

### 💬 Feedback

- [ ] **[Feedback] Add persistent in-app feedback entry point**
  Add a persistent, low-friction feedback button to the teacher UI (embedded Tally form or similar). Responses must trigger a Slack notification or email — not land in a dashboard no one checks.

### ⚖️ Legal & Compliance *(non-negotiable for UK schools)*

- [ ] **[Legal] Publish Terms of Service**
  Publish Terms of Service at a public URL, linked in the footer and at signup.

- [ ] **[Legal] Publish Privacy Policy covering UK GDPR**
  Privacy Policy must cover: what data is collected, how it is used, data subject rights, and how to request deletion of student data.

- [ ] **[Legal] Produce a Data Processing Agreement (DPA) template**
  UK school data protection officers will ask for a signed DPA before approving the tool. Without one, schools cannot legally use the product — regardless of how good it is.

- [ ] **[Legal] Add ICO-compliant cookie consent banner**

- [ ] **[Legal] Define and document the student data retention policy**
  Decide: how long are scanned student scripts (handwritten work from minors) stored in S3, and what is the deletion process?

### 🌐 Domain

- [ ] **[Domain] Decide: `getdeepmark.com` or `deepmark.co.uk`?**
  `getdeepmark.com` is already live in AWS Route53. `deepmark.co.uk` would require a new hosted zone, CloudFront update, and SSL certificate. Decide before Phase 3.

- [ ] **[Domain] Configure `deepmark.co.uk`** *(if chosen)*
  Create Route53 hosted zone, update CloudFront distributions and SST config, provision SSL via ACM.

- [ ] **[Domain] Redirect `deepmark.co.uk` to `getdeepmark.com`** *(if keeping getdeepmark.com)*
  Purchase `deepmark.co.uk` and configure as a permanent 301 redirect.

---

## Phase 3 — Commercialisation
> When beta teachers have validated the product and want to continue using it.

### 🌍 Landing Page

- [ ] **[Landing Page] Build public homepage — value prop, CTA, no login required**
  As a teacher who has heard about DeepMark, I can visit the homepage and immediately understand what it does, who it's for, and what to do next — without logging in or reading a long explanation.

- [ ] **[Landing Page] Add social proof from beta teachers**
  Include 1–2 quotes or results from beta teachers. Even informal is fine — "saved me 4 hours on a Friday afternoon" is enough.

### 💳 Stripe

- [ ] **[Stripe] Teacher can subscribe with a card — monthly per seat**
  As a teacher who wants to continue after my trial, I can subscribe in under 2 minutes — monthly billing per teacher seat — without leaving the app or contacting anyone.

- [ ] **[Stripe] Integrate Stripe Checkout and subscription webhook**
  Install Stripe SDK, create a `subscription` field on the teacher account, build the checkout flow, and handle the webhook for `customer.subscription.created`, `updated`, `deleted`, and `payment_failed`.

- [ ] **[Stripe] Gate marking flow behind active subscription**
  Lock the marking flow (read-only access to past results only) if subscription lapses or trial expires.

### 💰 Pricing Page

- [ ] **[Pricing] Publish a simple, transparent pricing page**
  As a prospective teacher, I can see exactly what DeepMark costs before signing up — no "contact us", no hidden tiers. Simple enough to understand in 10 seconds.

### 🔗 Invites

- [ ] **[Invites] Beta teachers can invite colleagues via a link**
  As a beta teacher, I can generate an invite link to share with a colleague — they skip any waitlist and land directly in the product.

---

## Phase 4 — Polish
> Post-validation. Only build this once you know what teachers actually care about.

### 🎨 Design System

- [ ] **[Design] Agree UI direction — get Figma mockups before writing any code**
  Glassmorphism is hard to implement consistently in Tailwind, reduces legibility on complex backgrounds, and looks dated fast. A clean professional dark theme with strong typography may serve teachers better and ship faster. Decide on paper, not in code.

- [ ] **[Design] Build and document the component/design system**
  Define colour palette, typography scale, spacing system, and component variants. Apply consistently across all teacher-facing pages.

### 📱 Responsive

- [ ] **[Responsive] Teacher UI usable on a tablet** *(low priority — teachers are at desks)*

### 📈 Analytics

- [ ] **[Analytics] Class-level trends across multiple batches**
  As a teacher, I can see: average marks by question, AO weaknesses across the class, and common misconceptions — so I can adjust my teaching, not just return papers.

### 🏫 School Admin

- [ ] **[School Admin] Manage seats, view usage, download billing history**
  As a school admin, I can manage teacher seat licences, view department usage, and download billing history — without contacting DeepMark directly.

---

## Decisions Needed (Blocking)

| Decision | Status | Who |
|---|---|---|
| Domain: `getdeepmark.com` or `deepmark.co.uk`? | ❓ Open | Stuart / Jeff |
| UI direction: glassmorphism needs Figma mockups before any build work starts | ❓ Open | Jeff |
| Legal: who is drafting ToS / Privacy Policy / DPA? | ❓ Open | Stuart / Jeff |
| Data retention: how long are student scripts kept in S3? | ❓ Open | Stuart / Jeff |
| Stripe pricing: monthly price per teacher seat? | ❓ Open | Jeff |
| Beta teachers: who are they and when are they available? | 🔄 In progress | Jeff |

---

## Failure Conditions — Do Not Ship If Any of These Are True

- Teacher wouldn't print the output
- Argument detection is not visually present on the script
- Scripts don't look like they were marked by a thorough examiner
- AO tagging is unclear or inconsistent
- OCR errors distort the meaning of an answer
- Workflow feels slow or requires more than 3–4 interactions after upload
- Teacher editing is frustrating or requires menus/modes
- There is no DPA available for schools that ask

---

*Last updated: March 2026*
