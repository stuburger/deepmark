import { auth } from "@/lib/auth"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import type { NextRequest } from "next/server"
import { Resource } from "sst"

const s3 = new S3Client({})
const bucketName = Resource.ScansBucket.name

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ path: string[] }> },
) {
	const session = await auth()
	if (!session) {
		return new Response("Unauthorized", { status: 401 })
	}

	const { path } = await params
	const key = path.join("/")

	try {
		const obj = await s3.send(
			new GetObjectCommand({ Bucket: bucketName, Key: key }),
		)
		if (!obj.Body) {
			return new Response("Not found", { status: 404 })
		}
		return new Response(obj.Body.transformToWebStream(), {
			headers: {
				"Content-Type": obj.ContentType ?? "application/octet-stream",
				"Cache-Control": "private, max-age=3600",
			},
		})
	} catch {
		return new Response("Not found", { status: 404 })
	}
}
