import { db } from "@/db"
import {
	type LinkSectionInput,
	linkJobQuestionsToExamPaperSections,
} from "@/lib/grading/link-job-questions"
import { normalizeQuestionNumber } from "@/lib/grading/normalize-question-number"
import {
	type PaperSetupSession,
	type PaperSetupStagedFile,
	ResourceGrantPrincipalType,
	ResourceGrantResourceType,
	ResourceGrantRole,
	type ScanStatus,
} from "@mcp-gcse/db"
import type {
	PaperBundle,
	PaperBundleMarkScheme,
	PaperBundleQuestion,
} from "./schema"

export type SessionWithFiles = PaperSetupSession & {
	staged_files: PaperSetupStagedFile[]
}

/**
 * Promotes a PaperSetupSession into a real ExamPaper.
 *
 * Steps (transactional where possible):
 *   1. Create the ExamPaper with all metadata fields populated.
 *   2. Grant the owner role to the session creator.
 *   3. Create Question + MarkScheme rows for every extracted question.
 *   4. Create one PdfIngestionJob per staged file, fully populated and
 *      already marked `ocr_complete` — the bundle already processed them.
 *   5. Write `exam_paper_id` onto the session. State is derived — the
 *      presence of this id IS what "bundle done" means.
 *   6. If a BatchIngestJob was dispatched in parallel for this session
 *      (carrying paper_setup_session_id), link it to the new paper now.
 *
 * Either everything in this function commits or nothing does — the ExamPaper
 * is never created in a half-formed state. The staged files (and their S3
 * objects) remain owned by the session until the session is deleted; for
 * v1 we keep them as a soft audit trail.
 *
 * NOTE: linkJobQuestionsToExamPaperSections uses the global `db` instance and
 * runs OUTSIDE the transaction — small window where the ExamPaper exists but
 * its ExamSection rows don't. The session view doesn't enable "Start marking"
 * until BOTH bundle and segmentation are done; the gap is invisible.
 */
export async function promoteSessionToExamPaper(
	bundle: PaperBundle,
	session: SessionWithFiles,
	uploaderEmail: string,
): Promise<{ examPaperId: string; questionCount: number }> {
	const meta = bundle.metadata

	const { paperId, sectionInputs, questionCount } = await db.$transaction(
		async (tx) => {
			const paper = await tx.examPaper.create({
				data: {
					title: meta.title,
					subject: meta.subject,
					exam_board: meta.exam_board,
					year: meta.year,
					paper_number: meta.paper_number ?? null,
					total_marks: meta.total_marks,
					duration_minutes: meta.duration_minutes,
					tier: meta.tier ?? null,
					created_by_id: session.created_by_id,
				},
			})

			await tx.resourceGrant.create({
				data: {
					resource_type: ResourceGrantResourceType.exam_paper,
					resource_id: paper.id,
					principal_type: ResourceGrantPrincipalType.user,
					principal_user_id: session.created_by_id,
					principal_email: uploaderEmail,
					role: ResourceGrantRole.owner,
					created_by: session.created_by_id,
					accepted_at: new Date(),
				},
			})

			// Materialise PdfIngestionJob rows for each staged file, fully populated.
			// These represent "this exam paper's source documents" — the upload
			// shell page reads them as the canonical source-of-truth for "what's
			// been uploaded against this paper."
			const now = new Date()
			const jobIds: Record<string, string> = {}
			for (const sf of session.staged_files) {
				const documentType =
					sf.kind === "question_paper"
						? "question_paper"
						: sf.kind === "mark_scheme"
							? "mark_scheme"
							: "exemplar" // scripts_bundle is not a PdfIngestionJob doc type
				if (sf.kind === "scripts_bundle") continue
				const job = await tx.pdfIngestionJob.create({
					data: {
						document_type: documentType,
						s3_key: sf.s3_key,
						s3_bucket: sf.s3_bucket,
						status: "ocr_complete" satisfies ScanStatus,
						uploaded_by: session.created_by_id,
						exam_board: meta.exam_board,
						subject: meta.subject,
						year: meta.year,
						auto_create_exam_paper: false,
						exam_paper_id: paper.id,
						processed_at: now,
						detected_exam_paper_metadata: meta as never,
					},
				})
				jobIds[sf.kind] = job.id
			}

			const sourceJobId = jobIds.question_paper ?? jobIds.mark_scheme ?? null

			const sectionInputs: LinkSectionInput[] = []
			let questionCount = 0
			for (const section of bundle.sections) {
				const linkedQuestions: LinkSectionInput["questions"] = []
				for (const q of section.questions) {
					const questionId = await createQuestionAndMarkScheme(tx, q, {
						subject: meta.subject,
						createdById: session.created_by_id,
						sourceJobId,
					})
					linkedQuestions.push({
						question_id: questionId,
						stimulus_labels: q.stimulus_labels ?? [],
					})
					questionCount++
				}
				sectionInputs.push({
					title: section.title,
					description: section.description ?? null,
					total_marks: section.total_marks,
					choice: {
						kind: section.choice.kind,
						n: section.choice.kind === "any_n_of" ? section.choice.n : null,
					},
					stimuli: section.stimuli?.map((s) => ({
						label: s.label,
						content: s.content,
						content_type: s.content_type ?? "text",
					})),
					questions: linkedQuestions,
				})
			}

			return { paperId: paper.id, sectionInputs, questionCount }
		},
	)

	await linkJobQuestionsToExamPaperSections(
		paperId,
		session.created_by_id,
		sectionInputs,
	)

	await db.paperSetupSession.update({
		where: { id: session.id },
		data: {
			exam_paper_id: paperId,
			error: null,
		},
	})

	// If the batch was dispatched in parallel from createPaperFromStaged, it
	// will already have paper_setup_session_id pointing at us and a null
	// exam_paper_id. Stitch the FK now that the paper exists. updateMany so
	// the no-batch case (teacher dropped no scripts) is a 0-row no-op.
	await db.batchIngestJob.updateMany({
		where: { paper_setup_session_id: session.id, exam_paper_id: null },
		data: { exam_paper_id: paperId },
	})

	return { examPaperId: paperId, questionCount }
}

