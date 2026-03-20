"use client"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
	consolidateQuestions,
	getSimilarQuestionsForPaper,
} from "@/lib/dashboard-actions"
import { AlertTriangle, GitMerge } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

type SimilarQuestion = {
	id: string
	text: string
	question_number: string | null
	origin: string
}

export function SimilarQuestionsSection({
	questionId,
	examPaperId,
	questions,
}: {
	questionId: string
	examPaperId: string
	/** All questions in the paper (passed from server component to avoid re-fetching) */
	questions: SimilarQuestion[]
}) {
	const router = useRouter()
	const [similarIds, setSimilarIds] = useState<string[] | null>(null)
	const [confirmingId, setConfirmingId] = useState<string | null>(null)
	const [merging, setMerging] = useState(false)
	const [error, setError] = useState<string | null>(null)

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

	async function handleMerge(discardId: string) {
		setMerging(true)
		setError(null)
		const result = await consolidateQuestions(questionId, discardId)
		setMerging(false)
		if (!result.ok) {
			setError(result.error)
			return
		}
		router.push(`/teacher/exam-papers/${examPaperId}`)
		router.refresh()
	}

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
				and mark scheme. You can merge them — the mark scheme will be moved to
				this question and the other will be deleted.
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
							{confirmingId === sq.id ? (
								<div className="flex items-center gap-2 shrink-0">
									<Button
										size="sm"
										variant="destructive"
										disabled={merging}
										onClick={() => handleMerge(sq.id)}
									>
										{merging ? (
											<Spinner className="h-3.5 w-3.5 mr-1.5" />
										) : (
											<GitMerge className="h-3.5 w-3.5 mr-1.5" />
										)}
										{merging ? "Merging…" : "Confirm merge"}
									</Button>
									<Button
										size="sm"
										variant="ghost"
										disabled={merging}
										onClick={() => setConfirmingId(null)}
									>
										Cancel
									</Button>
								</div>
							) : (
								<Button
									size="sm"
									variant="outline"
									className="shrink-0"
									onClick={() => setConfirmingId(sq.id)}
								>
									<GitMerge className="h-3.5 w-3.5 mr-1.5" />
									Merge into this
								</Button>
							)}
						</div>
						{confirmingId === sq.id && (
							<p className="text-xs text-destructive">
								This will delete the other question and move its mark scheme
								here. This cannot be undone.
							</p>
						)}
					</div>
				))}
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	)
}
