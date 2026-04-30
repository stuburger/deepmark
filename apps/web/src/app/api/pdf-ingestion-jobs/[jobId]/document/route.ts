import { routeHandler } from "@/lib/authz"
import { db } from "@/lib/db"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"

const s3 = new S3Client({})

export const GET = routeHandler.resource<{ jobId: string }>(
	{
		type: "pdfIngestionJob",
		role: "viewer",
		id: async (_req, { params }) => params.jobId,
	},
	async (_ctx, request, { params }) => {
		const { jobId } = await params

		const job = await db.pdfIngestionJob.findUnique({
			where: { id: jobId },
			select: { s3_bucket: true, s3_key: true },
		})

		if (!job?.s3_key) {
			return new Response("Not found", { status: 404 })
		}

		try {
			const obj = await s3.send(
				new GetObjectCommand({
					Bucket: job.s3_bucket,
					Key: job.s3_key,
					Range: request.headers.get("range") ?? undefined,
				}),
			)

			if (!obj.Body) {
				return new Response("Not found", { status: 404 })
			}

			const headers = new Headers({
				"Accept-Ranges": obj.AcceptRanges ?? "bytes",
				"Cache-Control": "private, max-age=3600",
				"Content-Type": obj.ContentType ?? "application/pdf",
			})

			if (obj.ContentLength !== undefined) {
				headers.set("Content-Length", String(obj.ContentLength))
			}
			if (obj.ContentRange) {
				headers.set("Content-Range", obj.ContentRange)
			}
			if (obj.ETag) {
				headers.set("ETag", obj.ETag)
			}

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
