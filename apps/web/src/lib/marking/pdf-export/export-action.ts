"use server"

import { randomUUID } from "node:crypto"
import { resourcesAction } from "@/lib/authz"
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda"
import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Resource } from "sst"
import { z } from "zod"
import { slugify } from "../listing/csv"
import { getStudentPapersForClass } from "../submissions/queries"
import type { StudentPaperResultPayload } from "../types"
import { collectAoLabels } from "./print/legend"
import {
	renderCoverDocument,
	renderLegendDocument,
	renderStudentDocument,
} from "./print/render"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})
const lambda = new LambdaClient({})

const exportInput = z.object({
	paperId: z.string(),
	submissionIds: z.array(z.string()).min(1, "No submissions selected"),
	className: z.string(),
	teacherName: z.string(),
	printLayout: z.enum(["none", "duplex", "duplex_2up"]),
	includeAnnotations: z.boolean(),
})

type RendererResponse =
	| { ok: true; pageCount: number; sizeBytes: number; durationMs: number }
	| { ok: false; error: string; durationMs: number }

export const exportClassReport = resourcesAction({
	schema: exportInput,
	resources: [
		{ type: "examPaper", role: "viewer", id: ({ paperId }) => paperId },
		{
			type: "submission",
			role: "viewer",
			ids: ({ submissionIds }) => submissionIds,
		},
	],
}).action(
	async ({
		parsedInput: input,
		ctx,
	}): Promise<{ url: string; filename: string; count: number }> => {
		const startedAt = Date.now()
		ctx.log.info("exportClassReport started", {
			paperId: input.paperId,
			count: input.submissionIds.length,
			includeAnnotations: input.includeAnnotations,
		})

		const fetched = await getStudentPapersForClass({
			examPaperId: input.paperId,
			submissionIds: input.submissionIds,
			includeAnnotations: input.includeAnnotations,
		})
		if (fetched?.serverError) throw new Error(fetched.serverError)
		const data = fetched?.data
		if (!data) throw new Error("Failed to fetch class submissions")
		if (data.payloads.length === 0) {
			throw new Error("No submissions returned")
		}

		const paperTitle = data.payloads[0]?.exam_paper_title ?? ""

		const date = new Date().toISOString().slice(0, 10)
		const baseName = input.className
			? slugify(input.className)
			: slugify(paperTitle || "class-report")
		const filename = `class-report-${baseName}-${date}.pdf`

		const jobId = randomUUID()
		const outputKey = `pdf-exports/${input.paperId}/${jobId}/output.pdf`

		// Build sections: cover (only when there are 2+ students; a class
		// cover for one student is just duplicate info) + one per student.
		// Per-section rendering is what enables sheet-boundary padding
		// between students under duplex / duplex_2up.
		const meta = {
			className: input.className,
			teacherName: input.teacherName,
			paperTitle,
			generatedAt: new Date(),
			printLayout: input.printLayout,
		}
		const sections: {
			name: string
			footerLabel: string
			html: string
		}[] = []
		if (data.payloads.length > 1) {
			sections.push({
				name: "cover",
				footerLabel: "Cover",
				html: renderCoverDocument({ meta, students: data.payloads }),
			})
		}

		// Legend goes between the cover and the first student, only when
		// there's something to legend (annotations actually present in this
		// class). Skipping it for unannotated exports avoids confusing
		// teachers with a key for marks they didn't ask for.
		const aoLabels = input.includeAnnotations
			? collectAoLabels(data.annotationsBySubmission)
			: []
		const hasAnyAnnotations =
			input.includeAnnotations &&
			Object.values(data.annotationsBySubmission).some(
				(list) => list.length > 0,
			)
		if (hasAnyAnnotations) {
			sections.push({
				name: "legend",
				footerLabel: "Annotation key",
				html: renderLegendDocument({ meta, aoLabels }),
			})
		}

		for (const student of data.payloads) {
			const submissionId = student.submission_id ?? ""
			sections.push({
				name: `student-${studentSlug(student)}`,
				footerLabel: student.student_name ?? "Student",
				html: renderStudentDocument({
					meta,
					student,
					annotations: data.annotationsBySubmission[submissionId] ?? [],
					pageTokens: data.tokensBySubmission[submissionId] ?? [],
				}),
			})
		}

		// Upload all sections in parallel; padded ordinal prefix keeps the
		// S3 listing readable when we go to debug a particular job.
		const sectionRefs = await Promise.all(
			sections.map(async (section, i) => {
				const key = `pdf-exports/${input.paperId}/${jobId}/${String(i).padStart(3, "0")}-${section.name}.html`
				await s3.send(
					new PutObjectCommand({
						Bucket: bucketName,
						Key: key,
						Body: section.html,
						ContentType: "text/html; charset=utf-8",
					}),
				)
				return {
					bucket: bucketName,
					key,
					footerLabel: section.footerLabel,
				}
			}),
		)

		// Note: the action itself runs in the Next.js Lambda (60s timeout, 60s
		// CloudFront cap). Per-section render keeps total render time linear in
		// student count; once classes routinely exceed 60s, switch to async
		// invoke + client-side polling. See PDF-RENDERER-PLAN.md.
		const invokeResult = await lambda.send(
			new InvokeCommand({
				FunctionName: Resource.PdfRenderer.name,
				InvocationType: "RequestResponse",
				Payload: Buffer.from(
					JSON.stringify({
						jobId,
						sections: sectionRefs,
						output: { bucket: bucketName, key: outputKey },
						printLayout: input.printLayout,
					}),
				),
			}),
		)
		if (invokeResult.FunctionError) {
			ctx.log.error("Renderer Lambda function error", {
				jobId,
				functionError: invokeResult.FunctionError,
			})
			throw new Error("Failed to generate PDF — please try again.")
		}
		const payload = invokeResult.Payload
			? (JSON.parse(
					Buffer.from(invokeResult.Payload).toString("utf-8"),
				) as RendererResponse)
			: null
		if (!payload) {
			ctx.log.error("Renderer returned no payload", { jobId })
			throw new Error("Failed to generate PDF — please try again.")
		}
		if (!payload.ok) {
			// Log the raw renderer error for debugging; surface a curated
			// teacher-facing message. Internal stack frames / temp paths /
			// chromium errors must not bleed into a UI toast.
			ctx.log.error("Renderer reported failure", {
				jobId,
				rawError: payload.error,
				durationMs: payload.durationMs,
			})
			throw new Error(sanitiseRendererError(payload.error))
		}

		const url = await getSignedUrl(
			s3,
			new GetObjectCommand({
				Bucket: bucketName,
				Key: outputKey,
				ResponseContentDisposition: `attachment; filename="${filename}"`,
			}),
			{ expiresIn: 300 },
		)

		ctx.log.info("exportClassReport finished", {
			paperId: input.paperId,
			count: data.payloads.length,
			sectionCount: sections.length,
			pageCount: payload.pageCount,
			sizeBytes: payload.sizeBytes,
			rendererMs: payload.durationMs,
			totalMs: Date.now() - startedAt,
			jobId,
		})

		return {
			url,
			filename,
			count: data.payloads.length,
		}
	},
)

function studentSlug(student: StudentPaperResultPayload): string {
	if (student.submission_id) return student.submission_id
	if (student.student_name) return slugify(student.student_name)
	return "unknown"
}

/**
 * Map renderer Lambda error strings to teacher-friendly toast copy.
 * The raw error is always logged separately for debugging — this only
 * decides what gets surfaced to the UI.
 */
function sanitiseRendererError(raw: string): string {
	if (/timeout|timed out/i.test(raw)) {
		return "PDF render timed out. Try exporting fewer students at a time."
	}
	if (/quota|throttle|rate limit/i.test(raw)) {
		return "PDF service is busy. Please try again in a moment."
	}
	return "Failed to generate PDF — please try again."
}
