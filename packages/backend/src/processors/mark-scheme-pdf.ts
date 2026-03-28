import { db } from "@/db"
import {
	type CancellationToken,
	createCancellationToken,
} from "@/lib/cancellation"
import { defaultChatModel, embedQuestionText } from "@/lib/google-generative-ai"
import { logger } from "@/lib/logger"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { GoogleGenAI, Type } from "@google/genai"
import type { ScanStatus } from "@mcp-gcse/db"
import {
	Grader,
	type QuestionWithMarkScheme,
	parseMarkPointsFromPrisma,
	probeBoundaries,
	runAdversarialLoop,
} from "@mcp-gcse/shared"
import { Resource } from "sst"

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
					ao_allocations: {
						type: Type.ARRAY,
						nullable: true,
						description:
							"AO codes and mark values from the 'Marks for this question:' header line. Include ONLY codes explicitly printed in the document — do NOT infer or add codes not present.",
						items: {
							type: Type.OBJECT,
							properties: {
								ao_code: {
									type: Type.STRING,
									description:
										"The AO code exactly as printed, e.g. AO1, AO2, AO3",
								},
								marks: {
									type: Type.INTEGER,
									description: "Number of marks allocated to this AO",
								},
							},
							required: ["ao_code", "marks"],
						},
					},
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
					options: {
						type: Type.ARRAY,
						nullable: true,
						description:
							"For multiple choice questions: the answer options (A, B, C, D). Only include when question_type is multiple_choice.",
						items: {
							type: Type.OBJECT,
							properties: {
								option_label: {
									type: Type.STRING,
									description: "The option label, e.g. A, B, C, D",
								},
								option_text: {
									type: Type.STRING,
									description: "The full text of this answer option",
								},
							},
							required: ["option_label", "option_text"],
						},
					},
					marking_method: {
						type: Type.STRING,
						nullable: true,
						description: "multiple_choice | level_of_response | point_based",
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
					matched_question_id: {
						type: Type.STRING,
						nullable: true,
						description:
							"The id of the matching question from the EXISTING QUESTIONS list provided in the prompt, or null if no match was found. Only set this when you are confident the question numbers and/or content match.",
					},
				},
				required: [
					"question_text",
					"question_type",
					"total_marks",
					"mark_points",
				],
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
	required: [
		"title",
		"subject",
		"exam_board",
		"total_marks",
		"duration_minutes",
	],
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

function embeddingToVectorStr(vec: number[]): string {
	return `[${vec.join(",")}]`
}

/**
 * Normalises a raw question number string to a compact canonical form
 * suitable for exact-match lookups.
 *
 * Examples:
 *   "Question 1(a)(ii)" → "1aii"
 *   "Q3b"               → "3b"
 *   "2.b"               → "2b"
 *   "1 a"               → "1a"
 */
export function normalizeQuestionNumber(raw: string): string {
	return raw
		.replace(/^(question|q)\s*/i, "") // strip leading Q / Question
		.replace(/[()[\]{} ]/g, "") // remove brackets and spaces
		.replace(/\.(?=[a-z])/gi, "") // remove dot before letter (2.b → 2b)
		.toLowerCase()
		.trim()
}

/**
 * Finds a matching question in the given exam paper using two strategies:
 *
 * 1. Exact question-number match (scoped to the paper) — most reliable.
 * 2. Embedding cosine similarity (scoped to the paper, threshold < 0.2).
 *
 * Falls back to exam_board scope only when no examPaperId is provided
 * (standalone uploads not linked to a paper).
 */
