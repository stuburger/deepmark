"use client"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type {
	ExamPaperDetail,
	ExamPaperQuestion,
	ExamPaperSection,
} from "@/lib/dashboard-actions"
import {
	deleteQuestion,
	reorderQuestionsInSection,
	reorderSections,
} from "@/lib/dashboard-actions"
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
	Clock,
	GripVertical,
	Minus,
	Plus,
	RotateCcw,
	Trash2,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

const ZOOM_STEP = 0.15
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0

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

function SortableQuestion({
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

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: question.id })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	}

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

// ─── Sortable section ─────────────────────────────────────────────────────────

function SortableSection({
	section,
	paperId,
	onQuestionClick,
	onQuestionDeleted,
}: {
	section: LocalSection
	paperId: string
	onQuestionClick: (id: string) => void
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
						paperId={paperId}
						onQuestionClick={onQuestionClick}
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
	onQuestionClick,
}: {
	paper: ExamPaperDetail
	onQuestionClick: (questionId: string) => void
}) {
	const router = useRouter()
	const [localSections, setLocalSections] = useState<LocalSection[]>(() =>
		buildSections(paper),
	)
	const [reorderError, setReorderError] = useState<string | null>(null)
	const [zoom, setZoom] = useState(1)

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
			setReorderError(null)

			const result = await reorderSections(
				paper.id,
				newOrder.map((s) => s.id),
			)
			if (!result.ok) setReorderError(result.error)
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
			setReorderError(null)

			const result = await reorderQuestionsInSection(
				section.id,
				newQuestions.map((q) => q.id),
			)
			if (!result.ok) setReorderError(result.error)
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
			{reorderError && (
				<p className="mb-3 text-xs text-destructive text-center">
					{reorderError}
				</p>
			)}

			{/* Zoom controls */}
			<div className="flex items-center justify-end gap-1 mb-4">
				<button
					type="button"
					onClick={() =>
						setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))
					}
					disabled={zoom <= ZOOM_MIN}
					className="flex h-7 w-7 items-center justify-center rounded border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
					aria-label="Zoom out"
				>
					<Minus className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					onClick={() => setZoom(1)}
					className="flex h-7 items-center justify-center rounded border bg-background px-2 text-xs text-muted-foreground transition-colors hover:bg-muted tabular-nums"
					aria-label="Reset zoom"
					title="Reset zoom"
				>
					<RotateCcw className="h-3 w-3 mr-1" />
					{Math.round(zoom * 100)}%
				</button>
				<button
					type="button"
					onClick={() =>
						setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))
					}
					disabled={zoom >= ZOOM_MAX}
					className="flex h-7 w-7 items-center justify-center rounded border bg-background text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
					aria-label="Zoom in"
				>
					<Plus className="h-3.5 w-3.5" />
				</button>
			</div>

			{/* Exam paper document — scrollable when zoomed in */}
			<div className="overflow-auto">
				<div
					className="mx-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-md shadow-sm"
					style={{ width: `min(${zoom * 100}%, ${zoom * 672}px)` }}
				>
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
										paperId={paper.id}
										onQuestionClick={onQuestionClick}
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
