import { routeHandler } from "@/lib/authz"
import { parsePageKeys } from "@/lib/batch/types"
import { db } from "@/lib/db"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Resource } from "sst"

const s3 = new S3Client({})
const bucketName = Resource.ScansBucket.name

export const GET = routeHandler.resource<{
	batchId: string
	scriptId: string
	pageOrder: string
}>(
	{
		type: "batch",
		role: "viewer",
		id: async (_req, { params }) => params.batchId,
	},
	async (_ctx, request, { params }) => {
		const { batchId, scriptId, pageOrder: pageOrderRaw } = await params
		const pageOrder = Number.parseInt(pageOrderRaw, 10)
		if (!Number.isFinite(pageOrder)) {
			return new Response("Bad request", { status: 400 })
		}

		const script = await db.stagedScript.findFirst({
			where: { id: scriptId, batch_job_id: batchId },
			select: { page_keys: true },
		})
		if (!script) return new Response("Not found", { status: 404 })

		const pages = parsePageKeys(script.page_keys)
		const page = pages.find((p) => p.order === pageOrder)
		if (!page) return new Response("Not found", { status: 404 })

		try {
			const obj = await s3.send(
				new GetObjectCommand({
					Bucket: bucketName,
					Key: page.s3_key,
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
