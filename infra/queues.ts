import { collabServer } from "./collab"
import {
	anthropicApiKey,
	cloudVisionApiKey,
	collabServiceSecret,
	geminiApiKey,
	isPermanentStage,
	openAiApiKey,
} from "./config"
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

// Pre-launch (zero real users): a doomed SQS message has no value sitting in the
// queue for the 4-day default while it gets redelivered every few minutes — that's
// the founder's personal money on every retry. Cap at 30 min everywhere so a bad
// message dies fast. Delete this constant and all references when real users exist.
// DLQs are intentionally NOT capped — their purpose is post-mortem inspection.
const PRELAUNCH_QUEUE_RETENTION_SECONDS = 30 * 60
const prelaunchRetention = {
	queue: { messageRetentionSeconds: PRELAUNCH_QUEUE_RETENTION_SECONDS },
}

export const markSchemePdfQueue = new sst.aws.Queue("MarkSchemePdfQueue", {
	visibilityTimeout: "10 minutes",
	transform: prelaunchRetention,
})

export const exemplarQueue = new sst.aws.Queue("ExemplarQueue", {
	visibilityTimeout: "10 minutes",
	transform: prelaunchRetention,
})

export const questionPaperQueue = new sst.aws.Queue("QuestionPaperQueue", {
	visibilityTimeout: "10 minutes",
	transform: prelaunchRetention,
})

// Dedicated DLQ per queue — each handler already knows its phase, no state inference needed.
// Retention left at SQS default (4 days) so failed messages stick around long enough to inspect.
const studentPaperOcrDlq = new sst.aws.Queue("StudentPaperOcrDLQ", {
	visibilityTimeout: "1 minute",
})
const studentPaperGradingDlq = new sst.aws.Queue("StudentPaperGradingDLQ", {
	visibilityTimeout: "1 minute",
})

// OCR queue: manually triggered by server action after teacher finalises upload
export const studentPaperOcrQueue = new sst.aws.Queue("StudentPaperOcrQueue", {
	visibilityTimeout: "10 minutes",
	dlq: { queue: studentPaperOcrDlq.arn, retry: 2 },
	transform: prelaunchRetention,
})

// Grading queue: manually triggered by server action after teacher selects exam paper.
// Grading + inline annotation run in the same Lambda — no downstream enrichment queue.
export const studentPaperQueue = new sst.aws.Queue("StudentPaperQueue", {
	visibilityTimeout: "10 minutes",
	dlq: { queue: studentPaperGradingDlq.arn, retry: 2 },
	transform: prelaunchRetention,
})

// K-7: projection queue. Fires on Y.Doc snapshot writes from Hocuspocus
// (yjs/${stage}:submission:${id}.bin) and projects the doc state onto PG —
// `student_paper_annotations` rows, `GradingRun.grading_results` JSON, and
// `TeacherOverride` rows. The doc is the source of truth for everything in
// the editor; this Lambda is the only writer of the projected PG state.
//
// Created on:
//   - `sst dev` (any stage)  → Lambda runs locally; queue + S3 notification
//                              are real cloud resources on the dev stage's
//                              own scansBucket. Necessary because grade
//                              Lambda no longer writes `grading_results`
//                              directly and override server actions no
//                              longer write `TeacherOverride` directly —
//                              both depend on this projection landing.
//   - permanent stages       → standard Lambda deployment.
//   - non-dev, non-permanent (PR preview) → skipped. PR previews share the
//                              dev stage's collab + projection.
export const annotationProjectionQueue =
	$dev || isPermanentStage
		? new sst.aws.Queue("AnnotationProjectionQueue", {
				visibilityTimeout: "5 minutes",
				transform: prelaunchRetention,
			})
		: undefined

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
		...(annotationProjectionQueue
			? [
					{
						name: "YjsSnapshotTrigger",
						queue: annotationProjectionQueue,
						events: ["s3:ObjectCreated:*" as const],
						filterPrefix: "yjs/",
						filterSuffix: ".bin",
					},
				]
			: []),
	],
})

annotationProjectionQueue?.subscribe({
	handler: "packages/backend/src/processors/annotation-projection.handler",
	link: [neonPostgres, scansBucket],
	environment: {
		STAGE: $app.stage,
	},
	timeout: "2 minutes",
	memory: "512 MB",
})

export const batchClassifyQueue = new sst.aws.Queue("BatchClassifyQueue", {
	visibilityTimeout: "5 minutes",
	transform: prelaunchRetention,
})

batchClassifyQueue.subscribe({
	handler: "packages/backend/src/processors/batch-classify.handler",
	link: [
		neonPostgres,
		geminiApiKey,
		openAiApiKey,
		anthropicApiKey,
		cloudVisionApiKey,
		scansBucket,
	],
	timeout: "4 minutes",
	memory: "2 GB",
	nodejs: { install: ["sharp", "mupdf"] },
})

// Test-only Lambda — same handler module as the BatchClassifyQueue subscriber,
// invokable directly via the AWS SDK with a synthetic SQS event payload. Lets
// the smoke test exercise the deployed code path under real Lambda conditions
// (memory cap, vCPU, native bindings) without going through SQS or the upload
// flow. `dev: false` keeps it in real AWS even during `sst dev`. Skipped on
// production — no value in a never-invoked Lambda there.
export const batchClassifyTestRunner =
	$app.stage !== "production"
		? new sst.aws.Function("BatchClassifyTestRunner", {
				handler: "packages/backend/src/processors/batch-classify.handler",
				link: [
					neonPostgres,
					geminiApiKey,
					openAiApiKey,
					anthropicApiKey,
					cloudVisionApiKey,
					scansBucket,
				],
				timeout: "4 minutes",
				memory: "2 GB",
				nodejs: { install: ["sharp", "mupdf"] },
				dev: false,
			})
		: undefined

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
	link: [
		neonPostgres,
		geminiApiKey,
		openAiApiKey,
		anthropicApiKey,
		scansBucket,
	],
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
	link: [
		neonPostgres,
		geminiApiKey,
		openAiApiKey,
		anthropicApiKey,
		scansBucket,
	],
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
	link: [
		neonPostgres,
		geminiApiKey,
		openAiApiKey,
		anthropicApiKey,
		scansBucket,
	],
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
		anthropicApiKey,
		scansBucket,
		studentPaperQueue,
		batchClassifyQueue,
		// seedSkeleton + fillAnswerTexts open a HeadlessEditor against Hocuspocus
		// to stream the document scaffolding + OCR text in real time.
		collabServer,
		collabServiceSecret,
	],
	environment: {
		STAGE: $app.stage,
	},
	timeout: "10 minutes",
	memory: "1 GB",
})

// Triggered automatically by student-paper-extract once OCR + reconciliation + attribution completes.
// Handler: loads questions + mark schemes, grades each answer via the MarkerOrchestrator
// (Deterministic → LevelOfResponse → LLM), and for each graded question also produces inline
// annotations (deterministic tick/cross for MCQ and point-based; Gemini-authored for LoR).
// Streams incremental grading results to the DB; writes annotations and LLM snapshots on the
// GradingRun when complete. If a Student record is linked, also writes normalised Answer +
// MarkingResult rows.
studentPaperQueue.subscribe({
	handler: "packages/backend/src/processors/student-paper-grade.handler",
	link: [
		neonPostgres,
		geminiApiKey,
		openAiApiKey,
		anthropicApiKey,
		scansBucket,
		vapidPublicKey,
		vapidPrivateKey,
		collabServer,
		collabServiceSecret,
	],
	environment: {
		STAGE: $app.stage,
	},
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
