import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Resource } from "sst"
import { GoogleGenAI, Type } from "@google/genai"
import { createOpenAI } from "@ai-sdk/openai"
import { db } from "@/db"
import {
	runAdversarialLoop,
	probeBoundaries,
	parseMarkPointsFromPrisma,
	Grader,
	type QuestionWithMarkScheme,
} from "@mcp-gcse/shared"
import type { ScanStatus } from "@mcp-gcse/db"

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

const MARK_SCHEME_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		questions: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_text: { type: Type.STRING },
					question_type: { type: Type.STRING },
					total_marks: { type: Type.INTEGER },
					ao_breakdown: { type: Type.STRING },
					mark_points: {
						type: Type.ARRAY,
						items: {
							type: Type.OBJECT,
							properties: {
								description: { type: Type.STRING },
								criteria: { type: Type.STRING },
								points: { type: Type.INTEGER },
							},
							required: ["description", "criteria", "points"],
						},
					},
					acceptable_answers: {
						type: Type.ARRAY,
						items: { type: Type.STRING },
					},
					guidance: { type: Type.STRING },
					question_number: { type: Type.STRING },
					correct_option: { type: Type.STRING },
					marking_method: {
						type: Type.STRING,
						nullable: true,
						description:
							"multiple_choice | level_of_response | point_based",
					},
					command_word: { type: Type.STRING, nullable: true },
					items_required: { type: Type.INTEGER, nullable: true },
					levels: {
						type: Type.ARRAY,
						nullable: true,
						items: {
							type: Type.OBJECT,
							properties: {
								level: { type: Type.INTEGER },
								mark_range: {
									type: Type.ARRAY,
									items: { type: Type.INTEGER },
								},
								descriptor: { type: Type.STRING },
								ao_requirements: {
									type: Type.ARRAY,
									items: { type: Type.STRING },
									nullable: true,
								},
							},
							required: ["level", "mark_range", "descriptor"],
						},
					},
					caps: {
						type: Type.ARRAY,
						nullable: true,
						items: {
							type: Type.OBJECT,
							properties: {
								condition: { type: Type.STRING },
								max_level: { type: Type.INTEGER, nullable: true },
								max_mark: { type: Type.INTEGER, nullable: true },
								reason: { type: Type.STRING },
							},
							required: ["condition", "reason"],
						},
					},
				},
				required: ["question_text", "question_type", "total_marks", "mark_points"],
			},
		},
	},
	required: ["questions"],
}

const EXAM_PAPER_METADATA_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		title: { type: Type.STRING },
		subject: { type: Type.STRING },
		exam_board: { type: Type.STRING },
		total_marks: { type: Type.INTEGER },
		duration_minutes: { type: Type.INTEGER },
		year: { type: Type.INTEGER, nullable: true },
	},
	required: ["title", "subject", "exam_board", "total_marks", "duration_minutes"],
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

async function embedText(text: string): Promise<number[]> {
	const res = await fetch("https://api.openai.com/v1/embeddings", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${Resource.OpenAiApiKey.value}`,
		},
		body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
	})
	if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`)
	const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> }
	const vec = json.data?.[0]?.embedding
	if (!vec || !Array.isArray(vec)) throw new Error("No embedding returned")
	return vec
}

function embeddingToVectorStr(vec: number[]): string {
	return `[${vec.join(",")}]`
}

