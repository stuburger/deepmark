import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Resource } from "sst"
import { GoogleGenAI, Type } from "@google/genai"
import { db } from "@/db"
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

const QUESTION_PAPER_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		questions: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					question_text: { type: Type.STRING },
					question_type: {
						type: Type.STRING,
						description: "written | multiple_choice",
					},
					total_marks: { type: Type.INTEGER },
					question_number: { type: Type.STRING },
				},
				required: ["question_text", "total_marks"],
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
		paper_number: { type: Type.INTEGER, nullable: true },
	},
	required: ["title", "subject", "exam_board", "total_marks", "duration_minutes"],
}

function parseJobIdFromKey(key: string): string {
	const decoded = decodeURIComponent(key)
	const parts = decoded.split("/")
	if (parts.length < 4 || parts[0] !== "pdfs" || parts[1] !== "question-papers") {
		throw new Error(`Unexpected question-paper S3 key format: ${key}`)
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

export async function handler(
	event: SqsEvent,
): Promise<{ batchItemFailures?: { itemIdentifier: string }[] }> {
	const failures: { itemIdentifier: string }[] = []
	const gemini = new GoogleGenAI({ apiKey: Resource.GeminiApiKey.value })

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
				if (job.document_type !== "question_paper") {
					console.warn(`Job ${jobId} is not question_paper, skipping`)
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

			if (job.document_type !== "question_paper" || !job.subject) {
				console.warn(`Job ${jobId} invalid for question paper processing (missing subject or wrong type)`)
				await db.pdfIngestionJob.update({
					where: { id: jobId },
					data: { status: "failed" as ScanStatus, error: "Question paper job missing required subject" },
				})
				continue
			}

			const subject = job.subject
			const examBoard = job.exam_board
			const uploadedBy = job.uploaded_by

			await db.pdfIngestionJob.update({
				where: { id: jobId },
				data: {
					attempt_count: { increment: 1 },
					status: "processing" as ScanStatus,
					error: null,
				},
			})

			const pdfBase64 = await getPdfBase64(bucket, key)

			const [questionsResponse, metadataResponse] = await Promise.all([
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
									text: "Extract all questions from this exam paper. For each question provide: question_text (the full question text), question_type (written or multiple_choice), total_marks (marks available), and question_number if visible. Do not include mark scheme or answers.",
								},
							],
						},
					],
					config: {
						responseMimeType: "application/json",
						responseSchema: QUESTION_PAPER_SCHEMA,
						temperature: 0.2,
					},
				}),
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
									text: "From the document header or cover, extract: title (exam paper title), subject, exam_board, total_marks, duration_minutes, year if visible, and paper_number if visible. Return only these fields.",
								},
							],
						},
					],
					config: {
						responseMimeType: "application/json",
						responseSchema: EXAM_PAPER_METADATA_SCHEMA,
						temperature: 0.1,
					},
				}),
			])

			const questionsText = questionsResponse.text
			if (!questionsText) throw new Error("No questions response from Gemini")

			const parsed = JSON.parse(questionsText) as {
				questions?: Array<{
					question_text: string
					question_type?: string
					total_marks: number
					question_number?: string
				}>
			}

			type DetectedMetadata = {
				title?: string
				subject?: string
				exam_board?: string
				total_marks?: number
				duration_minutes?: number
				year?: number | null
				paper_number?: number | null
			}
			let detectedMetadata: DetectedMetadata | null = null
			if (metadataResponse.text) {
				try {
					detectedMetadata = JSON.parse(metadataResponse.text) as DetectedMetadata
				} catch {
					// ignore
				}
			}

			for (let i = 0; i < (parsed.questions?.length ?? 0); i++) {
				const q = parsed.questions?.[i]
				if (!q) continue

				const questionText = q.question_text
				const embeddingVec = await embedText(questionText)
				const vecStr = embeddingToVectorStr(embeddingVec)

				const newQuestion = await db.question.create({
					data: {
						text: questionText,
						topic: subject,
						created_by_id: uploadedBy,
						subject,
						points: q.total_marks,
						question_type: q.question_type === "multiple_choice" ? "multiple_choice" : "written",
						multiple_choice_options: [],
						source_pdf_ingestion_job_id: jobId,
						origin: "question_paper",
					},
				})

				await db.$executeRaw`
					UPDATE questions SET embedding = (${vecStr}::text)::vector WHERE id = ${newQuestion.id}
				`
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
			console.error("Question paper PDF processor error:", err)
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