async function createQuestionAndMarkScheme(
	tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
	q: PaperBundleQuestion,
	ctx: {
		subject: PaperBundle["metadata"]["subject"]
		createdById: string
		sourceJobId: string | null
	},
): Promise<string> {
	const canonicalNumber = q.question_number
		? normalizeQuestionNumber(q.question_number)
		: null

	const question = await tx.question.create({
		data: {
			text: q.question_text,
			topic: ctx.subject,
			subject: ctx.subject,
			created_by_id: ctx.createdById,
			points: q.total_marks,
			question_type: q.question_type,
			multiple_choice_options:
				q.question_type === "multiple_choice" && q.options?.length
					? q.options
					: [],
			source_pdf_ingestion_job_id: ctx.sourceJobId,
			origin: "question_paper",
			question_number: canonicalNumber,
		},
	})

	await createMarkScheme(tx, question.id, q, ctx.createdById)

	return question.id
}

async function createMarkScheme(
	tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
	questionId: string,
	q: PaperBundleQuestion,
	createdById: string,
): Promise<string> {
	const ms = q.mark_scheme
	const markPoints = ms.mark_points.map((mp, idx) => ({
		point_number: idx + 1,
		description: "",
		points: 1,
		criteria: mp.criteria,
	}))
	const pointsTotal = q.total_marks ?? markPoints.length

	const correctOptionLabels =
		q.question_type === "multiple_choice" && ms.correct_option
			? [ms.correct_option.trim()]
			: []

	const aoDescription = formatAoAllocations(ms.ao_allocations ?? [])

	const created = await tx.markScheme.create({
		data: {
			question_id: questionId,
			created_by_id: createdById,
			description: aoDescription || q.question_text.slice(0, 500),
			guidance: ms.guidance ?? null,
			points_total: pointsTotal,
			mark_points: markPoints,
			correct_option_labels: correctOptionLabels,
			marking_method: ms.marking_method,
			content: ms.content ?? "",
			link_status: "linked",
			tags: [],
		},
	})
	return created.id
}

function formatAoAllocations(
	allocations: ReadonlyArray<{ ao_code: string; marks: number }>,
): string {
	if (allocations.length === 0) return ""
	return allocations
		.map((a) => `${a.ao_code} (${a.marks} ${a.marks === 1 ? "mark" : "marks"})`)
		.join(", ")
}

export type { PaperBundle, PaperBundleQuestion, PaperBundleMarkScheme }
