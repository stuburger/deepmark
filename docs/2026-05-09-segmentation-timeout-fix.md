# Session Summary — PDF segmentation timeout fix

Date: 2026-05-09
Working branch: `main` (local, uncommitted at end of session)
Trigger: Geoff's 214-page Year 9 Business batch failed 4× in production over 6 hours.

## The journey

### What we observed

Production batch `cmoyloil0000002jp8fn0xg5r` (exam paper `cmoya3byz000002jqbls97bn8`) failed
four separate times across the day, every attempt with the same error:

```
LLM call 'pdf-script-segmentation' exceeded wall-clock timeout of 90000ms
```

Pulling `job_events` from each failed run showed the same shape every time:

| Phase | Duration |
|---|---|
| pages_extracted (PDF → JPEG, 214 pages) | ~5s |
| vision_progress (Cloud Vision OCR, 214 pages) | ~22s |
| LLM segmentation (one Gemini structured-output call) | **exactly 90s, then dies** |

### The mistake I almost made

My first diagnosis was textbook CLAUDE.md: "If an LLM structured-output call takes longer
than ~20 seconds, the input is too large — chunk it and run the chunks in parallel." I was
about to propose ripping out the single-call segmentation in favour of chunked parallel
calls.

Stuart pushed back: chunked segmentation had been deliberately removed earlier because it
was unreliable — chunks lost the cross-page context needed to decide "is this page 4 of
the same student or page 1 of a new one?" The single-doc approach was correct; only the
budget was wrong.

He also volunteered a contradictory data point: he'd seen segmentation succeed on a
**700-page** batch (GWAUGH, May 6). If the input-size hypothesis were right, 700 pages
would have failed long before 214.

### The data dive that flipped the framing

I built an integration eval (`packages/backend/tests/integration/segmentation-evals.test.ts`
already existed for two y10 hand-labelled fixtures; this just adds a third) using Geoff's
actual source PDF and compared it side-by-side with the GWAUGH 700-page run via an
`onSegmentationMetrics` instrumentation callback I added to `SegmentPdfScriptsOptions`:

| Metric | Geoff (214p) | GWAUGH (700p) |
|---|---|---|
| Pages | 214 | 700 |
| Blank pages | 31 (14.5%) | 0 (0%) |
| Prompt chars | 219,899 | 524,361 |
| Input tokens | 54,543 | **147,046** |
| Output tokens | 11,946 | 17,533 |
| Scripts produced | 26 | 25 |
| **LLM wall-clock** | **43,168 ms** | **51,905 ms** |
| **ms per input token** | **0.79** | **0.35** |

The 700-page input is 2.7× more tokens but only 1.2× slower. **Per-token, Geoff's PDF is
2.3× slower** despite being a third the size. The "page count" framing was misleading; the
real driver is content shape:

1. **Pattern uniformity.** GWAUGH is exactly 28 pages × 25 students. Bone-perfect uniform —
   the model almost certainly latches onto the pattern in the first few pages and stops
   doing per-page reasoning. Geoff's PDF is mostly 8 pages × 23 students plus 10 pages × 3
   outliers — *almost* uniform, requiring real boundary detection.
2. **Blank pages add reasoning load.** Geoff has 31 blanks scattered through; GWAUGH has 0.
   The prompt instructs the model to assign each blank to the *preceding* student, so each
   blank is a "which student does this belong to" decision.

### The deeper insight

Across all the runs we saw across this session and prod, Gemini latency variance was huge
for both inputs:

- GWAUGH: 16s (prod, May 6) → 52s (eval, today)
- Geoff: 43s (eval) → 95s+ (prod, four times in a row)

The 90s default sat *right inside* Geoff's variance band — it caught him most of the time
but not always. GWAUGH's faster baseline meant 90s never caught it, masking the same
underlying tail behaviour. We were running with one second of margin instead of two minutes.

### Side observation: a wrong diagnosis I retracted mid-session

I'd flagged "abort signal is dropped at the segment-script call site" as a compounding bug
(callback signature missing the 4th `signal` arg). The eval re-run showed
`"signalForwarded":true` in the runner's timeout log — the abort *is* being plumbed
through `withTimeout`. The call-site signature is missing `signal` for documentation
purposes, but the actual cancellation path works. Bullet retracted.

## What shipped

### Production fix

