"use client"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
	ExamPaperDetail,
	ExamPaperQuestion,
	ExamPaperSection,
	QuestionDetail,
} from "@/lib/dashboard-actions"
import {
	deleteQuestion,
	getQuestionDetail,
	reorderQuestionsInSection,
	reorderSections,
} from "@/lib/dashboard-actions"
import { cn } from "@/lib/utils"
import {
	DndContext,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
	SortableContext,
	arrayMove,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
	AlertTriangle,
	Clock,
	FlaskConical,
	GripVertical,
	NotebookPen,
	Pencil,
	Trash2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { EvalDialog } from "./questions/[question_id]/eval-dialog"
import { MarkSchemeDialog } from "./questions/[question_id]/mark-scheme-dialog"
import { QuestionEditDialog } from "./questions/[question_id]/question-edit-dialog"

// ─── Types ────────────────────────────────────────────────────────────────────

type LocalSection = ExamPaperSection & { questions: ExamPaperQuestion[] }

function buildSections(paper: ExamPaperDetail): LocalSection[] {
	return paper.sections.map((section) => ({
		...section,
		questions: paper.questions
			.filter((q) => q.exam_section_id === section.id)
			.sort((a, b) => a.order - b.order),
	}))
}

// ─── Sortable question ────────────────────────────────────────────────────────

const iconBtnClass =
	"h-7 w-7 p-0 text-muted-foreground/60 hover:text-foreground transition-colors"

function SortableQuestion({
	question,
	onDeleted,
}: {
	question: ExamPaperQuestion
	onDeleted: () => void
}) {
	const router = useRouter()

	// DnD
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: question.id })
	const style = { transform: CSS.Transform.toString(transform), transition }

	// Dialog open states
	const [evalOpen, setEvalOpen] = useState(false)
	const [editOpen, setEditOpen] = useState(false)
	const [msOpen, setMsOpen] = useState(false)
	const [msDetail, setMsDetail] = useState<QuestionDetail | null>(null)
	const [msLoading, setMsLoading] = useState(false)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [deleting, setDeleting] = useState(false)

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

	async function handleDelete() {
		setDeleting(true)
		const result = await deleteQuestion(question.id)
		setDeleting(false)
		if (!result.ok) {
			toast.error(result.error)
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

	// Build mark scheme dialog props for edit mode
	const ms = msDetail?.mark_schemes[0]
	const msDialogEditProps = (() => {
		if (!ms) return null
		const common = {
			open: msOpen,
			onOpenChange: (v: boolean) => {
				setMsOpen(v)
				if (!v) setMsDetail(null)
			},
			hideTrigger: true as const,
			onSuccess: () => router.refresh(),
		}
		if (ms.marking_method === "deterministic") {
			return {
				...common,
				mode: "edit" as const,
				questionId: msDetail!.id,
				markSchemeId: ms.id,
				markingMethod: "deterministic" as const,
				multipleChoiceOptions: msDetail!.multiple_choice_options,
				initialDescription: ms.description ?? "",
				initialGuidance: ms.guidance ?? "",
				initialCorrectOptionLabels: ms.correct_option_labels,
			}
		}
		if (ms.marking_method === "level_of_response") {
			return {
				...common,
				mode: "edit" as const,
				questionId: msDetail!.id,
				markSchemeId: ms.id,
				markingMethod: "level_of_response" as const,
				initialDescription: ms.description ?? "",
				initialGuidance: ms.guidance ?? "",
				initialMarkingRules: null,
			}
		}
		return {
			...common,
			mode: "edit" as const,
			questionId: msDetail!.id,
			markSchemeId: ms.id,
			markingMethod: "point_based" as const,
			initialDescription: ms.description ?? "",
			initialGuidance: ms.guidance ?? "",
			initialMarkPoints: Array.isArray(ms.mark_points)
				? (ms.mark_points as { description: string; points: number }[])
				: [],
		}
	})()

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
								<span title="No mark scheme">
									<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
								</span>
							)}
							{marksLabel && (
								<span className="text-xs text-muted-foreground font-medium tabular-nums">
									{marksLabel}
								</span>
							)}
						</div>
					</div>

					{/* MCQ options */}
					{isMultipleChoice && question.multiple_choice_options.length > 0 && (
						<div className="mt-2.5 space-y-1">
							{question.multiple_choice_options.map((opt) => {
								const isCorrect =
									question.mark_scheme_correct_option_labels.includes(
										opt.option_label,
									)
								return (
									<div
										key={opt.option_label}
										className="flex items-start gap-2.5 text-sm"
									>
										<span
											className={cn(
												"font-semibold shrink-0 w-5 h-5 flex items-center justify-center text-xs leading-none tabular-nums",
												isCorrect &&
													"rounded-full ring-2 ring-emerald-500 text-emerald-600",
											)}
										>
											{opt.option_label}
										</span>
										<span className={cn(isCorrect && "font-medium")}>
											{opt.option_text}
										</span>
									</div>
								)
							})}
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

					{/* Action row — bottom right, always visible */}
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
				open={editOpen}
				onOpenChange={setEditOpen}
				onSaved={() => router.refresh()}
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
						onSuccess={() => router.refresh()}
					/>
				) : (
					<MarkSchemeDialog
						mode="create"
						questionId={question.id}
						open={msOpen}
						onOpenChange={setMsOpen}
						hideTrigger
						onSuccess={() => router.refresh()}
					/>
				))}

			{/* Mark scheme dialog — edit mode (rendered once detail is loaded) */}
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

