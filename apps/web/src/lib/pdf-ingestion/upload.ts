"use server"

import { authenticatedAction, resourceAction } from "@/lib/authz"
import { db } from "@/lib/db"
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Subject } from "@mcp-gcse/db"
import { Resource } from "sst"
import { z } from "zod"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})

import type { PdfDocumentType } from "./types"
export type { PdfDocumentType } from "./types"

const documentTypeEnum = z.enum(["mark_scheme", "exemplar", "question_paper"])

const subjectEnum = z.nativeEnum(Subject)

const createInput = z.object({
	document_type: documentTypeEnum,
	exam_board: z.string().trim().min(1, "Exam board is required"),
	subject: subjectEnum,
	year: z.number().int().optional(),
	paper_reference: z.string().trim().optional(),
	auto_create_exam_paper: z.boolean().optional(),
	exam_paper_id: z.string().optional(),
	run_adversarial_loop: z.boolean().optional(),
})

export const createPdfIngestionUpload = authenticatedAction
	.inputSchema(createInput)
	.action(
		async ({
			parsedInput: input,
			ctx,
		}): Promise<{ jobId: string; url: string }> => {
			// If linked to an existing paper, assert editor access manually
			// (resourceAction can't be used here because exam_paper_id is optional).
			if (input.exam_paper_id) {
				const { assertExamPaperAccess } = await import("@/lib/authz")
				const access = await assertExamPaperAccess(
					ctx.user,
					input.exam_paper_id,
					"editor",
				)
				if (!access.ok) throw new Error(access.error)
			}

			ctx.log.info("createPdfIngestionUpload called", {
				document_type: input.document_type,
				subject: input.subject,
				exam_board: input.exam_board,
				exam_paper_id: input.exam_paper_id ?? null,
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
					year: input.year ?? null,
					paper_reference: input.paper_reference ?? null,
					auto_create_exam_paper: input.exam_paper_id
						? false
						: (input.auto_create_exam_paper ?? true),
					run_adversarial_loop: input.run_adversarial_loop ?? false,
					exam_paper_id: input.exam_paper_id ?? null,
				},
			})
			const key = `${prefix}/${job.id}/document.pdf`
			await db.pdfIngestionJob.update({
				where: { id: job.id },
				data: { s3_key: key },
			})
			const command = new PutObjectCommand({
				Bucket: bucketName,
				Key: key,
				ContentType: "application/pdf",
			})
			const url = await getSignedUrl(s3, command, { expiresIn: 3600 })
			ctx.log.info("PDF ingestion job created", {
				jobId: job.id,
				document_type: input.document_type,
				key,
			})
			return { jobId: job.id, url }
		},
	)

export const createLinkedPdfUpload = resourceAction({
	type: "examPaper",
	role: "editor",
	schema: z.object({
		exam_paper_id: z.string(),
		document_type: documentTypeEnum,
		run_adversarial_loop: z.boolean().optional(),
	}),
	id: ({ exam_paper_id }) => exam_paper_id,
}).action(
	async ({
		parsedInput: input,
		ctx,
	}): Promise<{ jobId: string; url: string }> => {
		const examPaper = await db.examPaper.findFirst({
			where: { id: input.exam_paper_id, is_active: true },
			select: { id: true, exam_board: true, subject: true, year: true },
		})
		if (!examPaper) throw new Error("Exam paper not found")

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
				exam_board: examPaper.exam_board ?? "Other",
				subject: examPaper.subject,
				year: examPaper.year,
				auto_create_exam_paper: false,
				run_adversarial_loop: input.run_adversarial_loop ?? false,
				exam_paper_id: examPaper.id,
			},
		})
		const key = `${prefix}/${job.id}/document.pdf`
		await db.pdfIngestionJob.update({
			where: { id: job.id },
			data: { s3_key: key },
		})
		const command = new PutObjectCommand({
			Bucket: bucketName,
			Key: key,
			ContentType: "application/pdf",
		})
		const url = await getSignedUrl(s3, command, { expiresIn: 3600 })
		ctx.log.info("Linked PDF upload job created", {
			jobId: job.id,
			document_type: input.document_type,
			exam_paper_id: examPaper.id,
		})
		return { jobId: job.id, url }
	},
)
