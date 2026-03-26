"use client"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type {
	ExamPaperDetail,
	ExamPaperQuestion,
} from "@/lib/dashboard-actions"
import { deleteQuestion } from "@/lib/dashboard-actions"
import { Clock, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

function naturalCompare(a: string | null, b: string | null): number {
	if (a === null && b === null) return 0
	if (a === null) return 1
	if (b === null) return -1
	const re = /(\d+)|(\D+)/g
	const partsA = [...a.matchAll(re)].map((m) => m[0])
	const partsB = [...b.matchAll(re)].map((m) => m[0])
	for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
		const pa = partsA[i] ?? ""
		const pb = partsB[i] ?? ""
		const na = Number(pa)
		const nb = Number(pb)
		if (!isNaN(na) && !isNaN(nb)) {
			if (na !== nb) return na - nb
		} else {
			if (pa < pb) return -1
			if (pa > pb) return 1
		}
	}
	return 0
}

function groupBySection(
	questions: ExamPaperQuestion[],
): { sectionTitle: string; questions: ExamPaperQuestion[] }[] {
	const sorted = [...questions].sort((a, b) => {
		const cmp = naturalCompare(a.question_number, b.question_number)
		return cmp !== 0 ? cmp : a.order - b.order
	})

	const sections: { sectionTitle: string; questions: ExamPaperQuestion[] }[] =
		[]
	for (const q of sorted) {
		const title = q.section_title ?? ""
		const existing = sections.find((s) => s.sectionTitle === title)
		if (existing) {
			existing.questions.push(q)
		} else {
			sections.push({ sectionTitle: title, questions: [q] })
		}
	}
	return sections
}

function QuestionBlock({
	question,
	paperId,
	onQuestionClick,
	onDeleted,
}: {
	question: ExamPaperQuestion
	paperId: string
	onQuestionClick: (id: string) => void
	onDeleted: () => void
}) {
	const router = useRouter()
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [deleteError, setDeleteError] = useState<string | null>(null)

	async function handleDelete() {
		setDeleting(true)
		setDeleteError(null)
		const result = await deleteQuestion(question.id)
		setDeleting(false)
		if (!result.ok) {
			setDeleteError(result.error)
			return
		}
		router.refresh()
		onDeleted()
	}

	const isMultipleChoice = question.question_type === "multiple_choice"
	const marksLabel =
		question.points !== null
			? `[${question.points} mark${question.points !== 1 ? "s" : ""}]`
			: null

	return (
		<div className="group relative py-5 border-b border-dashed border-zinc-200 dark:border-zinc-700 last:border-0">
			<div className="flex items-start gap-3">
				{/* Question number */}
				<span className="font-bold text-sm w-8 shrink-0 pt-0.5 tabular-nums">
					{question.question_number ?? question.order}
				</span>

				{/* Question body */}
				<div
					className="flex-1 min-w-0 cursor-pointer"
					onClick={() => onQuestionClick(question.id)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") onQuestionClick(question.id)
					}}
					role="button"
					tabIndex={0}
				>
					<div className="flex items-start justify-between gap-4">
						<p className="text-sm leading-relaxed">{question.text}</p>
						{marksLabel && (
							<span className="shrink-0 text-xs text-muted-foreground font-medium tabular-nums">
								{marksLabel}
							</span>
						)}
					</div>

					{/* MCQ options */}
					{isMultipleChoice && question.multiple_choice_options.length > 0 && (
						<div className="mt-2.5 space-y-1">
							{question.multiple_choice_options.map((opt) => (
								<div
									key={opt.option_label}
									className="flex items-start gap-2.5 text-sm"
								>
									<span className="font-medium shrink-0 w-5 tabular-nums">
										{opt.option_label}.
									</span>
									<span>{opt.option_text}</span>
								</div>
							))}
						</div>
					)}

					{/* Answer space for written questions */}
					{!isMultipleChoice && (
						<div
							className="mt-3 rounded border border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-900/30"
							style={{
								height: `${Math.max(3, Math.min(10, (question.points ?? 3) * 1.2))}rem`,
							}}
							aria-hidden
						/>
					)}
				</div>

				{/* Delete button */}
				<div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
					<Button
						size="sm"
						variant="ghost"
						className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
						onClick={(e) => {
							e.stopPropagation()
							setConfirmOpen(true)
						}}
						title="Delete question"
					>
						<Trash2 className="h-3.5 w-3.5" />
						<span className="sr-only">Delete question</span>
					</Button>
				</div>
			</div>

			{deleteError && (
				<p className="mt-1 ml-11 text-xs text-destructive">{deleteError}</p>
			)}

			<ConfirmDialog
				open={confirmOpen}
				onOpenChange={(next) => {
					if (!deleting) setConfirmOpen(next)
				}}
				title="Delete this question?"
				description="This will permanently remove the question, its mark scheme, and all associated data. This cannot be undone."
				confirmLabel={deleting ? "Deleting…" : "Delete question"}
				loading={deleting}
				onConfirm={handleDelete}
			/>
		</div>
	)
}

export function ExamPaperPaperView({
	paper,
	onQuestionClick,
}: {
	paper: ExamPaperDetail
	onQuestionClick: (questionId: string) => void
}) {
	const router = useRouter()
	const sections = groupBySection(paper.questions)

	if (paper.questions.length === 0) {
		return (
			<div className="py-8 text-center text-sm text-muted-foreground">
				No questions yet. Upload a question paper or mark scheme PDF to populate
				this paper.
			</div>
		)
	}

	return (
		<div className="bg-zinc-50 dark:bg-zinc-900/40 rounded-lg p-6">
			{/* Exam paper document */}
			<div className="max-w-2xl mx-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-sm">
				{/* Header */}
				<div className="px-8 pt-8 pb-6 border-b border-zinc-200 dark:border-zinc-800">
					<div className="text-center space-y-1">
						{paper.exam_board && (
							<p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
								{paper.exam_board}
							</p>
						)}
						<h1 className="text-xl font-bold">{paper.title}</h1>
						<p className="text-sm text-muted-foreground capitalize">
							{paper.subject}
							{paper.paper_number ? ` · Paper ${paper.paper_number}` : ""}
							{" · "}
							{paper.year}
						</p>
					</div>
					<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-zinc-100 dark:border-zinc-800 pt-3">
						<span className="flex items-center gap-1.5">
							<Clock className="h-3.5 w-3.5" />
							{paper.duration_minutes} minutes
						</span>
						<span>Total marks: {paper.total_marks}</span>
						<span>
							{paper.questions.length} question
							{paper.questions.length !== 1 ? "s" : ""}
						</span>
					</div>
				</div>

				{/* Questions */}
				<div className="px-8 py-4">
					{sections.map(({ sectionTitle, questions }) => (
						<div key={sectionTitle || "__default__"} className="mb-6">
							{sectionTitle && (
								<div className="mb-3 pb-1.5 border-b border-zinc-200 dark:border-zinc-700">
									<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
										{sectionTitle}
									</h2>
								</div>
							)}
							<div>
								{questions.map((q) => (
									<QuestionBlock
										key={q.id}
										question={q}
										paperId={paper.id}
										onQuestionClick={onQuestionClick}
										onDeleted={() => router.refresh()}
									/>
								))}
							</div>
						</div>
					))}
				</div>

				{/* Footer */}
				<div className="px-8 py-4 border-t border-zinc-200 dark:border-zinc-800 text-center">
					<p className="text-xs text-muted-foreground">
						End of paper — Total: {paper.total_marks} marks
					</p>
				</div>
			</div>
		</div>
	)
}
