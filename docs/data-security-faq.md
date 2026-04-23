# DeepMark — Data, Security & AI FAQ

> Forward-looking posture for the next ~1 month of hardening. Used for answering teacher and school questions about data protection, security, and AI usage.

## 🔐 Data Protection (GDPR)

**What data does DeepMark collect?**
Teacher account data (name, email via Google/GitHub OAuth), question papers and mark schemes uploaded by the teacher, scanned student scripts (PDFs and page images), OCR-extracted answer text, optional student names and class metadata, and marking results with examiner-style feedback.

**Does it store personally identifiable student data (names, etc.)?**
Teachers can optionally attach a student name to a script. It is not required — submissions can be processed with a student ID or left unnamed. Teachers choose the level of identifiability.

**Can the system work with anonymised student IDs instead of names?**
Yes. Every script can be uploaded and marked under an anonymous ID; the name field is optional and can be left blank.

**Where is all data stored?**
All primary storage is in the **UK (AWS eu-west-2, London)** — S3 for scans and Postgres (Neon) for structured data.

**Is data encrypted (in transit and at rest)?**
Yes. HTTPS/TLS for all traffic; data is encrypted at rest in both S3 and Postgres.

**Is any data used to train AI models?**
No. DeepMark uses **Anthropic Claude** and **Google Gemini** (plus Google Cloud Vision for OCR) via their enterprise APIs, not consumer tools. Under these enterprise terms, customer data is not used to train provider models.

**Who has access to the data?**
Authenticated teachers only. Teachers can only see their own data. A small DeepMark engineering team has operational access for support and incident response under a documented internal policy.

**How can data be deleted?**
Teachers can delete individual scripts, submissions, exam papers, or mark schemes from the UI. A full account-level "delete everything" option will be available on request at launch.

**What is the data retention policy?**
A written retention policy will be published alongside our Privacy Policy before wider rollout. By default, teacher-uploaded data is retained while the account is active and for a short, documented window after deletion for backup/recovery purposes.

---

## 🧾 Data Processing

**Processor or Controller?**
DeepMark is a **Data Processor** for student data (the teacher/school is the Controller) and **Data Controller** only for our own account data (teacher login credentials, etc.).

**Can we provide a basic DPA?**
Yes — a Data Processing Agreement will be available before any paid pilot.

---

## 🛡️ Safeguarding / Access

**Can any user access another user's data?**
No. Data is scoped per-user; teachers can only access their own uploads and marking results.

**Is there any way student work can be publicly shared?**
No. Student scripts and marking feedback are never publicly accessible. There are no public share links.

**Is access restricted to authenticated users only?**
Yes — all teacher routes require authenticated sessions.

**Student accounts?**
Teacher-only. Students do not have accounts in DeepMark.

---

## 🌍 Data Location & Transfers

**Is any data transferred or stored outside the UK/EU?**
All primary storage (S3, Postgres) is in the UK. Our AI providers (Anthropic and Google) may process data on global infrastructure under their enterprise terms — we're confirming UK/EU processing regions where available.

**What safeguards are in place?**
Enterprise contracts with Anthropic and Google, both of which commit to not training on customer data and provide standard GDPR safeguards (SCCs where applicable).

---

## 🤖 AI Usage

**How does the AI make marking decisions?**
DeepMark uses a three-strategy marking engine:

1. **Deterministic** — direct letter-match for MCQ (no LLM).
2. **Level of Response** — LLM evaluates extended writing against the exam board's level descriptors.
3. **Point-based** — LLM awards per-mark-point credit using the mark scheme.

Every decision is logged with the model's reasoning.

**Can all marks and feedback be edited by the teacher?**
Yes. Every mark and every feedback comment is editable. Teacher overrides are recorded separately.

**Is the AI assistive (teacher-in-the-loop) rather than fully automated?**
Yes — DeepMark is explicitly a teacher-in-the-loop tool. Nothing leaves the platform without teacher review.

---

## 🔍 Accuracy & Reliability

**Alignment with exam board mark schemes (e.g. AQA)?**
Teachers upload the official mark scheme PDF and DeepMark extracts the guidance verbatim. The LLM is prompted to apply the board's descriptors, caps, and level criteria exactly as written. We evaluate against frozen real-world fixtures to catch regressions.

**How does the system avoid rigid keyword-only marking?**
DeepMark uses semantic, level-descriptor-based grading for extended writing. The LLM receives the full question context, full mark scheme guidance, and the student's complete answer — decisions are reasoned against the descriptor, not matched against keyword lists.

---

## 🗑️ Data Retention & Deletion

**How long is data stored by default?**
For the life of the account, with a documented retention policy published before rollout.

**Can users delete individual scripts?**
Yes — from the UI.

**Can users delete all their data completely?**
Yes — on request at launch; a self-service "delete account" flow is on the roadmap.

---

## 🔒 Security

**HTTPS everywhere?** Yes.

**Authentication and access control?** OAuth (Google / GitHub) via OpenAuth, with secure session cookies; per-user data scoping on every query.

**Account protection?** OAuth-only — no passwords held by DeepMark. MFA inherited from the teacher's Google/GitHub account.

---

## 📜 Legal / Policies

**Privacy Policy, Terms of Service?**
Both will be published before any paid use. Drafts are in progress.

**Do they state no data resale and no AI training?**
Yes — that will be stated clearly in both documents.

---

## ⚖️ Usage Boundaries

**Does DeepMark store or distribute exam papers?**
DeepMark only processes papers that a teacher uploads for their own use. We do not source, store, or distribute exam board papers ourselves.

---

## 🟡 Known open items (internal — not for external use)

Things to *not* over-promise if pressed:

1. **Google / Anthropic regional processing** — verifying whether enterprise APIs offer UK/EU region pinning. If asked directly: *"We're confirming this with both providers."*
2. **DPA / Privacy Policy / ToS** — drafts in progress, not published today. Don't claim they exist.
3. **Retention window** — the specific number of days hasn't been decided. Don't quote a figure yet.
4. **Self-service "delete my account"** — available on request at launch; full self-service flow is post-launch.

If a question touches one of these, safest phrasing is *"we're finalising that ahead of rollout — I'll follow up with specifics."*
