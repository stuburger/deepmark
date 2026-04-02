# DeepMark — CLAUDE.md

## What is DeepMark?

DeepMark is an AI-powered marking tool for teachers, primarily targeting the UK GCSE market. It lets teachers scan student exam scripts and receive fast, accurate, examiner-quality marking feedback — reducing the manual burden of marking while maintaining the rigour teachers expect.

### Core User Flow

1. **Upload a question paper (QP)** — Gemini extracts all questions, types, marks, and metadata.
2. **Upload a mark scheme (MS)** — Gemini extracts mark points, level descriptors, caps, and marking method. Optionally links to an existing exam paper.
3. **Upload student scripts (PDF)** — A multi-page PDF containing one or more student papers is scanned and segmented via drag-and-drop review into individual staged scripts.
4. **Mark** — Three-phase async pipeline:
   - **Phase 1 — OCR**: Gemini extracts answers; Cloud Vision detects per-page word tokens. Token reconciliation + answer region attribution follow.
   - **Phase 2 — Grading**: `MarkerOrchestrator` grades each answer (Deterministic → LevelOfResponse → LLM). Results stream to the DB.
   - **Phase 3 — Annotation** *(in progress)*: Feedback is rendered inline on the scanned script using word-level bounding boxes.

### Mark Scheme Types

| Type | Description |
|------|-------------|
| `deterministic` | MCQ — pure letter comparison, no LLM |
| `point_based` | Written answers — LLM awards marks per mark point |
| `level_of_response` | Extended writing — AQA-style level descriptors with caps |

---

## Monorepo Structure

```
mcp-gcse/
├── apps/
│   └── web/                  # Next.js 14 app (App Router)
│       └── src/
│           ├── app/teacher/  # Teacher-facing routes
│           ├── components/   # Shared UI components
│           └── lib/          # Domain modules (server actions, queries, types)
├── packages/
│   ├── backend/              # AWS Lambda processors + MCP server + API
│   ├── db/                   # Prisma schema + generated client
│   └── shared/               # Marking engine (MarkerOrchestrator, Grader, etc.)
├── infra/                    # SST v3 infrastructure (AWS + Neon)
└── sst.config.ts
```

**Package manager: `bun`** — always use `bun` to add packages, never `npm` or `yarn`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React, Tailwind CSS, shadcn/ui |
| State / URL | TanStack Query, nuqs (URL state) |
| Backend (web) | Next.js Server Actions (`"use server"`) |
| Backend (async) | AWS Lambda via SQS queues |
| Infrastructure | SST v3 (Ion / Pulumi) on AWS |
| Database | Neon (serverless Postgres) via Prisma ORM |
| AI | Google Gemini (`@ai-sdk/google`, `gemini-2.5-flash`) |
| OCR | Google Cloud Vision API |
| Auth | OpenAuth (`@openauthjs/openauth`) |
| Linting/Format | Biome (`bun check` / `bun fix`) |
| Build | Turborepo |

### AWS Region

Currently deployed to **us-east-1**. Planned migration to **eu-west-2** (London).

---

## Key Conventions

### Server Actions — Result Pattern

All server actions return a discriminated union. Never throw to the client.

```ts
// ✅ Correct
return { ok: true, data: ... }
return { ok: false, error: "Human-readable message" }

// ❌ Never
throw new Error("Something failed")
```

### Frontend Error Handling

Server action errors surface as Sonner toasts — never as inline React state.

```tsx
import { toast } from "sonner"

const result = await someServerAction()
if (!result.ok) {
  toast.error(result.error)
  return
}
toast.success("Done.")
```

### URL State — nuqs

Use `nuqs` for any client state that lives in a URL search parameter. The `NuqsAdapter` is mounted in `providers.tsx`.

```tsx
import { useQueryState, parseAsString } from "nuqs"

const [tab, setTab] = useQueryState("tab", parseAsString.withDefault("paper"))
```

Never manually compose URLs with `useSearchParams` + `useRouter` + `usePathname`.

### Next.js Client/Server Boundary

- `"use client"` files: **only `import type`** from `@mcp-gcse/db`. For runtime values like `SUBJECTS`, import from `@/lib/subjects`.
- Server components needing `buttonVariants`: import from `@/components/ui/button-variants`, not `@/components/ui/button` (which is `"use client"`).
- Always add `suppressHydrationWarning` to the root `<html>` element (next-themes requirement).

### Domain Module Layout (`apps/web/src/lib/`)

Functionality is split into domain folders with consistent file naming:

```
lib/
  exam-paper/
    queries.ts    — read-only server actions (fetch data)
    mutations.ts  — write server actions
    questions.ts  — question-specific mutations
  marking/
    types.ts      — shared TypeScript types
    queries.ts
    mutations.ts
  pdf-ingestion/
    upload.ts
    queries.ts
    job-lifecycle.ts
```

**Rules:**
- Types live in `types.ts` within the domain folder, not scattered across files.
- Prompts and LLM schemas live in `processors/<name>/prompts.ts` + `schema.ts` sibling files, never inline in handlers.
- Do not create barrel re-export files. Import directly from domain modules.

### Component Colocation

Large page shells are decomposed into collocated files in the same folder:

```
app/teacher/exam-papers/[id]/
  exam-paper-page-shell.tsx     # main shell
  exam-paper-helpers.tsx        # badge helpers, formatters
  hooks/
    use-exam-paper-live-queries.ts
    use-similar-questions.ts
  staged-script-review-cards.tsx
  dnd-script-card.tsx
```

