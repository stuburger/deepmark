import { db } from "@/db"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/infra/cancellation"
import { defaultChatModel, embedQuestionText } from "@/lib/infra/google-generative-ai"
import { logger } from "@/lib/infra/logger"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { GoogleGenAI } from "@google/genai"
import type { ScanStatus } from "@mcp-gcse/db"
import { Grader, probeBoundaries, runAdversarialLoop } from "@mcp-gcse/shared"
import { Resource } from "sst"
import {
	buildQuestionWithMarkScheme,
	linkJobQuestionsToExamPaper,
} from "./mark-scheme-pdf/linking"
import {
	buildExistingQuestionsBlock,
	buildExtractionPrompt,
} from "./mark-scheme-pdf/prompts"
import {
	embeddingToVectorStr,
	fetchExistingQuestionsForJob,
	findMatchingQuestionId,
} from "./mark-scheme-pdf/queries"
import {
	EXAM_PAPER_METADATA_SCHEMA,
	MARK_SCHEME_SCHEMA,
} from "./mark-scheme-pdf/schema"

const TAG = "mark-scheme-pdf"

const s3 = new S3Client({})

interface S3Record {
	s3: { bucket: { name: string }; object: { key: string } }
}

interface SqsRecord {
	messageId: string
	body: string
}

interface SqsEvent {
	Records: SqsRecord[]
}

function formatAoAllocations(
	allocations: Array<{ ao_code: string; marks: number }> | undefined,
): string | undefined {
	if (!allocations?.length) return undefined
	return allocations
		.map((a) => `${a.ao_code}: ${a.marks} mark${a.marks !== 1 ? "s" : ""}`)
		.join(", ")
}

function parseJobIdFromKey(key: string): string {
	const decoded = decodeURIComponent(key)
	const parts = decoded.split("/")
	// pdfs/mark-schemes/<jobId>/document.pdf
	if (parts.length < 4 || parts[0] !== "pdfs" || parts[1] !== "mark-schemes") {
		throw new Error(`Unexpected mark-scheme S3 key format: ${key}`)
	}
	return parts[2] ?? ""
}

async function getPdfBase64(bucket: string, key: string): Promise<string> {
	const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
	const response = await s3.send(cmd)
	const body = await response.Body?.transformToByteArray()
	if (!body?.length) throw new Error("Empty S3 object")
	return Buffer.from(body).toString("base64")
}

