import fixture from "../fixtures/exam-paper-abc.json"
import { db } from "./db"

export const TEST_EXAM_PAPER_ID = fixture.exam_paper.id
export const TEST_USER_ID = fixture.user.id

export async function ensureExamPaper(): Promise<void> {
	await db.user.upsert({
		where: { id: fixture.user.id },
		create: {
			id: fixture.user.id,
			email: fixture.user.email,
			name: fixture.user.name,
			role: "teacher",
			is_active: true,
		},
		update: {},
	})

	await db.examPaper.upsert({
		where: { id: fixture.exam_paper.id },
		create: {
			id: fixture.exam_paper.id,
			title: fixture.exam_paper.title,
			subject: fixture.exam_paper.subject as never,
			exam_board: fixture.exam_paper.exam_board,
			year: fixture.exam_paper.year,
			total_marks: fixture.exam_paper.total_marks,
			duration_minutes: fixture.exam_paper.duration_minutes,
			is_active: fixture.exam_paper.is_active,
			created_by_id: fixture.user.id,
		},
		update: {},
	})

	await db.examSection.upsert({
		where: { id: fixture.exam_section.id },
		create: {
			id: fixture.exam_section.id,
			exam_paper_id: fixture.exam_section.exam_paper_id,
			title: fixture.exam_section.title,
			total_marks: fixture.exam_section.total_marks,
			order: fixture.exam_section.order,
			created_by_id: fixture.user.id,
		},
		update: {},
	})

	for (const q of fixture.questions) {
		await db.question.upsert({
			where: { id: q.id },
			create: {
				id: q.id,
				text: q.text,
				topic: q.topic,
				question_type: q.question_type as never,
				question_number: q.question_number,
				points: q.points,
				multiple_choice_options: q.multiple_choice_options,
				origin: q.origin as never,
				subject: fixture.exam_paper.subject as never,
				created_by_id: fixture.user.id,
			},
			update: {},
		})
	}

	await db.markScheme.createMany({
		data: fixture.mark_schemes.map((ms) => ({
			id: ms.id,
			question_id: ms.question_id,
			description: ms.description,
			guidance: ms.guidance ?? undefined,
			points_total: ms.points_total,
			mark_points: ms.mark_points,
			correct_option_labels: ms.correct_option_labels,
			marking_method: ms.marking_method as never,
			tags: ms.tags,
			created_by_id: fixture.user.id,
		})),
		skipDuplicates: true,
	})

	await db.examSectionQuestion.createMany({
		data: fixture.exam_section_questions.map((esq) => ({
			id: esq.id,
			exam_section_id: esq.exam_section_id,
			question_id: esq.question_id,
			order: esq.order,
		})),
		skipDuplicates: true,
	})
}
