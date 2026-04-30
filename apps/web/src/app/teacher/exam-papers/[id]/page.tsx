import { getExamPaperDetail } from "@/lib/exam-paper/paper/queries"
import { listMySubmissions } from "@/lib/marking/listing/queries"
import { getExamPaperStats } from "@/lib/marking/stats/queries"
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
			getExamPaperDetail({ id }),
			getExamPaperIngestionLiveState({ examPaperId: id }),
			listMySubmissions(),
			getExamPaperStats({ examPaperId: id }),
		])
	const paper = result?.data?.paper
	if (!paper) notFound()

	const liveData = liveStateResult?.data
	const initialLiveState = liveData
		? {
				ok: true as const,
				jobs: liveData.jobs,
				documents: liveData.documents,
			}
		: { ok: true as const, jobs: [], documents: [] }
	const initialSubmissions = submissionsResult?.data?.submissions
		? submissionsResult.data.submissions.filter((s) => s.exam_paper_id === id)
		: []
	const initialAnalytics = statsResult?.data?.stats ?? null

	return (
		<div className="space-y-6">
			<ExamPaperPageShell
				paper={paper}
				initialLiveState={initialLiveState}
				initialSubmissions={initialSubmissions}
				initialAnalytics={initialAnalytics}
			/>
		</div>
	)
}
