# Build plan — DocX source-document ingestion + `PdfIngestionJob` rename

**Date:** 2026-05-20
**Owner:** Stuart
**Status:** Approved, pre-spike

## Goal

Accept Microsoft Word (`.docx`) uploads as source documents for **mark schemes, question papers, and stimulus packs** (not student scripts). Along the way, rename the ingestion pipeline so its types no longer encode "PDF" into the concept — they're source documents that happen to currently be PDFs.

## Strategy

**Strategy B: convert DocX → markdown locally with `mammoth`, send as text to Gemini.** A single Lambda per document type handles both formats, branching at a shared `loadSourceDocument(s3Key)` helper. PDF path is unchanged; DocX path produces markdown + optional image parts that slot into the same prompt body.

Reasoning: Gemini's File API does not accept DocX natively. DocX is already structured XML, so mammoth gives us deterministic markdown extraction with no LLM and no OCR step — strictly better input than the PDF→base64→visual-OCR path for documents that started life as Word files. Aligns with "extraction quality IS skill quality" and "repeatability of extraction matters as much as repeatability of marking" (CLAUDE.md).

## Non-goals

- Student scripts (`.docx` is rejected; scripts need page-image OCR which has no DocX equivalent).
- Legacy `.doc` (binary Word 97) — reject at upload with "save as .docx" message.
- LibreOffice-in-Lambda conversion (rejected: too heavy, lossy round-trip).
- Backfilling old PDF jobs or migrating S3 objects (their `s3_key` pointers stay valid).

## Kill-gate: the spike

Before any rename or DocX rollout, **prove mammoth's fidelity on a real AQA/Pearson mark scheme**. Half-hour spike:

- [ ] Hand-author (or obtain) one real GCSE mark scheme as `.docx` — ideally LoR with a level-descriptor table and AO grid.
- [ ] Wire mammoth into a throwaway script in `packages/backend/scripts/`.
- [ ] Extract markdown, hand-compare against the canonical `MarkScheme.content` we'd get from the existing PDF path.
- [ ] Pass criteria: tables preserved; headings preserved; AO codes intact; no silent drop of marker notes or indicative content; equation/special-character risks documented if any.

**If the spike fails:** stop, revisit Strategy A (LibreOffice→PDF) before committing to renames.

**If the spike passes:** proceed below.

## Phase 1 — Codebase rename

The point: stop encoding the format into the concept. A DocX mark scheme is the same conceptual thing as a PDF mark scheme.

### Prisma schema

- [ ] Rename model `PdfIngestionJob` → `DocumentIngestionJob`.
- [ ] Rename table mapping `pdf_ingestion_jobs` → `document_ingestion_jobs` (via `@@map`).
- [ ] Rename enum `PdfDocumentType` → `SourceDocumentType`.
- [ ] Add column `source_format: SourceFormat` (new enum: `pdf | docx`), default `pdf`.
- [ ] Keep `pages: Json?` as-is (used only by student-scan path).

### SQL migration (manual — `db:push` would drop-and-recreate)

Run on each Neon branch (`stuartbourhill` first, then `production`):

```sql
BEGIN;
ALTER TABLE pdf_ingestion_jobs RENAME TO document_ingestion_jobs;
ALTER TYPE "PdfDocumentType" RENAME TO "SourceDocumentType";
ALTER TABLE document_ingestion_jobs
  ADD COLUMN source_format TEXT NOT NULL DEFAULT 'pdf';
COMMIT;
```

- [ ] Run on dev branch (`stuartbourhill`). Verify zero drift after Prisma schema update + `bun db:push`.
- [ ] Run on production branch. Same verification.

### Code renames

- [ ] Folder `apps/web/src/lib/pdf-ingestion/` → `apps/web/src/lib/document-ingestion/`.
- [ ] Server action `createPdfIngestionUpload` → `createDocumentIngestionUpload`.
- [ ] Validation `validatePdfFile` → `validateSourceDocument`; `MAX_PDF_SIZE_MB` → `MAX_DOCUMENT_SIZE_MB`.
- [ ] Helper `getPdfBase64` → `getObjectBase64` (already format-agnostic).
- [ ] Trigger parser `parsePdfIngestionTrigger` → `parseSourceDocumentTrigger`.
- [ ] Processor files: `mark-scheme-pdf.ts` → `mark-scheme.ts`; `question-paper-pdf.ts` → `question-paper.ts`; `exemplar-pdf.ts` → `exemplar.ts`.
- [ ] SQS queues: `markSchemePdfQueue` → `markSchemeIngestQueue`; `questionPaperQueue` → `questionPaperIngestQueue`; `exemplarQueue` → `exemplarIngestQueue` (consistent suffix across the three).

### S3 prefix (for new uploads only)

