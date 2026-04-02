"use server"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createPrismaClient } from "@mcp-gcse/db"
import type { Subject } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "../auth"
import { log } from "../logger"

const TAG = "pdf-ingestion-actions"
const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

import type { PdfDocumentType } from "./types"
export type { PdfDocumentType } from "./types"

export type CreatePdfIngestionUploadResult =
	| { ok: true; jobId: string; url: string }
	| { ok: false; error: string }

export async function createPdfIngestionUpload(input: {
	document_type: PdfDocumentType
	exam_board: string
	subject?: Subject
	year?: number
	paper_reference?: string
	auto_create_exam_paper?: boolean
	exam_paper_id?: string
	run_adversarial_loop?: boolean
}): Promise<CreatePdfIngestionUploadResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	if (!input.exam_board.trim())
		return { ok: false, error: "Exam board is required" }
	if (!input.subject) {
		return { ok: false, error: "Subject is required" }
	}

	log.info(TAG, "createPdfIngestionUpload called", {
		userId: session.userId,
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
			uploaded_by: session.userId,
			exam_board: input.exam_board.trim(),
			subject: input.subject ?? null,
			year: input.year ?? null,
			paper_reference: input.paper_reference?.trim() ?? null,
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
	log.info(TAG, "PDF ingestion job created", {
		userId: session.userId,
		jobId: job.id,
		document_type: input.document_type,
		key,
	})
	return { ok: true, jobId: job.id, url }
}

export async function createLinkedPdfUpload(input: {
	exam_paper_id: string
	document_type: "mark_scheme" | "exemplar" | "question_paper"
	run_adversarial_loop?: boolean
}): Promise<CreatePdfIngestionUploadResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const examPaper = await db.examPaper.findFirst({
		where: { id: input.exam_paper_id, is_active: true },
		select: { id: true, exam_board: true, subject: true, year: true },
	})
	if (!examPaper) return { ok: false, error: "Exam paper not found" }

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
			uploaded_by: session.userId,
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
	log.info(TAG, "Linked PDF upload job created", {
		userId: session.userId,
		jobId: job.id,
		document_type: input.document_type,
		exam_paper_id: examPaper.id,
	})
	return { ok: true, jobId: job.id, url }
}
