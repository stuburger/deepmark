/**
 * One-shot recovery: re-enqueue OCR jobs for submissions whose OcrRun is
 * stuck in `pending` with zero events. Triggered by the silent-send-failure
 * bug in commit-service.ts (fixed alongside this script) where a single
 * SQS send error in the post-commit loop left the remaining submissions
 * pending forever.
 *
 * Usage:
 *   AWS_PROFILE=deepmark bunx sst shell --stage=production -- \
 *     bun run packages/backend/scripts/kick-stuck-ocr.ts
 *
 * Pass --submission-id=<id> to re-enqueue a specific submission only.
 * Pass --dry-run to print what would be enqueued without sending anything.
 */

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { db } from "@mcp-gcse/db"
import { Resource } from "sst"

const args = new Set(process.argv.slice(2))
const dryRun = args.has("--dry-run")
const explicitId = process.argv
	.find((a) => a.startsWith("--submission-id="))
	?.split("=")[1]

const sqs = new SQSClient({})

type StuckRow = {
	submission_id: string
	status: string
	created_at: Date
	student_name: string | null
	exam_paper_id: string | null
}

async function findStuck(): Promise<StuckRow[]> {
	if (explicitId) {
		return db.$queryRaw<StuckRow[]>`
			SELECT o.submission_id, o.status::text AS status, o.created_at,
			       s.student_name, s.exam_paper_id
			FROM ocr_runs o
			LEFT JOIN student_submissions s ON s.id = o.submission_id
			WHERE o.submission_id = ${explicitId}
		`
	}
	// "Stuck" = pending OcrRun with no recorded events. The Lambda writes the
	// first event the moment it claims the row, so an empty/null job_events
	// after creation means the message was never delivered.
	return db.$queryRaw<StuckRow[]>`
		SELECT o.submission_id, o.status::text AS status, o.created_at,
		       s.student_name, s.exam_paper_id
		FROM ocr_runs o
		LEFT JOIN student_submissions s ON s.id = o.submission_id
		WHERE o.status = 'pending'
		  AND (o.job_events IS NULL OR jsonb_array_length(o.job_events) = 0)
		ORDER BY o.created_at ASC
	`
}

async function main() {
	const stuck = await findStuck()

	if (stuck.length === 0) {
		console.log("Nothing to kick — no stuck pending OCR runs found.")
		return
	}

	console.log(`Found ${stuck.length} stuck OcrRun(s):`)
	for (const r of stuck) {
		console.log(
			`  - ${r.submission_id}  ${r.student_name ?? "?"}  paper=${
				r.exam_paper_id ?? "?"
			}  pending since ${r.created_at.toISOString()}`,
		)
	}

	if (dryRun) {
		console.log("\nDry run — exiting without sending.")
		return
	}

	for (const r of stuck) {
		await sqs.send(
			new SendMessageCommand({
				QueueUrl: Resource.StudentPaperOcrQueue.url,
				MessageBody: JSON.stringify({ job_id: r.submission_id }),
			}),
		)
		console.log(`  ✓ enqueued ${r.submission_id}`)
	}

	console.log(`\nDone — re-enqueued ${stuck.length} submission(s).`)
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err)
		process.exit(1)
	},
)