**`packages/backend/src/lib/script-ingestion/segment-script.ts`** —
Added `getRemainingTimeMs?: () => number` to `SegmentPdfScriptsOptions`. When provided,
computes the segmentation LLM budget as `Math.max(DEFAULT_LLM_TIMEOUT_MS, remaining −
10_000)`. When omitted (tests, web server actions, anywhere outside an SQS Lambda), the
runner uses its 90s default unchanged. Also added `onSegmentationMetrics?` callback for
the kind of comparison we just did — costs nothing when unwired, useful next time
something here gets weird.

**`packages/backend/src/lib/script-ingestion/source-file-processing.ts`** —
`processSourceFile` accepts `opts.getRemainingTimeMs` and threads it into
`segmentPdfScripts`.

**`packages/backend/src/processors/batch-classify.ts`** —
SQS handler accepts the Lambda `Context` as the optional 2nd arg, wraps
`context.getRemainingTimeInMillis` as a closure, passes it through to
`classifyBatch` → `processSourceFile` → `segmentPdfScripts`.

**`infra/queues.ts`** —
Added `{ batch: { size: 1 } }` to `batchClassifyQueue.subscribe(...)`. Without this the
Lambda-aware budget calculation is meaningless once a second message lands in the same
invocation. Same shape and reasoning as the existing student paper queues.

**`packages/shared/src/llm/runner.ts`** —
Expanded the comment on `DEFAULT_LLM_TIMEOUT_MS = 90_000` to articulate why we keep the
90s default as a canary even after raising one specific call site:

> The vast majority of our LLM calls finish in well under 30s; a call that runs past 90s
> is almost always genuinely stuck (model loop, upstream throttling, network blackhole)
> and burning money for no return. The pre-launch operating mode treats wasted LLM seconds
> as money flowing out of the founder's pocket, so the floor stays tight to fail those
> fast. Outliers go through opt-in `timeoutMs` overrides at the call site.

### Behaviour matrix (after the fix)