import { normalizeQuestionNumber } from "@/lib/grading/normalize-question-number"
export { normalizeQuestionNumber }

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })
	const bucketName = Resource.ScansBucket.name

	for (const record of event.Records) {
		const messageId = record.messageId
		let cancellation: CancellationToken | undefined
		try {
			const body = JSON.parse(record.body) as
				| { Records?: S3Record[] }
				| { job_id: string }

			let bucket: string
			let key: string
			let jobId: string

			logger.info(TAG, "Message received", { messageId })

			if ("job_id" in body && typeof body.job_id === "string") {
				jobId = body.job_id
				const job = await db.pdfIngestionJob.findUniqueOrThrow({
					where: { id: jobId },
				})
				if (job.document_type !== "mark_scheme") {
					logger.warn(TAG, "Job is not mark_scheme — skipping", {
						jobId,
						document_type: job.document_type,
					})
					continue
				}
				bucket = job.s3_bucket
				key = job.s3_key
			} else {
				const s3Event = body as { Records?: S3Record[] }
				const s3Records = s3Event.Records ?? []
				const s3Record = s3Records[0]
				if (!s3Record) {
					logger.warn(TAG, "No S3 record in SQS message", { messageId })
					continue
				}
				bucket = s3Record.s3.bucket.name
				key = decodeURIComponent(s3Record.s3.object.key)
				jobId = parseJobIdFromKey(key)
				logger.info(TAG, "Triggered by S3 event", { jobId, bucket, key })
			}

			const job = await db.pdfIngestionJob.findUniqueOrThrow({
				where: { id: jobId },
			})
			if (job.document_type !== "mark_scheme" || !job.subject) {
				logger.warn(TAG, "Job invalid — wrong type or missing subject", {
					jobId,
					document_type: job.document_type,
					subject: job.subject,
				})
				continue
			}
			if (job.status === "cancelled") {
				logger.info(TAG, "Job was cancelled — skipping", { jobId })
				continue
			}

			cancellation = createCancellationToken(jobId)

			logger.info(TAG, "Job started", {
				jobId,
				subject: job.subject,
				exam_board: job.exam_board,
				attempt: job.attempt_count + 1,
				auto_create_exam_paper: job.auto_create_exam_paper,
			})

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					attempt_count: { increment: 1 },
					status: "processing" satisfies ScanStatus,
					error: null,
				},
			})

			logger.info(TAG, "Fetching PDF from S3", { jobId, bucket, key })
			const pdfBase64 = await getPdfBase64(bucket, key)
			const examBoard = job.exam_board
			const subject = job.subject
			const uploadedBy = job.uploaded_by
			const autoCreateExamPaper = job.auto_create_exam_paper

			const existingQuestionsForContext = await fetchExistingQuestionsForJob(
				job.exam_paper_id,
				examBoard,
			)

			const existingQuestionsBlock = buildExistingQuestionsBlock(
				existingQuestionsForContext,
			)

			logger.info(TAG, "Calling Gemini for mark scheme + metadata extraction", {
				jobId,
				auto_create_exam_paper: autoCreateExamPaper,
				existing_questions_in_context: existingQuestionsForContext.length,
			})
			const [markSchemeResponse, metadataResponse] = await Promise.all([
				gemini.models.generateContent({
					model: "gemini-2.5-flash",
					contents: [
						{
							role: "user",
							parts: [
								{
									inlineData: {
										data: pdfBase64,
										mimeType: "application/pdf",
									},
								},
								{ text: buildExtractionPrompt(existingQuestionsBlock) },
							],
						},
					],
					config: {
						responseMimeType: "application/json",
						responseSchema: MARK_SCHEME_SCHEMA,
						temperature: 0.2,
					},
				}),
				autoCreateExamPaper
					? gemini.models.generateContent({
							model: "gemini-2.5-flash",
							contents: [
								{
									role: "user",
									parts: [
										{
											inlineData: {
												data: pdfBase64,
												mimeType: "application/pdf",
											},
										},
										{
											text: "From the document header or cover, extract: title (exam paper title), subject, exam_board, total_marks, duration_minutes, and year if visible. Return only these fields.",
										},
									],
								},
							],
							config: {
								responseMimeType: "application/json",
								responseSchema: EXAM_PAPER_METADATA_SCHEMA,
								temperature: 0.1,
							},
						})
					: Promise.resolve(null),
			])

			logger.info(TAG, "Gemini extraction complete", { jobId })
			const markSchemeText = markSchemeResponse.text
			if (!markSchemeText)
				throw new Error("No mark scheme response from Gemini")
			const parsed = JSON.parse(markSchemeText) as {
				questions: Array<{
					question_text: string
					question_type: string
					total_marks: number
					ao_allocations?: Array<{ ao_code: string; marks: number }>
					mark_points: Array<{
						description: string
						criteria: string
						points: number
					}>
					acceptable_answers?: string[]
					guidance?: string
					question_number?: string
					correct_option?: string
					options?: Array<{ option_label: string; option_text: string }>
					marking_method?: string
					command_word?: string
					items_required?: number
					levels?: Array<{
						level: number
						mark_range: [number, number]
						descriptor: string
						ao_requirements?: string[]
					}>
					caps?: Array<{
						condition: string
						max_level?: number
						max_mark?: number
						reason: string
					}>
					matched_question_id?: string | null
				}>
			}

			type DetectedMetadata = {
				title?: string
				subject?: string
				exam_board?: string
				total_marks?: number
				duration_minutes?: number
				year?: number | null
			}
			let detectedMetadata: DetectedMetadata | null = null
			if (metadataResponse?.text) {
				try {
					detectedMetadata = JSON.parse(
						metadataResponse.text,
					) as DetectedMetadata
				} catch {
					// ignore
				}
			}

			const runAdversarialLoopEnabled = job.run_adversarial_loop

			// Only instantiate grader if the adversarial loop is enabled — it's expensive
			// and not needed for a plain extraction run.
			const grader = runAdversarialLoopEnabled
				? new Grader(defaultChatModel(), {
						systemPrompt:
							"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Be consistent and conservative.",
					})
				: null

			const questionCount = parsed.questions?.length ?? 0
			logger.info(TAG, "Processing questions from mark scheme", {
				jobId,
				question_count: questionCount,
			})

			for (let i = 0; i < questionCount; i++) {
				const q = parsed.questions[i]
				if (!q) continue

				if (cancellation.isCancelled()) {
					logger.info(TAG, "Job cancelled mid-processing — stopping loop", {
						jobId,
						question_index: i + 1,
					})
					break
				}

				const questionText = q.question_text
				const canonicalNumber = q.question_number
					? normalizeQuestionNumber(q.question_number)
					: null

				// Validate Gemini's matched_question_id against our prefetched list to
				// guard against hallucinated IDs.
				const geminiMatchedId =
					q.matched_question_id &&
					existingQuestionsForContext.some(
						(eq) => eq.id === q.matched_question_id,
					)
						? q.matched_question_id
						: null

				logger.info(TAG, "Processing question", {
					jobId,
					index: i + 1,
					total: questionCount,
					question_number: canonicalNumber,
					marking_method: q.marking_method ?? "point_based",
					gemini_matched: geminiMatchedId != null,
				})

				// Skip the embedding API call when Gemini already provided a confident
				// match — it would be wasted work and "Question N" placeholder text
				// produces a meaningless vector anyway.
				let embeddingVec: number[] = []
				let existingId: string | null = geminiMatchedId
				if (!existingId) {
					embeddingVec = await embedQuestionText(questionText)
					existingId = await findMatchingQuestionId(
						job.exam_paper_id,
						examBoard,
						canonicalNumber,
						embeddingVec,
					)
				}

				const matchMethod = geminiMatchedId
					? "gemini_context"
					: existingId && canonicalNumber
						? "question_number"
						: existingId
							? "embedding"
							: "none"
				logger.info(
					TAG,
					existingId
						? `Matched existing question via ${matchMethod}`
						: "No match — creating new question",
					{ jobId, question_index: i + 1, existing_id: existingId },
				)
				const vecStr =
					embeddingVec.length > 0 ? embeddingToVectorStr(embeddingVec) : null
				const markPointsPrisma = (q.mark_points ?? []).map((mp, idx) => ({
					point_number: idx + 1,
					description: mp.description,
					points: mp.points ?? 1,
					criteria: mp.criteria,
				}))
				const pointsTotal =
					q.total_marks ?? markPointsPrisma.reduce((s, mp) => s + mp.points, 0)

				// When Gemini matched this entry to an existing question, use the existing
				// question's authoritative question_type rather than Gemini's extraction.
				// The extraction can be contaminated by the questions-in-context block causing
				// Gemini to output "written" for an MCQ entry whose full text is now visible.
				const matchedExistingQuestion = geminiMatchedId
					? existingQuestionsForContext.find((eq) => eq.id === geminiMatchedId)
					: null
				const resolvedQuestionType =
					matchedExistingQuestion?.question_type ?? q.question_type

				const correctOptionLabels =
					resolvedQuestionType === "multiple_choice" && q.correct_option
						? [q.correct_option.trim()]
						: []
				const effectiveMarkingMethod:
					| "deterministic"
					| "point_based"
					| "level_of_response" =
					resolvedQuestionType === "multiple_choice"
						? "deterministic"
						: q.marking_method === "level_of_response"
							? "level_of_response"
							: "point_based"
				const markingRules =
					effectiveMarkingMethod === "level_of_response" &&
					q.levels &&
					q.levels.length > 0
						? {
								command_word: q.command_word,
								items_required: q.items_required,
								levels: q.levels,
								caps: q.caps?.length ? q.caps : undefined,
							}
						: undefined

				if (existingId) {
					await db.question.update({
						where: { id: existingId },
						data: {
							// Never overwrite question text from the mark scheme — the question
							// paper upload is the authoritative source of question text.
							// When Gemini matched this to an existing question, also trust its
							// existing question_type (the extraction can be contaminated by the
							// questions-in-context block). Only write question_type when we found
							// the match via the fallback path (embedding / question_number), where
							// no context was injected and the extraction is clean.
							topic: subject,
							points: pointsTotal,
							...(geminiMatchedId
								? {}
								: {
										question_type:
											q.question_type === "multiple_choice"
												? "multiple_choice"
												: "written",
									}),
							// Only overwrite options if the mark scheme actually provides them.
							// Mark scheme PDFs often only show the correct letter ("1 C") with no
							// option texts — in that case leave the question paper's options intact.
							...(resolvedQuestionType === "multiple_choice" &&
							q.options?.length
								? { multiple_choice_options: q.options }
								: {}),
							...(canonicalNumber ? { question_number: canonicalNumber } : {}),
						},
					})
					// Only refresh the embedding when we computed one (i.e. no Gemini match).
					// If Gemini matched via context we have no new embedding, and we definitely
					// don't want to clobber a good embedding with a "Question N" vector.
					if (vecStr) {
						await db.$executeRaw`
						UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${existingId}
					`
					}
					const markScheme = await db.markScheme.findFirst({
						where: { question_id: existingId },
					})
					if (markScheme) {
						await db.markScheme.update({
							where: { id: markScheme.id },
							data: {
								description:
									formatAoAllocations(q.ao_allocations) ??
									q.question_text.slice(0, 500),
								guidance: q.guidance ?? null,
								points_total: pointsTotal,
								mark_points: markPointsPrisma,
								correct_option_labels: correctOptionLabels,
								marking_method: effectiveMarkingMethod,
								marking_rules: markingRules ?? undefined,
								link_status: "auto_linked",
							},
						})
						if (runAdversarialLoopEnabled && grader) {
							const questionWithScheme = buildQuestionWithMarkScheme(
								existingId,
								questionText,
								subject,
								q.question_type,
								markPointsPrisma,
								pointsTotal,
								q.guidance,
								formatAoAllocations(q.ao_allocations) ?? "",
								correctOptionLabels,
								effectiveMarkingMethod,
								markingRules ?? null,
							)
							const testResults = await runAdversarialLoop(
								questionWithScheme,
								grader,
								defaultChatModel(),
								{
									targetScores: probeBoundaries(pointsTotal),
									maxIterations: 3,
								},
							)
							for (const tr of testResults) {
								await db.markSchemeTestRun.create({
									data: {
										mark_scheme_id: markScheme.id,
										iteration: tr.iteration,
										target_score: tr.targetScore,
										actual_score: tr.actualScore,
										delta: tr.delta,
										student_answer: tr.studentAnswer,
										grader_reasoning: tr.graderReasoning,
										schema_patch: tr.schemaPatch ?? null,
										converged: tr.converged,
										triggered_by: "pdf_pipeline",
									},
								})
							}
							await db.markScheme.update({
								where: { id: markScheme.id },
								data: {
									refined_at: new Date(),
									refinement_iterations: testResults.length,
								},
							})
						}
					} else {
						const newMarkScheme = await db.markScheme.create({
							data: {
								question_id: existingId,
								description:
									formatAoAllocations(q.ao_allocations) ??
									questionText.slice(0, 500),
								guidance: q.guidance ?? null,
								created_by_id: uploadedBy,
								tags: [],
								points_total: pointsTotal,
								mark_points: markPointsPrisma,
								correct_option_labels: correctOptionLabels,
								marking_method: effectiveMarkingMethod,
								marking_rules: markingRules ?? undefined,
								link_status: "auto_linked",
							},
						})
						if (runAdversarialLoopEnabled && grader) {
							const questionWithScheme = buildQuestionWithMarkScheme(
								existingId,
								questionText,
								subject,
								q.question_type,
								markPointsPrisma,
								pointsTotal,
								q.guidance,
								formatAoAllocations(q.ao_allocations) ?? "",
								correctOptionLabels,
								effectiveMarkingMethod,
								markingRules ?? null,
							)
							const testResults = await runAdversarialLoop(
								questionWithScheme,
								grader,
								defaultChatModel(),
								{
									targetScores: probeBoundaries(pointsTotal),
									maxIterations: 3,
								},
							)
							for (const tr of testResults) {
								await db.markSchemeTestRun.create({
									data: {
										mark_scheme_id: newMarkScheme.id,
										iteration: tr.iteration,
										target_score: tr.targetScore,
										actual_score: tr.actualScore,
										delta: tr.delta,
										student_answer: tr.studentAnswer,
										grader_reasoning: tr.graderReasoning,
										schema_patch: tr.schemaPatch ?? null,
										converged: tr.converged,
										triggered_by: "pdf_pipeline",
									},
								})
							}
							await db.markScheme.update({
								where: { id: newMarkScheme.id },
								data: {
									refined_at: new Date(),
									refinement_iterations: testResults.length,
								},
							})
						}
					}
				} else {
					const newQuestion = await db.question.create({
						data: {
							text: questionText,
							topic: subject,
							created_by_id: uploadedBy,
							subject,
							points: pointsTotal,
							question_type:
								q.question_type === "multiple_choice"
									? "multiple_choice"
									: "written",
							multiple_choice_options:
								q.question_type === "multiple_choice" && q.options?.length
									? q.options
									: [],
							source_pdf_ingestion_job_id: jobId,
							origin: "mark_scheme",
							question_number: canonicalNumber,
						},
					})
					if (vecStr) {
						await db.$executeRaw`
						UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${newQuestion.id}
					`
					}
					const newMarkScheme = await db.markScheme.create({
						data: {
							question_id: newQuestion.id,
							description: formatAoAllocations(q.ao_allocations) ?? "",
							guidance: q.guidance ?? null,
							created_by_id: uploadedBy,
							tags: [],
							points_total: pointsTotal,
							mark_points: markPointsPrisma,
							correct_option_labels: correctOptionLabels,
							marking_method: effectiveMarkingMethod,
							marking_rules: markingRules ?? undefined,
							link_status: "linked",
						},
					})
					if (runAdversarialLoopEnabled && grader) {
						const questionWithScheme = buildQuestionWithMarkScheme(
							newQuestion.id,
							questionText,
							subject,
							q.question_type,
							markPointsPrisma,
							pointsTotal,
							q.guidance,
							formatAoAllocations(q.ao_allocations) ?? "",
							correctOptionLabels,
							effectiveMarkingMethod,
							markingRules ?? null,
						)
						const testResults = await runAdversarialLoop(
							questionWithScheme,
							grader,
							defaultChatModel(),
							{ targetScores: probeBoundaries(pointsTotal), maxIterations: 3 },
						)
						for (const tr of testResults) {
							await db.markSchemeTestRun.create({
								data: {
									mark_scheme_id: newMarkScheme.id,
									iteration: tr.iteration,
									target_score: tr.targetScore,
									actual_score: tr.actualScore,
									delta: tr.delta,
									student_answer: tr.studentAnswer,
									grader_reasoning: tr.graderReasoning,
									schema_patch: tr.schemaPatch ?? null,
									converged: tr.converged,
									triggered_by: "pdf_pipeline",
								},
							})
						}
						await db.markScheme.update({
							where: { id: newMarkScheme.id },
							data: {
								refined_at: new Date(),
								refinement_iterations: testResults.length,
							},
						})
					}
				}
			}

			if (cancellation.isCancelled()) {
				logger.info(TAG, "Job was cancelled — skipping completion", { jobId })
				continue
			}

			// If the job is linked to an existing exam paper, add all created questions
			// to that paper's first section (creating the section if it doesn't exist yet).
			if (job.exam_paper_id) {
				await linkJobQuestionsToExamPaper(jobId, job.exam_paper_id, uploadedBy)
			}

			logger.info(TAG, "Job completed successfully", {
				jobId,
				question_count: questionCount,
			})
			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					status: "ocr_complete" satisfies ScanStatus,
					processed_at: new Date(),
					detected_exam_paper_metadata: detectedMetadata ?? undefined,
					error: null,
				},
			})
		} catch (err) {
			logger.error(TAG, "Job failed with unhandled error", {
				error: String(err),
			})
			const message = err instanceof Error ? err.message : String(err)
			try {
				const body = JSON.parse(record.body) as
					| { job_id?: string }
					| { Records?: S3Record[] }
				const jobId =
					"job_id" in body && body.job_id
						? body.job_id
						: parseJobIdFromKey(
								(record.body &&
									(JSON.parse(record.body) as { Records?: S3Record[] })
										.Records?.[0]?.s3?.object?.key) ??
									"",
							)
				if (jobId) {
					await db.pdfIngestionJob.update({
						where: { id: jobId },
						data: { status: "failed" satisfies ScanStatus, error: message },
					})
				}
			} catch {
				// ignore
			}
			failures.push({ itemIdentifier: messageId })
		} finally {
			cancellation?.stop()
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}
