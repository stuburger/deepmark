import { Button } from "@/components/ui/button"
import {
	getExamPaperDetail,
	toggleExamPaperPublic,
} from "@/lib/dashboard-actions"
import { Globe, Lock } from "lucide-react"
import { revalidatePath } from "next/cache"
import { notFound } from "next/navigation"
import { ExamPaperPageShell } from "./exam-paper-page-shell"

async function TogglePublicForm({
	id,
	isPublic,
}: { id: string; isPublic: boolean }) {
	async function toggle() {
		"use server"
		await toggleExamPaperPublic(id, !isPublic)
		revalidatePath(`/teacher/exam-papers/${id}`)
	}
	return (
		<form action={toggle}>
			<Button type="submit" variant="outline" size="sm">
				{isPublic ? (
					<>
						<Lock className="h-3.5 w-3.5 mr-1.5" />
						Unpublish
					</>
				) : (
					<>
						<Globe className="h-3.5 w-3.5 mr-1.5" />
						Publish to catalog
					</>
				)}
			</Button>
		</form>
	)
}

export default async function ExamPaperDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const result = await getExamPaperDetail(id)
	if (!result.ok) notFound()

	const { paper } = result

	return (
		<div className="space-y-6">
			<ExamPaperPageShell
				paper={paper}
				togglePublicForm={
					<TogglePublicForm id={paper.id} isPublic={paper.is_public} />
				}
			/>
		</div>
	)
}
