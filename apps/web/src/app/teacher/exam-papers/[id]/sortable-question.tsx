"use client"

import { McqOptions } from "@/components/mcq-options"
import { StimulusDisclosure } from "@/components/stimulus-disclosure"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ExamPaperQuestion } from "@/lib/exam-paper/types"
import { cn } from "@/lib/utils"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlertTriangle, GripVertical, Pencil, Trash2 } from "lucide-react"
import { parseAsString, useQueryState } from "nuqs"
import { useState } from "react"
import { useDeleteQuestion } from "./hooks/use-exam-paper-mutations"

const iconBtnClass =
	"h-7 w-7 p-0 text-muted-foreground/60 hover:text-foreground transition-colors"

export function SortableQuestion({
	question,
	paperId,
	onDeleted,
}: {
	question: ExamPaperQuestion
	paperId: string
	onDeleted: () => void
}) {
	const { mutate: deleteQ, isPending: deleting } = useDeleteQuestion(paperId)

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: question.id })
	const style = { transform: CSS.Transform.toString(transform), transition }

	const [, setEditQuestionId] = useQueryState("edit_question", parseAsString)
	const [confirmOpen, setConfirmOpen] = useState(false)

	const hasScheme =
		question.mark_scheme_status === "linked" ||
		question.mark_scheme_status === "auto_linked"

	function handleDelete() {
		deleteQ(question.id, {
			onSuccess: () => {
				setConfirmOpen(false)
				onDeleted()
			},
		})
	}

	const isMultipleChoice = question.question_type === "multiple_choice"
	const marksLabel =
		question.points !== null
			? `[${question.points} mark${question.points !== 1 ? "s" : ""}]`
			: null

	const pointsMismatch =
		hasScheme &&
		question.points !== null &&
		question.mark_scheme_points_total !== null &&
		question.points !== question.mark_scheme_points_total

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={[
				"group relative py-5 border-b border-dashed border-zinc-200 dark:border-zinc-700 last:border-0",
				isDragging ? "opacity-40" : "",
			].join(" ")}
			{...attributes}
		>
			<div className="flex items-start gap-2">
				{/* Drag handle */}
				<button
					type="button"
					{...listeners}
					className="shrink-0 mt-0.5 cursor-grab active:cursor-grabbing p-1 -ml-1 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
					aria-label="Drag to reorder question"
				>
					<GripVertical className="h-4 w-4" />
				</button>

				{/* Question number */}
				<span className="font-bold text-sm w-8 shrink-0 pt-0.5 tabular-nums">
					{question.question_number ?? question.order}
				</span>

				{/* Question body */}
				<div className="flex-1 min-w-0">
					<StimulusDisclosure stimuli={question.stimuli} />
					<div className="flex items-start justify-between gap-4">
						<p className="text-sm leading-relaxed">{question.text}</p>
						<div className="flex items-center gap-1.5 shrink-0">
							{(!question.mark_scheme_status ||
								question.mark_scheme_status === "unlinked") && (
								<Tooltip>
									<TooltipTrigger>
										<AlertTriangle className="h-3.5 w-3.5 text-warning" />
									</TooltipTrigger>
									<TooltipContent>No mark scheme</TooltipContent>
								</Tooltip>
							)}
							{pointsMismatch && (
								<Tooltip>
									<TooltipTrigger>
										<AlertTriangle className="h-3.5 w-3.5 text-warning" />
									</TooltipTrigger>
									<TooltipContent>
										Mark scheme total ({question.mark_scheme_points_total}{" "}
										{question.mark_scheme_points_total === 1 ? "mark" : "marks"}
										) doesn&apos;t match question ({question.points}{" "}
										{question.points === 1 ? "mark" : "marks"})
									</TooltipContent>
								</Tooltip>
							)}
							{marksLabel && (
								<span
									className={cn(
										"text-xs font-medium tabular-nums",
										pointsMismatch ? "text-warning" : "text-muted-foreground",
									)}
								>
									{marksLabel}
								</span>
							)}
						</div>
					</div>

					{/* Extraction warning — shown when QP-extraction validators flagged a marks mismatch */}
					{question.extraction_warning && (
						<div className="mt-2.5 flex items-start gap-2 rounded border border-warning-300 bg-warning-50 px-3 py-2 text-xs dark:border-warning-700/60 dark:bg-warning-950/30">
							<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning-600 mt-0.5 dark:text-warning-400" />
							<div className="flex-1 min-w-0">
								<p className="font-medium text-warning-900 dark:text-warning-200">
									We couldn&apos;t verify the marks for this question
								</p>
								<p className="mt-0.5 text-warning-800/90 dark:text-warning-300/90">
									{question.extraction_warning} Please review and correct if
									needed — sorry for the friction.
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								className="h-7 shrink-0 border-warning-300 bg-white text-warning-900 hover:bg-warning-100 hover:text-warning-900 dark:border-warning-700 dark:bg-warning-950/50 dark:text-warning-200"
								onClick={() => void setEditQuestionId(question.id)}
							>
								Review and fix
							</Button>
						</div>
					)}

					{/* MCQ options */}
					{isMultipleChoice && question.multiple_choice_options.length > 0 && (
						<div className="mt-2.5">
							<McqOptions
								options={question.multiple_choice_options}
								correctLabels={question.mark_scheme_correct_option_labels}
							/>
						</div>
					)}

					{/* Answer space for written questions */}
					{!isMultipleChoice && (
						<div
							className="mt-3 rounded border border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-50/50 dark:bg-zinc-900/30"
							style={{
								height: `${Math.max(
									3,
									Math.min(10, (question.points ?? 3) * 1.2),
								)}rem`,
							}}
							aria-hidden
						/>
					)}

					{/* Action row — single edit-pencil + delete */}
					<TooltipProvider>
						<div className="mt-2 flex items-center justify-end gap-0.5">
							<Tooltip>
								<TooltipTrigger
									className={iconBtnClass}
									onClick={() => void setEditQuestionId(question.id)}
								>
									<Pencil className="h-3.5 w-3.5" />
									<span className="sr-only">Edit question</span>
								</TooltipTrigger>
								<TooltipContent>
									Edit question, mark scheme & test answers
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger
									className={cn(iconBtnClass, "hover:text-destructive")}
									onClick={() => setConfirmOpen(true)}
								>
									<Trash2 className="h-3.5 w-3.5" />
									<span className="sr-only">Delete question</span>
								</TooltipTrigger>
								<TooltipContent>Delete question</TooltipContent>
							</Tooltip>
						</div>
					</TooltipProvider>
				</div>
			</div>

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
