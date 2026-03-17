"use server"

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { createPrismaClient } from "@mcp-gcse/db"
import { Resource } from "sst"
import { auth } from "./auth"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})

const db = createPrismaClient(Resource.NeonPostgres.databaseUrl)

type PageInput = { mimeType: "image/jpeg" | "image/png" | "image/webp" }

export type PresignedPage = { pageNumber: number; url: string }

export type CreateScanUploadResult =
	| { ok: true; submissionId: string; presignedPutUrls: PresignedPage[] }
	| { ok: false; error: string }

function extFromMime(mimeType: "image/jpeg" | "image/png" | "image/webp") {
	if (mimeType === "image/png") return "png"
	if (mimeType === "image/webp") return "webp"
	return "jpg"
}

export async function createScanUpload(pages: PageInput[]): Promise<CreateScanUploadResult> {
	const session = await auth()
	if (!session) {
		return { ok: false, error: "Not authenticated" }
	}
	if (pages.length === 0) {
		return { ok: false, error: "At least one page is required" }
	}


	const submission = await db.scanSubmission.create({
		data: {
			student_id: session.userId,
			page_count: pages.length,
			status: "pending",
		},
	})

	const presignedPutUrls: PresignedPage[] = []

	for (let i = 0; i < pages.length; i++) {
		const pageNumber = i + 1
		const page = pages[i]
		if (!page) continue
		const ext = extFromMime(page.mimeType)
		const key = `scans/${submission.id}/${pageNumber}.${ext}`

		await db.scanPage.create({
			data: {
				scan_submission_id: submission.id,
				page_number: pageNumber,
				s3_key: key,
				s3_bucket: bucketName,
				ocr_status: "pending",
			},
		})

		const command = new PutObjectCommand({
			Bucket: bucketName,
			Key: key,
			ContentType: page.mimeType,
		})
		const url = await getSignedUrl(s3, command, { expiresIn: 3600 })
		presignedPutUrls.push({ pageNumber, url })
	}

	return {
		ok: true,
		submissionId: submission.id,
		presignedPutUrls,
	}
}

export type HandwritingFeature = {
	box_2d: [number, number, number, number]
	label: string
	feature_type: string
}

export type HandwritingAnalysis = {
	transcript: string
	features: HandwritingFeature[]
	observations: string[]
}

export type PageStatus = {
	pageNumber: number
	ocrStatus: string
	ocrResult: HandwritingAnalysis | null
	imageUrl: string | null
}

export type PollScanStatusResult =
	| { ok: true; allComplete: boolean; pages: PageStatus[] }
	| { ok: false; error: string }

export async function pollScanStatus(submissionId: string): Promise<PollScanStatusResult> {
	const session = await auth()
	if (!session) {
		return { ok: false, error: "Not authenticated" }
	}

	const submission = await db.scanSubmission.findFirst({
		where: { id: submissionId, student_id: session.userId },
		include: { pages: { orderBy: { page_number: "asc" } } },
	})

	if (!submission) {
		return { ok: false, error: "Submission not found" }
	}

	const TERMINAL = ["ocr_complete", "failed"]

	const pages: PageStatus[] = await Promise.all(
		submission.pages.map(async (p) => {
			const ocrResult = p.ocr_result as HandwritingAnalysis | null
			let imageUrl: string | null = null

			if (p.ocr_status === "ocr_complete" && p.s3_key) {
				const getCommand = new GetObjectCommand({ Bucket: p.s3_bucket, Key: p.s3_key })
				imageUrl = await getSignedUrl(s3, getCommand, { expiresIn: 3600 })
			}

			return {
				pageNumber: p.page_number,
				ocrStatus: p.ocr_status,
				ocrResult: ocrResult ?? null,
				imageUrl,
			}
		}),
	)

	const allComplete = pages.length > 0 && pages.every((p) => TERMINAL.includes(p.ocrStatus))

	return { ok: true, allComplete, pages }
}
