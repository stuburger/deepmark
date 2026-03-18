import { getStudentPaperResult } from "@/lib/mark-actions"
import { notFound } from "next/navigation"
import { MarkingResultsClient } from "./results-client"

export default async function MarkResultPage({
	params,
}: {
	params: Promise<{ jobId: string }>
}) {
	const { jobId } = await params
	const result = await getStudentPaperResult(jobId)

	if (!result.ok) notFound()
	if (result.data.status !== "ocr_complete") {
		// Still processing — redirect back to new page
		return (
			<div className="max-w-xl mx-auto mt-16 text-center space-y-3">
				<p className="text-lg font-semibold">Still processing…</p>
				<p className="text-sm text-muted-foreground">
					This paper is not ready yet. Please wait a moment.
				</p>
			</div>
		)
	}

	return <MarkingResultsClient jobId={jobId} data={result.data} />
}
