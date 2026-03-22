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
import { Output, generateText } from "ai"
import { z } from "zod"

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

type MarkPointResultEntry = {
	pointNumber: number
	awarded: boolean
	reasoning: string
	expectedCriteria?: string
	studentCovered?: string
}

type GradingResult = {
	question_id: string
	question_number: string
	question_text: string
	student_answer: string
	awarded_score: number
	max_score: number
	llm_reasoning: string
	feedback_summary: string
	level_awarded?: number
	why_not_next_level?: string
	cap_applied?: string
	mark_points_results: MarkPointResultEntry[]
	mark_scheme_id: string | null
}

type ExtractedAnswersRaw = {
	student_name?: string | null
	answers: Array<{ question_number: string; answer_text: string }>
}

/**
 * Normalise question numbers for comparison.
 * Strips a leading "Q"/"q", all whitespace, all dots, and lowercases — so
 * "Q1a", "1 a", "1A", "0.1.1", "01.1", "0.01" all collapse to a comparable
 * form before any lookup is attempted.
 */
function normaliseQNum(s: string): string {
	return s.replace(/^q/i, "").replace(/[\s.]/g, "").toLowerCase()
}

const AlignmentSchema = z.object({
	alignments: z.array(
		z.object({
			question_id: z.string(),
			answer_text: z.string(),
		}),
	),
})

/**
 * LLM fallback: aligns OCR-extracted answers to exam questions when
 * normalised string matching fails (e.g. OCR reads "0.1.2" for "01.2").
 *
 * Only called when at least one question has no normalised match AND
 * there are unconsumed OCR answers — one LLM call covers the whole paper.
 */
