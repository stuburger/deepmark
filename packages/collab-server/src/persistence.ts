import {
	GetObjectCommand,
	NoSuchKey,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3"
import { Resource } from "sst"

const s3 = new S3Client({})
const bucket = Resource.ScansBucket.name

function keyFor(documentName: string): string {
	return `yjs/${documentName}.bin`
}

export async function loadSnapshot(
	documentName: string,
): Promise<Uint8Array | null> {
	try {
		const res = await s3.send(
			new GetObjectCommand({ Bucket: bucket, Key: keyFor(documentName) }),
		)
		if (!res.Body) return null
		const bytes = await res.Body.transformToByteArray()
		return new Uint8Array(bytes)
	} catch (err) {
		if (err instanceof NoSuchKey) return null
		if ((err as { name?: string })?.name === "NoSuchKey") return null
		throw err
	}
}

export async function saveSnapshot(
	documentName: string,
	state: Uint8Array,
): Promise<void> {
	await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: keyFor(documentName),
			Body: state,
			ContentType: "application/octet-stream",
		}),
	)
}
