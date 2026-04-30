import { routeHandler } from "@/lib/authz"
import { db } from "@/lib/db"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Resource } from "sst"
import { z } from "zod"

const s3 = new S3Client({})
const bucketName = Resource.ScansBucket.name

// StudentSubmission.pages uses a different shape than StagedScript.page_keys —
// commitBatchService renames `s3_key` -> `key` at commit time and drops the
// staged-only `source_file` field. Parse what's actually on submissions here
// rather than reusing the staged-script schema.
const submissionPagesSchema = z.array(
	z.object({
		key: z.string(),
		order: z.number(),
		mime_type: z.string(),
	}),
)

export const GET = routeHandler.resource<{
	submissionId: string
	pageOrder: string
}>(
	{
		type: "submission",
		role: "viewer",
		id: async (_req, { params }) => params.submissionId,
	},
	async (_ctx, request, { params }) => {
		const { submissionId, pageOrder: pageOrderRaw } = await params
		const pageOrder = Number.parseInt(pageOrderRaw, 10)
		if (!Number.isFinite(pageOrder)) {
			return new Response("Bad request", { status: 400 })
		}

		const sub = await db.studentSubmission.findUnique({
			where: { id: submissionId },
			select: { pages: true, s3_bucket: true },
		})
		if (!sub) return new Response("Not found", { status: 404 })

		const parsed = submissionPagesSchema.safeParse(sub.pages)
		if (!parsed.success) return new Response("Not found", { status: 404 })
		const page = parsed.data.find((p) => p.order === pageOrder)
		if (!page) return new Response("Not found", { status: 404 })

		try {
			const obj = await s3.send(
				new GetObjectCommand({
					Bucket: sub.s3_bucket ?? bucketName,
					Key: page.key,
					Range: request.headers.get("range") ?? undefined,
				}),
			)
			if (!obj.Body) return new Response("Not found", { status: 404 })

			const headers = new Headers({
				"Accept-Ranges": obj.AcceptRanges ?? "bytes",
				"Cache-Control": "private, max-age=3600",
				"Content-Type": page.mime_type || "application/octet-stream",
			})
			if (obj.ContentLength !== undefined) {
				headers.set("Content-Length", String(obj.ContentLength))
			}
			if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange)
			if (obj.ETag) headers.set("ETag", obj.ETag)

			return new Response(obj.Body.transformToWebStream(), {
				status: obj.ContentRange ? 206 : 200,
				headers,
			})
		} catch (error) {
			if (error instanceof Error && error.name === "InvalidRange") {
				return new Response("Requested range not satisfiable", { status: 416 })
			}
			return new Response("Not found", { status: 404 })
		}
	},
)
