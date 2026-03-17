import { geminiApiKey } from "./config"
import { neonPostgres } from "./database"
import { scansBucket } from "./storage"

export const ocrQueue = new sst.aws.Queue("OcrQueue", {
	visibilityTimeout: "5 minutes",
})

export const extractionQueue = new sst.aws.Queue("ExtractionQueue", {
	visibilityTimeout: "4 minutes",
})

scansBucket.notify({
	notifications: [
		{
			name: "OcrTrigger",
			queue: ocrQueue,
			events: ["s3:ObjectCreated:*"],
			filterPrefix: "scans/",
		},
	],
})

ocrQueue.subscribe({
	handler: "packages/backend/src/processors/ocr.handler",
	link: [neonPostgres, geminiApiKey, scansBucket, extractionQueue],
	timeout: "4 minutes",
	memory: "512 MB",
})

extractionQueue.subscribe({
	handler: "packages/backend/src/processors/extract-answers.handler",
	link: [neonPostgres, geminiApiKey],
	timeout: "3 minutes",
})