async function findMatchingQuestionId(
	examPaperId: string | null,
	examBoard: string,
	questionNumber: string | null,
	embeddingVec: number[],
): Promise<string | null> {
	// Strategy 1: exact question number match within the paper
	if (examPaperId && questionNumber) {
		const rows = await db.$queryRaw<{ id: string }[]>`
			SELECT q.id FROM questions q
			JOIN exam_section_questions esq ON esq.question_id = q.id
			JOIN exam_sections es ON es.id = esq.exam_section_id
			WHERE es.exam_paper_id = ${examPaperId}
			AND q.question_number = ${questionNumber}
			LIMIT 1
		`
		if (rows[0]) {
			return rows[0].id
		}
	}

	// Strategy 2: embedding similarity scoped to the paper (or exam_board fallback)
	const vecStr = embeddingToVectorStr(embeddingVec)

	let rows: { id: string }[]
	if (examPaperId) {
		rows = await db.$queryRaw<{ id: string }[]>`
			SELECT q.id FROM questions q
			JOIN exam_section_questions esq ON esq.question_id = q.id
			JOIN exam_sections es ON es.id = esq.exam_section_id
			WHERE es.exam_paper_id = ${examPaperId}
			AND q.embedding IS NOT NULL
			ORDER BY q.embedding <=> (${vecStr}::text)::vector
			LIMIT 1
		`
	} else {
		rows = await db.$queryRaw<{ id: string }[]>`
			SELECT q.id FROM questions q
			JOIN pdf_ingestion_jobs pij ON q.source_pdf_ingestion_job_id = pij.id
			WHERE pij.exam_board = ${examBoard}
			AND q.embedding IS NOT NULL
			ORDER BY q.embedding <=> (${vecStr}::text)::vector
			LIMIT 1
		`
	}

	const row = rows[0]
	if (!row) return null

	const withDistance = await db.$queryRaw<{ id: string; dist: number }[]>`
		SELECT q.id, (q.embedding <=> (${vecStr}::text)::vector) as dist
		FROM questions q
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
					status: "processing" as ScanStatus,
					error: null,
				},
			})

			logger.info(TAG, "Fetching PDF from S3", { jobId, bucket, key })
			const pdfBase64 = await getPdfBase64(bucket, key)
			const examBoard = job.exam_board
			const subject = job.subject
			const uploadedBy = job.uploaded_by
			const autoCreateExamPaper = job.auto_create_exam_paper

			// Fetch questions already on the paper (or recent question_paper uploads for this
			// exam_board) so Gemini can map mark scheme entries directly to existing questions
			// rather than creating duplicates.
			type ExistingQuestionContext = {
				id: string
				question_number: string | null
				text: string
				question_type: string
			}
			let existingQuestionsForContext: ExistingQuestionContext[] = []
			if (job.exam_paper_id) {
				existingQuestionsForContext = await db.$queryRaw<
					ExistingQuestionContext[]
				>`
			SELECT q.id, q.question_number, q.text, q.question_type
			FROM questions q
			JOIN exam_section_questions esq ON esq.question_id = q.id
			JOIN exam_sections es ON es.id = esq.exam_section_id
			WHERE es.exam_paper_id = ${job.exam_paper_id}
			ORDER BY esq.order
		`
			} else {
				existingQuestionsForContext = await db.$queryRaw<
					ExistingQuestionContext[]
				>`
			SELECT DISTINCT ON (q.question_number) q.id, q.question_number, q.text, q.question_type
			FROM questions q
			JOIN pdf_ingestion_jobs pij ON q.source_pdf_ingestion_job_id = pij.id
			WHERE pij.exam_board = ${examBoard}
			AND q.origin = 'question_paper'
			ORDER BY q.question_number, pij.created_at DESC
			LIMIT 60
		`
			}

			const existingQuestionsBlock =
				existingQuestionsForContext.length > 0
					? `\n\nEXISTING QUESTIONS (for matched_question_id lookup ONLY):\n${existingQuestionsForContext
							.map(
								(eq) =>
									`- id: "${eq.id}" | question_number: "${eq.question_number ?? "?"}" | text: "${eq.text.slice(0, 300)}"`,
							)
							.join(
								"\n",
							)}\n\nMATCHING INSTRUCTIONS — READ CAREFULLY:\n- For EACH extracted mark scheme entry, check whether it corresponds to one of the EXISTING QUESTIONS above (match primarily by question_number, and secondarily by content). If a match is found, set matched_question_id to that question's id. If no match is found, set matched_question_id to null.\n- CRITICAL: The existing questions list is ONLY used to populate matched_question_id. You MUST extract ALL other fields (question_text, question_type, correct_option, mark_points, marking_method, etc.) EXCLUSIVELY from the mark scheme PDF document. Do NOT use the existing questions list to influence any other field. An MCQ entry that shows only "1 C" in the PDF must still be extracted as question_type "multiple_choice" with correct_option "C" — even if the matched existing question has a long written text.`
					: ""

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
								{
									text: `Extract all questions and their mark scheme details from this document.

IMPORTANT — Multiple Choice Questions (MCQ):
Mark schemes for MCQ sections often show a table or list like "1 C  2 A  3 D ...". You MUST extract EACH numbered MCQ as a SEPARATE question entry — do NOT create a single entry for the whole MCQ section. For each MCQ entry:
- question_text: the actual question text if visible; if only a question number and correct option are shown (no question text in the mark scheme), set question_text to "Question [number]" as a placeholder
- question_type: "multiple_choice"
- question_number: the question number as a string (e.g. "1", "2", "15")
- correct_option: the correct option label (e.g. "C", "A", "D")
- total_marks: 1 (unless stated otherwise)
- marking_method: "multiple_choice"
- options: include the A/B/C/D options if the question text is visible in this document; omit if only the answer is shown

GENERAL RULES:
- Clean up all extracted text: ensure proper spacing between words, correct punctuation, and proper line breaks. Fix any OCR artefacts such as run-together words or missing spaces.
- For each written question provide: question_text, question_type ("written"), total_marks, ao_allocations if present, mark_points (array of { description, criteria, points }), acceptable_answers if listed, guidance, question_number.
- Detect marking_method: "multiple_choice" for MCQ, "level_of_response" if the mark scheme uses level descriptors with mark ranges (e.g. Level 1: 1–3 marks), or "point_based" for individual mark point criteria.
- If level_of_response: extract command_word if given, items_required if given, levels (array of { level, mark_range [min, max], descriptor, ao_requirements? }), and caps if any (array of { condition, max_level or max_mark, reason }).

MARK POINTS, GUIDANCE AND TOTAL MARKS — CRITICAL RULES:
- total_marks MUST match the mark allocation explicitly stated in the document (e.g. "(2 marks)" in the question or the sum of AO marks in the header). Never default to 1 when the document says otherwise.
- guidance MUST be populated whenever the mark scheme provides a list of acceptable answers or example responses. Copy the FULL "Answers may include" / "Possible answers" list verbatim into guidance, including any worked examples or developed answer examples.
- mark_points MUST be genuinely descriptive — never use vague placeholders like "Identification of a correct way" or "Correct answer". The criteria field must contain the actual acceptable content from the mark scheme:
  * For "1 mark for each correct [item] up to N marks" patterns: create N mark points each worth 1 mark. Set criteria to the specific list of acceptable answers from the document (e.g. "Acceptable: Mystery shoppers / Customer service surveys / Number of repeat sales / Amount of returned products / Volume of complaints / Quality control checks / Quality assurance / TQM").
  * For "1 mark identify + 1 mark develop/explain" patterns: create 2 separate mark points. First point: description="Identify [the concept]", criteria=the full list of valid identifications from the document. Second point: description="Development / explanation", criteria="Award 1 mark for a linked explanation or consequence that develops the identified point (e.g. 'which means the exact requirements of customers can be met')".
  * For calculation questions: description="Correct calculation method", criteria="Show the exact working required (e.g. step-by-step calculation shown in the mark scheme)".
  * Always copy the specific example answers, bullet-point lists, and any worked examples from the document into the criteria or guidance fields — never summarise or omit them.

AO BREAKDOWN — CRITICAL RULES:
- AQA mark schemes print a "Marks for this question:" header above the level table, e.g. "AO2 – 3 marks    AO3 – 6 marks". Extract ONLY the AO codes and mark values stated in that line as ao_allocations.
- For level_of_response questions, the right-hand column of each level's bullet points is labelled with an AO code (e.g. AO3, AO2). Copy these labels verbatim into ao_requirements for each level — include ONLY the codes that appear in the document for that level.
- NEVER invent or infer AO codes that are not explicitly printed in the mark scheme. AQA GCSE Business papers typically use only AO2 and AO3; do not add AO1 or AO4 unless they are literally present in the document.${existingQuestionsBlock}`,
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
					status: "ocr_complete" as ScanStatus,
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
						data: { status: "failed" as ScanStatus, error: message },
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

function buildQuestionWithMarkScheme(
	questionId: string,
	questionText: string,
	topic: string,
	questionType: string,
	markPointsPrisma: Array<{
		point_number: number
		description: string
		points: number
		criteria: string
	}>,
	totalPoints: number,
	guidance: string | undefined,
	rubric: string,
	correctOptionLabels: string[],
	markingMethod?: "deterministic" | "point_based" | "level_of_response",
	markingRules?: {
		command_word?: string
		items_required?: number
		levels: Array<{
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
	} | null,
): QuestionWithMarkScheme {
	const markPoints = parseMarkPointsFromPrisma(markPointsPrisma)
	return {
		id: questionId,
		questionType:
			questionType === "multiple_choice" ? "multiple_choice" : "written",
		questionText,
		topic,
		rubric,
		guidance: guidance ?? null,
		totalPoints,
		markPoints,
		correctOptionLabels:
			correctOptionLabels.length > 0 ? correctOptionLabels : undefined,
		availableOptions: undefined,
		markingMethod: markingMethod ?? undefined,
		markingRules: markingRules ?? undefined,
	}
}

/**
 * Links all questions created by a job to the given exam paper's first section.
 * Creates the section if the paper has none yet.
 * Skips questions already linked to avoid unique constraint violations (idempotent).
 */
async function linkJobQuestionsToExamPaper(
	jobId: string,
	examPaperId: string,
	uploadedBy: string,
): Promise<void> {
	const questions = await db.question.findMany({
		where: { source_pdf_ingestion_job_id: jobId },
		orderBy: { created_at: "asc" },
		select: { id: true },
	})
	if (questions.length === 0) return

	let section = await db.examSection.findFirst({
		where: { exam_paper_id: examPaperId },
		orderBy: { order: "asc" },
	})
	if (!section) {
		const paper = await db.examPaper.findUnique({
			where: { id: examPaperId },
			select: { total_marks: true },
		})
		section = await db.examSection.create({
			data: {
				exam_paper_id: examPaperId,
				title: "Section 1",
				total_marks: paper?.total_marks ?? 0,
				order: 1,
				created_by_id: uploadedBy,
			},
		})
	}

	const existingLinks = await db.examSectionQuestion.findMany({
		where: { exam_section_id: section.id },
		select: { question_id: true, order: true },
		orderBy: { order: "asc" },
	})
	const existingQuestionIds = new Set(existingLinks.map((l) => l.question_id))
	const maxOrder =
		existingLinks.length > 0
			? Math.max(...existingLinks.map((l) => l.order))
			: 0

	let orderOffset = maxOrder
	for (const q of questions) {
		if (existingQuestionIds.has(q.id)) continue
		orderOffset++
		await db.examSectionQuestion.create({
			data: {
				exam_section_id: section.id,
				question_id: q.id,
				order: orderOffset,
			},
		})
	}
}
