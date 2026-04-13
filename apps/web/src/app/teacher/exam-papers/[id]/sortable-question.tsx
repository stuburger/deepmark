"use client"

import { McqOptions } from "@/components/mcq-options"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { getQuestionDetail } from "@/lib/exam-paper/questions/queries"
import type { ExamPaperQuestion, QuestionDetail } from "@/lib/exam-paper/types"
import { cn } from "@/lib/utils"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
	AlertTriangle,
	FlaskConical,
	GripVertical,
	NotebookPen,
	Pencil,
	Trash2,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useDeleteQuestion } from "./hooks/use-exam-paper-mutations"
import { EvalDialog } from "./questions/[question_id]/eval-dialog"
import { MarkSchemeDialog } from "./questions/[question_id]/mark-scheme-dialog"
import { QuestionEditDialog } from "./questions/[question_id]/question-edit-dialog"

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

	const [evalOpen, setEvalOpen] = useState(false)
	const [editOpen, setEditOpen] = useState(false)
	const [msOpen, setMsOpen] = useState(false)
	const [msDetail, setMsDetail] = useState<QuestionDetail | null>(null)
	const [msLoading, setMsLoading] = useState(false)
	const [confirmOpen, setConfirmOpen] = useState(false)

	const hasScheme =
		question.mark_scheme_status === "linked" ||
		question.mark_scheme_status === "auto_linked"

	async function handleMarkSchemeClick() {
		if (!hasScheme) {
			setMsOpen(true)
			return
		}
		setMsLoading(true)
		const result = await getQuestionDetail(question.id)
		setMsLoading(false)
		if (!result.ok) {
			toast.error("Failed to load mark scheme")
			return
		}
		setMsDetail(result.question)
		setMsOpen(true)
	}

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

	const ms = msDetail?.mark_schemes[0]
	const msDialogEditProps = buildEditProps(
		ms,
		msDetail,
		msOpen,
		setMsOpen,
		setMsDetail,
		paperId,
	)

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			className={[
				"group relative py-5 border-b border-dashed border-zinc-200 dark:border-zinc-700 last:border-0",
				isDragging ? "opacity-40" : "",
			].join(" ")}
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
					<div className="flex items-start justify-between gap-4">
						<p className="text-sm leading-relaxed">{question.text}</p>
						<div className="flex items-center gap-1.5 shrink-0">
							{(!question.mark_scheme_status ||
								question.mark_scheme_status === "unlinked") && (
								<Tooltip>
									<TooltipTrigger>
										<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
									</TooltipTrigger>
									<TooltipContent>No mark scheme</TooltipContent>
								</Tooltip>
							)}
							{pointsMismatch && (
								<Tooltip>
									<TooltipTrigger>
										<AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
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
										pointsMismatch
											? "text-orange-500"
											: "text-muted-foreground",
									)}
								>
									{marksLabel}
								</span>
							)}
						</div>
					</div>

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

					{/* Action row */}
					<TooltipProvider>
						<div className="mt-2 flex items-center justify-end gap-0.5">
							<Tooltip>
								<TooltipTrigger
									className={iconBtnClass}
									onClick={() => setEvalOpen(true)}
								>
									<FlaskConical className="h-3.5 w-3.5" />
									<span className="sr-only">Test answer</span>
								</TooltipTrigger>
								<TooltipContent>Test answer</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger
									className={iconBtnClass}
									onClick={() => setEditOpen(true)}
								>
									<Pencil className="h-3.5 w-3.5" />
									<span className="sr-only">Edit question</span>
								</TooltipTrigger>
								<TooltipContent>Edit question</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger
									className={iconBtnClass}
									onClick={handleMarkSchemeClick}
									disabled={msLoading}
								>
									<NotebookPen className="h-3.5 w-3.5" />
									<span className="sr-only">
										{hasScheme ? "Edit mark scheme" : "Add mark scheme"}
									</span>
								</TooltipTrigger>
								<TooltipContent>
									{hasScheme ? "Edit mark scheme" : "Add mark scheme"}
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

			{/* Dialogs */}
			<EvalDialog
				questionId={question.id}
				open={evalOpen}
				onOpenChange={setEvalOpen}
				hideTrigger
			/>

			<QuestionEditDialog
				questionId={question.id}
				initialText={question.text}
				initialPoints={question.points}
				initialQuestionNumber={question.question_number}
				paperId={paperId}
				open={editOpen}
				onOpenChange={setEditOpen}
			/>

			{/* Mark scheme dialog — create mode */}
			{!hasScheme &&
				(question.question_type === "multiple_choice" ? (
					<MarkSchemeDialog
						mode="create"
						questionId={question.id}
						questionType="multiple_choice"
						multipleChoiceOptions={question.multiple_choice_options}
						open={msOpen}
						onOpenChange={setMsOpen}
						hideTrigger
						paperId={paperId}
					/>
				) : (
					<MarkSchemeDialog
						mode="create"
						questionId={question.id}
						open={msOpen}
						onOpenChange={setMsOpen}
						hideTrigger
						paperId={paperId}
					/>
				))}

			{/* Mark scheme dialog — edit mode */}
			{hasScheme && msDialogEditProps && (
				<MarkSchemeDialog {...msDialogEditProps} />
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

// ── Build mark scheme edit dialog props ─────────────────────────────────────

function buildEditProps(
	ms: QuestionDetail["mark_schemes"][number] | undefined,
	msDetail: QuestionDetail | null,
	msOpen: boolean,
	setMsOpen: (v: boolean) => void,
	setMsDetail: (v: QuestionDetail | null) => void,
	paperId: string,
) {
	if (!ms || !msDetail) return null
	const common = {
		open: msOpen,
		onOpenChange: (v: boolean) => {
			setMsOpen(v)
			if (!v) setMsDetail(null)
		},
		hideTrigger: true as const,
		paperId,
	}
	if (ms.marking_method === "deterministic") {
		return {
			...common,
			mode: "edit" as const,
			questionId: msDetail.id,
			markSchemeId: ms.id,
			markingMethod: "deterministic" as const,
			multipleChoiceOptions: msDetail.multiple_choice_options,
			initialDescription: ms.description ?? "",
			initialGuidance: ms.guidance ?? "",
			initialCorrectOptionLabels: ms.correct_option_labels,
		}
	}
	if (ms.marking_method === "level_of_response") {
		return {
			...common,
			mode: "edit" as const,
			questionId: msDetail.id,
			markSchemeId: ms.id,
			markingMethod: "level_of_response" as const,
			initialDescription: ms.description ?? "",
			initialGuidance: ms.guidance ?? "",
			initialContent: ms.content ?? "",
			pointsTotal: ms.points_total,
		}
	}
	return {
		...common,
		mode: "edit" as const,
		questionId: msDetail.id,
		markSchemeId: ms.id,
		markingMethod: "point_based" as const,
		initialDescription: ms.description ?? "",
		initialGuidance: ms.guidance ?? "",
		initialMarkPoints: Array.isArray(ms.mark_points)
			? (ms.mark_points as Array<{ description: string; points: number }>)
			: [],
	}
}