async function alignAnswersWithLlm(
	unmatchedQuestions: Array<{
		question_id: string
		question_number: string
		question_text: string
		question_type: string
	}>,
	allOcrAnswers: Array<{ question_number: string; answer_text: string }>,
	jobId: string,
): Promise<Map<string, string>> {
	const result = new Map<string, string>()

	const questionsText = unmatchedQuestions
		.map(
			(q) =>
				`- id: ${q.question_id} | number: ${q.question_number} | type: ${q.question_type} | text: ${q.question_text.slice(0, 120)}`,
		)
		.join("\n")

	const answersText = allOcrAnswers
		.map(
			(a) =>
				`- ocr_number: ${a.question_number} | answer: ${a.answer_text || "(blank)"}`,
		)
		.join("\n")

	const prompt = `You are aligning a student's OCR-extracted answers to the correct exam questions.
The OCR may have misread question numbers (e.g. "0.1.2" instead of "01.2", "0.01" instead of "01.1").

EXAM QUESTIONS THAT NEED ANSWERS (currently unmatched):
${questionsText}

ALL OCR-EXTRACTED ANSWERS (including already-matched ones for context):
${answersText}

For each unmatched exam question, identify the most likely student answer from the OCR outputs.
Consider: question number similarity, answer content matching question type (A/B/C/D for MCQ, text for written).
If a question genuinely has no student answer, use an empty string "".
Return the alignments array strictly matching the schema.`

	try {
		const { output } = await generateText({
			model: defaultChatModel(),
			prompt,
			// @ts-expect-error todo
			output: Output.object({ schema: AlignmentSchema }),
		})
		
		// @ts-expect-error todo
		for (const alignment of output.alignments) {
			result.set(alignment.question_id, alignment.answer_text)
		}
	} catch (err) {
		logger.error(
			TAG,
			"LLM alignment failed — unmatched questions will receive empty answers",
			{
				jobId,
				error: String(err),
			},
		)
	}

	return result
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

			// ── Pass 1: Normalised map ──────────────────────────────────────────
			// Strip Q-prefix, dots, whitespace, lowercase on both sides.
			// Handles "Q1a"→"1a", "0.1.1"→"011", "01.1"→"011", etc.
			const answerMap = new Map<string, string>()
			for (const a of rawAnswers) {
				answerMap.set(normaliseQNum(a.question_number), a.answer_text)
			}

			// Determine which questions are still unmatched after pass 1
			const unmatchedQuestions = questionList.filter(
				(q) => !answerMap.has(normaliseQNum(q.question_number)),
			)

			// Determine which OCR answers weren't consumed by any matched question
			const matchedNormKeys = new Set(
				questionList
					.filter((q) => answerMap.has(normaliseQNum(q.question_number)))
					.map((q) => normaliseQNum(q.question_number)),
			)
			const unusedOcrAnswers = rawAnswers.filter(
				(a) => !matchedNormKeys.has(normaliseQNum(a.question_number)),
			)

			// ── Pass 2: Subset positional alignment ──────────────────────────────
			// When unmatched question count equals unused OCR answer count, pair
			// them by position. Both lists are already in paper order:
			//   questionList  — built by iterating sections/questions in order
			//   rawAnswers    — OCR extracts top-to-bottom (reading order)
			// This handles "0.01"→"01.1", "0.2.1"→"02.1" etc. without any LLM.
			const positionalAlignmentMap = new Map<string, string>()
			if (
				unmatchedQuestions.length > 0 &&
				unusedOcrAnswers.length === unmatchedQuestions.length
			) {
				for (let i = 0; i < unmatchedQuestions.length; i++) {
					const q = unmatchedQuestions[i]
					const a = unusedOcrAnswers[i]
					if (q && a) positionalAlignmentMap.set(q.question_id, a.answer_text)
				}
				logger.info(TAG, "Subset positional alignment applied", {
					jobId,
					aligned_count: positionalAlignmentMap.size,
				})
			}

			// ── Pass 3: LLM alignment ────────────────────────────────────────────
			// Only reached when counts differ (student skipped a question AND
			// OCR garbled its number). One LLM call covers the whole residual.
			let llmAlignmentMap = new Map<string, string>()
			const stillUnmatched = unmatchedQuestions.filter(
				(q) => !positionalAlignmentMap.has(q.question_id),
			)
			if (stillUnmatched.length > 0 && unusedOcrAnswers.length > 0) {
				logger.info(TAG, "Triggering LLM alignment fallback", {
					jobId,
					unmatched_questions: stillUnmatched.length,
					unused_ocr_answers: unusedOcrAnswers.length,
				})
				llmAlignmentMap = await alignAnswersWithLlm(
					stillUnmatched.map((q) => ({
						question_id: q.question_id,
						question_number: q.question_number,
						question_text: q.question_text,
						question_type: q.question_obj.question_type,
					})),
					rawAnswers,
					jobId,
				)
				logger.info(TAG, "LLM alignment complete", {
					jobId,
					aligned_count: llmAlignmentMap.size,
				})
			}

			logger.info(TAG, "Grading using pre-extracted answers", {
				jobId,
				normalised_matched: answerMap.size - unmatchedQuestions.length,
				positional_aligned: positionalAlignmentMap.size,
				llm_aligned: llmAlignmentMap.size,
				still_empty: stillUnmatched.length - llmAlignmentMap.size,
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

				const studentAnswer =
					answerMap.get(normaliseQNum(qItem.question_number)) ??
					positionalAlignmentMap.get(qItem.question_id) ??
					llmAlignmentMap.get(qItem.question_id) ??
					""
				const ms = qItem.mark_scheme

				if (!ms) {
					logger.warn(TAG, "No mark scheme for question — skipping grade", {
						jobId,
						question_id: qItem.question_id,
						question_number: qItem.question_number,
					})
					gradingResults.push({
						question_id: qItem.question_id,
						question_number: qItem.question_number,
						question_text: qItem.question_text,
						student_answer: studentAnswer,
						awarded_score: 0,
						max_score: qItem.question_obj.points ?? 0,
						llm_reasoning: "No mark scheme available for this question.",
						feedback_summary: "No mark scheme available.",
						mark_points_results: [],
						mark_scheme_id: null,
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
						question_number: qItem.question_number,
						question_text: qItem.question_text,
						student_answer: studentAnswer,
						awarded_score: grade.totalScore,
						max_score: grade.maxPossibleScore,
						llm_reasoning: grade.llmReasoning,
						feedback_summary: grade.feedbackSummary,
						level_awarded: grade.levelAwarded ?? undefined,
						why_not_next_level: grade.whyNotNextLevel ?? undefined,
						cap_applied: grade.capApplied ?? undefined,
						mark_points_results:
							grade.markPointsResults as MarkPointResultEntry[],
						mark_scheme_id: ms.id,
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
						question_number: qItem.question_number,
						question_text: qItem.question_text,
						student_answer: studentAnswer,
						awarded_score: 0,
						max_score: ms.points_total,
						llm_reasoning: "Grading failed.",
						feedback_summary: "Grading failed for this question.",
						mark_points_results: [],
						mark_scheme_id: ms.id,
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

			// Persist normalised Answer + MarkingResult rows when a Student record
			// is linked to this job. Failures here are non-fatal — the JSON blob
			// already carries the results.
			const linkedStudentId = job.student_id
			if (linkedStudentId) {
				try {
					const markedAt = new Date()
					for (const r of gradingResults) {
						const answer = await db.answer.create({
							data: {
								question_id: r.question_id,
								student_id: linkedStudentId,
								student_answer: r.student_answer,
								total_score: r.awarded_score,
								max_possible_score: r.max_score,
								marking_status: "completed",
								source: "scanned",
								marked_at: markedAt,
							},
						})
						if (r.mark_scheme_id) {
							await db.markingResult.create({
								data: {
									answer_id: answer.id,
									mark_scheme_id: r.mark_scheme_id,
									mark_points_results: r.mark_points_results,
									total_score: r.awarded_score,
									max_possible_score: r.max_score,
									llm_reasoning: r.llm_reasoning,
									feedback_summary: r.feedback_summary,
									level_awarded: r.level_awarded ?? null,
									why_not_next_level: r.why_not_next_level ?? null,
									cap_applied: r.cap_applied ?? null,
								},
							})
						}
					}
					logger.info(TAG, "Answer + MarkingResult rows written", {
						jobId,
						student_id: linkedStudentId,
						count: gradingResults.length,
					})
				} catch (persistErr) {
					logger.error(
						TAG,
						"Failed to persist Answer/MarkingResult rows — non-fatal",
						{ jobId, error: String(persistErr) },
					)
				}
			}
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
