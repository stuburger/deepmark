import { getExamPaperDetail } from "@/lib/exam-paper/queries"
import { getExamPaperStats, listMySubmissions } from "@/lib/marking/queries"
import { getExamPaperIngestionLiveState } from "@/lib/pdf-ingestion/queries"
import { notFound } from "next/navigation"
import { ExamPaperPageShell } from "./exam-paper-page-shell"

export default async function ExamPaperDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const [result, liveStateResult, submissionsResult, statsResult] =
		await Promise.all([
			getExamPaperDetail(id),
			getExamPaperIngestionLiveState(id),
			listMySubmissions(),
			getExamPaperStats(id),
		])
	if (!result.ok) notFound()

	const initialLiveState = liveStateResult.ok
		? {
				ok: true as const,
				jobs: liveStateResult.jobs,
				documents: liveStateResult.documents,
			}
		: { ok: true as const, jobs: [], documents: [] }
	const initialSubmissions = submissionsResult.ok
		? submissionsResult.submissions.filter((s) => s.exam_paper_id === id)
		: []
	const initialAnalytics = statsResult.ok ? statsResult.stats : null

	return (
		<div className="space-y-6">
			<ExamPaperPageShell
				paper={result.paper}
				initialLiveState={initialLiveState}
				initialSubmissions={initialSubmissions}
				initialAnalytics={initialAnalytics}
			/>
		</div>
	)
}
