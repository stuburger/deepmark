import { getJobScanPageUrls, getStudentPaperResult } from "@/lib/mark-actions"
import { notFound } from "next/navigation"
import { derivePhase } from "./shared/phase"
import { UnifiedMarkingLayout } from "./unified-marking-layout"

export default async function MarkResultPage({
	params,
}: {
	params: Promise<{ jobId: string }>
}) {
	const { jobId } = await params

	const [result, scanResult] = await Promise.all([
		getStudentPaperResult(jobId),
		getJobScanPageUrls(jobId),
	])

	if (!result.ok) notFound()

	const data = result.data
	const scanPages = scanResult.ok ? scanResult.pages : []
	const phase = derivePhase(data)

	return (
		<UnifiedMarkingLayout
			jobId={jobId}
			data={data}
			scanPages={scanPages}
			phase={phase}
		/>
	)
}