Extract sub-components and hooks into sibling files rather than growing a single file past ~300 lines.

---

## Marking Engine

All student answer grading goes through `MarkerOrchestrator` from `@mcp-gcse/shared`. Never write raw LLM calls for marking.

```ts
import {
  DeterministicMarker,
  Grader,
  LevelOfResponseMarker,
  LlmMarker,
  MarkerOrchestrator,
} from "@mcp-gcse/shared"

const orchestrator = new MarkerOrchestrator([
  new DeterministicMarker(),          // MCQ — no LLM
  new LevelOfResponseMarker(grader),  // LoR — level descriptors
  new LlmMarker(grader),              // point_based fallback
])

const grade = await orchestrator.mark(questionWithMarkScheme, studentAnswer)
```

The `Grader` wraps the LLM model. In Lambda processors, use `defaultChatModel()` from `packages/backend/src/lib/google-generative-ai.ts`. In web server actions, create via `@ai-sdk/google`.

---

## Async Processing Pipeline (SQS Queues)

All heavy lifting runs in Lambda functions triggered by SQS queues, defined in `infra/queues.ts`.

| Queue | Trigger | Handler |
|-------|---------|---------|
| `MarkSchemePdfQueue` | S3 upload to `pdfs/mark-schemes/` | `processors/mark-scheme-pdf.ts` |
| `QuestionPaperQueue` | S3 upload to `pdfs/question-papers/` | `processors/question-paper-pdf.ts` |
| `ExemplarQueue` | S3 upload to `pdfs/exemplars/` | `processors/exemplar-pdf.ts` |
| `BatchClassifyQueue` | Manual (server action) | `processors/batch-classify.ts` |
| `StudentPaperOcrQueue` | Manual (teacher finalises upload) | `processors/student-paper-extract.ts` |
| `StudentPaperQueue` | Auto (after OCR complete) | `processors/student-paper-grade.ts` |
| `StudentPaperEnrichQueue` | Auto (after grading complete) | `processors/student-paper-enrich.ts` *(stub)* |

---

## Infrastructure (SST v3)

- **`sst.config.ts`** — app entry, imports `infra/` modules.
- **`infra/config.ts`** — secrets (Gemini API key, etc.) and domain config.
- **`infra/database.ts`** — Neon Postgres with branch-per-stage strategy. Production uses the `main` branch; dev/PR stages get isolated named branches.
- **`infra/storage.ts`** — S3 bucket (`scansBucket`) for all PDFs and scans.
- **`infra/queues.ts`** — all SQS queues + Lambda subscribers.
- **`infra/auth.ts`** — OpenAuth issuer.
- **`infra/web.ts`** — Next.js deployment (`sst.aws.Nextjs`).

### Environment / Secrets

Use the SST Resource pattern — never hardcode secrets.

```ts
import { Resource } from "sst"
Resource.GeminiApiKey.value
Resource.NeonPostgres.databaseUrl
```

Types are declared in `sst-env.d.ts`.

---

## Database

- ORM: **Prisma** (`packages/db`)
- DB: **Neon** (serverless Postgres)
- Migrations: `bun db:migrate` (dev), `bun db:deploy` (production)
- Studio: `bun db:studio`

Never import runtime values from `@mcp-gcse/db` into client components — only `import type`.

---

## MCP Server

`packages/backend/src/mcp-server.ts` exposes an MCP (Model Context Protocol) server for AI tooling integrations. Each tool lives in `packages/backend/src/tools/<tool-name>/` with:

- `schema.ts` — Zod input schema
- `tool.ts` — handler (`tool(Schema, async (args) => text(...))`)

Register in `mcp-server.ts` via `server.registerTool(...)`.

---

## Commands

```bash
bun dev              # SST dev mode (Next.js + Lambda local)
bun build            # Turborepo full build
bun typecheck        # Type-check all packages
bun check            # Biome lint + format check
bun fix              # Biome auto-fix

bun db:generate      # Regenerate Prisma client
bun db:migrate       # Create + apply migration (dev)
bun db:deploy        # Apply migrations (production)
bun db:studio        # Open Prisma Studio

bun test:unit        # Vitest unit tests
bun test:integration # Vitest integration tests (requires SST env)
```

---

## Active Priorities (as of April 2026)

### Tier 1 — Accuracy / Trust
- Fix MCQ OCR alignment (detect tick near label, ignore crossed-out marks, low-confidence flag)
- Add bounding box scan coverage check — warn or block if coverage is low
- Add inference / "benefit of the doubt" layer; default to balanced examiner mode
- Improve 2-marker and 12-marker handling (partial semantic credit, borderline push-up)

### Tier 2 — UX / Flow
- Gate "missing mark scheme" message behind processing state
- Progressive dashboard reveal (hide analytics until marking is complete)
- Enforce upload order: QP → MS → scripts
- Add cancel/replace option during upload

### Tier 3 — Refinement
- Compress LLM feedback to short examiner-style bullets
- Deduplicate similar questions (click to review/merge/delete)
- Show scripts as "Zack (5 pages)" not page-by-page
- Add granular processing status messages ("Parsing… Detecting MCQs… Applying AO…")

### Upcoming Builds
- Landing page
- Softness/strictness slider
- Homework mode (auto mark scheme generation)
- Annotation engine (Phase 3 of marking pipeline)
