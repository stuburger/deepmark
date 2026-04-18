# DeepMark — CLAUDE.md

## Team & Access Control

At the start of every conversation, ask who is using Claude Code. Adapt scope accordingly:

- **Stuart Bourhill** — Project owner, full-stack developer. Full access to all packages, infra, and config. No restrictions.
- **Geoff Waugh** — Frontend contributor. Restrict all file edits to `apps/web/` only. Do not modify files in `packages/`, `infra/`, or root config files (`sst.config.ts`, `package.json`, etc.). If Geoff's request requires changes outside `apps/web/`, explain what's needed and suggest he asks Stuart.

If the user doesn't identify themselves, ask before proceeding with any edits.

---

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
deepmark/
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
├── infra/                    # SST v4 infrastructure (AWS + Neon)
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
| Infrastructure | SST v4 (Ion / Pulumi) on AWS |
| Database | Neon (serverless Postgres) via Prisma ORM |
| AI | Google Gemini (`@ai-sdk/google`, `gemini-2.5-flash`) |
| OCR | Google Cloud Vision API |
| Auth | OpenAuth (`@openauthjs/openauth`) |
| Linting/Format | Biome (`bun check` / `bun fix`) |
| Build | Turborepo |

### AWS Region

Deployed to **eu-west-2** (London) on the `deepmark` AWS profile.

---

## Key Conventions

### UI Components — shadcn/ui First

Always reach for a shadcn/ui component before writing a custom one. The component registry is defined in `apps/web/components.json`. Check `apps/web/src/components/ui/` before building anything from scratch — Button, Dialog, Table, Tabs, Badge, Card, Progress, Toast, etc. are all available.

When a shadcn component doesn't exist yet, add it with:

```bash
bunx shadcn@latest add <component-name>
```

Only build a custom component when shadcn genuinely cannot cover the use case (e.g. drag-and-drop canvas, bounding box overlay).

**Never use vanilla `<button>` when `<Button>` from `@/components/ui/button` will do.** The `Button` component provides consistent styling, focus rings, disabled states, and variant/size props. Use it for all clickable actions — primary CTAs, icon buttons (`size="icon"`), destructive actions (`variant="destructive"`), subtle actions (`variant="ghost"`).

Vanilla `<button>` is only acceptable when:
- A compound component API requires a plain element as a render prop / trigger (e.g. Sheet, Tooltip, dnd-kit drag handles).
- The button is an overlay control with absolute positioning and fully custom styling that `Button` variants can't express.

When touching a file that has vanilla `<button>` where `<Button>` should be used, convert it as part of your change (campsite rule).

---

### State Management

**Minimise `useState`.** Before reaching for local state, ask:

- Can this be derived from props or existing query data? → compute it inline, no state needed.
- Does it belong in the URL? → use `nuqs`.
- Does it come from the server? → use React Query.
- Is it purely ephemeral UI (open/closed, hover)? → `useState` is fine.

Prefer derived values over synchronised state:

```tsx
// ❌ Redundant state — derived from existing data
const [totalMarks, setTotalMarks] = useState(0)
useEffect(() => setTotalMarks(results.reduce(...)), [results])

// ✅ Computed inline
const totalMarks = results.reduce((sum, r) => sum + r.awarded_score, 0)
```

---

### Data Fetching — React Query + Server Actions

Use TanStack Query (`useQuery`, `useMutation`) for all client-side data fetching. Server actions are the fetch/mutate functions — pass them directly as the query/mutation function.

**Optimistic updates are the default for mutations that change visible state.** Use `useMutation` with `onMutate` / `onError` / `onSettled` to apply the change instantly and roll back on failure.

```tsx
const queryClient = useQueryClient()

const mutation = useMutation({
  mutationFn: updateStagedScript,
  onMutate: async (variables) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.batch(paperId) })
    const previous = queryClient.getQueryData(queryKeys.batch(paperId))
    queryClient.setQueryData(queryKeys.batch(paperId), (old) => applyOptimisticUpdate(old, variables))
    return { previous }
  },
  onError: (_err, _vars, context) => {
    queryClient.setQueryData(queryKeys.batch(paperId), context?.previous)
    toast.error("Failed to update script")
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.batch(paperId) })
  },
})
```

Query keys live in `apps/web/src/lib/query-keys.ts` — always use them, never inline strings.

