"use server"

import { randomUUID } from "node:crypto"
import { resourcesAction } from "@/lib/authz"
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

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})

const exportInput = z.object({
	paperId: z.string(),
	submissionIds: z.array(z.string()).min(1, "No submissions selected"),
	className: z.string(),
	teacherName: z.string(),
	printLayout: z.enum(["none", "duplex", "duplex_2up"]),
	includeAnnotations: z.boolean(),
})

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
			students: data.payloads,
			annotationsBySubmission: data.annotationsBySubmission,
			tokensBySubmission: data.tokensBySubmission,
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

		ctx.log.info("exportClassReport finished", {
			paperId: input.paperId,
			count: data.payloads.length,
			bytes: bytes.byteLength,
			durationMs: Date.now() - startedAt,
			key,
		})

		return {
			url,
			filename,
			count: data.payloads.length,
		}
	},
)