async function findMatchingQuestionId(
	examBoard: string,
	embeddingVec: number[],
): Promise<string | null> {
	const vecStr = embeddingToVectorStr(embeddingVec)
	const rows = await db.$queryRaw<{ id: string }[]>`
		SELECT q.id FROM questions q
		JOIN pdf_ingestion_jobs pij ON q.source_pdf_ingestion_job_id = pij.id
		WHERE pij.exam_board = ${examBoard}
		AND q.embedding IS NOT NULL
		ORDER BY q.embedding <=> (${vecStr}::text)::vector
		LIMIT 1
	`
	const row = rows[0]
	if (!row) return null
	const withDistance = await db.$queryRaw<{ id: string; dist: number }[]>`
		SELECT q.id, (q.embedding <=> (${vecStr}::text)::vector) as dist FROM questions q
		WHERE q.id = ${row.id}
	`
	const d = withDistance[0]?.dist
	if (d == null || Number(d) >= 0.2) return null
	return row.id
}

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })
	const bucketName = Resource.ScansBucket.name

	for (const record of event.Records) {
		const messageId = record.messageId
		try {
			const body = JSON.parse(record.body) as
				| { Records?: S3Record[] }
				| { job_id: string }

			let bucket: string
			let key: string
			let jobId: string

			if ("job_id" in body && typeof body.job_id === "string") {
				jobId = body.job_id
				const job = await db.pdfIngestionJob.findUniqueOrThrow({
					where: { id: jobId },
				})
				if (job.document_type !== "mark_scheme") {
					console.warn(`Job ${jobId} is not mark_scheme, skipping`)
					continue
				}
				bucket = job.s3_bucket
				key = job.s3_key
			} else {
				const s3Event = body as { Records?: S3Record[] }
				const s3Records = s3Event.Records ?? []
				const s3Record = s3Records[0]
				if (!s3Record) {
					console.warn("No S3 record in message")
					continue
				}
				bucket = s3Record.s3.bucket.name
				key = decodeURIComponent(s3Record.s3.object.key)
				jobId = parseJobIdFromKey(key)
			}

			const job = await db.pdfIngestionJob.findUniqueOrThrow({
				where: { id: jobId },
			})
			if (job.document_type !== "mark_scheme" || !job.subject) {
				console.warn(`Job ${jobId} invalid for mark scheme processing`)
				continue
			}

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					attempt_count: { increment: 1 },
					status: "processing" as ScanStatus,
					error: null,
				},
			})

			const pdfBase64 = await getPdfBase64(bucket, key)
			const examBoard = job.exam_board
			const subject = job.subject
			const uploadedBy = job.uploaded_by
			const autoCreateExamPaper = job.auto_create_exam_paper

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
								{
									text: "Extract all questions and their mark scheme details from this document. For each question provide question_text, question_type (written or multiple_choice), total_marks, ao_breakdown if present, mark_points (array of { description, criteria, points }), acceptable_answers if listed, guidance, question_number and correct_option for MCQ. For each question, detect marking_method: use 'multiple_choice' for MCQ, 'level_of_response' if the mark scheme uses level descriptors with mark ranges (e.g. Level 1: 1-3 marks), or 'point_based' for individual mark point criteria. If level_of_response, extract marking_method='level_of_response', command_word if given, items_required if given, levels (array of { level (number), mark_range [min, max], descriptor (text), ao_requirements (optional string array) }), and caps if any (array of { condition, max_level or max_mark, reason }).",
								},
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

			const markSchemeText = markSchemeResponse.text
			if (!markSchemeText) throw new Error("No mark scheme response from Gemini")
			const parsed = JSON.parse(markSchemeText) as {
				questions: Array<{
					question_text: string
					question_type: string
					total_marks: number
					ao_breakdown?: string
					mark_points: Array<{ description: string; criteria: string; points: number }>
					acceptable_answers?: string[]
					guidance?: string
					question_number?: string
					correct_option?: string
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
					detectedMetadata = JSON.parse(metadataResponse.text) as DetectedMetadata
				} catch {
					// ignore
				}
			}

			const openai = createOpenAI({ apiKey: Resource.OpenAiApiKey.value })
			const grader = new Grader(openai("gpt-4o"), {
				systemPrompt:
					"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Be consistent and conservative.",
			})

			for (let i = 0; i < (parsed.questions?.length ?? 0); i++) {
				const q = parsed.questions[i]
				if (!q) continue
				const questionText = q.question_text
				const embeddingVec = await embedText(questionText)
				const existingId = await findMatchingQuestionId(examBoard, embeddingVec)
				const vecStr = embeddingToVectorStr(embeddingVec)
				const markPointsPrisma = (q.mark_points ?? []).map((mp, idx) => ({
					point_number: idx + 1,
					description: mp.description,
					points: mp.points ?? 1,
					criteria: mp.criteria,
				}))
				const pointsTotal = q.total_marks ?? markPointsPrisma.reduce((s, mp) => s + mp.points, 0)
				const correctOptionLabels =
					q.question_type === "multiple_choice" && q.correct_option
						? [q.correct_option.trim()]
						: []
				const effectiveMarkingMethod: "deterministic" | "point_based" | "level_of_response" =
					q.question_type === "multiple_choice"
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
							text: questionText,
							topic: subject,
							points: pointsTotal,
							question_type: q.question_type === "multiple_choice" ? "multiple_choice" : "written",
							multiple_choice_options: q.question_type === "multiple_choice" ? [] : [],
						},
					})
					await db.$executeRaw`
						UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${existingId}
					`
					const markScheme = await db.markScheme.findFirst({
						where: { question_id: existingId },
					})
				if (markScheme) {
					await db.markScheme.update({
						where: { id: markScheme.id },
						data: {
							description: q.ao_breakdown ?? q.question_text.slice(0, 500),
							guidance: q.guidance ?? null,
							points_total: pointsTotal,
							mark_points: markPointsPrisma,
							correct_option_labels: correctOptionLabels,
							marking_method: effectiveMarkingMethod,
							marking_rules: markingRules ?? undefined,
							link_status: "auto_linked",
						},
					})
						const questionWithScheme = buildQuestionWithMarkScheme(
							existingId,
							questionText,
							subject,
							q.question_type,
							markPointsPrisma,
							pointsTotal,
							q.guidance,
							q.ao_breakdown ?? "",
							correctOptionLabels,
							effectiveMarkingMethod,
							markingRules ?? null,
						)
						const testResults = await runAdversarialLoop(
							questionWithScheme,
							grader,
							openai("gpt-4o"),
							{ targetScores: probeBoundaries(pointsTotal), maxIterations: 3 },
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
						const totalIterations = testResults.length
						await db.markScheme.update({
							where: { id: markScheme.id },
							data: {
								refined_at: new Date(),
								refinement_iterations: totalIterations,
							},
						})
					} else {
						const newMarkScheme = await db.markScheme.create({
							data: {
								question_id: existingId,
								description: q.ao_breakdown ?? questionText.slice(0, 500),
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
						const questionWithScheme = buildQuestionWithMarkScheme(
							existingId,
							questionText,
							subject,
							q.question_type,
							markPointsPrisma,
							pointsTotal,
							q.guidance,
							q.ao_breakdown ?? "",
							correctOptionLabels,
							effectiveMarkingMethod,
							markingRules ?? null,
						)
						const testResults = await runAdversarialLoop(
							questionWithScheme,
							grader,
							openai("gpt-4o"),
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
				} else {
				const newQuestion = await db.question.create({
					data: {
						text: questionText,
						topic: subject,
						created_by_id: uploadedBy,
						subject,
						points: pointsTotal,
						question_type: q.question_type === "multiple_choice" ? "multiple_choice" : "written",
						multiple_choice_options: [],
						source_pdf_ingestion_job_id: jobId,
						origin: "mark_scheme",
					},
				})
				await db.$executeRaw`
					UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${newQuestion.id}
				`
				const newMarkScheme = await db.markScheme.create({
					data: {
						question_id: newQuestion.id,
						description: q.ao_breakdown ?? questionText.slice(0, 500),
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
					const questionWithScheme = buildQuestionWithMarkScheme(
						newQuestion.id,
						questionText,
						subject,
						q.question_type,
						markPointsPrisma,
						pointsTotal,
						q.guidance,
						q.ao_breakdown ?? "",
						correctOptionLabels,
						effectiveMarkingMethod,
						markingRules ?? null,
					)
					const testResults = await runAdversarialLoop(
						questionWithScheme,
						grader,
						openai("gpt-4o"),
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

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					status: "ocr_complete" as ScanStatus,
					processed_at: new Date(),
					detected_exam_paper_metadata: detectedMetadata ?? undefined,
					error: null,
				},
			})
		} catch (err) {
			console.error("Mark scheme PDF processor error:", err)
			const message = err instanceof Error ? err.message : String(err)
			try {
				const body = JSON.parse(record.body) as { job_id?: string } | { Records?: S3Record[] }
				const jobId =
					"job_id" in body && body.job_id
						? body.job_id
						: parseJobIdFromKey(
								(record.body && (JSON.parse(record.body) as { Records?: S3Record[] }).Records?.[0]?.s3?.object?.key) ?? "",
							)
				if (jobId) {
					await db.pdfIngestionJob.update({
						where: { id: jobId },
						data: { status: "failed" as ScanStatus, error: message },
					})
				}
			} catch {
				// ignore
			}
			failures.push({ itemIdentifier: messageId })
		}
	}

	return failures.length > 0 ? { batchItemFailures: failures } : {}
}

function buildQuestionWithMarkScheme(
	questionId: string,
	questionText: string,
	topic: string,
	questionType: string,
	markPointsPrisma: Array<{ point_number: number; description: string; points: number; criteria: string }>,
	totalPoints: number,
	guidance: string | undefined,
	rubric: string,
	correctOptionLabels: string[],
	markingMethod?: "deterministic" | "point_based" | "level_of_response",
	markingRules?: {
		command_word?: string
		items_required?: number
		levels: Array<{ level: number; mark_range: [number, number]; descriptor: string; ao_requirements?: string[] }>
		caps?: Array<{ condition: string; max_level?: number; max_mark?: number; reason: string }>
	} | null,
): QuestionWithMarkScheme {
	const markPoints = parseMarkPointsFromPrisma(markPointsPrisma)
	return {
		id: questionId,
		questionType: questionType === "multiple_choice" ? "multiple_choice" : "written",
		questionText,
		topic,
		rubric,
		guidance: guidance ?? null,
		totalPoints,
		markPoints,
		correctOptionLabels: correctOptionLabels.length > 0 ? correctOptionLabels : undefined,
		availableOptions: undefined,
		markingMethod: markingMethod ?? undefined,
		markingRules: markingRules ?? undefined,
	}
}