**UX requirements for every mutation:**
- Immediate optimistic feedback where the data is visible in the UI.
- `toast.error(result.error)` on failure (see error handling below).
- `toast.success(...)` for non-obvious confirmations (deletes, submits).
- Loading spinners only for operations with no optimistic path (e.g. file uploads, long async jobs).

---

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

### Forms

Forms use **react-hook-form** with **zod** for validation (`zodResolver`). Every form component follows the same contract:

```tsx
type Props = {
  initialValue: FormValues   // always required — creation uses empty/zero values
  onSubmit: (values: FormValues) => Promise<void> | void
}
```

- **Creation** callers pass zeroed-out defaults: empty strings, `0`, empty arrays.
- **Edit** callers load values from the DB and pass them in directly.

This keeps forms pure and reusable — they know nothing about whether they're creating or editing.

```tsx
// Schema and types live inside the form file
const markSchemeSchema = z.object({
  description: z.string().min(1, "Description is required"),
  guidance: z.string(),
  markPoints: z.array(
    z.object({
      description: z.string().min(1, "Required"),
      points: z.number().int().min(0),
    })
  ).min(1, "At least one mark point is required"),
})

type MarkSchemeFormValues = z.infer<typeof markSchemeSchema>

// Empty value for creation
export const EMPTY_MARK_SCHEME: MarkSchemeFormValues = {
  description: "",
  guidance: "",
  markPoints: [{ description: "", points: 1 }],
}

// The form component
export function MarkSchemeForm({ initialValue, onSubmit }: Props) {
  const form = useForm<MarkSchemeFormValues>({
    resolver: zodResolver(markSchemeSchema),
    defaultValues: initialValue,
  })

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      {/* fields */}
    </form>
  )
}
```

**Validation errors** (field-level, from Zod) are displayed inline using the `Field` / `FieldError` / `FieldLabel` components from `@/components/ui/field`.

**Server errors** (from a failed server action) are always shown as a Sonner toast — never stored in state and rendered as JSX. The `onSubmit` prop is the right boundary:

```tsx
// In the parent — not inside the form
async function handleSubmit(values: MarkSchemeFormValues) {
  const result = await createMarkScheme(values)
  if (!result.ok) {
    toast.error(result.error)   // server error → toast
    return
  }
  toast.success("Mark scheme saved")
  onClose()
}

<MarkSchemeForm initialValue={EMPTY_MARK_SCHEME} onSubmit={handleSubmit} />
```

The form itself never calls server actions directly. The parent wires `onSubmit` to the mutation/server action and owns the success/error side-effects.

---

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

Functionality is split into domain folders. Small domains use flat files; larger domains nest into **sub-domain folders** that group queries, mutations, and types that change together.

**Flat structure** (default for small domains):

```
lib/
  exam-paper/
    queries.ts    — read-only server actions (fetch data)
    mutations.ts  — write server actions
    questions.ts  — question-specific mutations
    types.ts
  pdf-ingestion/
    upload.ts
    queries.ts
    job-lifecycle.ts
    types.ts
```

**Nested structure** (for domains that outgrow flat files — use `marking/` as the reference):

```
lib/
  marking/
    types.ts              — shared types used across sub-domains
    status.ts             — cross-cutting utility
    mutations.ts          — flat until split is needed
    evaluation.ts         — standalone small concern
    bounding-box.ts       — standalone small concern
    submissions/
      queries.ts          — single-submission detail retrieval
    scan/
      queries.ts          — page images, tokens, annotations
    listing/
      queries.ts          — submission list views
    stats/
      queries.ts          — aggregate analytics
```

**When to nest:** A domain should move from flat to nested when it has ~400+ line files **or** 3+ distinct sub-domains with their own queries/mutations. The sub-domain folder groups things that change together — if "scan data" changes, you touch `marking/scan/` and nothing else.

**What stays at the domain root:** Cross-cutting types (`types.ts`), shared utilities (`status.ts`), and small leaf files (<~100 lines, single concern) that don't belong to any one sub-domain.

**Incremental migration:** Not all domains are nested yet. When doing significant work in a domain that still uses flat files (e.g. `exam-paper/`, `batch/`), convert it to the nested convention as part of that work. This keeps the migration gradual rather than a big-bang rewrite.

