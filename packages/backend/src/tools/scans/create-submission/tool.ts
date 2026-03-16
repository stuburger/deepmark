import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { Resource } from "sst"
import { tool } from "@/tools/shared/tool-utils"
import { db } from "@/db"
import { CreateScanSubmissionSchema } from "./schema"

const s3 = new S3Client({})
const bucketName = Resource.ScansBucket.name

export const handler = tool(CreateScanSubmissionSchema, async (args, extra) => {
	const { exam_session_id, page_count, mime_type = "image/jpeg" } = args
	const userId = extra.authInfo.extra.userId

	const session = await db.examSession.findUniqueOrThrow({
		where: { id: exam_session_id },
		include: { exam_paper: true },
	})

	if (session.student_id !== userId) {
		throw new Error("You can only create scan submissions for your own exam session")
	}

	const submission = await db.scanSubmission.create({
		data: {
			exam_session_id,
			student_id: session.student_id,
			exam_paper_id: session.exam_paper_id,
			page_count,
			status: "pending",
		},
	})

	const ext = mime_type === "image/png" ? "png" : mime_type === "image/webp" ? "webp" : "jpg"
	const presignedUrls: string[] = []

	for (let i = 1; i <= page_count; i++) {
		const key = `scans/${submission.id}/${i}.${ext}`
		await db.scanPage.create({
			data: {
				scan_submission_id: submission.id,
				page_number: i,
				s3_key: key,
				s3_bucket: bucketName,
				ocr_status: "pending",
			},
		})
		const command = new PutObjectCommand({
			Bucket: bucketName,
			Key: key,
			ContentType: mime_type,
		})
		const url = await getSignedUrl(s3, command, { expiresIn: 3600 })
		presignedUrls.push(url)
	}

	return JSON.stringify(
		{
			scan_submission_id: submission.id,
			page_count,
			upload_instructions:
				"Upload each page image with a PUT request to the corresponding URL. Use the exact Content-Type header matching the mime_type.",
			presigned_put_urls: presignedUrls.map((url, i) => ({
				page_number: i + 1,
				url,
			})),
		},
		null,
		2,
	)
})
