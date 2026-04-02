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

### UI Components — shadcn/ui First

Always reach for a shadcn/ui component before writing a custom one. The component registry is defined in `apps/web/components.json`. Check `apps/web/src/components/ui/` before building anything from scratch — Button, Dialog, Table, Tabs, Badge, Card, Progress, Toast, etc. are all available.

When a shadcn component doesn't exist yet, add it with:

```bash
bunx shadcn@latest add <component-name>
```

Only build a custom component when shadcn genuinely cannot cover the use case (e.g. drag-and-drop canvas, bounding box overlay).

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
