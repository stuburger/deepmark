import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { Resource } from "sst"

const s3 = new S3Client({})

export const uploadTestFile = async (
	key: string,
	body: Buffer,
	contentType: string,
) => {
	await s3.send(
		new PutObjectCommand({
			Bucket: Resource.ScansBucket.name,
			Key: key,
			Body: body,
			ContentType: contentType,
		}),
	)
	return key
}
