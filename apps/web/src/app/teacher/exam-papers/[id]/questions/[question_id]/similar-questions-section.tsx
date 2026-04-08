"use client"

import { Button } from "@/components/ui/button"
import { getSimilarQuestionsForPaper } from "@/lib/exam-paper/similarity"
import { AlertTriangle, GitMerge } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { MergeQuestionsDialog } from "./merge-questions-dialog"

type SimilarQuestion = {
	id: string
	text: string
	question_number: string | null
	origin: string
	mark_scheme_status: string | null
	mark_scheme_id: string | null
	mark_scheme_description: string | null
}

type CurrentQuestion = {
	id: string
	text: string
	question_number: string | null
	origin: string
	mark_scheme_id: string | null
	mark_scheme_description: string | null
}

export function SimilarQuestionsSection({
	questionId,
	examPaperId,
	questions,
	currentQuestion,
}: {
	questionId: string
	examPaperId: string
	/** All questions in the paper (passed from server component to avoid re-fetching) */
	questions: SimilarQuestion[]
	/** The current page's question details for the merge dialog */
	currentQuestion: CurrentQuestion
}) {
	const [similarIds, setSimilarIds] = useState<string[] | null>(null)
	const [mergeTarget, setMergeTarget] = useState<SimilarQuestion | null>(null)

	useEffect(() => {
		getSimilarQuestionsForPaper(examPaperId).then((r) => {
			if (!r.ok) return
			const ids = r.pairs
				.filter(
					(p) => p.questionId === questionId || p.similarToId === questionId,
				)
				.map((p) =>
					p.questionId === questionId ? p.similarToId : p.questionId,
				)
			setSimilarIds(ids)
		})
	}, [questionId, examPaperId])

	if (similarIds === null) return null
	if (similarIds.length === 0) return null

	const similarQuestions = similarIds
		.map((id) => questions.find((q) => q.id === id))
		.filter((q): q is SimilarQuestion => q !== undefined)

	if (similarQuestions.length === 0) return null

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
				<p className="text-sm font-medium text-amber-800 dark:text-amber-200">
					Similar question{similarQuestions.length !== 1 ? "s" : ""} detected in
					this paper
				</p>
			</div>
			<p className="text-xs text-muted-foreground">
				These questions may be duplicates from uploading both a question paper
				and mark scheme. You can merge them — choose which question text and
				mark scheme to keep.
			</p>
			<div className="space-y-2">
				{similarQuestions.map((sq) => (
					<div
						key={sq.id}
						className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 space-y-2"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 flex-1">
								{sq.question_number && (
									<p className="text-xs text-muted-foreground mb-0.5">
										Q{sq.question_number}
									</p>
								)}
								<Link
									href={`/teacher/exam-papers/${examPaperId}/questions/${sq.id}`}
									className="text-sm hover:underline underline-offset-4 line-clamp-2"
								>
									{sq.text}
								</Link>
								<p className="text-xs text-muted-foreground mt-1">
									Source: {sq.origin.replace(/_/g, " ")}
								</p>
							</div>
							<Button
								size="sm"
								variant="outline"
								className="shrink-0"
								onClick={() => setMergeTarget(sq)}
							>
								<GitMerge className="h-3.5 w-3.5 mr-1.5" />
								Merge
							</Button>
						</div>
					</div>
				))}
			</div>

			{mergeTarget && (
				<MergeQuestionsDialog
					open={mergeTarget !== null}
					onOpenChange={(open) => {
						if (!open) setMergeTarget(null)
					}}
					currentQuestion={currentQuestion}
					similarQuestion={mergeTarget}
					examPaperId={examPaperId}
				/>
			)}
		</div>
	)
}
