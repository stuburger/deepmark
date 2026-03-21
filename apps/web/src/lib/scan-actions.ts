"use server"

import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
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

export async function createScanUpload(
	examPaperId: string,
	pages: PageInput[],
): Promise<CreateScanUploadResult> {
	const session = await auth()
	if (!session) {
		return { ok: false, error: "Not authenticated" }
	}
	if (pages.length === 0) {
		return { ok: false, error: "At least one page is required" }
	}

	const submission = await db.scanSubmission.create({
		data: {
			uploaded_by_id: session.userId,
			exam_paper_id: examPaperId,
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

export async function pollScanStatus(
	submissionId: string,
): Promise<PollScanStatusResult> {
	const session = await auth()
	if (!session) {
		return { ok: false, error: "Not authenticated" }
	}

	const submission = await db.scanSubmission.findFirst({
		where: { id: submissionId, uploaded_by_id: session.userId },
		include: { pages: { orderBy: { page_number: "asc" } } },
	})

	if (!submission) {
		return { ok: false, error: "Submission not found" }
	}

	const TERMINAL = ["ocr_complete", "graded", "failed"]

	const pages: PageStatus[] = await Promise.all(
		submission.pages.map(async (p) => {
			const ocrResult = p.ocr_result as HandwritingAnalysis | null
			let imageUrl: string | null = null

			if (p.ocr_status === "ocr_complete" && p.s3_key) {
				const getCommand = new GetObjectCommand({
					Bucket: p.s3_bucket,
					Key: p.s3_key,
				})
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

	const allComplete =
		pages.length > 0 && pages.every((p) => TERMINAL.includes(p.ocrStatus))

	return { ok: true, allComplete, pages }
}

// ─── Graded submission ────────────────────────────────────────────────────────

export type MarkPointResult = {
	pointNumber: number
	awarded: boolean
	reasoning: string
	expectedCriteria: string
	studentCovered: string
}

export type GradedAnswerOnPage = {
	extractedAnswerId: string
	questionId: string
	questionPartId: string | null
	questionText: string
	questionNumber: string
	extractedText: string
	awardedScore: number
	maxScore: number
	feedbackSummary: string
	llmReasoning: string
	levelAwarded?: number
	markPointResults: MarkPointResult[]
	// Bounding boxes for this page only (from page_segments)
	boundingBoxes: HandwritingFeature[]
	// Refined single-region for this page — null until RegionRefinementQueue finishes
	answerRegion: [number, number, number, number] | null
	// True when this page is not the first page of the answer
	isContinuation: boolean
}

export type GradedPage = {
	pageNumber: number
	imageUrl: string
	gradedAnswers: GradedAnswerOnPage[]
}

export type GetGradedSubmissionResult =
	| {
			ok: true
			status: string
			student: { id: string; name: string } | null
			totalAwarded: number
			totalMax: number
			pages: GradedPage[]
	  }
	| { ok: false; error: string }

type RawPageSegment = {
	page_number: number
	scan_page_id?: string
	segment_text: string
	bounding_boxes: HandwritingFeature[]
}

type RawAnswerRegion = {
	page_number: number
	scan_page_id: string
	answer_region: [number, number, number, number]
}

type RawMarkPointResult = {
	pointNumber?: number
	point_number?: number
	awarded: boolean
	reasoning: string
	expectedCriteria?: string
	expected_criteria?: string
	studentCovered?: string
	student_covered?: string
}

export async function getGradedSubmission(
	submissionId: string,
): Promise<GetGradedSubmissionResult> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const submission = await db.scanSubmission.findFirst({
		where: { id: submissionId, uploaded_by_id: session.userId },
		include: {
			student: { select: { id: true, name: true } },
			pages: { orderBy: { page_number: "asc" } },
			extracted_answers: {
				include: {
					question: {
						select: {
							id: true,
							text: true,
							question_number: true,
						},
					},
					question_part: {
						select: { id: true, text: true, part_label: true },
					},
					answer: {
						include: {
							marking_results: {
								orderBy: { marked_at: "desc" },
								take: 1,
							},
						},
					},
				},
			},
		},
	})

	if (!submission) return { ok: false, error: "Submission not found" }

	// Build question number map from exam paper ordering
	// (question_number on Question is the canonical number string from the PDF)
	const questionNumberMap = new Map<string, string>()
	for (const ext of submission.extracted_answers) {
		const q = ext.question
		if (!q) continue
		const key = ext.question_part_id ? `${q.id}:${ext.question_part_id}` : q.id
		const partLabel = ext.question_part?.part_label ?? ""
		const num = q.question_number
			? `${q.question_number}${partLabel}`
			: `Q${ext.question_id.slice(-4)}${partLabel}`
		questionNumberMap.set(key, num)
	}

	// Generate presigned GET URLs for all pages
	const imageUrls = await Promise.all(
		submission.pages.map(async (p) => {
			const cmd = new GetObjectCommand({
				Bucket: p.s3_bucket,
				Key: p.s3_key,
			})
			return getSignedUrl(s3, cmd, { expiresIn: 3600 })
		}),
	)

	let totalAwarded = 0
	let totalMax = 0

	const gradedPages: GradedPage[] = submission.pages.map((page, idx) => {
		const gradedAnswers: GradedAnswerOnPage[] = []

		for (const ext of submission.extracted_answers) {
			const segments = (ext.page_segments as RawPageSegment[] | null) ?? []
			const segmentOnPage = segments.find(
				(s) => s.page_number === page.page_number,
			)
			if (!segmentOnPage) continue

			// isContinuation: true if this page is not the first in the answer's segments
			const allPageNumbers = segments.map((s) => s.page_number)
			const firstPage = Math.min(...allPageNumbers)
			const isContinuation = page.page_number !== firstPage

			// Refined answer region for this page (if refinement has completed)
			const regions = (ext.answer_regions as RawAnswerRegion[] | null) ?? []
			const regionOnPage = regions.find(
				(r) => r.page_number === page.page_number,
			)

			// Score and feedback from the latest MarkingResult
			const markingResult = ext.answer?.marking_results[0] ?? null

			if (!isContinuation) {
				totalAwarded += markingResult?.total_score ?? 0
				totalMax +=
					markingResult?.max_possible_score ??
					ext.answer?.max_possible_score ??
					0
			}

			const rawMarkPoints =
				(markingResult?.mark_points_results as RawMarkPointResult[] | null) ??
				[]
			const markPointResults: MarkPointResult[] = rawMarkPoints.map((mp) => ({
				pointNumber: mp.pointNumber ?? mp.point_number ?? 0,
				awarded: mp.awarded,
				reasoning: mp.reasoning,
				expectedCriteria: mp.expectedCriteria ?? mp.expected_criteria ?? "",
				studentCovered: mp.studentCovered ?? mp.student_covered ?? "",
			}))

			const qKey = ext.question_part_id
				? `${ext.question_id}:${ext.question_part_id}`
				: ext.question_id

			gradedAnswers.push({
				extractedAnswerId: ext.id,
				questionId: ext.question_id,
				questionPartId: ext.question_part_id,
				questionText: ext.question_part?.text ?? ext.question?.text ?? "",
				questionNumber: questionNumberMap.get(qKey) ?? "",
				extractedText: ext.extracted_text,
				awardedScore: markingResult?.total_score ?? 0,
				maxScore:
					markingResult?.max_possible_score ??
					ext.answer?.max_possible_score ??
					0,
				feedbackSummary: markingResult?.feedback_summary ?? "",
				llmReasoning: markingResult?.llm_reasoning ?? "",
				levelAwarded: markingResult?.level_awarded ?? undefined,
				markPointResults,
				boundingBoxes:
					(segmentOnPage.bounding_boxes as HandwritingFeature[]) ?? [],
				answerRegion: regionOnPage?.answer_region ?? null,
				isContinuation,
			})
		}

		// Sort answers by first appearance on this page (top of page first, using first bounding box y)
		gradedAnswers.sort((a, b) => {
			const aY = a.boundingBoxes[0]?.box_2d[0] ?? 0
			const bY = b.boundingBoxes[0]?.box_2d[0] ?? 0
			return aY - bY
		})

		return {
			pageNumber: page.page_number,
			imageUrl: imageUrls[idx] ?? "",
			gradedAnswers,
		}
	})

	return {
		ok: true,
		status: submission.status,
		student: submission.student ?? null,
		totalAwarded,
		totalMax,
		pages: gradedPages,
	}
}
