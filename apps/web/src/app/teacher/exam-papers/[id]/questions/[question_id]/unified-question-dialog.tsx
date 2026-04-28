"use client"

import { McqOptions } from "@/components/mcq-options"
import { StimulusDisclosure } from "@/components/stimulus-disclosure"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getQuestionDetail } from "@/lib/exam-paper/questions/queries"
import type { ExamPaperQuestion, QuestionDetail } from "@/lib/exam-paper/types"
import { Pencil, X } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { EvalBody } from "./eval-body"
import { MarkSchemeBody, type MarkSchemeBodyProps } from "./mark-scheme-body"
import { QuestionEditForm } from "./question-edit-form"

type Props = {
	/** The question to render. When null the dialog is closed (or never opens). */
	question: ExamPaperQuestion | null
	paperId: string
	open: boolean
	onOpenChange: (open: boolean) => void
}

type Tab = "mark_scheme" | "test"

export function UnifiedQuestionDialog({
	question,
	paperId,
	open,
	onOpenChange,
}: Props) {
	const [tab, setTab] = useState<Tab>("mark_scheme")
	const [editingQuestion, setEditingQuestion] = useState(false)
	const [detail, setDetail] = useState<QuestionDetail | null>(null)
	const [loadingDetail, setLoadingDetail] = useState(false)

	const questionId = question?.id ?? null

	// Load mark-scheme detail on open. The list view doesn't carry full mark
	// point data, so we fetch it lazily.
	useEffect(() => {
		if (!open || !questionId) return
		let cancelled = false
		setLoadingDetail(true)
		getQuestionDetail(questionId).then((res) => {
			if (cancelled) return
			setLoadingDetail(false)
			if (!res.ok) {
				toast.error("Failed to load mark scheme")
				return
			}
			setDetail(res.question)
		})
		return () => {
			cancelled = true
		}
	}, [open, questionId])

	// Reset transient state when the dialog closes.
	useEffect(() => {
		if (!open) {
			setEditingQuestion(false)
			setTab("mark_scheme")
			setDetail(null)
		}
	}, [open])

	if (!question) return null

	const isMcq = question.question_type === "multiple_choice"
	const hasScheme =
		question.mark_scheme_status === "linked" ||
		question.mark_scheme_status === "auto_linked"

	const marksLabel =
		question.points !== null
			? `${question.points} mark${question.points !== 1 ? "s" : ""}`
			: null

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="inset-4! w-auto! translate-x-0! translate-y-0! max-w-none! rounded-2xl p-0 gap-0 overflow-hidden ring-0 shadow-2xl flex flex-col"
			>
				{/* Header */}
				<div className="flex items-center justify-between gap-3 border-b px-5 py-3 shrink-0">
					<div className="flex items-center gap-2 min-w-0">
						<DialogTitle className="text-sm font-semibold tabular-nums">
							Question {question.question_number ?? question.order}
						</DialogTitle>
						{marksLabel && (
							<Badge variant="secondary" className="text-xs">
								{marksLabel}
							</Badge>
						)}
						{isMcq && (
							<Badge variant="outline" className="text-xs">
								MCQ
							</Badge>
						)}
					</div>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => onOpenChange(false)}
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>

				{/* Body */}
				<div className="flex flex-1 min-h-0">
					{/* Left rail — question */}
					<div className="w-[360px] shrink-0 border-r overflow-y-auto p-5 space-y-4">
						<div className="flex items-center justify-between gap-2">
							<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
								Question
							</h3>
							{!editingQuestion && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={() => setEditingQuestion(true)}
								>
									<Pencil className="h-3 w-3 mr-1" />
									Edit
								</Button>
							)}
						</div>

						{editingQuestion ? (
							<div className="space-y-3">
								<QuestionEditForm
									questionId={question.id}
									initialText={question.text}
									initialPoints={question.points}
									initialQuestionNumber={question.question_number}
									paperId={paperId}
									onSaved={() => setEditingQuestion(false)}
								/>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="text-xs"
									onClick={() => setEditingQuestion(false)}
								>
									Cancel
								</Button>
							</div>
						) : (
							<>
								<StimulusDisclosure stimuli={question.stimuli} />
								<p className="text-sm leading-relaxed whitespace-pre-wrap">
									{question.text}
								</p>
								{isMcq && question.multiple_choice_options.length > 0 && (
									<McqOptions
										options={question.multiple_choice_options}
										correctLabels={question.mark_scheme_correct_option_labels}
									/>
								)}
							</>
						)}
					</div>

					{/* Right pane — tabs */}
					<div className="flex-1 min-w-0 flex flex-col">
						<Tabs
							value={tab}
							onValueChange={(v) => setTab(v as Tab)}
							className="flex-1 min-h-0 flex flex-col gap-0"
						>
							<div className="px-5 pt-3 border-b">
								<TabsList variant="line" className="h-10 gap-0 p-0">
									<TabsTrigger
										value="mark_scheme"
										className="rounded-none px-4 h-full after:bg-primary data-active:text-primary data-active:bg-transparent data-active:shadow-none"
									>
										Mark scheme
									</TabsTrigger>
									<TabsTrigger
										value="test"
										className="rounded-none px-4 h-full after:bg-primary data-active:text-primary data-active:bg-transparent data-active:shadow-none"
									>
										Test answer
									</TabsTrigger>
								</TabsList>
							</div>

							<TabsContent
								value="mark_scheme"
								className="flex-1 min-h-0 overflow-y-auto px-5 py-4"
							>
								{loadingDetail ? (
									<div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
										<Spinner className="h-4 w-4 mr-2" />
										Loading mark scheme…
									</div>
								) : (
									<MarkSchemeBodyForQuestion
										question={question}
										detail={detail}
										paperId={paperId}
										hasScheme={hasScheme}
									/>
								)}
							</TabsContent>

							<TabsContent
								value="test"
								className="flex-1 min-h-0 overflow-y-auto px-5 py-4"
							>
								{hasScheme ? (
									<EvalBody questionId={question.id} />
								) : (
									<div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
										Add a mark scheme first to test answers against it.
									</div>
								)}
							</TabsContent>
						</Tabs>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}

