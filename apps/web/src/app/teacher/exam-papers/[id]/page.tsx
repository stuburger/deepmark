import { getExamPaperDetail } from "@/lib/dashboard-actions"
import { getPdfDocumentsForPaper } from "@/lib/pdf-ingestion-actions"
import { notFound } from "next/navigation"
import { ExamPaperPageShell } from "./exam-paper-page-shell"

export default async function ExamPaperDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const [result, docsResult] = await Promise.all([
		getExamPaperDetail(id),
		getPdfDocumentsForPaper(id),
	])
	if (!result.ok) notFound()

	const initialDocs = docsResult.ok ? docsResult.documents : []

	return (
		<div className="space-y-6">
			<ExamPaperPageShell paper={result.paper} initialDocs={initialDocs} />
		</div>
	)
}
