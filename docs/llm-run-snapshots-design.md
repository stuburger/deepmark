# LLM Run Snapshots — Design

## Problem

No record of which models were used for a given run. Can't replay a run with identical config. Can't compare runs across different models.

## Design

Two concepts per run:

- **Selected config** — the `LlmModelEntry[]` chain configured at run start (snapshot of DB state)
- **Effective config** — which model actually handled each call (including fallback info)

```ts
type LlmRunSnapshot = {
  // What was configured when the run started
  selected: Record<string, LlmModelEntry[]>  // keyed by call site key
  // What actually executed (filled in progressively as the run proceeds)
  effective: Array<{
    call_site: string
    provider: string
    model: string
    temperature: number
    was_fallback: boolean
    attempt_index: number
  }>
}
```

## Implementation Plan

1. Add `llm_snapshot Json?` column to `ocr_runs`, `grading_runs`, `enrichment_runs`
2. Create `LlmRunContext` — threaded through processors, accumulates effective entries
3. `callLlmWithFallback` reports back which model was effective (it already knows)
4. Processors snapshot selected config at start, write effective entries as calls complete
5. Re-trigger server actions read snapshot from previous run → pass to processor as override
6. `getLlmConfig` gains override path: run context → DB → defaults
7. UI: show snapshot on submission detail page, allow editing selected config before re-trigger
