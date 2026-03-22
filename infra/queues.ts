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
		// StudentPaperTrigger intentionally removed — student paper OCR and grading
		// are manually queued by server actions, not auto-triggered on S3 upload.
	],
})

// Triggered automatically: S3 fires a message whenever an image is uploaded to scans/<submissionId>/<page>.
// Handler: runs Gemini OCR on the page image and stores the transcript + bounding-box features on the
// ScanPage row. Once every page in the submission is OCR'd, it detects the student name from page 1
// and pushes { scan_submission_id } to extractionQueue to kick off answer extraction.
ocrQueue.subscribe({
	handler: "packages/backend/src/processors/ocr.handler",
	link: [
		neonPostgres,
		geminiApiKey,
		openAiApiKey,
		scansBucket,
		extractionQueue,
	],
	timeout: "4 minutes",
	memory: "512 MB",
})

export const scanGradingQueue = new sst.aws.Queue("ScanGradingQueue", {
	visibilityTimeout: "10 minutes",
})

export const regionRefinementQueue = new sst.aws.Queue(
	"RegionRefinementQueue",
	{
		visibilityTimeout: "8 minutes",
	},
)

// Triggered by: ocrQueue handler once all pages for a submission are OCR'd.
// Message shape: { scan_submission_id }
// Handler: sends all OCR transcripts + bounding-box features (across every page) to Gemini along with the
// exam paper's question structure. Gemini maps each piece of handwriting to the correct question (and
// question part), producing ExtractedAnswer rows with per-page bounding boxes. Once done it pushes
// { scan_submission_id } to BOTH scanGradingQueue (to grade the answers) and regionRefinementQueue
// (to sharpen the answer bounding boxes) in parallel.
extractionQueue.subscribe({
	handler: "packages/backend/src/processors/extract-answers.handler",
	link: [
		neonPostgres,
		geminiApiKey,
		openAiApiKey,
		scanGradingQueue,
		regionRefinementQueue,
	],
	timeout: "3 minutes",
})

// Triggered by: extractionQueue handler after ExtractedAnswer rows have been saved.
// Message shape: { scan_submission_id }
// Handler: loads all ExtractedAnswers and the exam paper's mark schemes, then runs the MarkerOrchestrator
// (Deterministic → LevelOfResponse → LLM) to grade each answer. Upserts a Student record using the
// name detected during OCR, writes Answer + MarkingResult rows, and marks the submission as "graded".
scanGradingQueue.subscribe({
	handler: "packages/backend/src/processors/grade-scan.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey],
	timeout: "8 minutes",
	memory: "512 MB",
})

// Triggered by: extractionQueue handler (runs in parallel with scanGradingQueue).
// Message shape: { scan_submission_id }
// Handler: for each page that contains extracted answers, fetches the raw scan image from S3 and asks
// Gemini Vision to draw a precise bounding box around the entire handwritten answer region for each
// question. Saves the coordinates back onto each ExtractedAnswer row as answer_regions. These regions
// are consumed by the scan viewer UI to highlight exactly where each answer appears on the page.
regionRefinementQueue.subscribe({
	handler: "packages/backend/src/processors/refine-answer-regions.handler",
	link: [neonPostgres, geminiApiKey, scansBucket],
	timeout: "6 minutes",
	memory: "512 MB",
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
// Handler: loads all page files for the job from S3, then fans out to Gemini in parallel —
// one call across all pages to extract the student name + every answer keyed by question number,
// plus a per-page runOcr call for transcripts and bounding boxes. Saves the raw extracted answers
// and page-level OCR analyses back onto the PdfIngestionJob. Does NOT grade — the teacher must
// select an exam paper first and then trigger studentPaperQueue separately.
studentPaperOcrQueue.subscribe({
	handler: "packages/backend/src/processors/student-paper-ocr.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})

// Triggered manually: a server action pushes { job_id } after a teacher selects an exam paper for a
// student paper that has already been OCR'd (studentPaperOcrQueue must have run first).
// Handler: loads the exam paper's questions and mark schemes, then aligns the OCR-extracted answers
// to the correct questions using three passes — (1) normalised string match on question number,
// (2) positional match when counts agree, (3) LLM fallback for OCR misreads. Grades each aligned
// answer via the MarkerOrchestrator (Deterministic → LevelOfResponse → LLM) and stores the full
// results as a JSON blob on the job. If a Student record is linked to the job, also writes
// normalised Answer + MarkingResult rows to the database.
studentPaperQueue.subscribe({
	handler: "packages/backend/src/processors/student-paper-pdf.handler",
	link: [neonPostgres, geminiApiKey, openAiApiKey, scansBucket],
	timeout: "8 minutes",
	memory: "1 GB",
})
