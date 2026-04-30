import { effectiveExamPaperRole } from "@/lib/authz"
import { resolveSessionUser } from "@/lib/authz/middleware/require-session"
import { getJobPageTokens, getJobScanPages } from "@/lib/marking/scan/queries"
import { getJobStages } from "@/lib/marking/stages/queries"
import { getStudentPaperJob } from "@/lib/marking/submissions/queries"
import { notFound } from "next/navigation"
import { SubmissionView } from "../../mark/papers/[examPaperId]/submissions/[jobId]/submission-view"

/**
 * Standalone submission page. Asserts only submission-level access — used by
 * users who have been granted access to a single submission (not the parent
 * exam paper) and by the marking-history list as the canonical "open this
 * submission" link.
 *
 * The exam-paper detail page's `?job=...` query still works for paper owners /
 * editors who want the submission opened in a dialog with full paper context.
 */
export default async function SubmissionPage({
	params,
}: {
	params: Promise<{ jobId: string }>
}) {
	const { jobId } = await params

	const [jobResult, scanResult, tokensResult, stagesResult] = await Promise.all(
		[
			getStudentPaperJob({ jobId }),
			getJobScanPages({ jobId }),
			getJobPageTokens({ jobId }),
			getJobStages({ jobId }),
		],
	)

	const jobData = jobResult?.data?.data
	const stages = stagesResult?.data?.stages
	if (!jobData || !stages) notFound()

	// Paper-link breadcrumb only renders if the viewer can also access the
	// parent paper. Submission-only grants (the typical sharing case) don't
	// imply paper access, so following that link would 404.
	const user = await resolveSessionUser()
	const paperRole = await effectiveExamPaperRole(user, jobData.exam_paper_id)
	const paperAccessible = paperRole !== null

	return (
		<div className="fixed inset-0 z-40 flex flex-col bg-background">
			<SubmissionView
				examPaperId={jobData.exam_paper_id}
				jobId={jobId}
				initialData={jobData}
				scanPages={scanResult?.data?.pages ?? []}
				pageTokens={tokensResult?.data?.tokens ?? []}
				initialStages={stages}
				paperAccessible={paperAccessible}
			/>
		</div>
	)
}
