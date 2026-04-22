"use server"

import { db } from "@/lib/db"
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Resource } from "sst"
import { auth } from "../../auth"
import { parsePageKeys } from "../types"

const bucketName = Resource.ScansBucket.name
const s3 = new S3Client({})

// ─── getStagedScriptPageUrls ────────────────────────────────────────────────

export async function getStagedScriptPageUrls(
	batchJobId: string,
): Promise<
	{ ok: true; urls: Record<string, string> } | { ok: false; error: string }
> {
	const session = await auth()
	if (!session) return { ok: false, error: "Not authenticated" }

	const batch = await db.batchIngestJob.findFirst({
		where: { id: batchJobId },
		include: { staged_scripts: true },
	})
	if (!batch) return { ok: false, error: "Batch not found" }

	const allKeys = batch.staged_scripts.flatMap((s) =>
		parsePageKeys(s.page_keys).map((pk) => pk.s3_key),
	)

	const unique = [...new Set(allKeys)]
	const urlEntries = await Promise.all(
		unique.map(async (key) => {
			const cmd = new GetObjectCommand({ Bucket: bucketName, Key: key })
			const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 })
			return [key, url] as const
		}),
	)

	return { ok: true, urls: Object.fromEntries(urlEntries) }
}
