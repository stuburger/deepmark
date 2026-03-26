import { getExamPaperDetail } from "@/lib/dashboard-actions"
import { notFound } from "next/navigation"
import { ExamPaperPageShell } from "./exam-paper-page-shell"

export default async function ExamPaperDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const result = await getExamPaperDetail(id)
	if (!result.ok) notFound()

	return (
		<div className="space-y-6">
			<ExamPaperPageShell paper={result.paper} />
		</div>
	)
}
