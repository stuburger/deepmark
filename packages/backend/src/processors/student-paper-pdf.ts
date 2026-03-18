import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Resource } from "sst"
import { GoogleGenAI, Type } from "@google/genai"
import { createOpenAI } from "@ai-sdk/openai"
import { db } from "@/db"
import type { ScanStatus } from "@mcp-gcse/db"
import {
	DeterministicMarker,
	Grader,
	LevelOfResponseMarker,
	LlmMarker,
	MarkerOrchestrator,
	parseMarkPointsFromPrisma,
	parseMarkingRulesFromPrisma,
	type QuestionWithMarkScheme,
} from "@mcp-gcse/shared"

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

const STUDENT_PAPER_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		student_name: { type: Type.STRING, nullable: true },
		answers: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_number: { type: Type.STRING },
					answer_text: { type: Type.STRING },
				},
				required: ["question_number", "answer_text"],
			},
		},
	},
	required: ["answers"],
}

function parseJobIdFromKey(key: string): string {
	const decoded = decodeURIComponent(key)
	const parts = decoded.split("/")
	if (parts.length < 4 || parts[0] !== "pdfs" || parts[1] !== "student-papers") {
		throw new Error(`Unexpected student-paper S3 key format: ${key}`)
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

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })
	const openai = createOpenAI({ apiKey: Resource.OpenAiApiKey.value })

	const grader = new Grader(openai("gpt-4o"), {
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
		try {
			const body = JSON.parse(record.body) as
				| { Records?: S3Record[] }
				| { job_id: string }

			let bucket: string
			let key: string
			let jobId: string

			if ("job_id" in body && typeof body.job_id === "string") {
				jobId = body.job_id
				const job = await db.pdfIngestionJob.findUniqueOrThrow({ where: { id: jobId } })
				if (job.document_type !== "student_paper") {
					console.warn(`Job ${jobId} is not student_paper, skipping`)
					continue
				}
				bucket = job.s3_bucket
				key = job.s3_key
			} else {
				const s3Event = body as { Records?: S3Record[] }
				const s3Record = s3Event.Records?.[0]
				if (!s3Record) {
					console.warn("No S3 record in message")
					continue
				}
				bucket = s3Record.s3.bucket.name
				key = decodeURIComponent(s3Record.s3.object.key)
				jobId = parseJobIdFromKey(key)
			}

			const job = await db.pdfIngestionJob.findUniqueOrThrow({ where: { id: jobId } })

			if (job.document_type !== "student_paper" || !job.exam_paper_id) {
				console.warn(`Job ${jobId} invalid for student paper processing (wrong type or missing exam_paper_id)`)
				await db.pdfIngestionJob.update({
					where: { id: jobId },
					data: { status: "failed" as ScanStatus, error: "Student paper job requires a linked exam_paper_id" },
				})
				continue
			}

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: { attempt_count: { increment: 1 }, status: "processing" as ScanStatus, error: null },
			})

			// Load all questions + mark schemes for this exam paper
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
													mark_schemes: { take: 1, orderBy: { created_at: "desc" } },
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

			// Build ordered question list with numbering
			const questionList: Array<{
				question_number: string
				question_id: string
				question_text: string
				mark_scheme: typeof examPaper.sections[0]["exam_section_questions"][0]["question"]["mark_schemes"][0] | null
				question_obj: typeof examPaper.sections[0]["exam_section_questions"][0]["question"]
			}> = []

			let questionIndex = 1
			for (const section of examPaper.sections) {
				for (const esq of section.exam_section_questions) {
					const q = esq.question
					const ms = q.mark_schemes[0] ?? null
					questionList.push({
						question_number: String(questionIndex),
						question_id: q.id,
						question_text: q.text,
						mark_scheme: ms,
						question_obj: q,
					})
					questionIndex++
				}
			}

			const pdfBase64 = await getPdfBase64(bucket, key)

			// Build prompt describing all questions so Gemini can match answers
			const questionPromptList = questionList
				.map((q) => `Question ${q.question_number}: ${q.question_text}`)
				.join("\n")

			const response = await gemini.models.generateContent({
				model: "gemini-2.5-flash",
				contents: [
					{
						role: "user",
						parts: [
							{ inlineData: { data: pdfBase64, mimeType: "application/pdf" } },
							{
								text: `This is a student's exam paper. Extract the student's name if visible on the paper.
Then, for each question below, find and extract the student's written answer exactly as written.

Questions:
${questionPromptList}

Return:
- student_name: the student's name from the paper (or empty string if not found)
- answers: array of { question_number, answer_text } for each question. Use an empty string if no answer is written.`,
							},
						],
					},
				],
				config: {
					responseMimeType: "application/json",
					responseSchema: STUDENT_PAPER_SCHEMA,
					temperature: 0.1,
				},
			})

			const responseText = response.text
			if (!responseText) throw new Error("No response from Gemini")

			const parsed = JSON.parse(responseText) as {
				student_name?: string
				answers: Array<{ question_number: string; answer_text: string }>
			}

			// Build answer lookup by question_number
			const answerMap = new Map<string, string>()
			for (const a of parsed.answers ?? []) {
				answerMap.set(a.question_number, a.answer_text)
			}

			// Grade each question
			const gradingResults: GradingResult[] = []

			for (const qItem of questionList) {
				const studentAnswer = answerMap.get(qItem.question_number) ?? ""
				const ms = qItem.mark_scheme

				if (!ms) {
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
					? rawOptions.map((o) => ({ optionLabel: o.option_label, optionText: o.option_text }))
					: undefined

				const questionWithScheme: QuestionWithMarkScheme = {
					id: qItem.question_id,
					questionType: qItem.question_obj.question_type === "multiple_choice" ? "multiple_choice" : "written",
					questionText: qItem.question_text,
					topic: qItem.question_obj.subject ?? examPaper.subject,
					rubric: ms.description,
					guidance: ms.guidance ?? null,
					totalPoints: ms.points_total,
					markPoints: parseMarkPointsFromPrisma(ms.mark_points),
					correctOptionLabels: ms.correct_option_labels?.length > 0 ? ms.correct_option_labels : undefined,
					availableOptions,
					markingMethod: (ms.marking_method as "deterministic" | "point_based" | "level_of_response") ?? undefined,
					markingRules: parseMarkingRulesFromPrisma(ms.marking_rules),
				}

				try {
					const grade = await orchestrator.mark(questionWithScheme, studentAnswer)
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
					console.error(`Grading failed for question ${qItem.question_id}:`, err)
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

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					status: "ocr_complete" as ScanStatus,
					processed_at: new Date(),
					student_name: parsed.student_name?.trim() || null,
					grading_results: gradingResults,
					error: null,
				},
			})
		} catch (err) {
			console.error("Student paper PDF processor error:", err)
			const message = err instanceof Error ? err.message : String(err)
			try {
				const b = JSON.parse(record.body) as { job_id?: string } | { Records?: S3Record[] }
				const jId =
					"job_id" in b && b.job_id
						? b.job_id
						: parseJobIdFromKey(
								(record.body && (JSON.parse(record.body) as { Records?: S3Record[] }).Records?.[0]?.s3?.object?.key) ?? "",
							)
				if (jId) {
					await db.pdfIngestionJob.update({
						where: { id: jId },
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
