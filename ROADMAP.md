# DeepMark Roadmap

> **North Star**: Scan → Upload → Auto mark → Teacher tweak → Print → Hand back. No friction. No confusion. No extra steps.
>
> **MVP definition**: A teacher can upload 30 papers, wait, skim/tweak, hit print and hand them back to students, and the script looks rigorously marked.

---

## Phase 1 — Core Product
> Build this before showing it to anyone. The product must do what it says.

### 🖊️ Argument Detection
- [ ] As a teacher, I can see connective words (because, therefore, leads to, this means, as a result, however, on the other hand, ultimately, drawback, limitation) **boxed** on the student's marked script, so I can see at a glance whether the student is building arguments
- [ ] As a teacher, I can see chains of reasoning (Point → connective → elaboration → conclusion) **underlined or grouped** on the script, visually signalling "this is analysis"
- [ ] As a teacher, I can see evaluation language (however, on the other hand, it depends, ultimately) clearly **tagged** so I know where AO3 evidence lives
- [ ] The argument detection is returned by the LLM as structured JSON (not embedded in prose), so the annotation engine can place it precisely on the page

### 🏷️ AO Tagging as First-Class Output
- [ ] As a teacher, I can see AO1 / AO2 / AO3 mini-tags embedded on the marked script (not buried in a text report), tied to the specific text they refer to
- [ ] AO1 / AO2 / AO3 are structured fields in the grading result (not free-text strings in a prompt), so they can be rendered, aggregated, and exported reliably

### 📄 Annotated PDF Engine *(the core product)*
- [ ] As a teacher, I receive a PDF that looks like a thoroughly marked paper — with ticks, crosses, underlines, margin comments, boxed connectives, AO tags, and marks per question overlaid on the student's actual handwriting
- [ ] The annotated PDF works in black and white and is legible on a poor printer
- [ ] Each annotation is tied to an AO or an argument quality signal — no generic floating comments
- [ ] At the end of each answer there is a summary block: mark awarded, level, short justification ("Clear application, some analysis → Level 2"), and AO snapshot (AO1 ✓ / AO2 ✓✓ / AO3 ~)
- [ ] There is a summary page per script: total mark, AO breakdown, strengths, targets, "why this level / why not next level"

### 📦 Bulk Upload — 30 Scripts at Once
- [ ] As a teacher, I can drag and drop up to 30 scanned PDFs in a single action and have all scripts processed in parallel without any per-script setup
- [ ] The system auto-detects page boundaries and assigns pages to the correct script
- [ ] I can see a clear progress view showing which scripts are queued, processing, and done — so I'm not left wondering what's happening
- [ ] If a single script fails, the rest continue — I'm told which one failed and can re-upload just that one

### ✏️ Teacher Mark Override
- [ ] As a teacher, I can click any mark on a marked script and change it — totals and the summary page update automatically
- [ ] I can edit any margin comment or AO tag inline — click, type, done — with no menus or mode switches
- [ ] I can add an annotation to any part of the script that the system missed

### 📊 Class CSV Export
- [ ] As a teacher, after a batch is marked I can export a CSV with: student name, total mark, AO1 / AO2 / AO3 scores, and per-question breakdown
- [ ] The CSV is ready to paste into a school markbook with no reformatting

---

## Phase 2 — Beta Ready
> Before inviting the first real teachers. Operational basics and legal.

### 🚨 Error Monitoring
- [ ] Errors in production are captured and alerted (Sentry or equivalent) — we know when something breaks before a teacher tells us
- [ ] Backend queue failures (OCR, grading) surface to the teacher with a clear retry action, not a silent hang

### 📧 Transactional Email
- [ ] As a teacher, I receive an email when my batch has finished marking and is ready to review — so I can upload and walk away
- [ ] Email is sent via Resend (or similar), wired to the existing SQS job completion events

### 🧭 Teacher Onboarding — Empty State
- [ ] A new teacher who logs in for the first time sees a clear starting point: "Add your first exam paper → upload scripts → done" — not a blank screen
- [ ] The onboarding path requires ≤ 3 clicks to reach the first meaningful action

### 💬 Feedback Mechanism
- [ ] There is a persistent, low-friction way for beta teachers to report issues or share feedback (Tally form, feedback button, or similar)
- [ ] Feedback is routed somewhere the team will actually read it

### ⚖️ Legal & Compliance *(non-negotiable for UK schools)*
- [ ] Terms of Service published at a public URL
- [ ] Privacy Policy published, covering UK GDPR, data subject rights, and what data is retained
- [ ] **Data Processing Agreement (DPA) template** available for schools — their data protection officer will ask for this before approving the tool
- [ ] Cookie consent banner (ICO requirement)
- [ ] Data retention policy defined and documented: how long are scanned student scripts stored, and how are they deleted

### 🌐 Domain
- [ ] Decision made: `getdeepmark.com` (already live in AWS Route53) vs `deepmark.co.uk` (not yet configured)
- [ ] If using `deepmark.co.uk`: hosted zone created in Route53, CloudFront updated, SSL provisioned
- [ ] If keeping `getdeepmark.com`: `deepmark.co.uk` parked and redirected

---

## Phase 3 — Commercialisation
> When beta teachers have validated the product and want to continue using it.

### 🌍 Landing Page
- [ ] Public marketing page at the root domain — value proposition, who it's for, what it does
- [ ] Includes 1–2 quotes or case study snippets from beta teachers (even informal)
- [ ] Clear CTA: join waitlist or sign up
- [ ] Works without any login — fully public

### 💳 Stripe Subscription Billing
- [ ] As a teacher, I can subscribe with a card — monthly billing per teacher seat
- [ ] Subscription is required to continue using the product after a trial or invite period
- [ ] Teacher account is locked (read-only or paywalled) if subscription lapses
- [ ] Stripe webhook handles subscription state changes (active, cancelled, past_due)

### 💰 Pricing Page
- [ ] Pricing is clearly listed on a public page — no "contact us for pricing"
- [ ] Plan tiers are simple (single teacher, department, school) — avoid complexity until pricing model is validated

### 🔗 Teacher Invite / Referral
- [ ] Beta teachers can invite a colleague via a link — colleague skips waitlist
- [ ] Referred signups are tracked

---

## Phase 4 — Polish
> Post-validation. Only build this once you know what teachers actually care about.

### 🎨 Design System & UI Overhaul
- [ ] Colour palette and typography system defined and documented
- [ ] Component library consistent across all teacher-facing pages
- [ ] UI direction agreed (glassmorphism vs clean professional dark) — **get Figma mockups before building**
- [ ] Design applied to all teacher-facing pages

### 📱 Responsive / Mobile
- [ ] Teacher-facing pages are usable on a tablet (low priority — teachers are at desks)

### 📈 Teacher Analytics
- [ ] As a teacher, I can see class-level trends across multiple batches: average marks, AO weaknesses, common misconceptions

### 🏫 School Admin
- [ ] A school admin can manage teacher seats, view usage, and download billing history

---

## Decisions Needed (Blocking)

| Decision | Status | Who |
|---|---|---|
| Domain: `getdeepmark.com` or `deepmark.co.uk`? | ❓ Open | Stuart / Jeff |
| Glassmorphism: actual Figma mockups needed before building | ❓ Open | Jeff |
| Legal: who is drafting ToS / Privacy Policy / DPA? | ❓ Open | Stuart / Jeff |
| Stripe pricing: what is the monthly price per teacher? | ❓ Open | Jeff |
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
