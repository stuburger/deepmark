import { geminiApiKey, openAiApiKey } from "./config"
import { neonPostgres } from "./database"
import { scansBucket } from "./storage"

export const markSchemePdfQueue = new sst.aws.Queue("MarkSchemePdfQueue", {
	visibilityTimeout: "10 minutes",
})

export const exemplarQueue = new sst.aws.Queue("ExemplarQueue", {
	visibilityTimeout: "10 minutes",
})

export const questionPaperQueue = new sst.aws.Queue("QuestionPaperQueue", {
	visibilityTimeout: "10 minutes",
})

// OCR queue: manually triggered by server action after teacher finalises upload
export const studentPaperOcrQueue = new sst.aws.Queue("StudentPaperOcrQueue", {
	visibilityTimeout: "10 minutes",
})

// Grading queue: manually triggered by server action after teacher selects exam paper
export const studentPaperQueue = new sst.aws.Queue("StudentPaperQueue", {
	visibilityTimeout: "10 minutes",
})

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
// Handler: loads all page files for the job from S3, then fans out to Gemini in parallel —
// one call across all pages to extract the student name + every answer keyed by question number,
// plus a per-page runOcr call for transcripts and bounding boxes. Saves the raw extracted answers
// and page-level OCR analyses back onto the PdfIngestionJob, then automatically enqueues studentPaperQueue.
studentPaperOcrQueue.subscribe({
	handler: "packages/backend/src/processors/student-paper-extract.handler",
	link: [
		neonPostgres,
		geminiApiKey,
		openAiApiKey,
		scansBucket,
		studentPaperQueue,
	],
	timeout: "8 minutes",
	memory: "1 GB",
})

// Triggered automatically by student-paper-extract once OCR completes (exam_paper_id always required).
// Handler: loads the exam paper's questions and mark schemes, then aligns the OCR-extracted answers
// to the correct questions using three passes — (1) normalised string match on question number,
// (2) positional match when counts agree, (3) LLM fallback for OCR misreads. Grades each aligned
// answer via the MarkerOrchestrator (Deterministic → LevelOfResponse → LLM) and stores the full
// results as a JSON blob on the job. If a Student record is linked to the job, also writes
// normalised Answer + MarkingResult rows to the database.
studentPaperQueue.subscribe({
	handler: "packages/backend/src/processors/student-paper-grade.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})
