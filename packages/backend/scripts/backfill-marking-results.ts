/**
 * One-shot backfill: populate `answers` + `marking_results` rows for every
 * already-graded current submission, using the per-question grade payload
 * the projection Lambda has already mirrored onto `grading_runs.grading_results`.
 *
 * Why this exists: when the projection Lambda gained `writeMarkingResults`,
 * the doc snapshot is the trigger — but submissions that were graded BEFORE
 * the deploy haven't been touched since, so no S3 PutObject event fires and
 * their normalised rows stay empty. The marketing homepage counter (and any
 * future per-question analytics) needs them to exist on day one.
 *
 * The grading_results JSON is the same shape `writeMarkingResults` consumes
 * (it's what `deriveGradingResultsFromDoc` produces; the projection writes
 * it onto the column on every snapshot). Reusing it saves us re-deriving
 * from the Yjs binary just to throw away most of the work.
 *
 * NOTE on legacy data: `GradingResult.mark_scheme_id` was added to the
 * editor's derivation as part of the same refactor that introduced this
 * script. Submissions whose `grading_runs.grading_results` JSON was written
 * by the OLD derivation will not have `mark_scheme_id` populated, and
 * `writeMarkingResults` skips rows with null mark_scheme_id (the schema
 * requires it on MarkingResult). For those, the path is to trigger a
 * fresh snapshot of each Yjs doc — opening it in a teacher's tab, or
 * making any edit via Hocuspocus, will fire the projection Lambda which
 * rewrites the JSON column with the new shape and the rows then exist.
 * Dry-run output makes this visible: "12 grading_results, 12 skipped for
 * null mark_scheme_id" means the JSON column needs a refresh first.
 *
 * Run via SST shell so `Resource.*` is populated:
 *
 *   AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
 *     bun packages/backend/scripts/backfill-marking-results.ts [flags]
 *
 * Flags:
 *   --dry-run            log the projection plan per submission, no DB writes
 *   --limit N            cap iterations (smoke testing the script itself)
 *   --submission-id ID   process exactly one submission
 *   --include-superseded back-fill superseded submissions too (off by default)
 */

import { db } from "@/db"
import { writeMarkingResults } from "@/processors/annotation-projection"
import type { GradingResult } from "@mcp-gcse/shared"

// ─── Args ───────────────────────────────────────────────────────────────────

type Flags = {
	dryRun: boolean
	limit?: number
	submissionId?: string
	includeSuperseded: boolean
}

function parseFlags(argv: string[]): Flags {
	let dryRun = false
	let limit: number | undefined
	let submissionId: string | undefined
	let includeSuperseded = false
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === "--dry-run") {
			dryRun = true
		} else if (a === "--limit") {
			const next = argv[++i]
			limit = Number(next)
			if (Number.isNaN(limit)) {
				throw new Error(`--limit requires a number, got ${JSON.stringify(next)}`)
			}
		} else if (a === "--submission-id") {
			submissionId = argv[++i]
		} else if (a === "--include-superseded") {
			includeSuperseded = true
		} else {
			throw new Error(`Unknown flag: ${a}`)
		}
	}
	return { dryRun, limit, submissionId, includeSuperseded }
}

const flags = parseFlags(process.argv.slice(2))

// ─── Main ───────────────────────────────────────────────────────────────────

async function listCandidates(): Promise<
	Array<{ submission_id: string; grading_results: GradingResult[] }>
> {
	const rows = await db.gradingRun.findMany({
		where: {
			status: "complete",
			grading_results: { not: null },
			...(flags.submissionId
				? { submission_id: flags.submissionId }
				: flags.includeSuperseded
					? {}
					: { submission: { is: { superseded_at: null } } }),
		},
		select: {
			submission_id: true,
			grading_results: true,
			created_at: true,
		},
		orderBy: { created_at: "desc" },
		take: flags.limit,
	})

	// One submission may have multiple grading runs (re-marks). Take the most
	// recent run per submission — the projection treats `(submission, question)`
	// as the unique key and the latest run wins.
	const seen = new Set<string>()
	const out: Array<{ submission_id: string; grading_results: GradingResult[] }> = []
	for (const r of rows) {
		if (seen.has(r.submission_id)) continue
		seen.add(r.submission_id)
		const results = r.grading_results as GradingResult[] | null
		if (!results || !Array.isArray(results) || results.length === 0) continue
		out.push({ submission_id: r.submission_id, grading_results: results })
	}
	return out
}

async function main(): Promise<void> {
	console.log(`[backfill-marking-results] Starting`, {
		dryRun: flags.dryRun,
		limit: flags.limit,
		submissionId: flags.submissionId,
		includeSuperseded: flags.includeSuperseded,
	})

	const candidates = await listCandidates()
	console.log(
		`[backfill-marking-results] ${candidates.length} candidate submissions`,
	)

	let projected = 0
	let withRows = 0
	for (const c of candidates) {
		const projectableCount = c.grading_results.filter(
			(r) => r.mark_scheme_id != null,
		).length

		if (flags.dryRun) {
			console.log(
				`[dry-run] ${c.submission_id} → would project ${projectableCount} rows ` +
					`(${c.grading_results.length} grading_results, ${c.grading_results.length - projectableCount} skipped for null mark_scheme_id)`,
			)
		} else {
			await writeMarkingResults(c.submission_id, c.grading_results)
			console.log(
				`[backfill] ${c.submission_id} → projected ${projectableCount} rows`,
			)
			if (projectableCount > 0) withRows++
		}
		projected += projectableCount
	}

	console.log(`[backfill-marking-results] Done.`, {
		dryRun: flags.dryRun,
		submissionsProcessed: candidates.length,
		submissionsWithProjectedRows: flags.dryRun ? null : withRows,
		totalRowsProjected: projected,
	})
}

main()
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
	.then(() => process.exit(0))