// ─── Mark scheme body — picks create vs edit props from question detail ──────

function MarkSchemeBodyForQuestion({
	question,
	detail,
	paperId,
	hasScheme,
}: {
	question: ExamPaperQuestion
	detail: QuestionDetail | null
	paperId: string
	hasScheme: boolean
}) {
	const isMcq = question.question_type === "multiple_choice"

	// No scheme yet — render the MarkSchemeBody in create mode. We don't need
	// `detail` to load before showing the create form.
	if (!hasScheme) {
		const createProps: MarkSchemeBodyProps = isMcq
			? {
					mode: "create",
					questionId: question.id,
					questionType: "multiple_choice",
					multipleChoiceOptions: question.multiple_choice_options,
					paperId,
				}
			: {
					mode: "create",
					questionId: question.id,
					paperId,
				}
		return <MarkSchemeBody {...createProps} />
	}

	// Edit mode but detail not yet loaded — keep loading invisible (the parent
	// already shows a spinner during initial load, this is just a guard).
	if (!detail) return null
	const ms = detail.mark_schemes[0]
	if (!ms) return null

	if (ms.marking_method === "deterministic") {
		const props: MarkSchemeBodyProps = {
			mode: "edit",
			questionId: detail.id,
			markSchemeId: ms.id,
			markingMethod: "deterministic",
			multipleChoiceOptions: detail.multiple_choice_options,
			initialDescription: ms.description ?? "",
			initialGuidance: ms.guidance ?? "",
			initialCorrectOptionLabels: ms.correct_option_labels,
			paperId,
		}
		return <MarkSchemeBody {...props} />
	}

	if (ms.marking_method === "level_of_response") {
		const props: MarkSchemeBodyProps = {
			mode: "edit",
			questionId: detail.id,
			markSchemeId: ms.id,
			markingMethod: "level_of_response",
			initialDescription: ms.description ?? "",
			initialGuidance: ms.guidance ?? "",
			initialContent: ms.content ?? "",
			pointsTotal: ms.points_total,
			paperId,
		}
		return <MarkSchemeBody {...props} />
	}

	// point_based (default)
	const markPoints = Array.isArray(ms.mark_points)
		? (
				ms.mark_points as Array<{
					criteria?: string
					description?: string
					points: number
				}>
			).map((mp) => ({
				criteria: mp.criteria ?? mp.description ?? "",
				description: mp.criteria ? (mp.description ?? "") : "",
				points: mp.points,
			}))
		: []

	const props: MarkSchemeBodyProps = {
		mode: "edit",
		questionId: detail.id,
		markSchemeId: ms.id,
		markingMethod: "point_based",
		initialDescription: ms.description ?? "",
		initialGuidance: ms.guidance ?? "",
		initialMarkPoints: markPoints,
		paperId,
	}
	return <MarkSchemeBody {...props} />
}