**Rules:**
- Types shared across sub-domains live in `types.ts` at the domain root, not scattered across files. Sub-domain-specific types can live in `<subdomain>/types.ts` as that sub-domain grows.
- Prompts and LLM schemas live in `processors/<name>/prompts.ts` + `schema.ts` sibling files, never inline in handlers.
- Do not create barrel re-export files. Import directly from the specific file — `"use server"` barrels cause problems in Next.js.
- **Never import across package boundaries.** Tests must not import from `apps/web/` — if a test needs a function, that function belongs in `packages/backend/` or `packages/shared/`. Web server actions should be thin auth wrappers that delegate to backend services.

### Tables, Grids & Dialogs — Always Extracted

Tables, data grids, and dialogs are **never inlined** inside a higher-level page shell or parent component. Each gets its own file.

```
app/teacher/exam-papers/[id]/
  exam-paper-page-shell.tsx     # orchestrates layout only
  submission-grid.tsx           # owns the grid/table for submissions
  link-mark-scheme-dialog.tsx   # owns the dialog for linking a mark scheme
  marking-job-dialog.tsx        # owns the dialog for starting a marking job
```

A page shell should compose these components, not contain their markup:

```tsx
// ✅ Shell composes extracted components
return (
  <>
    <SubmissionGrid submissions={submissions} paperId={paperId} />
    <LinkMarkSchemeDialog open={linkOpen} onOpenChange={setLinkOpen} />
  </>
)

// ❌ Never inline table rows or dialog content directly in the shell
return (
  <Dialog>
    <DialogContent>
      <Table>
        <TableBody>
          {submissions.map((s) => <TableRow key={s.id}>...</TableRow>)}
        </TableBody>
      </Table>
    </DialogContent>
  </Dialog>
)
```

The extracted component owns everything about that table or dialog: its columns/rows, internal state (sorting, selection), loading/empty states, and the actions it exposes. The parent only passes data in and callbacks out.

---

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

Extract sub-components and hooks into sibling files rather than growing a single file past **~400 lines**. When a file approaches that limit, look for the natural seams: a self-contained visual block, a reusable hook, a group of helper functions — and split along those lines.

---

### Code Quality — Campsite Rule

Leave every file cleaner than you found it. This does not mean a full refactor on every pass — it means: fix the obvious thing, rename the unclear variable, extract the inline type that has grown a name. Small, consistent improvements compound.

**Tight scope** — every function, class, and component should do one thing. If you find yourself writing "and" in a description of what something does, split it.

**Fast by default** — tasks, tests, and LLM calls that should finish quickly must finish quickly. Never increase a timeout to accommodate slow code — fix the underlying problem instead (chunk the work, reduce payload size, parallelise). Integration tests should complete in under 30 seconds each. If an LLM structured-output call takes longer than ~20 seconds, the input is too large — chunk it and run the chunks in parallel.

**No `any`** — `any` is never acceptable. Use `unknown` when the type is genuinely unknown and narrow it explicitly, or model the type properly with Zod/TypeScript.

```ts
// ❌
function process(data: any) { ... }

// ✅ Unknown input — narrow before use
function process(data: unknown) {
  const parsed = mySchema.parse(data)
  ...
}
```

**No inline `import()` types** — never use `import("./types").Foo` in function signatures or return types. Always use a top-level `import type { Foo } from "./types"`. Inline import types are hard to read, hard to search for, and hide dependencies. The one exception is dynamic `await import()` for runtime lazy-loading — that's a different pattern and is fine.

```ts
// ❌ Inline import type in a signature
function save(): Promise<{ ok: true; data: import("./types").Result }> { ... }

// ✅ Top-level import
import type { Result } from "./types"
function save(): Promise<{ ok: true; data: Result }> { ... }
```

**Prefer Zod over type-casting** — when data crosses a boundary (API response, form input, queue payload, URL param), parse it with a Zod schema. Do not cast with `as`. A parse failure is a loud, traceable error; a bad cast is a silent bug.

```ts
// ❌ Trusting the shape without verification
const payload = event.body as JobPayload

// ✅ Parse and validate at the boundary
const payload = jobPayloadSchema.parse(JSON.parse(event.body))
```

**Named types over inline types** — give types a name when they represent a concept. Reserve inline types for genuinely trivial one-offs (a two-field internal helper that never leaves the function).

```ts
// ❌ Inline type — hard to reuse, hard to name in error messages
function render(config: { title: string; maxMarks: number; isPublic: boolean }) { ... }

// ✅ Named type
type QuestionConfig = {
  title: string
  maxMarks: number
  isPublic: boolean
}
function render(config: QuestionConfig) { ... }
```

