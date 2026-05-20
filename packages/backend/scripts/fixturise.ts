/**
 * Capture a graded submission as a frozen JSON fixture for the annotation
 * eval suite.
 *
 * Workflow (the loop that makes evals cheap to add):
 *   1. Grade a paper in dev. Tweak by hand until the grade is what a teacher
 *      would expect.
 *   2. Run this script. It pulls every input the annotation LLM sees
 *      (student answer, mark scheme, page tokens, AO awards, etc.) and
 *      writes them to a folder under
 *      `packages/backend/tests/integration/fixtures/annotations/<name>/`.
 *   3. Commit the folder. The source submission can be deleted later — the
 *      eval is fed by the frozen JSON forever.
 *   4. Add expectations (annotationCount bounds, mustHaveSignals, etc.) by
 *      hand to the TS wrapper in the same folder.
 *   5. Add the fixture to the FIXTURES array in
 *      `tests/integration/annotation-evals.test.ts` and ship.
 *
 * Pattern is "snapshot to file at fixture-creation time", NOT "query DB at
 * test-run time". Tests stay hermetic and survive any DB state.
 *
 * Run via SST shell so `Resource.*` is populated:
 *
 *   AWS_PROFILE=deepmark bunx sst shell --stage=stuartbourhill -- \
 *     bun packages/backend/scripts/fixturise.ts \
 *       --submission <submission-id> --question <question-number> --name <fixture-name>
 *
 * Flags:
 *   --submission ID   submission to snapshot (required)
 *   --question NUM    question_number, e.g. "2" or "6a" (required)
 *   --name SLUG       output folder name, e.g. "jaufferdeen-q2" (required)
 *   --force           overwrite an existing fixture folder
 */

import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { db } from "@/db"
import type { MarkSchemeForAnnotation } from "@/lib/annotations/types"
import type { GradingResult } from "@/lib/grading/grade-questions"
import { parseMarkPointsFromPrisma } from "@mcp-gcse/shared"
import type { AoAwardRow, MarkPointResult } from "@mcp-gcse/shared"

type Args = {
	submissionId: string
	questionNumber: string
	name: string
	force: boolean
}

function parseArgs(): Args {
	const argv = process.argv.slice(2)
	const get = (flag: string): string | null => {
		const idx = argv.indexOf(flag)
		if (idx === -1 || idx === argv.length - 1) return null
		return argv[idx + 1] ?? null
	}
	const submissionId = get("--submission")
	const questionNumber = get("--question")
	const name = get("--name")
	const force = argv.includes("--force")
	if (!submissionId || !questionNumber || !name) {
		console.error(
			"Usage: bun packages/backend/scripts/fixturise.ts --submission <id> --question <num> --name <slug> [--force]",
		)
		process.exit(2)
	}
	if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name)) {
		console.error(
			`--name must be a kebab-case slug (got '${name}'). Example: jaufferdeen-q2.`,
		)
		process.exit(2)
	}
	return { submissionId, questionNumber, name, force }
}

type FixtureJson = {
	gradingResult: GradingResult
	markScheme: MarkSchemeForAnnotation | null
	levelDescriptors: string | null
	examBoard: string | null
	subject: string | null
}

