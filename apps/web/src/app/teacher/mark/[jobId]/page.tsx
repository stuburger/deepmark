import { getStudentPaperResult } from "@/lib/mark-actions"
import { notFound, redirect } from "next/navigation"

export default async function MarkResultPage({
	params,
}: {
	params: Promise<{ jobId: string }>
}) {
	const { jobId } = await params

	const result = await getStudentPaperResult(jobId)
	if (!result.ok) notFound()

	redirect(
		`/teacher/mark/papers/${result.data.exam_paper_id}/submissions/${jobId}`,
	)
}
