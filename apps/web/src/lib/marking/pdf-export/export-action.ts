"use server"

import { randomUUID } from "node:crypto"
import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Resource } from "sst"
import { auth } from "../../auth"
import { log } from "../../logger"
import { slugify } from "../listing/csv"
import { getStudentPapersForClass } from "../submissions/queries"
import type { PrintLayout } from "./types"

const TAG = "class-pdf-export"
const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})

export type ExportClassReportInput = {
	paperId: string
	submissionIds: string[]
	className: string
	teacherName: string
	printLayout: PrintLayout
	includeAnnotations: boolean
}

export type ExportClassReportResult =
	| { ok: true; url: string; filename: string; count: number }
	| { ok: false; error: string }

export async function exportClassReport(
	input: ExportClassReportInput,
): Promise<ExportClassReportResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }
	if (input.submissionIds.length === 0) {
		return { ok: false, error: "No submissions selected" }
	}

	const startedAt = Date.now()
	log.info(TAG, "exportClassReport started", {
		userId: session.userId,
		paperId: input.paperId,
		count: input.submissionIds.length,
		includeAnnotations: input.includeAnnotations,
	})

	const fetched = await getStudentPapersForClass(
		input.paperId,
		input.submissionIds,
		{ includeAnnotations: input.includeAnnotations },
	)
	if (!fetched.ok) return fetched
	if (fetched.payloads.length === 0) {
		return { ok: false, error: "No submissions returned" }
	}

	const paperTitle = fetched.payloads[0]?.exam_paper_title ?? ""

	// Imported lazily so the heavy react-pdf module only loads when an export
	// is actually requested — not on every server-action import.
	const { generateClassReportServer } = await import("./generate.server")

	const bytes = await generateClassReportServer({
		meta: {
			className: input.className,
			teacherName: input.teacherName,
			paperTitle,
			generatedAt: new Date(),
			printLayout: input.printLayout,
		},
		students: fetched.payloads,
		annotationsBySubmission: fetched.annotationsBySubmission,
		tokensBySubmission: fetched.tokensBySubmission,
		includeAnnotations: input.includeAnnotations,
	})

	const date = new Date().toISOString().slice(0, 10)
	const baseName = input.className
		? slugify(input.className)
		: slugify(paperTitle || "class-report")
	const filename = `class-report-${baseName}-${date}.pdf`

	const key = `pdf-exports/${input.paperId}/${randomUUID()}.pdf`
	await s3.send(
		new PutObjectCommand({
			Bucket: bucketName,
			Key: key,
			Body: bytes,
			ContentType: "application/pdf",
			ContentDisposition: `attachment; filename="${filename}"`,
		}),
	)

	const url = await getSignedUrl(
		s3,
		new GetObjectCommand({
			Bucket: bucketName,
			Key: key,
			ResponseContentDisposition: `attachment; filename="${filename}"`,
		}),
		{ expiresIn: 300 },
	)

	log.info(TAG, "exportClassReport finished", {
		userId: session.userId,
		paperId: input.paperId,
		count: fetched.payloads.length,
		bytes: bytes.byteLength,
		durationMs: Date.now() - startedAt,
		key,
	})

	return {
		ok: true,
		url,
		filename,
		count: fetched.payloads.length,
	}
}
