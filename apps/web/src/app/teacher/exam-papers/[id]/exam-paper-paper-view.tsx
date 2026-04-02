"use client"

import type {
	ExamPaperDetail,
	ExamPaperQuestion,
	ExamPaperSection,
} from "@/lib/exam-paper/queries"
import {
	reorderQuestionsInSection,
	reorderSections,
} from "@/lib/exam-paper/questions"
import { queryKeys } from "@/lib/query-keys"
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
import { useQueryClient } from "@tanstack/react-query"
import { Clock, GripVertical } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { SortableQuestion } from "./sortable-question"

// ─── Types ──────────────────────────────────────────────────────────────────

type LocalSection = ExamPaperSection & { questions: ExamPaperQuestion[] }

function buildSections(paper: ExamPaperDetail): LocalSection[] {
	return paper.sections.map((section) => ({
		...section,
		questions: paper.questions
			.filter((q) => q.exam_section_id === section.id)
			.sort((a, b) => a.order - b.order),
	}))
}

// ─── Sortable section ───────────────────────────────────────────────────────

function SortableSection({
	section,
	paperId,
	onQuestionDeleted,
}: {
	section: LocalSection
	paperId: string
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
						onDeleted={onQuestionDeleted}
					/>
				))}
			</SortableContext>
		</div>
	)
}

// ─── Main component ─────────────────────────────────────────────────────────

export function ExamPaperPaperView({
	paper,
	paperId,
}: {
	paper: ExamPaperDetail
	paperId: string
}) {
	const queryClient = useQueryClient()
	const [localSections, setLocalSections] = useState<LocalSection[]>(() =>
		buildSections(paper),
	)

	const questionFingerprint = paper.questions
		.map((q) => `${q.id}:${q.mark_scheme_status ?? "none"}`)
		.sort()
		.join(",")
	// biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint intentionally used instead of full paper object
	useEffect(() => {
		setLocalSections(buildSections(paper))
	}, [questionFingerprint])

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
			const oldIndex = localSections.findIndex((s) => s.id === activeId)
			const newIndex = localSections.findIndex((s) => s.id === overId)
			if (oldIndex === -1 || newIndex === -1) return

			const newOrder = arrayMove(localSections, oldIndex, newIndex)
			setLocalSections(newOrder)

			const result = await reorderSections(
				paper.id,
				newOrder.map((s) => s.id),
			)
			if (!result.ok) {
				toast.error(result.error)
			} else {
				void queryClient.invalidateQueries({
					queryKey: queryKeys.examPaper(paperId),
				})
			}
		} else {
			const section = localSections.find((s) =>
				s.questions.some((q) => q.id === activeId),
			)
			if (!section) return

			const isOverInSameSection = section.questions.some(
				(q) => q.id === overId,
			)
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
			if (!result.ok) {
				toast.error(result.error)
			} else {
				void queryClient.invalidateQueries({
					queryKey: queryKeys.examPaper(paperId),
				})
			}
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
		<div className="max-w-4xl mx-auto bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-sm">
			{/* Header */}
			<div className="px-8 pt-8 pb-6 border-b border-zinc-200 dark:border-zinc-700">
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
				<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground border-t border-zinc-100 dark:border-zinc-700 pt-3">
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
								paperId={paperId}
								onQuestionDeleted={() =>
									void queryClient.invalidateQueries({
										queryKey: queryKeys.examPaper(paperId),
									})
								}
							/>
						))}
					</SortableContext>
				</DndContext>
			</div>

			{/* Footer */}
			<div className="px-8 py-4 border-t border-zinc-200 dark:border-zinc-700 text-center">
				<p className="text-xs text-muted-foreground">
					End of paper — Total: {paper.total_marks} marks
				</p>
			</div>
		</div>
	)
}
