import {
	effectiveExamPaperRole,
	effectiveSubmissionRole,
	meetsMinimum,
} from "@/lib/authz"
import { resolveSessionUser } from "@/lib/authz/middleware/require-session"
import { getStudentPaperJob } from "@/lib/marking/submissions/queries"
import { notFound } from "next/navigation"
import { SubmissionPageClient } from "./submission-page-client"

/**
 * Standalone submission page. Asserts only submission-level access — used by
 * users who have been granted access to a single submission (not the parent
 * exam paper) and by the marking-history list as the canonical "open this
 * submission" link.
 *
 * The exam-paper detail page's `?job=...` query still works for paper owners
 * who want the submission opened in a dialog with full paper context.
 *
 * Server-side we resolve the submission so we can determine the parent
 * paper's id (needed for breadcrumb routing) and whether this viewer can
 * follow the breadcrumb to the paper. The actual submission data is loaded
 * client-side via SubmissionPageClient — the same pattern MarkingJobDialog
 * uses, which avoids SSR-rendering SubmissionView (Yjs / TanStack Query
 * bundling drops them into duplicate-import territory under direct RSC).
 */
export default async function SubmissionPage({
	params,
}: {
	params: Promise<{ jobId: string }>
}) {
	const { jobId } = await params

	const jobResult = await getStudentPaperJob({ jobId })
	const jobData = jobResult?.data?.data
	if (!jobData) notFound()

	const user = await resolveSessionUser()
	const [paperRole, submissionRole] = await Promise.all([
		effectiveExamPaperRole(user, jobData.exam_paper_id),
		effectiveSubmissionRole(user, jobId),
	])
	const paperAccessible = paperRole !== null
	const readOnly = !meetsMinimum(submissionRole, "editor")

	return (
		<SubmissionPageClient
			jobId={jobId}
			examPaperId={jobData.exam_paper_id}
			paperAccessible={paperAccessible}
			readOnly={readOnly}
		/>
	)
}