async function main(): Promise<void> {
	const args = parseArgs()
	const outDir = join(
		__dirname,
		"..",
		"tests",
		"integration",
		"fixtures",
		"annotations",
		args.name,
	)
	if (existsSync(outDir) && !args.force) {
		console.error(
			`Fixture folder already exists: ${outDir}\nUse --force to overwrite.`,
		)
		process.exit(1)
	}

	const submission = await db.studentSubmission.findUnique({
		where: { id: args.submissionId },
		select: {
			id: true,
			exam_paper_id: true,
			exam_paper: {
				select: { exam_board: true, subject: true, level_descriptors: true },
			},
		},
	})
	if (!submission) {
		console.error(`Submission not found: ${args.submissionId}`)
		process.exit(1)
	}

	// Find the answer for this (submission, question_number) pair. Question is
	// linked to ExamPaper through exam_section_questions → exam_sections, so
	// we can't filter on `exam_paper_id` directly on Question. The submission
	// scopes us to one paper, so filtering by question_number alone within a
	// submission's answers is unambiguous.
	const answer = await db.answer.findFirst({
		where: {
			submission_id: args.submissionId,
			question: { question_number: args.questionNumber },
		},
		select: {
			id: true,
			question_id: true,
			student_answer: true,
			question: {
				select: {
					id: true,
					question_number: true,
					text: true,
					points: true,
					mark_schemes: {
						select: {
							id: true,
							description: true,
							guidance: true,
							marking_method: true,
							content: true,
							mark_points: true,
						},
						orderBy: { created_at: "desc" },
						take: 1,
					},
				},
			},
			marking_results: {
				orderBy: { marked_at: "desc" },
				take: 1,
				select: {
					mark_scheme_id: true,
					total_score: true,
					max_possible_score: true,
					llm_reasoning: true,
					feedback_summary: true,
					level_awarded: true,
					why_not_next_level: true,
					cap_applied: true,
					mark_points_results: true,
					ao_awards: true,
					what_went_well: true,
					even_better_if: true,
				},
			},
		},
	})
	if (!answer) {
		console.error(
			`No answer found for (submission=${args.submissionId}, question_number=${args.questionNumber}). Has the question been graded on this submission?`,
		)
		process.exit(1)
	}
	const question = answer.question
	const mr = answer.marking_results[0] ?? null
	if (!mr) {
		console.error(
			"Answer exists but has no marking_results row — paper hasn't been graded yet.",
		)
		process.exit(1)
	}

	const tokens = await db.studentPaperPageToken.findMany({
		where: { submission_id: args.submissionId, question_id: question.id },
		orderBy: [
			{ page_order: "asc" },
			{ para_index: "asc" },
			{ line_index: "asc" },
			{ word_index: "asc" },
		],
		select: {
			id: true,
			page_order: true,
			para_index: true,
			line_index: true,
			word_index: true,
			text_raw: true,
			text_corrected: true,
			bbox: true,
			confidence: true,
		},
	})
	if (tokens.length === 0) {
		console.error(
			"No page tokens found for this question. OCR may have skipped it or attribution didn't assign tokens.",
		)
		process.exit(1)
	}

	const ms = question.mark_schemes[0] ?? null
	const markScheme: MarkSchemeForAnnotation | null = ms
		? {
				description: ms.description,
				guidance: ms.guidance,
				marking_method: ms.marking_method,
				content: ms.content ?? "",
				mark_points: parseMarkPointsFromPrisma(ms.mark_points),
			}
		: null

	const gradingResult: GradingResult = {
		_v: 1,
		question_id: question.id,
		question_number: question.question_number ?? args.questionNumber,
		question_text: question.text,
		student_answer: answer.student_answer,
		awarded_score: mr.total_score,
		max_score: mr.max_possible_score,
		llm_reasoning: mr.llm_reasoning,
		feedback_summary: mr.feedback_summary,
		marking_method: ms?.marking_method ?? null,
		mark_points_results:
			(mr.mark_points_results as MarkPointResult[] | null) ?? [],
		mark_scheme_id: mr.mark_scheme_id,
		...(mr.level_awarded != null ? { level_awarded: mr.level_awarded } : {}),
		...(mr.why_not_next_level
			? { why_not_next_level: mr.why_not_next_level }
			: {}),
		...(mr.cap_applied ? { cap_applied: mr.cap_applied } : {}),
		...(Array.isArray(mr.ao_awards) && mr.ao_awards.length > 0
			? { ao_awards: mr.ao_awards as AoAwardRow[] }
			: {}),
		...(mr.what_went_well.length > 0
			? { what_went_well: mr.what_went_well }
			: {}),
		...(mr.even_better_if.length > 0
			? { even_better_if: mr.even_better_if }
			: {}),
	}

	const fixture: FixtureJson = {
		gradingResult,
		markScheme,
		levelDescriptors: submission.exam_paper.level_descriptors ?? null,
		examBoard: submission.exam_paper.exam_board ?? null,
		subject: submission.exam_paper.subject ?? null,
	}

	await mkdir(outDir, { recursive: true })
	await writeFile(
		join(outDir, "fixture.json"),
		`${JSON.stringify(fixture, null, "\t")}\n`,
		"utf-8",
	)
	await writeFile(
		join(outDir, "tokens.json"),
		`${JSON.stringify(tokens, null, "\t")}\n`,
		"utf-8",
	)

	const wrapperPath = join(outDir, "fixture.ts")
	if (!existsSync(wrapperPath) || args.force) {
		await writeFile(wrapperPath, renderWrapper(args.name), "utf-8")
	}

	console.log(`Wrote fixture '${args.name}':`)
	console.log(`  ${join(outDir, "fixture.json")}`)
	console.log(`  ${join(outDir, "tokens.json")} (${tokens.length} tokens)`)
	console.log(
		`  ${wrapperPath}${existsSync(wrapperPath) && !args.force ? " (already existed — skipped)" : ""}`,
	)
	console.log()
	console.log("Next steps:")
	console.log(
		`  1. Open ${wrapperPath} and tune \`expectations\` for this fixture.`,
	)
	console.log(
		`  2. Add ${args.name.toUpperCase().replace(/-/g, "_")}_FIXTURE to FIXTURES in tests/integration/annotation-evals.test.ts`,
	)
	console.log("  3. Run the eval suite to verify it passes.")

	await db.$disconnect()
}

function renderWrapper(name: string): string {
	const constName = `${name.toUpperCase().replace(/-/g, "_")}_FIXTURE`
	return `import { join } from "node:path"
import { loadFixtureData } from "../load-fixture"
import type { AnnotationFixtureSpec } from "../shared-types"

/**
 * ${name} — captured from a real graded submission via
 * \`bun packages/backend/scripts/fixturise.ts\`.
 *
 * The JSON file is the source of truth for the LLM-facing inputs (student
 * answer, mark scheme, grading result). Expectations below are hand-tuned —
 * they assert what the LLM should produce against this frozen input.
 */
export const ${constName}: AnnotationFixtureSpec = {
\tname: "${name}",
\tdir: join(__dirname),
\t...loadFixtureData(__dirname),
\texpectations: {
\t\t// Tune these once you've seen what the LLM actually emits against this fixture.
\t\tannotationCount: { min: 1, max: 10 },
\t},
}
`
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
