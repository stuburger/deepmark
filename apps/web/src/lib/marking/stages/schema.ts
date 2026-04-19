import { z } from "zod"
import type { JobStages } from "./types"

/**
 * Zod schemas for JobStages, used to parse the SSE payload at the client
 * boundary. Validates enum values, shape, and coerces ISO-string dates back
 * to Date objects in one pass (JSON.parse can't do the latter).
 *
 * The inferred type of `jobStagesSchema` is asserted to equal the canonical
 * `JobStages` type at compile time (see the `_SchemaMatches` assertion
 * below) — if the two drift, the build fails.
 */

const stageStatusSchema = z.enum([
	"not_started",
	"generating",
	"done",
	"failed",
	"cancelled",
])

/**
 * Accepts ISO-8601 strings (from JSON.parse of an SSE frame) and Date
 * objects (from Next.js server actions, which preserve Date natively).
 * Always outputs `Date | null`.
 */
const nullableDateSchema = z
	.union([z.string(), z.date()])
	.nullable()
	.transform((v) => {
		if (v === null) return null
		return v instanceof Date ? v : new Date(v)
	})

const stageSchema = z.object({
	status: stageStatusSchema,
	runId: z.string().nullable(),
	startedAt: nullableDateSchema,
	completedAt: nullableDateSchema,
	error: z.string().nullable(),
})

export const jobStagesSchema = z.object({
	jobId: z.string(),
	ocr: stageSchema,
	grading: stageSchema,
	annotation: stageSchema,
})

// Compile-time assertion: the inferred schema type must equal the canonical
// JobStages type. If either side adds/removes a field or changes a type,
// this line fails to compile — forcing the schema and type to stay aligned.
type _SchemaMatches = z.infer<typeof jobStagesSchema> extends JobStages
	? JobStages extends z.infer<typeof jobStagesSchema>
		? true
		: never
	: never
const _check: _SchemaMatches = true
void _check
