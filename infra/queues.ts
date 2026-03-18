import { geminiApiKey, openAiApiKey } from "./config"
import { neonPostgres } from "./database"
import { scansBucket } from "./storage"

export const ocrQueue = new sst.aws.Queue("OcrQueue", {
	visibilityTimeout: "5 minutes",
})

export const extractionQueue = new sst.aws.Queue("ExtractionQueue", {
	visibilityTimeout: "4 minutes",
})

export const markSchemePdfQueue = new sst.aws.Queue("MarkSchemePdfQueue", {
	visibilityTimeout: "10 minutes",
})

export const exemplarQueue = new sst.aws.Queue("ExemplarQueue", {
	visibilityTimeout: "10 minutes",
})

export const questionPaperQueue = new sst.aws.Queue("QuestionPaperQueue", {
	visibilityTimeout: "10 minutes",
})

export const studentPaperQueue = new sst.aws.Queue("StudentPaperQueue", {
	visibilityTimeout: "10 minutes",
})

scansBucket.notify({
	notifications: [
		{
			name: "OcrTrigger",
			queue: ocrQueue,
			events: ["s3:ObjectCreated:*"],
			filterPrefix: "scans/",
		},
		{
			name: "MarkSchemePdfTrigger",
			queue: markSchemePdfQueue,
			events: ["s3:ObjectCreated:*"],
			filterPrefix: "pdfs/mark-schemes/",
			filterSuffix: ".pdf",
		},
		{
			name: "ExemplarTrigger",
			queue: exemplarQueue,
			events: ["s3:ObjectCreated:*"],
			filterPrefix: "pdfs/exemplars/",
			filterSuffix: ".pdf",
		},
		{
			name: "QuestionPaperTrigger",
			queue: questionPaperQueue,
			events: ["s3:ObjectCreated:*"],
			filterPrefix: "pdfs/question-papers/",
			filterSuffix: ".pdf",
		},
		{
			name: "StudentPaperTrigger",
			queue: studentPaperQueue,
			events: ["s3:ObjectCreated:*"],
			filterPrefix: "pdfs/student-papers/",
			filterSuffix: ".pdf",
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

markSchemePdfQueue.subscribe({
	handler: "packages/backend/src/processors/mark-scheme-pdf.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})

exemplarQueue.subscribe({
	handler: "packages/backend/src/processors/exemplar-pdf.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})

questionPaperQueue.subscribe({
	handler: "packages/backend/src/processors/question-paper-pdf.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})

studentPaperQueue.subscribe({
	handler: "packages/backend/src/processors/student-paper-pdf.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})
