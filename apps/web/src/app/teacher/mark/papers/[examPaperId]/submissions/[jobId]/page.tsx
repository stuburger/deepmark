import {
	getJobPageTokens,
	getJobScanPageUrls,
} from "@/lib/marking/scan/queries"
import { getJobStages } from "@/lib/marking/stages/queries"
import { getStudentPaperJobForPaper } from "@/lib/marking/submissions/queries"
import { notFound } from "next/navigation"
import { SubmissionPageClient } from "./submission-page-client"

/**
 * Direct-link / bookmarkable submission page.
 *
 * Server-fetches jobData, scanPages, pageTokens, and jobStages in parallel so
 * the initial render hydrates React Query with real state — no client-side
 * loading spinner, no pip flicker while SSE connects. The dialog entry point
 * (`MarkingJobDialog` on the exam paper page) still exists for in-context
 * browsing and fetches the same data client-side.
 */
export default async function SubmissionPage({
	params,
}: {
	params: Promise<{ examPaperId: string; jobId: string }>
}) {
	const { examPaperId, jobId } = await params

	const [jobResult, scansResult, tokensResult, stagesResult] =
		await Promise.all([
			getStudentPaperJobForPaper(examPaperId, jobId),
			getJobScanPageUrls(jobId),
			getJobPageTokens(jobId),
			getJobStages(jobId),
		])

	if (!jobResult.ok || !stagesResult.ok) notFound()

	return (
		<SubmissionPageClient
			examPaperId={examPaperId}
			jobId={jobId}
			initialData={jobResult.data}
			scanPages={scansResult.ok ? scansResult.pages : []}
			pageTokens={tokensResult.ok ? tokensResult.tokens : []}
			initialStages={stagesResult.stages}
		/>
	)
}