**Sanitize inputs** — trim strings and normalise casing at the boundary (server action or form `onSubmit`) before writing to the DB or passing to the LLM. Never trust raw user input downstream.

```ts
function sanitiseMarkPoint(raw: string): string {
  return raw.trim().replace(/\s+/g, " ")
}
```

---

### Explicit Data Flow & Pure Functions

Data flows down via props; events flow up via callbacks. Avoid implicit shared mutable state.

**Pure functions are the default for all logic.** A function that takes inputs and returns outputs with no side effects is easy to test, easy to trace, and safe to call from anywhere.

```ts
// ✅ Pure — same input always produces same output, no side effects
function computePercentage(awarded: number, max: number): number {
  if (max === 0) return 0
  return Math.round((awarded / max) * 100)
}

// ❌ Impure — reads external state, harder to test
function computePercentage(): number {
  return Math.round((store.awarded / store.max) * 100)
}
```

Side effects (fetching, writing, toasts) belong at the boundary — in event handlers, `useMutation` callbacks, or server actions — not buried inside rendering logic or utility functions.

---

### Programming Style — Pragmatic OOP + Functional

The codebase uses a deliberate mix:

**Pure functions** for logic, transformations, formatters, and helpers. These should be the majority of the code. Prefer immutable data — never mutate arrays or objects in place.

```ts
// ✅ Immutable update
const updated = scripts.map((s) => s.id === id ? { ...s, name } : s)

// ❌ Mutation
scripts.find((s) => s.id === id)!.name = name
```

**Classes** for domain objects that carry both data and behaviour, especially in `packages/shared`. The `MarkerOrchestrator`, `Grader`, `DeterministicMarker`, `LlmMarker`, and `LevelOfResponseMarker` are all classes because they encapsulate strategy logic, hold injected dependencies, and have a clear lifecycle. Follow this pattern when a concept has identity, internal state, or pluggable behaviour.

```ts
// ✅ Class for a domain object with injected behaviour
class LlmMarker implements Marker {
  constructor(private grader: Grader) {}
  canMark(q: QuestionWithMarkScheme) { return q.markingMethod === "point_based" }
  async mark(q, answer) { ... }
}

// ✅ Pure function for a transformation
function normaliseQuestionNumber(raw: string): string { ... }
```

Do not use classes merely to group functions — a module (file) does that job better. Classes are for objects.

---

### Domain-Driven Design

Think in terms of domains: `exam-paper`, `marking`, `pdf-ingestion`, `batch`, `student`, `mark-scheme`. Each domain owns its types, queries, mutations, and helpers. Code that spans domains lives in `lib/` at the appropriate level.

When a concept grows complex enough to warrant its own behaviour (validation, transformation, comparison), extract it as a domain class or a dedicated module rather than spreading that logic across components.

Ask: *if this domain concept changed, how many files would I need to touch?* A good domain boundary means the answer is "one folder".

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

## Attribution Eval Suite — Required for Extract Pipeline Changes

The scan-extraction pipeline is guarded by an end-to-end eval suite in `packages/backend/tests/integration/attribution-evals.test.ts` that runs real LLM calls against frozen fixtures pulled from production scripts.

**Fixtures** live under `packages/backend/tests/integration/fixtures/attribution/` (e.g. `aaron-brown/`, `kai-jassi/`). Each fixture bundles page images + Cloud Vision tokens + typed expectations.

**Current evals** (see file for details):
1. Continuation coverage across multi-page answers.
2. Per-page tokens form a single contiguous spatial run per question (no interleaving).
3. Cover/template pages attract zero attribution.
4. Dense multi-answer pages distribute tokens across each answer.
5. Every question with attributed tokens produces non-empty `answer_text`.
6. `answer_text` preserves required punctuation/substrings (opt-in, per fixture).

### Mandatory workflow

Whenever you change **any** file in `packages/backend/src/processors/student-paper-extract.ts` or the `packages/backend/src/lib/scan-extraction/` directory (attribution, OCR, tokens, MCQ resolution, spatial sort — anything the extract processor consumes):