| Caller | Lambda Context? | Remaining ms | Effective LLM budget |
|---|---|---|---|
| SQS handler in prod | ✅ | > 100,000 | `remaining − 10,000` |
| SQS handler in prod | ✅ | < 100,000 | clamped to 90,000 floor |
| Vitest integration test | ❌ | — | runner default 90,000 (or test's stub) |
| Web server action / dev | ❌ | — | runner default 90,000 |

In prod for a single Geoff-shaped batch, segmentation now starts with ~210s remaining
after extract+Vision finishes, so it gets ~200s of LLM budget — more than 2× the 95s it
actually needs in the worst observed case.

### Eval coverage

**`packages/backend/tests/integration/segmentation-evals.test.ts`** —
Bumped hook timeout 2 min → 6 min so the LLM error propagates cleanly instead of getting
swallowed by a hook timeout. Filtered FIXTURES through `AVAILABLE_FIXTURES` so missing
gitignored PDFs skip gracefully on clean checkouts. Added scratch capture-to-/tmp for
future hand-labelling. Added a `getRemainingTimeMs: () => 240_000` stub in `beforeAll` so
the eval has the same headroom prod has — without it, slow runs on Geoff's fixture would
flap against the 90s default.

**`packages/backend/tests/integration/fixtures/segmentation/geoff-business-y9-214.ts`** —
Hand-labelled with 26 students from the first successful eval run. Mostly 8-page chunks
with three 10-page outliers (Joshi 80→89, Kassi 90→99, Arun 116→125). Names captured as
OCR'd from handwriting — some garbled (e.g. "Bah fapi", "Algie 1574 Gorster") and
`nameContains` tokens chosen accordingly. Boundaries are NOT visually verified against
the source PDF — flagged in the docstring as a follow-up.

**`packages/backend/tests/integration/fixtures/segmentation/gwaugh-700-page.ts`** —
Structural-only guard fixture for the 700-page success case. Capture is in
`/tmp/segmentation-capture-gwaugh-700-page.json` if anyone wants to ratchet it later.

**`y10_papers/geoff-business-y9-214-page.pdf`** —
Source PDF (18 MB), committed to the repo alongside the existing y10 fixtures. Pulled
from `s3://deepmark-production-scansbucketbucket-oxttmuus/batches/cmoyloil0000002jp8fn0xg5r/source/9cbs4.pdf`.

### Final eval result

```
Test Files  1 passed (1)
Tests  8 passed | 8 skipped (16)
Duration  ~310s   ← extract + Vision + LLM for both fixtures
```

Both Geoff (43–95s LLM) and GWAUGH (16–52s LLM) green.

## What's tracked separately

**[DEE-62: BatchClassifyQueue: missing DLQ + bounded retries](https://linear.app/deepmark/issue/DEE-62/batchclassifyqueue-missing-dlq-bounded-retries)** —
Geoff's failure also exposed that `batchClassifyQueue` has no DLQ and no `dlq.retry` cap.
The 30-min `prelaunchRetention` cap bounds the bleeding, but the message redelivered four
times across 6 hours, each invocation burning ~30s of Vision quota + a 90s Gemini call
before failing identically. The student paper queues already have the right shape
(`dedicated DLQ + retry: 2 + DLQ handler that marks the job failed`); batch-classify
should mirror it. Scoped to May 15 Launch, priority High.

## Open questions / future work

1. **Hand-label GWAUGH** — capture is sitting in `/tmp/segmentation-capture-gwaugh-700-page.json`.
   Currently structural-only; ratcheting to real ground truth would make it a stronger
   regression guard.

2. **Verify Geoff's boundaries visually** — the 26-student ground truth is captured-from-model,
   not eyeballed against the source. Probably right (uniform 8-page booklet template + 3
   students who used overflow), but the three 10-page outliers in particular deserve a
   manual check before treating the fixture as authoritative.

3. **Multi-source-file batches don't fit the current Lambda budget** — `classifyBatch`
   iterates source PDFs sequentially. Two Geoff-shaped source files in one batch would
   exhaust the 4-min Lambda. Options when this becomes real: bump Lambda timeout (max 15
   min for non-VPC), fan out per source, or reject oversized batches at upload. Not a
   problem today (Geoff's case was 1 source file with 214 pages); flagged for when it is.

4. **Promote `onSegmentationMetrics` to structured logging** — right now it's only used by
   the eval. If we logged input tokens / output tokens / latency to the runner's normal
   log path, we'd build an organic dataset of "what does Gemini segmentation actually
   cost" without instrumenting case-by-case.

## Reference: actual production data that drove the diagnosis

```sql
-- Failed batches against the affected exam paper
SELECT id, status, error, created_at
FROM batch_ingest_jobs
WHERE exam_paper_id = 'cmoya3byz000002jqbls97bn8'
ORDER BY created_at DESC;

-- Per-batch event timeline (compute extract → vision → LLM phase durations)
SELECT id, status, jsonb_pretty(job_events)
FROM batch_ingest_jobs
WHERE id = 'cmoyloil0000002jp8fn0xg5r';

-- Comparison across recent batches (size + outcome)
WITH events AS (
  SELECT
    bj.id, bj.status, bj.created_at,
    (SELECT (e->>'totalPages')::int
       FROM jsonb_array_elements(bj.job_events) e
       WHERE e->>'kind' = 'source_file_started' LIMIT 1) AS total_pages,
    (SELECT (e->>'at')::timestamptz
       FROM jsonb_array_elements(bj.job_events) e
       WHERE e->>'kind' = 'vision_progress'
       ORDER BY (e->>'processed')::int DESC, (e->>'at') DESC LIMIT 1) AS vision_done_at,
    (SELECT (e->>'at')::timestamptz
       FROM jsonb_array_elements(bj.job_events) e
       WHERE e->>'kind' = 'segmentation_complete'
       ORDER BY (e->>'at') DESC LIMIT 1) AS seg_done_at,
    (SELECT (e->>'at')::timestamptz
       FROM jsonb_array_elements(bj.job_events) e
       WHERE e->>'kind' = 'failed'
       ORDER BY (e->>'at') DESC LIMIT 1) AS failed_at
  FROM batch_ingest_jobs bj
  WHERE bj.created_at > now() - interval '14 days' AND bj.job_events IS NOT NULL
)
SELECT id, status, total_pages,
       EXTRACT(EPOCH FROM (COALESCE(seg_done_at, failed_at) - vision_done_at))
         AS seg_seconds
FROM events
WHERE total_pages IS NOT NULL
ORDER BY created_at DESC;
```

That last query is the one that produced the comparison table earlier — useful to keep
around for future "is segmentation getting slower over time" questions.
