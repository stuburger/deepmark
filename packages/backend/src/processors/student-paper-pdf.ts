import { db } from "@/db"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/cancellation"
import { defaultChatModel } from "@/lib/google-generative-ai"
import { logger } from "@/lib/logger"
import { S3Client } from "@aws-sdk/client-s3"
import type { ScanStatus } from "@mcp-gcse/db"
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

const TAG = "student-paper-pdf"

// S3 client kept for potential future use (e.g. fetching pages for re-OCR)
const _s3 = new S3Client({})

interface SqsRecord {
	messageId: string
	body: string
}

interface SqsEvent {
	Records: SqsRecord[]
}

type GradingResult = {
	question_id: string
	question_text: string
	question_number: string
	student_answer: string
	awarded_score: number
	max_score: number
	llm_reasoning: string
	feedback_summary: string
	level_awarded?: number
}

type ExtractedAnswersRaw = {
	student_name?: string | null
	answers: Array<{ question_number: string; answer_text: string }>
}

/**
 * Normalise question numbers before comparison so that "Q1a", "1 a", "1A"
 * all resolve to the same key "1a".
 */
function normaliseQNum(s: string): string {
	return s.replace(/^q/i, "").replace(/\s+/g, "").toLowerCase()
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
		let jobId: string | undefined
		let cancellation: CancellationToken | undefined

		try {
			const body = JSON.parse(record.body) as { job_id: string }
			jobId = body.job_id

			if (!jobId) {
				logger.warn(TAG, "Message missing job_id", { messageId })
				continue
			}

			logger.info(TAG, "Grading job received", { jobId, messageId })

			const job = await db.pdfIngestionJob.findUniqueOrThrow({
				where: { id: jobId },
			})

			if (job.document_type !== "student_paper") {
				logger.warn(TAG, "Job is not student_paper — skipping", {
					jobId,
					document_type: job.document_type,
				})
				continue
			}

			if (!job.exam_paper_id) {
				logger.warn(TAG, "Job has no exam_paper_id — cannot grade", { jobId })
				await db.pdfIngestionJob.update({
					where: { id: jobId },
					data: {
						status: "failed" as ScanStatus,
						error: "No exam paper selected — cannot grade",
					},
				})
				continue
			}

			if (!job.extracted_answers_raw) {
				logger.warn(TAG, "Job has no extracted_answers_raw — run OCR first", {
					jobId,
				})
				await db.pdfIngestionJob.update({
					where: { id: jobId },
					data: {
						status: "failed" as ScanStatus,
						error: "No extracted answers — run OCR before grading",
					},
				})
				continue
			}

			if (job.status === "cancelled") {
				logger.info(TAG, "Job was cancelled — skipping", { jobId })
				continue
			}

			cancellation = createCancellationToken(jobId)

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					attempt_count: { increment: 1 },
					status: "processing" as ScanStatus,
					error: null,
				},
			})

			logger.info(TAG, "Loading exam paper questions and mark schemes", {
				jobId,
				exam_paper_id: job.exam_paper_id,
			})

			const examPaper = await db.examPaper.findUniqueOrThrow({
				where: { id: job.exam_paper_id },
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
			})

			const questionList: Array<{
				question_number: string
				question_id: string
				question_text: string
				mark_scheme:
					| (typeof examPaper.sections)[0]["exam_section_questions"][0]["question"]["mark_schemes"][0]
					| null
				question_obj: (typeof examPaper.sections)[0]["exam_section_questions"][0]["question"]
			}> = []

			let questionIndex = 1
			for (const section of examPaper.sections) {
				for (const esq of section.exam_section_questions) {
					const q = esq.question
					const ms = q.mark_schemes[0] ?? null
					// Use the canonical question number from the PDF (e.g. "1a", "2bii")
					// and fall back to sequential position only when none is stored.
					questionList.push({
						question_number: q.question_number ?? String(questionIndex),
						question_id: q.id,
						question_text: q.text,
						mark_scheme: ms,
						question_obj: q,
					})
					questionIndex++
				}
			}

			logger.info(TAG, "Exam paper loaded", {
				jobId,
				question_count: questionList.length,
				questions_without_scheme: questionList.filter((q) => !q.mark_scheme)
					.length,
			})

			const extractedRaw = job.extracted_answers_raw as ExtractedAnswersRaw
			const rawAnswers = extractedRaw.answers ?? []

			// Build a normalised map for reliable lookup even when the OCR returns
			// "Q1a" or "1 A" instead of the canonical "1a".
			const answerMap = new Map<string, string>()
			for (const a of rawAnswers) {
				answerMap.set(normaliseQNum(a.question_number), a.answer_text)
			}

			// Position-based fallback: if the number of extracted answers exactly
			// matches the number of questions and every normalised question_number
			// lookup misses, map by index order instead.
			const usePositionFallback =
				rawAnswers.length === questionList.length &&
				questionList.every(
					(q) => !answerMap.has(normaliseQNum(q.question_number)),
				)

			if (usePositionFallback) {
				logger.info(
					TAG,
					"Question numbers did not match — using position-based fallback",
					{
						jobId,
						question_count: questionList.length,
					},
				)
			}

			logger.info(TAG, "Grading using pre-extracted answers", {
				jobId,
				answer_count: answerMap.size,
				position_fallback: usePositionFallback,
			})

			const gradingResults: GradingResult[] = []

			for (let qi = 0; qi < questionList.length; qi++) {
				const qItem = questionList[qi]
				if (!qItem) continue

				if (cancellation.isCancelled()) {
					logger.info(TAG, "Job cancelled mid-grading — stopping loop", {
						jobId,
						question_id: qItem.question_id,
					})
					break
				}

				const studentAnswer = usePositionFallback
					? (rawAnswers[qi]?.answer_text ?? "")
					: (answerMap.get(normaliseQNum(qItem.question_number)) ?? "")
				const ms = qItem.mark_scheme

				if (!ms) {
					logger.warn(TAG, "No mark scheme for question — skipping grade", {
						jobId,
						question_id: qItem.question_id,
						question_number: qItem.question_number,
					})
					gradingResults.push({
						question_id: qItem.question_id,
						question_text: qItem.question_text,
						question_number: qItem.question_number,
						student_answer: studentAnswer,
						awarded_score: 0,
						max_score: qItem.question_obj.points ?? 0,
						llm_reasoning: "No mark scheme available for this question.",
						feedback_summary: "No mark scheme available.",
					})
					continue
				}

				const rawOptions = qItem.question_obj.multiple_choice_options as
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
					id: qItem.question_id,
					questionType:
						qItem.question_obj.question_type === "multiple_choice"
							? "multiple_choice"
							: "written",
					questionText: qItem.question_text,
					topic: qItem.question_obj.subject ?? examPaper.subject,
					rubric: ms.description,
					guidance: ms.guidance ?? null,
					totalPoints: ms.points_total,
					markPoints: parseMarkPointsFromPrisma(ms.mark_points),
					correctOptionLabels:
						ms.correct_option_labels?.length > 0
							? ms.correct_option_labels
							: undefined,
					availableOptions,
					markingMethod:
						(ms.marking_method as
							| "deterministic"
							| "point_based"
							| "level_of_response") ?? undefined,
					markingRules: parseMarkingRulesFromPrisma(ms.marking_rules),
				}

				logger.info(TAG, "Grading question", {
					jobId,
					question_number: qItem.question_number,
					question_id: qItem.question_id,
					marking_method: ms.marking_method,
				})
				try {
					const grade = await orchestrator.mark(
						questionWithScheme,
						studentAnswer,
					)
					logger.info(TAG, "Question graded", {
						jobId,
						question_number: qItem.question_number,
						awarded: grade.totalScore,
						max: grade.maxPossibleScore,
					})
					gradingResults.push({
						question_id: qItem.question_id,
						question_text: qItem.question_text,
						question_number: qItem.question_number,
						student_answer: studentAnswer,
						awarded_score: grade.totalScore,
						max_score: grade.maxPossibleScore,
						llm_reasoning: grade.llmReasoning,
						feedback_summary: grade.feedbackSummary,
						level_awarded: grade.levelAwarded ?? undefined,
					})
				} catch (err) {
					logger.error(TAG, "Grading failed for question", {
						jobId,
						question_number: qItem.question_number,
						question_id: qItem.question_id,
						error: String(err),
					})
					gradingResults.push({
						question_id: qItem.question_id,
						question_text: qItem.question_text,
						question_number: qItem.question_number,
						student_answer: studentAnswer,
						awarded_score: 0,
						max_score: ms.points_total,
						llm_reasoning: "Grading failed.",
						feedback_summary: "Grading failed for this question.",
					})
				}
			}

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job was cancelled — skipping completion", { jobId })
				continue
			}

			const totalAwarded = gradingResults.reduce(
				(s, r) => s + r.awarded_score,
				0,
			)
			const totalMax = gradingResults.reduce((s, r) => s + r.max_score, 0)
			logger.info(TAG, "Grading job complete", {
				jobId,
				total_awarded: totalAwarded,
				total_max: totalMax,
				questions_graded: gradingResults.length,
			})

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					status: "ocr_complete" as ScanStatus,
					processed_at: new Date(),
					student_name:
						(
							job.extracted_answers_raw as ExtractedAnswersRaw
						).student_name?.trim() || job.student_name,
					grading_results: gradingResults,
					error: null,
				},
			})
		} catch (err) {
			logger.error(TAG, "Grading job failed with unhandled error", {
				jobId,
				error: String(err),
			})
			const message = err instanceof Error ? err.message : String(err)
			if (jobId) {
				try {
					await db.pdfIngestionJob.update({
						where: { id: jobId },
						data: { status: "failed" as ScanStatus, error: message },
					})
				} catch {
					// ignore
				}
			}
			failures.push({ itemIdentifier: messageId })
		} finally {
			cancellation?.stop()
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}