1. **Run the suite before committing.**

   ```bash
   cd packages/backend
   AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
     bunx vitest run tests/integration/attribution-evals.test.ts
   ```

   All 9 runnable evals must be green. Skipped evals are fine (they're guarded per-fixture).

2. **Add a fixture when a real-world paper reveals a gap.** When testing through the web UI surfaces an anomaly (missing punctuation, misattributed continuation, collapsed dense answers, mis-assigned cover page, etc.), capture that submission's pages + tokens as a new fixture and add the specific assertion that would have caught it. Use existing fixtures as the template — seed metadata in `fixture.ts`, put page JPEGs and `tokens.json` alongside.

3. **Pull fixture data from Neon via MCP** — use `mcp__Neon__run_sql` with the snake_case table names (`student_submissions`, `student_paper_page_tokens`). Strip `question_id` from tokens before writing `tokens.json` — that's what the pipeline is being tested on.

4. **Tighten thresholds, don't loosen them.** If the model improves, ratchet `minTokens`/`minCoverage` upward so we don't silently regress. If it regresses, fix the prompt/pipeline — don't relax the eval.

5. **No mocking.** These are intentionally real LLM calls. Flakiness is signal, not noise.

---

## Infrastructure (SST v4)

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
- Schema sync: `bun db:push` (pushes schema to DB without migrations — use `--accept-data-loss` or `--force-reset` when needed)
- **Do NOT use `bun db:migrate`** — this project uses `db:push` not Prisma Migrate
- Studio: `bun db:studio`

Never import runtime values from `@mcp-gcse/db` into client components — only `import type`.

### Querying via Neon MCP

Use the `mcp__Neon__run_sql` tool to query the database directly. Key things to know:

**Project & org:**
- `NEON_PROJECT_ID`: `snowy-bar-65699801`
- `NEON_ORG_ID`: `org-ancient-mud-15177616`

**Branching:** Each SST stage gets its own Neon branch (see `infra/database.ts`). Production uses the `main` branch; dev/PR stages create named branches where the branch **name** equals the SST stage (e.g. `stuartbourhill`). The Neon MCP `branchId` parameter requires the branch **ID** (e.g. `br-round-dawn-abu36m2h`), not the name. To find the right branch:
1. Try running the query without `branchId` first (hits the default/main branch).
2. If the data isn't there, use `mcp__Neon__list_branch_computes` to list all branches and their IDs, then try each until you find the one with the data.

**Table & column naming:** Prisma models use PascalCase (`StudentSubmission`) but all tables are mapped to **snake_case** in Postgres via `@@map()`. Always use the snake_case table names in SQL:

| Prisma model | Postgres table |
|---|---|
| `StudentSubmission` | `student_submissions` |
| `StudentPaperPageToken` | `student_paper_page_tokens` |
| `StudentPaperAnswerRegion` | `student_paper_answer_regions` |
| `StudentPaperAnnotation` | `student_paper_annotations` |
| `ExamPaper` | `exam_papers` |
| `Question` | `questions` |
| `MarkScheme` | `mark_schemes` |
| `Answer` | `answers` |
| `MarkingResult` | `marking_results` |
| `OcrRun` | `ocr_runs` |
| `GradingRun` | `grading_runs` |
| `BatchIngestJob` | `batch_ingest_jobs` |
| `PdfIngestionJob` | `pdf_ingestion_jobs` |

Column names are already snake_case in the Prisma schema — use them as-is in SQL (e.g. `exam_paper_id`, `marking_job_id`, `question_number`).

---

## MCP Server

`packages/backend/src/mcp-server.ts` exposes an MCP (Model Context Protocol) server for AI tooling integrations. Each tool lives in `packages/backend/src/tools/<tool-name>/` with:

- `schema.ts` — Zod input schema
- `tool.ts` — handler (`tool(Schema, async (args) => text(...))`)

Register in `mcp-server.ts` via `server.registerTool(...)`.

---

## Commands

```bash
AWS_PROFILE=deepmark npx sst dev          # SST dev mode (Next.js + Lambda local)
AWS_PROFILE=deepmark npx sst deploy --stage=production    # Deploy production
AWS_PROFILE=deepmark npx sst deploy --stage=development   # Deploy development
bun build            # Turborepo full build
bun typecheck        # Type-check all packages
bun check            # Biome lint + format check
bun fix              # Biome auto-fix

bun db:generate      # Regenerate Prisma client
bun db:push          # Push schema to DB (no migrations)
bun db:studio        # Open Prisma Studio

bun test:unit                    # Unit tests (packages/backend)
bun test:integration             # All integration tests (requires SST env via sst shell)
# Filter by project: --project backend:integration, --project web:integration
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
