import * as fs from "node:fs"
import * as path from "node:path"
import { db, uploadTestFile } from "@mcp-gcse/test-utils"
import { Resource } from "sst"
import type { FixtureSpec, FixtureToken } from "./shared-types"

export type SeededFixture = {
	tokens: Array<{
		id: string
		page_order: number
		para_index: number
		line_index: number
		word_index: number
		text_raw: string
		bbox: unknown
	}>
	pages: Array<{ key: string; order: number; mime_type: string }>
}

/**
 * Seeds all DB rows + uploads images for a fixture. Idempotent on
 * user/exam-paper/section/questions (they're cheap to leave around), creates
 * a fresh submission + fresh tokens scoped to `submissionId`.
 *
 * Tokens are inserted WITHOUT question_id — the attribution pipeline under
 * test is what populates that field.
 */
export async function seedFixture(
	fixture: FixtureSpec,
	submissionId: string,
): Promise<SeededFixture> {
	// ── user / exam paper / section ──
	await db.user.upsert({
		where: { id: fixture.userId },
		create: {
			id: fixture.userId,
			email: `test+${fixture.name}@deepmark.test`,
			name: `Eval fixture: ${fixture.name}`,
			role: "teacher",
			is_active: true,
		},
		update: {},
	})

	const totalMarks = fixture.questions.reduce((s, q) => s + q.points, 0)

	await db.examPaper.upsert({
		where: { id: fixture.examPaperId },
		create: {
			id: fixture.examPaperId,
			title: `Attribution eval — ${fixture.name}`,
			subject: "business",
			exam_board: "AQA",
			year: 2026,
			total_marks: totalMarks,
			duration_minutes: 60,
			is_active: true,
			created_by_id: fixture.userId,
		},
		update: {},
	})

	await db.examSection.upsert({
		where: { id: fixture.sectionId },
		create: {
			id: fixture.sectionId,
			exam_paper_id: fixture.examPaperId,
			title: "Section 1",
			total_marks: totalMarks,
			order: 1,
			created_by_id: fixture.userId,
		},
		update: {},
	})

	for (const [i, q] of fixture.questions.entries()) {
		await db.question.upsert({
			where: { id: q.id },
			create: {
				id: q.id,
				text: q.text,
				topic: "business",
				question_type: q.question_type,
				question_number: q.question_number,
				points: q.points,
				multiple_choice_options: q.multiple_choice_options,
				origin: "question_paper",
				subject: "business",
				created_by_id: fixture.userId,
			},
			update: {},
		})

		await db.examSectionQuestion.upsert({
			where: { id: `${fixture.sectionId}-esq-${q.question_number}` },
			create: {
				id: `${fixture.sectionId}-esq-${q.question_number}`,
				exam_section_id: fixture.sectionId,
				question_id: q.id,
				order: i + 1,
			},
			update: {},
		})
	}

	// ── images → test S3 bucket ──
	const pageKeys: Array<{ key: string; order: number; mime_type: string }> = []
	for (const page of fixture.pages) {
		const key = `test/attribution/${fixture.name}/${submissionId}/${page.image_filename}`
		const bytes = fs.readFileSync(path.join(fixture.dir, page.image_filename))
		await uploadTestFile(key, bytes, page.mime_type)
		pageKeys.push({ key, order: page.order, mime_type: page.mime_type })
	}

	// ── submission ──
	await db.studentSubmission.create({
		data: {
			id: submissionId,
			exam_paper_id: fixture.examPaperId,
			uploaded_by: fixture.userId,
			s3_key: pageKeys[0]?.key ?? "",
			s3_bucket: Resource.ScansBucket.name,
			exam_board: "AQA",
			pages: pageKeys,
		},
	})

	// ── tokens (no question_id — that's what we're testing) ──
	const tokensJson = JSON.parse(
		fs.readFileSync(path.join(fixture.dir, "tokens.json"), "utf8"),
	) as FixtureToken[]

	const tokens = await db.studentPaperPageToken.createManyAndReturn({
		data: tokensJson.map((t) => ({
			submission_id: submissionId,
			page_order: t.page_order,
			para_index: t.para_index,
			line_index: t.line_index,
			word_index: t.word_index,
			text_raw: t.text_raw,
			bbox: t.bbox,
		})),
		select: {
			id: true,
			page_order: true,
			para_index: true,
			line_index: true,
			word_index: true,
			text_raw: true,
			bbox: true,
		},
	})

	return { tokens, pages: pageKeys }
}

/**
 * Deletes per-submission data. Leaves the shared exam paper + questions
 * around — they're cheap, and keeping them avoids flapping cascade deletes
 * when multiple eval runs overlap.
 */
export async function cleanupSubmission(submissionId: string): Promise<void> {
	await db.studentPaperAnswerRegion.deleteMany({
		where: { submission_id: submissionId },
	})
	await db.studentPaperPageToken.deleteMany({
		where: { submission_id: submissionId },
	})
	await db.ocrRun.deleteMany({ where: { submission_id: submissionId } })
	await db.studentSubmission.deleteMany({ where: { id: submissionId } })
}
