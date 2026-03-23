import {
	getJobScanPageUrls,
	getStudentPaperJobForPaper,
} from "@/lib/mark-actions"
import { notFound } from "next/navigation"
import { derivePhase } from "../../../../[jobId]/shared/phase"
import { SubmissionView } from "./submission-view"

export default async function SubmissionPage({
	params,
}: {
	params: Promise<{ examPaperId: string; jobId: string }>
}) {
	const { examPaperId, jobId } = await params

	const [result, scanResult] = await Promise.all([
		getStudentPaperJobForPaper(examPaperId, jobId),
		getJobScanPageUrls(jobId),
	])

	if (!result.ok) notFound()

	const data = result.data
	const scanPages = scanResult.ok ? scanResult.pages : []
	const phase = derivePhase(data)

	return (
		<SubmissionView
			examPaperId={examPaperId}
			jobId={jobId}
			initialData={data}
			scanPages={scanPages}
			initialPhase={phase}
		/>
	)
}
