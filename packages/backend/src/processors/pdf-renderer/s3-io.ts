import {
	GetObjectCommand,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"

import type { S3Ref } from "./schema"

const s3 = new S3Client({})

export async function s3GetText(ref: S3Ref): Promise<string> {
	const result = await s3.send(
		new GetObjectCommand({ Bucket: ref.bucket, Key: ref.key }),
	)
	if (!result.Body) {
		throw new Error(`Empty body at s3://${ref.bucket}/${ref.key}`)
	}
	return result.Body.transformToString("utf-8")
}

export async function s3PutPdf(ref: S3Ref, body: Uint8Array): Promise<void> {
	await s3.send(
		new PutObjectCommand({
			Bucket: ref.bucket,
			Key: ref.key,
			Body: body,
			ContentType: "application/pdf",
		}),
	)
}
