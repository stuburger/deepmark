import { cloudVisionApiKey, geminiApiKey, openAiApiKey } from "./config"
import { neonPostgres } from "./database"
import { scansBucket } from "./storage"

export const vapidPublicKey = new sst.Secret(
	"VapidPublicKey",
	"BCFcD8zrMJzK4lMxhj6vEG_jBuxsqT1b7qo0i3NoTJWCm4yGH1OFN2L0sRTRP5YR-LCScli9ltW_SqZCysXSvFk",
)
export const vapidPrivateKey = new sst.Secret(
	"VapidPrivateKey",
	"5UFLD1r3EJ8yyPi3SKLU7fX8KCcNUbUMvbxIvK5rmtY",
)

export const markSchemePdfQueue = new sst.aws.Queue("MarkSchemePdfQueue", {
	visibilityTimeout: "10 minutes",
})

export const exemplarQueue = new sst.aws.Queue("ExemplarQueue", {
	visibilityTimeout: "10 minutes",
})

export const questionPaperQueue = new sst.aws.Queue("QuestionPaperQueue", {
	visibilityTimeout: "10 minutes",
})

// Dedicated DLQ per queue — each handler already knows its phase, no state inference needed.
const studentPaperOcrDlq = new sst.aws.Queue("StudentPaperOcrDLQ", {
	visibilityTimeout: "1 minute",
})
const studentPaperGradingDlq = new sst.aws.Queue("StudentPaperGradingDLQ", {
	visibilityTimeout: "1 minute",
})
const studentPaperEnrichDlq = new sst.aws.Queue("StudentPaperEnrichDLQ", {
	visibilityTimeout: "1 minute",
})

// OCR queue: manually triggered by server action after teacher finalises upload
export const studentPaperOcrQueue = new sst.aws.Queue("StudentPaperOcrQueue", {
	visibilityTimeout: "10 minutes",
	dlq: { queue: studentPaperOcrDlq.arn, retry: 2 },
})

// Grading queue: manually triggered by server action after teacher selects exam paper
export const studentPaperQueue = new sst.aws.Queue("StudentPaperQueue", {
	visibilityTimeout: "10 minutes",
	dlq: { queue: studentPaperGradingDlq.arn, retry: 2 },
})

// Enrich queue: automatically triggered by student-paper-grade once grading completes.
// Generates inline annotations on scanned scripts using mark scheme + grading results.
export const studentPaperEnrichQueue = new sst.aws.Queue(
	"StudentPaperEnrichQueue",
	{
		visibilityTimeout: "10 minutes",
		dlq: { queue: studentPaperEnrichDlq.arn, retry: 2 },
	},
)

scansBucket.notify({
	notifications: [
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
		// Student paper OCR and grading are manually queued by server actions.
	],
})

export const batchClassifyQueue = new sst.aws.Queue("BatchClassifyQueue", {
	visibilityTimeout: "5 minutes",
})

batchClassifyQueue.subscribe({
	handler: "packages/backend/src/processors/batch-classify.handler",
	link: [neonPostgres, geminiApiKey, scansBucket, studentPaperOcrQueue],
	timeout: "4 minutes",
	memory: "1 GB",
	nodejs: { install: ["sharp"] },
})

