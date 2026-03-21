import { db } from "@/db"
import { defaultChatModel } from "@/lib/google-generative-ai"
import { logger } from "@/lib/logger"
import { ScanStatus } from "@mcp-gcse/db"
import {
	DeterministicMarker,
	Grader,
	LevelOfResponseMarker,
	LlmMarker,
	MarkerOrchestrator,
	type QuestionWithMarkScheme,
	parseMarkPointsFromPrisma,
	parseMarkingRulesFromPrisma,
} from "@mcp-gcse/shared"

const TAG = "grade-scan"

interface SqsRecord {
	messageId: string
	body: string
}

interface SqsEvent {
	Records: SqsRecord[]
}

async function upsertStudent(
	teacherId: string,
	detectedName: string | null,
): Promise<{ id: string }> {
	if (!detectedName) {
		return db.student.create({
			data: { name: "Unknown Student", teacher_id: teacherId },
		})
	}
	const existing = await db.student.findFirst({
		where: {
			teacher_id: teacherId,
			name: { equals: detectedName, mode: "insensitive" },
		},
	})
	if (existing) return existing
	return db.student.create({
		data: { name: detectedName, teacher_id: teacherId },
	})
}

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []

	const grader = new Grader(defaultChatModel(), {
		systemPrompt:
			"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Ignore spelling and grammar; focus on understanding and correct concepts. Be consistent and conservative: only award marks when there is clear evidence.",
	})
	const orchestrator = new MarkerOrchestrator([
		new DeterministicMarker(),
		new LevelOfResponseMarker(grader),
		new LlmMarker(grader),
	])

	for (const record of event.Records) {
		const messageId = record.messageId
		let scanSubmissionId: string | undefined

		try {
			const body = JSON.parse(record.body) as { scan_submission_id: string }
			scanSubmissionId = body.scan_submission_id

			if (!scanSubmissionId) {
				logger.warn(TAG, "Message missing scan_submission_id", { messageId })
				continue
			}

			logger.info(TAG, "Grading job received", {
				scanSubmissionId,
				messageId,
			})

			const submission = await db.scanSubmission.findUniqueOrThrow({
				where: { id: scanSubmissionId },
				include: {
					extracted_answers: true,
					exam_paper: {
						include: {
							sections: {
								orderBy: { order: "asc" },
								include: {
									exam_section_questions: {
										orderBy: { order: "asc" },
										include: {
											question: {
												include: {
													mark_schemes: {
														take: 1,
														orderBy: { created_at: "desc" },
													},
													question_parts: {
														orderBy: { order: "asc" },
														include: {
															mark_schemes: {
																take: 1,
																orderBy: { created_at: "desc" },
															},
														},
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
			})

			if (submission.status !== ScanStatus.extracted) {
				logger.warn(TAG, "Submission not in extracted status — skipping", {
					scanSubmissionId,
					status: submission.status,
				})
				continue
			}

			if (submission.extracted_answers.length === 0) {
				logger.warn(TAG, "No extracted answers — nothing to grade", {
					scanSubmissionId,
				})
				await db.scanSubmission.update({
					where: { id: scanSubmissionId },
					data: {
						status: ScanStatus.graded,
						processed_at: new Date(),
					},
				})
				continue
			}

			await db.scanSubmission.update({
				where: { id: scanSubmissionId },
				data: { status: ScanStatus.grading },
			})

			// Upsert Student from the detected name; use uploaded_by as teacher
			const student = await upsertStudent(
				submission.uploaded_by_id,
				submission.detected_student_name,
			)

			// Link student to submission if not already set
			if (!submission.student_id) {
				await db.scanSubmission.update({
					where: { id: scanSubmissionId },
					data: { student_id: student.id },
				})
			}

			// Build a map of question_id → { question, mark_scheme } from the exam paper
			type QuestionEntry = {
				question: (typeof submission.exam_paper.sections)[0]["exam_section_questions"][0]["question"]
				markScheme:
					| (typeof submission.exam_paper.sections)[0]["exam_section_questions"][0]["question"]["mark_schemes"][0]
					| null
				questionNumber: string
			}
			const questionMap = new Map<string, QuestionEntry>()
			let questionIndex = 1
			for (const section of submission.exam_paper.sections) {
				for (const esq of section.exam_section_questions) {
					const q = esq.question
					questionMap.set(q.id, {
						question: q,
						markScheme: q.mark_schemes[0] ?? null,
						questionNumber: String(questionIndex),
					})
					// Also map question parts
					for (const part of q.question_parts ?? []) {
						questionMap.set(`${q.id}:${part.id}`, {
							question: q,
							markScheme: part.mark_schemes[0] ?? null,
							questionNumber: `${questionIndex}${part.part_label}`,
						})
					}
					questionIndex++
				}
			}

			logger.info(TAG, "Grading extracted answers", {
				scanSubmissionId,
				extracted_count: submission.extracted_answers.length,
			})

			for (const ext of submission.extracted_answers) {
				// Skip if already linked to an answer
				if (ext.answer_id) continue

				// Look up by question_id + optional question_part_id
				const mapKey = ext.question_part_id
					? `${ext.question_id}:${ext.question_part_id}`
					: ext.question_id
				const entry = questionMap.get(mapKey)

				if (!entry) {
					logger.warn(TAG, "No question entry found for extracted answer", {
						scanSubmissionId,
						extractedAnswerId: ext.id,
						question_id: ext.question_id,
						question_part_id: ext.question_part_id,
					})
					continue
				}

				const { question, markScheme, questionNumber } = entry

				if (!markScheme) {
					logger.warn(TAG, "No mark scheme — creating ungraded answer", {
						scanSubmissionId,
						question_id: ext.question_id,
						questionNumber,
					})
					const answer = await db.answer.create({
						data: {
							question_id: ext.question_id,
							question_part_id: ext.question_part_id ?? null,
							student_id: student.id,
							student_answer: ext.extracted_text,
							max_possible_score: question.points ?? 0,
							marking_status: "failed",
							source: "scanned",
						},
					})
					await db.extractedAnswer.update({
						where: { id: ext.id },
						data: { answer_id: answer.id },
					})
					continue
				}

				const rawOptions = question.multiple_choice_options as
					| Array<{ option_label: string; option_text: string }>
					| null
					| undefined
				const availableOptions = Array.isArray(rawOptions)
					? rawOptions.map((o) => ({
							optionLabel: o.option_label,
							optionText: o.option_text,
						}))
					: undefined

				const questionWithScheme: QuestionWithMarkScheme = {
					id: question.id,
					questionType:
						question.question_type === "multiple_choice"
							? "multiple_choice"
							: "written",
					questionText: question.text,
					topic: question.subject ?? submission.exam_paper.subject,
					rubric: markScheme.description,
					guidance: markScheme.guidance ?? null,
					totalPoints: markScheme.points_total,
					markPoints: parseMarkPointsFromPrisma(markScheme.mark_points),
					correctOptionLabels:
						markScheme.correct_option_labels?.length > 0
							? markScheme.correct_option_labels
							: undefined,
					availableOptions,
					markingMethod:
						(markScheme.marking_method as
							| "deterministic"
							| "point_based"
							| "level_of_response") ?? undefined,
					markingRules: parseMarkingRulesFromPrisma(markScheme.marking_rules),
				}

				logger.info(TAG, "Grading question", {
					scanSubmissionId,
					questionNumber,
					question_id: question.id,
					marking_method: markScheme.marking_method,
				})

				let grade: Awaited<ReturnType<typeof orchestrator.mark>>
				try {
					grade = await orchestrator.mark(
						questionWithScheme,
						ext.extracted_text,
					)
					logger.info(TAG, "Question graded", {
						scanSubmissionId,
						questionNumber,
						awarded: grade.totalScore,
						max: grade.maxPossibleScore,
					})
				} catch (err) {
					logger.error(TAG, "Grading failed for question", {
						scanSubmissionId,
						questionNumber,
						question_id: question.id,
						error: String(err),
					})
					const answer = await db.answer.create({
						data: {
							question_id: ext.question_id,
							question_part_id: ext.question_part_id ?? null,
							student_id: student.id,
							student_answer: ext.extracted_text,
							max_possible_score: markScheme.points_total,
							marking_status: "failed",
							source: "scanned",
						},
					})
					await db.extractedAnswer.update({
						where: { id: ext.id },
						data: { answer_id: answer.id },
					})
					continue
				}

				const answer = await db.answer.create({
					data: {
						question_id: ext.question_id,
						question_part_id: ext.question_part_id ?? null,
						student_id: student.id,
						student_answer: ext.extracted_text,
						total_score: grade.totalScore,
						max_possible_score: grade.maxPossibleScore,
						marked_at: new Date(),
						marking_status: "completed",
						source: "scanned",
					},
				})

				await db.markingResult.create({
					data: {
						answer_id: answer.id,
						mark_scheme_id: markScheme.id,
						mark_points_results:
							(grade.markPointsResults as unknown as object) ?? [],
						total_score: grade.totalScore,
						max_possible_score: grade.maxPossibleScore,
						llm_reasoning: grade.llmReasoning,
						feedback_summary: grade.feedbackSummary,
						level_awarded: grade.levelAwarded ?? null,
						why_not_next_level: grade.whyNotNextLevel ?? null,
						cap_applied: grade.capApplied ?? null,
					},
				})

				await db.extractedAnswer.update({
					where: { id: ext.id },
					data: { answer_id: answer.id },
				})
			}

			await db.scanSubmission.update({
				where: { id: scanSubmissionId },
				data: {
					status: ScanStatus.graded,
					processed_at: new Date(),
				},
			})

			logger.info(TAG, "Grading complete", { scanSubmissionId })
		} catch (err) {
			logger.error(TAG, "Grading job failed with unhandled error", {
				scanSubmissionId,
				error: String(err),
			})
			const message = err instanceof Error ? err.message : String(err)
			if (scanSubmissionId) {
				try {
					await db.scanSubmission.update({
						where: { id: scanSubmissionId },
						data: {
							status: ScanStatus.failed,
							error_message: message,
						},
					})
				} catch {
					// ignore secondary failure
				}
			}
			failures.push({ itemIdentifier: messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}
