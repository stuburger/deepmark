import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"

export const s3 = new S3Client({})

export async function getFileBase64(
	bucket: string,
	key: string,
): Promise<string> {
	const cmd = new GetObjectCommand({ Bucket: bucket, Key: key })
	const response = await s3.send(cmd)
	const body = await response.Body?.transformToByteArray()
	if (!body?.length) throw new Error(`Empty S3 object: ${key}`)
	return Buffer.from(body).toString("base64")
}