// Triggered automatically: S3 fires a message when a PDF is uploaded to pdfs/mark-schemes/.
// Can also be triggered manually via { job_id } from a server action (e.g. teacher retries a failed job).
// Handler: fetches the PDF from S3 and sends it to Gemini to extract every question with its full mark
// scheme (mark points, level descriptors, caps, marking method). Optionally extracts exam paper metadata
// (title, subject, board, marks, duration) if auto_create_exam_paper is set on the job. Upserts Question
// rows — matching existing questions by question number or embedding similarity — and creates/updates
// their MarkScheme rows. If run_adversarial_loop is enabled, also runs test answers through the marking
// engine to probe edge cases and stores the results as MarkSchemeTestRun rows. Finally links all new
// questions to the exam paper section if the job has an exam_paper_id.
markSchemePdfQueue.subscribe({
	handler: "packages/backend/src/processors/mark-scheme-pdf.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})

// Triggered automatically: S3 fires a message when a PDF is uploaded to pdfs/exemplars/.
// Can also be triggered manually via { job_id }.
// Handler: fetches the PDF from S3 and asks Gemini to extract all exemplar answers — model answers at
// each mark level with explanations of why they hit that level. Saves ExemplarAnswer rows linked to
// the relevant questions. Then runs validateWithExemplars for each affected mark scheme, grading the
// exemplars through the marking engine to verify the scheme awards the expected scores.
exemplarQueue.subscribe({
	handler: "packages/backend/src/processors/exemplar-pdf.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})

// Triggered automatically: S3 fires a message when a PDF is uploaded to pdfs/question-papers/.
// Can also be triggered manually via { job_id }.
// Handler: fetches the PDF from S3 and sends it to Gemini (two parallel calls) — one to extract every
// question (text, type, marks, options for MCQ) and one to extract exam paper metadata (title, subject,
// board, duration). Creates Question rows with vector embeddings for each question. Links the new
// questions to the exam paper section if the job has an exam_paper_id attached.
questionPaperQueue.subscribe({
	handler: "packages/backend/src/processors/question-paper-pdf.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})

// Triggered manually: a server action pushes { job_id } after a teacher finalises a student paper upload.
// exam_paper_id must be set on the job before this queue is triggered.
// Handler runs in three phases:
//   Phase 1 (parallel): Gemini answer extraction + per-page Cloud Vision word token detection.
//   Phase 2a (awaited): Gemini token reconciliation — corrects raw OCR text per page.
//   Phase 2b (awaited): Gemini vision attribution — assigns corrected tokens to questions,
//     derives precise answer region bboxes. Runs after Phase 2a so corrected text is available.
// On completion enqueues studentPaperQueue for grading.
studentPaperOcrQueue.subscribe({
	handler: "packages/backend/src/processors/student-paper-extract.handler",
	link: [
		neonPostgres,
		geminiApiKey,
		cloudVisionApiKey,
		openAiApiKey,
		scansBucket,
		studentPaperQueue,
		batchClassifyQueue,
	],
	timeout: "10 minutes",
	memory: "1 GB",
})

// Triggered automatically by student-paper-extract once OCR + reconciliation + attribution completes.
// Handler: pure assessment — loads questions and mark schemes, grades each answer via the
// MarkerOrchestrator (Deterministic → LevelOfResponse → LLM), streams incremental results to
// the DB, and stores the full grading_results JSON on the job. If a Student record is linked,
// also writes normalised Answer + MarkingResult rows. On completion enqueues studentPaperEnrichQueue.
studentPaperQueue.subscribe({
	handler: "packages/backend/src/processors/student-paper-grade.handler",
	link: [
		neonPostgres,
		geminiApiKey,
		openAiApiKey,
		scansBucket,
		vapidPublicKey,
		vapidPrivateKey,
		studentPaperEnrichQueue,
	],
	timeout: "8 minutes",
	memory: "1 GB",
})

// Triggered automatically by student-paper-grade once grading completes.
// Generates inline annotations for each graded question using mark scheme context,
// grading results, and OCR tokens. Annotations are anchored to specific token spans.
studentPaperEnrichQueue.subscribe({
	handler: "packages/backend/src/processors/student-paper-enrich.handler",
	link: [neonPostgres, geminiApiKey, scansBucket],
	timeout: "10 minutes",
	memory: "1 GB",
})

// DLQ handlers: each queue has its own dedicated DLQ handler that already knows
// which phase failed — no job state inspection required.
studentPaperOcrDlq.subscribe({
	handler: "packages/backend/src/processors/student-paper-ocr-dlq.handler",
	link: [neonPostgres],
	timeout: "30 seconds",
})

studentPaperGradingDlq.subscribe({
	handler: "packages/backend/src/processors/student-paper-grading-dlq.handler",
	link: [neonPostgres],
	timeout: "30 seconds",
})

studentPaperEnrichDlq.subscribe({
	handler: "packages/backend/src/processors/student-paper-enrich-dlq.handler",
	link: [neonPostgres],
	timeout: "30 seconds",
})
