import { getExamPaperStats, listMySubmissions } from "@/lib/mark-actions"
import { notFound } from "next/navigation"
import { ExamPaperStatsShell } from "./exam-paper-stats-shell"

export default async function ExamPaperStatsPage({
	params,
}: {
	params: Promise<{ examPaperId: string }>
}) {
	const { examPaperId } = await params
	const [statsResult, historyResult] = await Promise.all([
		getExamPaperStats(examPaperId),
		listMySubmissions(),
	])

	if (!statsResult.ok) notFound()

	const initialSubmissions = historyResult.ok
		? historyResult.submissions.filter((s) => s.exam_paper_id === examPaperId)
		: []

	return (
		<div className="space-y-6">
			<ExamPaperStatsShell
				examPaperId={examPaperId}
				initialStats={statsResult.stats}
				initialSubmissions={initialSubmissions}
			/>
		</div>
	)
}
