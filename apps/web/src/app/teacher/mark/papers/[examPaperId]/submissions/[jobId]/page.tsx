import { getJobPageTokens, getJobScanPageUrls } from "@/lib/marking/scan/queries"
import { getStudentPaperJobForPaper } from "@/lib/marking/submissions/queries"
import { notFound } from "next/navigation"
import { derivePhase } from "./phase"
import { SubmissionView } from "./submission-view"

export default async function SubmissionPage({
	params,
	searchParams,
}: {
	params: Promise<{ examPaperId: string; jobId: string }>
	searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
	const [{ examPaperId, jobId }, sp] = await Promise.all([params, searchParams])
	const debugMode = sp.debug === "true"

	const [result, scanResult, tokensResult] = await Promise.all([
		getStudentPaperJobForPaper(examPaperId, jobId),
		getJobScanPageUrls(jobId),
		getJobPageTokens(jobId),
	])

	if (!result.ok) notFound()

	const data = result.data
	const scanPages = scanResult.ok ? scanResult.pages : []
	const pageTokens = tokensResult.ok ? tokensResult.tokens : []
	const phase = derivePhase(data)

	return (
		<div className="-m-6 h-dvh">
			<SubmissionView
				examPaperId={examPaperId}
				jobId={jobId}
				initialData={data}
				scanPages={scanPages}
				pageTokens={pageTokens}
				initialPhase={phase}
				debugMode={debugMode}
			/>
		</div>
	)
}
