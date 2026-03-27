import { getExamPaperDetail } from "@/lib/dashboard-actions"
import { listMySubmissions } from "@/lib/mark-actions"
import { getPdfDocumentsForPaper } from "@/lib/pdf-ingestion-actions"
import { notFound } from "next/navigation"
import { ExamPaperPageShell } from "./exam-paper-page-shell"

export default async function ExamPaperDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const [result, docsResult, submissionsResult] = await Promise.all([
		getExamPaperDetail(id),
		getPdfDocumentsForPaper(id),
		listMySubmissions(),
	])
	if (!result.ok) notFound()

	const initialDocs = docsResult.ok ? docsResult.documents : []
	const initialSubmissions = submissionsResult.ok
		? submissionsResult.submissions.filter((s) => s.exam_paper_id === id)
		: []

	return (
		<div className="space-y-6">
			<ExamPaperPageShell
				paper={result.paper}
				initialDocs={initialDocs}
				initialSubmissions={initialSubmissions}
			/>
		</div>
	)
}
