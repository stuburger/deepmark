import { db } from "@/lib/db"
import type { ResourceGrantRole } from "@mcp-gcse/db"
import {
	effectiveExamPaperRole,
	effectiveSubmissionRole,
} from "./effective-roles"
import type { AuthUser } from "./principal"
import { meetsMinimum } from "./roles"

export async function assertExamPaperAccess(
	user: AuthUser,
	examPaperId: string,
	minimum: ResourceGrantRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const role = await effectiveExamPaperRole(user, examPaperId)
	if (!meetsMinimum(role, minimum)) {
		return { ok: false, error: "You do not have access to this exam paper" }
	}
	return { ok: true }
}

export async function assertSubmissionAccess(
	user: AuthUser,
	submissionId: string,
	minimum: ResourceGrantRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const role = await effectiveSubmissionRole(user, submissionId)
	if (!meetsMinimum(role, minimum)) {
		return { ok: false, error: "You do not have access to this submission" }
	}
	return { ok: true }
}

export async function assertPdfIngestionJobAccess(
	user: AuthUser,
	jobId: string,
	minimum: ResourceGrantRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const job = await db.pdfIngestionJob.findUnique({
		where: { id: jobId },
		select: { exam_paper_id: true, uploaded_by: true },
	})
	if (!job) return { ok: false, error: "Job not found" }

	if (user.systemRole === "admin" && meetsMinimum("owner", minimum)) {
		return { ok: true }
	}

	if (job.exam_paper_id) {
		return assertExamPaperAccess(user, job.exam_paper_id, minimum)
	}
	if (job.uploaded_by === user.id) {
		return meetsMinimum("owner", minimum)
			? { ok: true }
			: { ok: false, error: "You do not have access to this document" }
	}
	return { ok: false, error: "You do not have access to this document" }
}

export async function assertBatchAccess(
	user: AuthUser,
	batchId: string,
	minimum: ResourceGrantRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const batch = await db.batchIngestJob.findUnique({
		where: { id: batchId },
		select: { exam_paper_id: true },
	})
	if (!batch) return { ok: false, error: "Batch not found" }
	return assertExamPaperAccess(user, batch.exam_paper_id, minimum)
}

export async function assertStagedScriptAccess(
	user: AuthUser,
	stagedScriptId: string,
	minimum: ResourceGrantRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const script = await db.stagedScript.findUnique({
		where: { id: stagedScriptId },
		select: { batch_job_id: true },
	})
	if (!script) return { ok: false, error: "Script not found" }
	return assertBatchAccess(user, script.batch_job_id, minimum)
}

export async function examPaperIdForQuestion(
	questionId: string,
): Promise<string | null> {
	const sectionLink = await db.examSectionQuestion.findFirst({
		where: { question_id: questionId },
		select: { exam_section: { select: { exam_paper_id: true } } },
	})
	if (sectionLink) return sectionLink.exam_section.exam_paper_id

	const question = await db.question.findUnique({
		where: { id: questionId },
		select: {
			source_pdf_ingestion_job: {
				select: { exam_paper_id: true },
			},
		},
	})
	return question?.source_pdf_ingestion_job?.exam_paper_id ?? null
}

export async function assertQuestionAccess(
	user: AuthUser,
	questionId: string,
	minimum: ResourceGrantRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const examPaperId = await examPaperIdForQuestion(questionId)
	if (!examPaperId) return { ok: false, error: "Question not found" }
	return assertExamPaperAccess(user, examPaperId, minimum)
}

export async function assertMarkSchemeAccess(
	user: AuthUser,
	markSchemeId: string,
	minimum: ResourceGrantRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const markScheme = await db.markScheme.findUnique({
		where: { id: markSchemeId },
		select: { question_id: true },
	})
	if (!markScheme) return { ok: false, error: "Mark scheme not found" }
	return assertQuestionAccess(user, markScheme.question_id, minimum)
}
