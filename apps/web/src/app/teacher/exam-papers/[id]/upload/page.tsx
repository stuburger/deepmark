import { getExamPaperDetail } from "@/lib/exam-paper/paper/queries"
import { notFound } from "next/navigation"
import { LinkedPdfUploadClient } from "./upload-client"

export default async function ExamPaperUploadPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const result = await getExamPaperDetail({ id })
	const paper = result?.data?.paper
	if (!paper) notFound()

	return (
		<LinkedPdfUploadClient
			examPaperId={paper.id}
			examPaperTitle={paper.title}
			subject={paper.subject}
			examBoard={paper.exam_board}
			year={paper.year}
		/>
	)
}