- [ ] New uploads write to `documents/mark-schemes/{jobId}/source.{ext}` (etc.).
- [ ] **Do not** rewrite `s3_key` on existing rows. Existing objects stay at `pdfs/...` indefinitely; their DB rows still resolve correctly.
- [ ] Update SQS S3 trigger filters: replace `filterPrefix: "pdfs/mark-schemes/"` with `filterPrefix: "documents/mark-schemes/"` (and equivalents for question-papers + exemplars).
- [ ] Update `filterSuffix` from `".pdf"` to support both `".pdf"` and `".docx"` (SST/Pulumi: either multiple notification configs or a single filter — confirm during impl).
- [ ] Check `infra/storage.ts` and bucket-level config for any `pdfs/`-scoped lifecycle/CORS rules (none expected, but verify).

## Phase 2 — DocX ingestion path

### Loader helper

- [ ] Create `packages/backend/src/lib/source-documents/load.ts` exporting:

```ts
type LoadedSourceDocument =
  | { kind: "pdf"; contentPart: FilePart }
  | { kind: "docx"; contentPart: TextPart; images: ImagePart[] }

async function loadSourceDocument(s3Key: string): Promise<LoadedSourceDocument>
```

- [ ] PDF branch: existing base64 + `{ type: "file", mediaType: "application/pdf" }` shape.
- [ ] DocX branch: mammoth → markdown, plus extracted images uploaded to S3 (or inline base64) and returned as Gemini image parts.
- [ ] Format detection: `s3Key.endsWith(".docx")` (or read `source_format` from the job row — single source of truth).

### Processor wiring

For each of `mark-scheme.ts`, `question-paper.ts`, `exemplar.ts`, `paper-bundle.ts`:

- [ ] Replace direct `getPdfBase64()` + inline `{type: "file"}` construction with `await loadSourceDocument(s3Key)`.
- [ ] Spread the resulting content parts into the existing Gemini messages array. Prompt body, Zod schema, DB writes untouched.
- [ ] Confirm `paper-bundle.ts` handles mixed-format bundles (PDF QP + DocX MS, etc.) — should "just work" since each document loads independently.

### Upload boundary

- [ ] `apps/web/src/lib/upload-validation.ts`: accept both `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. Reject `application/msword` (`.doc`) with a clear "save as .docx" message.
- [ ] Reject DocX explicitly for student-script uploads.
- [ ] `createDocumentIngestionUpload`: set presigned `ContentType` based on file MIME; write `source_format` to DB row; use `.{ext}` suffix in S3 key.
- [ ] UI: extend the dropzone `accept` attribute on Paper Setup wizard (`new-paper-upload-client.tsx`) + any other entry points for MS/QP/stimulus.

## Phase 3 — Eval coverage

- [ ] Add one DocX fixture per document type to the relevant eval suites (mark-scheme extraction, question-paper extraction). Use the same source content as an existing PDF fixture so the comparison is apples-to-apples.
- [ ] Assert byte-identical canonical markdown across re-runs (repeatability is the whole point of the deterministic mammoth path).
- [ ] Document any AQA/Pearson MS quirks the spike surfaced that mammoth handles imperfectly, so future onboarding knows.

## Sequencing

1. Spike (Phase 0 kill-gate) — 30 min.
2. Prisma + SQL migration on `stuartbourhill` dev branch — 30 min.
3. Codebase rename (mechanical, IDE-driven) — 1 hr.
4. DocX loader + processor wiring — 1 hr.
5. Upload boundary + UI — 30 min.
6. Eval fixtures — 30 min.
7. Smoke test on dev: PDF MS + DocX MS, both extract; PDF QP + DocX QP; mixed bundle.
8. Run SQL migration on production Neon branch.
9. Deploy (Stuart runs all deploys — agent never runs `sst deploy`).

**Estimate:** ~3 hours of focused work post-spike.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Mammoth drops equations / SmartArt / text boxes on real MS files | Spike kill-gate before commit; document weak spots; fall back to Strategy A if catastrophic |
| Stimulus DocX with embedded images doesn't round-trip cleanly to Gemini | Validate as part of spike; paper-bundle eval covers this once a DocX stimulus fixture exists |
| Mixed bucket (`pdfs/` + `documents/`) is cosmetically untidy | Accepted — pre-launch, no user impact; can `aws s3 mv` later if it irritates |
| SST S3 trigger filter syntax for multi-suffix or multi-prefix needs experimentation | Allow extra 30 min in Phase 1 if SST docs aren't clear; worst case, separate notification configs per format |
| Renaming a referenced Prisma model breaks consumers we didn't grep for | Typecheck pass after rename catches all of them; IDE rename-symbol handles the bulk |

## What we explicitly chose NOT to do

- **S3 object migration** — old objects stay at `pdfs/...`, new at `documents/...`. The DB `s3_key` is the pointer of record; no rewrite needed.
- **`.doc` (legacy Word) support** — separate library, separate fidelity story; reject at upload.
- **Compatibility shim for old `PdfIngestionJob` references** — no-grandfathering rule; clean break, no users.
- **A separate `markSchemeDocxQueue`** — same Lambda branches on format; one prompt per document type.
- **Stashing `source_format` in `pages` JSON** — dispatch hot-path earns a typed column.
