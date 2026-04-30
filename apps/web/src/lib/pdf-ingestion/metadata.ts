"use server"

import { authenticatedAction } from "@/lib/authz"
import { db } from "@/lib/db"
import {
	CopyObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import {
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	ResourceGrantRole,
	Subject,
	TierLevel,
} from "@mcp-gcse/db"
import { Output, generateText } from "ai"
import { Resource } from "sst"
import { z } from "zod"
import { typicalGradeBoundaryCreateData } from "../exam-paper/paper/grade-boundary-defaults"
import { callLlmWithFallback } from "../llm-runtime"

const s3 = new S3Client({})
const bucketName = Resource.ScansBucket.name

/**
 * Prefix that has no S3 event notifications — safe for staging uploads before
 * the teacher confirms details and triggers the real ingestion pipeline.
 */
const METADATA_TEMP_PREFIX = "pdfs/metadata-temp"

const MetadataSchema = z.object({
	title: z
		.string()
		.describe("Full exam paper title, e.g. 'AQA Biology Paper 1 Higher Tier'"),
	subject: z
		.string()
		.describe(
			"Subject as a lowercase slug: biology, chemistry, physics, english, english_literature, mathematics, history, geography, computer_science, french, spanish, religious_studies, business",
		),
	exam_board: z
		.string()
		.describe("Exam board name, e.g. AQA, OCR, Edexcel, WJEC, Cambridge"),
	year: z
		.number()
		.nullable()
		.optional()
		.describe(
			"Year the exam was sat as an integer, e.g. 2023. Null if not found.",
		),
	paper_number: z
		.number()
		.nullable()
		.optional()
		.describe(
			"Paper number as an integer (1, 2, 3…). Null if not found or not applicable.",
		),
	total_marks: z
		.number()
		.describe("Total marks available for the paper (integer)"),
	duration_minutes: z.number().describe("Allowed time in minutes (integer)"),
	document_type: z
		.string()
		.describe(
			"Type of document: 'mark_scheme' if this is a mark scheme or marking guide, 'question_paper' if this is a question paper or exam paper for students, 'exemplar' if this contains exemplar or sample student answers",
		),
	tier: z
		.string()
		.nullable()
		.optional()
		.describe(
			"Tier if printed on the cover: 'foundation' or 'higher'. Null if the paper is untiered (e.g. English, History) or the tier is not visible.",
		),
})

import type {
	DetectedPdfMetadata,
	IngestionSlot,
	PdfDocumentType,
} from "./types"
export type {
	DetectedPdfMetadata,
	IngestionSlot,
	PdfDocumentType,
} from "./types"

const subjectEnum = z.nativeEnum(Subject)
const tierEnum = z.nativeEnum(TierLevel)
const documentTypeEnum = z.enum(["mark_scheme", "exemplar", "question_paper"])

/**
 * Returns a presigned PUT URL for a temp S3 location that does NOT trigger
 * any ingestion pipeline. Use this to stage the PDF before metadata extraction.
 */
export const requestMetadataUpload = authenticatedAction.action(
	async ({ ctx }): Promise<{ url: string; s3Key: string }> => {
		const id = crypto.randomUUID()
		const s3Key = `${METADATA_TEMP_PREFIX}/${id}/document.pdf`

		const command = new PutObjectCommand({
			Bucket: bucketName,
			Key: s3Key,
			ContentType: "application/pdf",
		})
		const url = await getSignedUrl(s3, command, { expiresIn: 3600 })

		ctx.log.info("Metadata temp upload URL created", { s3Key })

		return { url, s3Key }
	},
)

/**
 * Fetches the PDF from the temp S3 key, sends it to Gemini Flash for fast
 * metadata extraction, and returns the detected fields.
 */
export const extractPdfMetadata = authenticatedAction
	.inputSchema(
		z.object({
			s3Key: z.string().refine((v) => v.startsWith(METADATA_TEMP_PREFIX), {
				message: "Invalid S3 key",
			}),
		}),
	)
	.action(
		async ({
			parsedInput: { s3Key },
			ctx,
		}): Promise<{ metadata: DetectedPdfMetadata }> => {
			ctx.log.info("extractPdfMetadata called", { s3Key })

			const cmd = new GetObjectCommand({ Bucket: bucketName, Key: s3Key })
			const response = await s3.send(cmd)
			const body = await response.Body?.transformToByteArray()
			if (!body?.length) throw new Error("Could not read uploaded PDF")
			const pdfBase64 = Buffer.from(body).toString("base64")

			const { output: raw } = await callLlmWithFallback(
				"pdf-metadata-detection",
				async (model, entry, report) => {
					const result = await generateText({
						model,
						temperature: entry.temperature,
						messages: [
							{
								role: "user",
								content: [
									{
										type: "file",
										data: pdfBase64,
										mediaType: "application/pdf",
									},
									{
										type: "text",
										text: "Look at the header, cover page, and overall structure of this document. Extract the exam paper metadata. For subject, use the lowercase slug that best matches: biology, chemistry, physics, english, english_literature, mathematics, history, geography, computer_science, french, spanish, religious_studies, or business. For document_type: use 'mark_scheme' if this is a mark scheme or marking guide, 'question_paper' if this is a question paper for students to answer, or 'exemplar' if it contains sample student answers. For tier: return 'foundation' or 'higher' only if the cover explicitly states the tier; null otherwise (untiered subjects or tier not printed).",
									},
								],
							},
						],
						output: Output.object({ schema: MetadataSchema }),
					})
					report.usage = result.usage
					return result
				},
			)

			const documentType: PdfDocumentType =
				raw.document_type === "mark_scheme" ||
				raw.document_type === "question_paper" ||
				raw.document_type === "exemplar"
					? raw.document_type
					: "question_paper"

			const tier: "foundation" | "higher" | null =
				raw.tier === "foundation" || raw.tier === "higher" ? raw.tier : null

			const metadata: DetectedPdfMetadata = {
				title: raw.title,
				subject: raw.subject,
				exam_board: raw.exam_board,
				year: raw.year ?? null,
				paper_number: raw.paper_number ?? null,
				total_marks: raw.total_marks,
				duration_minutes: raw.duration_minutes,
				document_type: documentType,
				tier,
			}

			ctx.log.info("Metadata extracted", {
				s3Key,
				subject: metadata.subject,
				exam_board: metadata.exam_board,
				document_type: metadata.document_type,
			})

			return { metadata }
		},
	)

const slotSchema = z.object({
	s3MetadataKey: z.string().refine((v) => v.startsWith(METADATA_TEMP_PREFIX), {
		message: "Invalid staging key",
	}),
	document_type: documentTypeEnum,
	run_adversarial_loop: z.boolean().optional(),
})

const createWithIngestionInput = z.object({
	s3MetadataKey: z.string().refine((v) => v.startsWith(METADATA_TEMP_PREFIX), {
		message: "Invalid staging key",
	}),
	title: z.string().trim().min(1),
	subject: subjectEnum,
	exam_board: z.string().trim().min(1),
	year: z.number().int(),
	paper_number: z.number().int().optional(),
	total_marks: z.number().int(),
	duration_minutes: z.number().int(),
	document_type: documentTypeEnum,
	tier: tierEnum.nullable().optional(),
	run_adversarial_loop: z.boolean().optional(),
})

export const createExamPaperWithIngestion = authenticatedAction
	.inputSchema(createWithIngestionInput)
	.action(
		async ({
			parsedInput: input,
			ctx,
		}): Promise<{ paperId: string; jobId: string }> => {
			const runAdversarialLoop =
				input.document_type === "mark_scheme"
					? (input.run_adversarial_loop ?? false)
					: false

			ctx.log.info("createExamPaperWithIngestion called", {
				subject: input.subject,
				exam_board: input.exam_board,
				document_type: input.document_type,
				run_adversarial_loop: runAdversarialLoop,
			})

			const paper = await db.examPaper.create({
				data: {
					title: input.title,
					subject: input.subject,
					exam_board: input.exam_board,
					year: input.year,
					paper_number: input.paper_number ?? null,
					total_marks: input.total_marks,
					duration_minutes: input.duration_minutes,
					created_by_id: ctx.user.id,
					...typicalGradeBoundaryCreateData(input.subject, input.tier),
				},
			})
			await db.resourceGrant.create({
				data: {
					resource_type: ResourceGrantResourceType.exam_paper,
					resource_id: paper.id,
					principal_type: ResourceGrantPrincipalType.user,
					principal_user_id: ctx.user.id,
					principal_email: ctx.user.email,
					role: ResourceGrantRole.owner,
					created_by: ctx.user.id,
					accepted_at: new Date(),
				},
			})

			const prefix =
				input.document_type === "mark_scheme"
					? "pdfs/mark-schemes"
					: input.document_type === "question_paper"
						? "pdfs/question-papers"
						: "pdfs/exemplars"

			const job = await db.pdfIngestionJob.create({
				data: {
					document_type: input.document_type,
					s3_key: "",
					s3_bucket: bucketName,
					status: "pending",
					uploaded_by: ctx.user.id,
					exam_board: input.exam_board,
					subject: input.subject,
					year: input.year,
					auto_create_exam_paper: false,
					run_adversarial_loop: runAdversarialLoop,
					exam_paper_id: paper.id,
				},
			})

			const destKey = `${prefix}/${job.id}/document.pdf`

			await db.pdfIngestionJob.update({
				where: { id: job.id },
				data: { s3_key: destKey },
			})

			await s3.send(
				new CopyObjectCommand({
					Bucket: bucketName,
					CopySource: `${bucketName}/${input.s3MetadataKey}`,
					Key: destKey,
					ContentType: "application/pdf",
				}),
			)

			ctx.log.info("Exam paper and ingestion job created", {
				paperId: paper.id,
				jobId: job.id,
				destKey,
				document_type: input.document_type,
			})

			return { paperId: paper.id, jobId: job.id }
		},
	)

const createWithMultipleInput = z.object({
	slots: z.array(slotSchema).min(1),
	title: z.string().trim().min(1),
	subject: subjectEnum,
	exam_board: z.string().trim().min(1),
	year: z.number().int(),
	paper_number: z.number().int().optional(),
	total_marks: z.number().int(),
	duration_minutes: z.number().int(),
	tier: tierEnum.nullable().optional(),
})

export const createExamPaperWithMultipleIngestions = authenticatedAction
	.inputSchema(createWithMultipleInput)
	.action(
		async ({
			parsedInput: input,
			ctx,
		}): Promise<{ paperId: string; jobIds: string[] }> => {
			ctx.log.info("createExamPaperWithMultipleIngestions called", {
				subject: input.subject,
				exam_board: input.exam_board,
				slot_count: input.slots.length,
				document_types: input.slots.map((s) => s.document_type),
			})

			const paper = await db.examPaper.create({
				data: {
					title: input.title,
					subject: input.subject,
					exam_board: input.exam_board,
					year: input.year,
					paper_number: input.paper_number ?? null,
					total_marks: input.total_marks,
					duration_minutes: input.duration_minutes,
					created_by_id: ctx.user.id,
					...typicalGradeBoundaryCreateData(input.subject, input.tier),
				},
			})
			await db.resourceGrant.create({
				data: {
					resource_type: ResourceGrantResourceType.exam_paper,
					resource_id: paper.id,
					principal_type: ResourceGrantPrincipalType.user,
					principal_user_id: ctx.user.id,
					principal_email: ctx.user.email,
					role: ResourceGrantRole.owner,
					created_by: ctx.user.id,
					accepted_at: new Date(),
				},
			})

			const jobIds = await Promise.all(
				input.slots.map(async (slot: IngestionSlot) => {
					const runAdversarialLoop =
						slot.document_type === "mark_scheme"
							? (slot.run_adversarial_loop ?? false)
							: false

					const prefix =
						slot.document_type === "mark_scheme"
							? "pdfs/mark-schemes"
							: slot.document_type === "question_paper"
								? "pdfs/question-papers"
								: "pdfs/exemplars"

					const job = await db.pdfIngestionJob.create({
						data: {
							document_type: slot.document_type,
							s3_key: "",
							s3_bucket: bucketName,
							status: "pending",
							uploaded_by: ctx.user.id,
							exam_board: input.exam_board,
							subject: input.subject,
							year: input.year,
							auto_create_exam_paper: false,
							run_adversarial_loop: runAdversarialLoop,
							exam_paper_id: paper.id,
						},
					})

					const destKey = `${prefix}/${job.id}/document.pdf`

					await db.pdfIngestionJob.update({
						where: { id: job.id },
						data: { s3_key: destKey },
					})

					await s3.send(
						new CopyObjectCommand({
							Bucket: bucketName,
							CopySource: `${bucketName}/${slot.s3MetadataKey}`,
							Key: destKey,
							ContentType: "application/pdf",
						}),
					)

					ctx.log.info("Ingestion job created", {
						paperId: paper.id,
						jobId: job.id,
						destKey,
						document_type: slot.document_type,
					})

					return job.id
				}),
			)

			ctx.log.info("All ingestion jobs created", {
				paperId: paper.id,
				jobIds,
			})

			return { paperId: paper.id, jobIds }
		},
	)