// ─── Sortable section ─────────────────────────────────────────────────────────

function SortableSection({
	section,
	onQuestionDeleted,
}: {
	section: LocalSection
	onQuestionDeleted: () => void
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: section.id })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...attributes}
			className={["mb-6 group/section", isDragging ? "opacity-40" : ""].join(
				" ",
			)}
		>
			{section.title && (
				<div className="mb-3 pb-1.5 border-b border-zinc-200 dark:border-zinc-700 flex items-center gap-1.5">
					{/* Section drag handle */}
					<button
						type="button"
						{...listeners}
						className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 opacity-0 group-hover/section:opacity-100 transition-opacity touch-none"
						aria-label="Drag to reorder section"
					>
						<GripVertical className="h-4 w-4" />
					</button>
					<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
						{section.title}
					</h2>
				</div>
			)}

			<SortableContext
				items={section.questions.map((q) => q.id)}
				strategy={verticalListSortingStrategy}
			>
				{section.questions.map((q) => (
					<SortableQuestion
						key={q.id}
						question={q}
						onDeleted={onQuestionDeleted}
					/>
				))}
			</SortableContext>
		</div>
	)
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ExamPaperPaperView({
	paper,
}: {
	paper: ExamPaperDetail
}) {
	const router = useRouter()
	const [localSections, setLocalSections] = useState<LocalSection[]>(() =>
		buildSections(paper),
	)

	// Re-sync when questions are added or removed (e.g. after delete + router.refresh())
	const questionIds = paper.questions
		.map((q) => q.id)
		.sort()
		.join(",")
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only sync on id set changes
	useEffect(() => {
		setLocalSections(buildSections(paper))
	}, [questionIds])

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
	)

	async function onDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over || active.id === over.id) return

		const activeId = String(active.id)
		const overId = String(over.id)

		const isSectionDrag = localSections.some((s) => s.id === activeId)

		if (isSectionDrag) {
			// Reorder sections
			const oldIndex = localSections.findIndex((s) => s.id === activeId)
			const newIndex = localSections.findIndex((s) => s.id === overId)
			if (oldIndex === -1 || newIndex === -1) return

			const newOrder = arrayMove(localSections, oldIndex, newIndex)
			setLocalSections(newOrder)

			const result = await reorderSections(
				paper.id,
				newOrder.map((s) => s.id),
			)
			if (!result.ok) toast.error(result.error)
		} else {
			// Reorder question within its section
			const section = localSections.find((s) =>
				s.questions.some((q) => q.id === activeId),
			)
			if (!section) return

			// Ensure the over target is also a question in the same section
			const isOverInSameSection = section.questions.some((q) => q.id === overId)
			if (!isOverInSameSection) return

			const oldIndex = section.questions.findIndex((q) => q.id === activeId)
			const newIndex = section.questions.findIndex((q) => q.id === overId)
			if (oldIndex === -1 || newIndex === -1) return

			const newQuestions = arrayMove(section.questions, oldIndex, newIndex)
			setLocalSections((prev) =>
				prev.map((s) =>
					s.id === section.id ? { ...s, questions: newQuestions } : s,
				),
			)

			const result = await reorderQuestionsInSection(
				section.id,
				newQuestions.map((q) => q.id),
			)
			if (!result.ok) toast.error(result.error)
		}
	}

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
			<div>
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

					{/* Questions with drag-and-drop */}
					<div className="px-8 py-4">
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={onDragEnd}
						>
							<SortableContext
								items={localSections.map((s) => s.id)}
								strategy={verticalListSortingStrategy}
							>
								{localSections.map((section) => (
									<SortableSection
										key={section.id}
										section={section}
										onQuestionDeleted={() => router.refresh()}
									/>
								))}
							</SortableContext>
						</DndContext>
					</div>

					{/* Footer */}
					<div className="px-8 py-4 border-t border-zinc-200 dark:border-zinc-800 text-center">
						<p className="text-xs text-muted-foreground">
							End of paper — Total: {paper.total_marks} marks
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
