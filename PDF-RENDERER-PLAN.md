# PDF Renderer — Build Plan (Puppeteer)

**Status:** Rewritten 2026-05-07 after a wrong turn into "embed scans + bbox overlay" (which doesn't match what the existing exporter produces). The current exporter is a structured class report rendered from `grading_results` + annotations + page tokens — never a scan booklet. We're keeping that output model; we're swapping the rendering engine.

---

## 1. What we're doing and why

The current class export uses `@react-pdf/renderer` (Yoga + pdfkit). It is:

- **Slow.** A 30-student export is on the edge of the 60s Next.js Lambda timeout.
- **Broken on layout.** Yoga's multi-pass `fixed`-element measurement crashes (`unsupported number: -7.97e21`) on real submissions, e.g. Sosia's. Workarounds shift the bug instead of fixing it.

We replace it with **headless Chromium printing real HTML/CSS**. Concretely: a separate Lambda runs Puppeteer, the Next.js action server-renders the existing report to HTML, the Lambda navigates that HTML and `page.pdf()`s it. CSS handles flow / page breaks / wrap / fonts — the things @react-pdf got wrong.

Output content is unchanged: same student header, same MCQ table, same per-question cards with `AnnotatedAnswer` (OCR'd `student_answer` decorated with marks derived from `annotations` + `pageTokens`), same WWW/EBI bullets, same examiner summary, same footer. **Nothing about scans, bboxes, or pdf-lib drawing primitives is in this plan.**

---

## 2. Non-goals

- **No scan embedding.** Original handwritten scan PDFs / page images do not appear in the report.
- **No `@react-pdf/renderer` in the new path.** It's the engine we're escaping.
- **No print URL / JWT auth surface.** The Lambda doesn't navigate to a Next.js page; the action server-renders HTML and writes it to S3.
- **No replacement of the per-submission single-student export yet.** That route already calls `exportClassReport` with one submission ID, so it migrates for free.
- **No new design.** The visual spec is the existing exporter. The port preserves it.

---

## 3. Architecture

```
[browser]
   │  click Export → ClassExportDialog submit
   ▼
[Next.js server action: exportClassReport]
   │  authz check (resourcesAction)
   │  fetch student data + annotations + pageTokens (existing query)
   │  server-render React → HTML string (renderToString)
   │  S3 PutObject pdf-exports/{paperId}/{jobId}/input.html
   │  Lambda.Invoke (RequestResponse) PdfRenderer with { input, output, printLayout }
   ▼
[PdfRendererFn — separate Lambda]
   │  S3 GetObject input.html
   │  launch headless Chromium (puppeteer-core + @sparticuz/chromium)
   │  page.setContent(html, { waitUntil: "networkidle0" })
   │  page.pdf({ format: "A4", printBackground: true, margin: ... })
   │  if printLayout != "none": pdf-lib pass appends blank A4s to land on sheet boundary
   │  S3 PutObject output.pdf
   │  return { ok, pageCount, sizeBytes, durationMs }
   ▼
[server action]
   │  presign GET on output, 5 min TTL
   ▼
[browser] downloads PDF
```

### Why an action-renders-HTML / Lambda-prints split

- **No Lambda → Next.js network round-trip.** Action already has authz + the data; rendering JSX → string is local and fast.
- **No JWT / auth surface** for the Lambda to navigate a Next.js page.
- **HTML is a debuggable artefact.** Save `input.html`, open it in any browser, see exactly what the Lambda saw.
- **Lambda has zero React or app-domain knowledge.** It's a generic html-to-pdf service we could lift out.

### Why sync invoke

User-initiated; the dialog blocks until the URL comes back. `Lambda.Invoke (RequestResponse)` is the natural fit. The 60s CloudFront cap on the Next.js side is the real ceiling — see open issue (8) for the async-poll fallback once that becomes a problem.

---

## 4. Lambda contract

### Request payload

```ts
type PdfRendererRequest = {
  jobId: string                              // log correlation
  input:  { bucket: string; key: string }    // input.html
  output: { bucket: string; key: string }    // output.pdf
  printLayout: "none" | "duplex" | "duplex_2up"
}
```

### Response payload

```ts
type PdfRendererResponse =
  | { ok: true;  pageCount: number; sizeBytes: number; durationMs: number }
  | { ok: false; error: string;     durationMs: number }
```

Failures are returned as `{ ok: false }`, not thrown. Action interprets and surfaces as `serverError` to the dialog.

### What the HTML looks like

A single self-contained document:
- `<style>` block with all print CSS (system font stack, `@page { size: A4; margin: 16mm }`, page-break rules, colour tokens lifted from existing exporter).
- `<body>` containing class cover (skipped for `students.length === 1`) + per-student section + per-student section + ...
- All assets inlined (no external `<img src=>`, no font fetches). Images, if any are added later, embed as base64 data URIs.

---

## 5. Lambda internals

### Boot Chromium

Use `@sparticuz/chromium` (the maintained AWS Lambda fork of `chrome-aws-lambda`) plus `puppeteer-core`. The chromium binary ships in the Lambda layer / bundle; total cold-start ~1.5–2s.

```ts
import chromium from "@sparticuz/chromium"
import puppeteer from "puppeteer-core"

const browser = await puppeteer.launch({
  args: chromium.args,
  executablePath: await chromium.executablePath(),
  headless: true,
})
```

Reuse the browser across invocations within a warm Lambda — cache it at module scope, gate close() on container shutdown.

### Render

```ts
const page = await browser.newPage()
await page.setContent(html, { waitUntil: "networkidle0", timeout: 60_000 })
await page.emulateMediaType("print")
const pdfBytes = await page.pdf({
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,  // honour @page from the HTML
  margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
})
await page.close()
```

### Sheet-boundary padding (post-process)

`paddingFor(printLayout)` and `padToBoundary(doc, multiple)` (already in `concat.ts`) wrap the Puppeteer output with pdf-lib: load `pdfBytes` via `PDFDocument.load`, append A4 blanks to land on the sheet multiple, save. No-op for `printLayout === "none"`.

---

## 6. Component breakdown — what to build

### A. Renderer Lambda

**Location:** `packages/backend/src/processors/pdf-renderer/`
- `handler.ts` — entrypoint: validates the request, fetches HTML, prints, optionally pads, uploads.
- `schema.ts` — Zod schemas for request/response (lives there now; gets `printLayout` added in Phase 2).
- `chromium.ts` — module-scoped browser cache + boot helper.
- `print.ts` — pure-ish HTML → `Uint8Array` via `puppeteer-core`.
- `concat.ts` — *exists* — `paddingFor` + `padToBoundary` post-process.
- `s3-io.ts` — *exists* — extends with `s3GetText` for HTML.
- `cover-page.ts` — **delete** once HTML pipeline lands; pdf-lib cover is a stopgap.

### B. Print components (`apps/web/src/lib/marking/pdf-export/print/`)

Plain React + CSS — no `@react-pdf/renderer`. Mirror the existing structure:
- `class-report.tsx` — top-level: `<html><head><style/></head><body>{cover?}{students.map(StudentSection)}</body></html>`
- `cover.tsx` — class-level cover (skipped for N=1)
- `student-section.tsx` — header, examiner summary, MCQ table, per-question cards, footer
- `written-question-card.tsx` — header, stimuli, question text, answer, WWW/EBI
- `annotated-answer.tsx` — line-by-line render with `Segment` per `splitIntoSegments(line, marks)` — same logic as the @react-pdf one, plain `<span>`s with inline `style`
- `print-styles.ts` — single string export: all CSS, `@page` rules, page-break utilities, colour tokens

The existing `marksForQuestion`, `splitIntoSegments`, `deriveSegmentStyle`, `splitIntoLines`, `clipMarksToLine` are pure and move with no API change. They are the bits we don't re-derive.

### C. Server action

**File:** `apps/web/src/lib/marking/pdf-export/export-action.ts`
- Same authz + data fetch as today.
- Replace the renderer-input JSON envelope with `renderToString(<ClassReport ... />)`.
- `S3 PutObject` `input.html`. `Lambda.Invoke`. Presign output. Return URL.
- Drop `@aws-sdk/client-lambda` keep — already added in Phase 1.

### D. Cleanup

After Phase 5 verifies end-to-end, delete:
- `apps/web/src/lib/marking/pdf-export/{generate,generate.server,student-section,annotated-answer,cover-page,legend-page,styles}.{ts,tsx}` (the @react-pdf path)
- `@react-pdf/renderer` from `apps/web/package.json`
- `apps/web/scripts/checks/no-hex-color-literal.ts` allowlist entry for those files

---

## 7. Phases

Each phase is a shippable PR. Don't merge them as one.

### Phase 1 — DONE

Lambda skeleton, sync invoke, S3 in/out, presigned download, cover-only stub. Round-trip works in dev.

### Phase 2 — Puppeteer Lambda + raw-HTML round-trip

Goal: Lambda accepts arbitrary HTML, prints PDF, returns it.

- Add `@sparticuz/chromium` + `puppeteer-core` to `packages/backend`.
- Bump `pdfRendererFn` memory to **3 GB** (chromium working-set), keep 5 min timeout. May need `nodejs.install` for the chromium bundle.
- `chromium.ts` + `print.ts` + handler swap.
- Schema gets `printLayout` on the request.
- Action keeps the JSON envelope **temporarily** but uploads it as `input.html` containing a hand-written stub HTML document so we can test the print path before the component port lands.
- Verify a 1-page PDF lands. Open it. Page size A4, margins right.

### Phase 3 — Print component port (no annotations)

Goal: real HTML class report, but answers render as plain text (no marks).

- New `print/` folder with components above. Cover, student header, MCQ table, written-question card with plain answer text, footer.
- Print CSS: page breaks per question (`page-break-inside: avoid` on `.question-card` once it fits one page; flow otherwise), `@page { size: A4; margin: 16mm }`, system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).
- Action: replaces stub HTML with `renderToString(<ClassReport />)`.
- Verify a real class export looks right minus annotations.

### Phase 4 — Annotated answer port

Goal: feature parity with the @react-pdf exporter.

- Port `AnnotatedAnswer` to `print/annotated-answer.tsx` using plain `<span>` segments with inline styles.
- Reuse `marksForQuestion`, `splitIntoSegments`, `deriveSegmentStyle`, `splitIntoLines`, `clipMarksToLine` verbatim — they're pure.
- AO labels render as inline `<span>`s with the `aoHex(label)` colour.
- Verify on Sosia's submission (the canonical "this used to crash @react-pdf").

### Phase 5 — Sheet-boundary padding

Goal: duplex / duplex_2up exports start each student on a fresh sheet.

- After Puppeteer returns, `PDFDocument.load(bytes)` → `padToBoundary(doc, paddingFor(printLayout))` → save. Already-existing helpers in `concat.ts`.
- We can't pad *between* students from a single HTML render (Chromium prints the whole document then we know its page count), so the padding lands at the end. That matches the cover-shares-with-first-student behaviour we already had.

> **Open question for this phase:** if a class export needs each *student* to start on a fresh sheet (not just the doc-end), we need a per-student print pass and concat. Punt to Phase 6 unless real testing shows it matters.

### Phase 6 — Cleanup

Delete @react-pdf code + dep + lint allowlist entries. PR title: "feat(pdf-export): remove @react-pdf, switch to Puppeteer".

---

## 8. Tests

### Pure-function unit tests (Vitest, colocated, fast)

- `packages/backend/src/processors/pdf-renderer/__tests__/concat.test.ts` — `paddingFor("none"|"duplex"|"duplex_2up")`, `padToBoundary` against pdf-lib for inputs of varying page counts.
- `apps/web/src/lib/marking/pdf-export/print/__tests__/wrapping.test.ts` — `splitIntoLines`, `clipMarksToLine`, `splitIntoSegments` (table-driven). These already exist for the @react-pdf path; they migrate alongside the components.
- `packages/backend/src/processors/pdf-renderer/__tests__/schema.test.ts` — schema parses + rejects malformed payloads.

### HTML snapshot tests (Vitest, colocated, browser-free)

- `apps/web/src/lib/marking/pdf-export/print/__tests__/class-report.snapshot.test.tsx` — given fixture `StudentPaperJobPayload`s + annotations + tokens, `renderToString(<ClassReport ... />)` matches a stored snapshot. One snapshot per scenario:
  1. Class of 3, mixed MCQ + written, with annotations.
  2. Single student, MCQ-only.
  3. Single student, written-only with examiner summary.
  4. Annotated answer with all mark types (tick / cross / underline / box / circle / chain / AO).
  5. Sosia's submission (the regression fixture from the @react-pdf bug).

Snapshots catch regressions in segment styling, page-break classes, mark-derivation behaviour. They run in <100ms each — no browser needed.

### Print smoke test (Puppeteer, opt-in, local-only)

- `packages/backend/tests/integration/pdf-renderer-puppeteer.test.ts` — uses full `puppeteer` (not `-core`), launches Chromium, prints a fixture HTML, asserts:
  - `pageCount > 0`
  - `sizeBytes > 4 KB` (sanity floor)
  - text extraction (via `pdf-parse`) contains the student name and at least one question number.
- Tagged so it doesn't run in CI by default. Run locally with `bun test:integration --project backend:integration --testNamePattern "pdf-renderer"`.

### Manual verification

Each phase has a manual smoke before the PR merges:
- Phase 2: hand-written HTML round-trips, opens in Preview, looks like A4.
- Phase 3: real class export looks like the @react-pdf one minus annotations.
- Phase 4: annotated answer matches the on-screen `EditorContent` view of the same submission.
- Phase 5: 25-student class with `printLayout: duplex` ends on an even page count.

### What we're not testing

- We don't pixel-diff PDFs in CI — too fragile against Chromium version drift.
- We don't simulate the Lambda runtime in CI — the print smoke uses local puppeteer; the Lambda's `@sparticuz/chromium` path runs in `sst dev`.

---

## 9. Auth / security

- Lambda invoked by IAM principal (the web Lambda's role). External callers can't reach it.
- S3: both Lambdas already have `link:[scansBucket]`, which gives Get/Put on the bucket.
- `input.html` contains PII (student names, examiner summary, OCR'd answers). Same exposure surface as the scans already in the bucket. The 1-day lifecycle on `pdf-exports/` (existing) auto-cleans both `input.html` and `output.pdf`.
- No print URL → no JWT.

---

## 10. Open items

1. **Browser cache lifetime.** Module-scoped browser reuse across invocations is the standard pattern but can leak handles. If we see growing memory, switch to launch-per-invocation and accept the +1.5s cold start.
2. **Fonts.** System stack only for v1. If the design ever needs Geist or similar, bundle as `font-face` data URIs in the print CSS — no Lambda layer needed.
3. **Per-student sheet boundary.** Phase 5 pads at doc-end. If real teachers complain that two students share one sheet under duplex, switch to per-student print + concat (more code, more invocations).
4. **Async invoke fallback.** Sync invoke is fine while renders are <60s. Larger classes will eventually need `Lambda.Invoke (Event)` + a polling endpoint that checks for `output.pdf` existence + presigns it.
5. **Single-student route.** Currently rides on `exportClassReport` with one submission ID. After Phase 5, confirm the cover-skip + sheet-padding behaviour still feels right for one-student exports; tweak if not.

---

## 11. Definition of done

- A 25-student class with `includeAnnotations: true` exports cleanly.
- The output looks visually equivalent to the @react-pdf exporter's golden output (same student header layout, same MCQ table, same annotation marks, same WWW/EBI bullets, same footer).
- Sosia's submission (the regression case) renders without crashing.
- Five HTML snapshots green; concat unit tests green; opt-in Puppeteer smoke runs locally green.
- `@react-pdf/renderer` is gone from the dependency tree.
- Memory + duration metrics on the production Lambda look stable across 10 consecutive renders.
