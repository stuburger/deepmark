"use client"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button-variants"
import { Separator } from "@/components/ui/separator"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import type { QuestionDetail } from "@/lib/dashboard-actions"
import { getQuestionDetail } from "@/lib/dashboard-actions"
import { ExternalLink } from "lucide-react"
import Link from "next/link"
import { useEffect, useState, useTransition } from "react"

function markingMethodLabel(method: string) {
	switch (method) {
		case "point_based":
			return "Point-based"
		case "level_of_response":
			return "Level of response"
		case "deterministic":
			return "Multiple choice"
		default:
			return method
	}
}

function MarkSchemeContent({ detail }: { detail: QuestionDetail }) {
	if (detail.mark_schemes.length === 0) {
		return (
			<p className="text-sm text-muted-foreground italic">
				No mark scheme added yet.
			</p>
		)
	}

	return (
		<div className="space-y-4">
			{detail.mark_schemes.map((ms) => (
				<div key={ms.id} className="space-y-2">
					<div className="flex items-center gap-2 flex-wrap">
						<Badge variant="secondary">
							{markingMethodLabel(ms.marking_method)}
						</Badge>
						<span className="text-xs text-muted-foreground">
							{ms.points_total} mark{ms.points_total !== 1 ? "s" : ""}
						</span>
					</div>

					{ms.description && (
						<p className="text-sm text-muted-foreground">{ms.description}</p>
					)}

					{ms.marking_method === "deterministic" &&
						ms.correct_option_labels.length > 0 && (
							<div className="flex items-center gap-1.5 flex-wrap">
								<span className="text-xs text-muted-foreground">Correct:</span>
								{ms.correct_option_labels.map((label) => (
									<Badge key={label} variant="outline" className="text-xs">
										{label}
									</Badge>
								))}
							</div>
						)}

					{ms.marking_method === "point_based" &&
						Array.isArray(ms.mark_points) &&
						(ms.mark_points as { description: string; points: number }[])
							.length > 0 && (
							<div className="space-y-1">
								{(
									ms.mark_points as { description: string; points: number }[]
								).map((mp, i) => (
									<div key={i} className="flex items-start gap-2 text-sm">
										<span className="shrink-0 mt-px text-muted-foreground tabular-nums">
											{i + 1}.
										</span>
										<span className="flex-1">{mp.description}</span>
										<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
											{mp.points}m
										</span>
									</div>
								))}
							</div>
						)}

					{ms.marking_method === "level_of_response" &&
						ms.marking_rules !== null &&
						(() => {
							const rules = ms.marking_rules as {
								levels?: {
									level: number
									mark_range: [number, number]
									descriptor: string
								}[]
							}
							if (!rules.levels?.length) return null
							return (
								<div className="space-y-1.5">
									{rules.levels.map((lvl) => (
										<div
											key={lvl.level}
											className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-2"
										>
											<div className="flex items-center justify-between mb-1">
												<span className="text-xs font-semibold">
													Level {lvl.level}
												</span>
												<span className="text-xs text-muted-foreground tabular-nums">
													{lvl.mark_range[0]}–{lvl.mark_range[1]} marks
												</span>
											</div>
											<p className="text-xs text-muted-foreground leading-relaxed">
												{lvl.descriptor}
											</p>
										</div>
									))}
								</div>
							)
						})()}

					{ms.guidance && (
						<div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
							<span className="font-medium text-foreground">Guidance: </span>
							{ms.guidance}
						</div>
					)}
				</div>
			))}
		</div>
	)
}

export function ExamPaperQuestionSheet({
	open,
	onClose,
	questionId,
	paperId,
}: {
	open: boolean
	onClose: () => void
	questionId: string | null
	paperId: string
}) {
	const [detail, setDetail] = useState<QuestionDetail | null>(null)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [isPending, startTransition] = useTransition()

	useEffect(() => {
		if (!questionId) {
			setDetail(null)
			setLoadError(null)
			return
		}
		setDetail(null)
		setLoadError(null)
		startTransition(async () => {
			const result = await getQuestionDetail(questionId)
			if (result.ok) {
				setDetail(result.question)
			} else {
				setLoadError("Failed to load question details.")
			}
		})
	}, [questionId])

	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose()
			}}
		>
			<SheetContent
				side="right"
				className="w-full sm:max-w-[50vw] overflow-y-auto flex flex-col gap-0 p-0"
			>
				{isPending || (!detail && !loadError && questionId) ? (
					<div className="flex flex-1 items-center justify-center py-16">
						<Spinner className="h-5 w-5" />
					</div>
				) : loadError ? (
					<div className="flex flex-1 items-center justify-center py-16">
						<p className="text-sm text-destructive">{loadError}</p>
					</div>
				) : detail ? (
					<>
						<SheetHeader className="px-6 pt-6 pb-4 border-b">
							<div className="flex items-start justify-between gap-3 pr-8">
								<SheetTitle className="text-base font-semibold leading-snug">
									Question detail
								</SheetTitle>
								<Link
									href={`/teacher/exam-papers/${paperId}/questions/${detail.id}`}
									className={buttonVariants({ variant: "outline", size: "sm" })}
								>
									<ExternalLink className="h-3.5 w-3.5 mr-1.5" />
									Open full view
								</Link>
							</div>
							<div className="flex flex-wrap items-center gap-1.5 mt-1">
								<Badge variant="outline" className="text-xs">
									{detail.question_type === "multiple_choice"
										? "Multiple choice"
										: "Written"}
								</Badge>
								{detail.points !== null && (
									<Badge variant="secondary" className="text-xs">
										{detail.points} mark{detail.points !== 1 ? "s" : ""}
									</Badge>
								)}
								{detail.topic && (
									<Badge variant="outline" className="text-xs">
										{detail.topic}
									</Badge>
								)}
							</div>
						</SheetHeader>

						<div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
							{/* Question text */}
							<div>
								<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
									Question
								</h3>
								<p className="text-sm leading-relaxed">{detail.text}</p>
							</div>

							{/* MCQ options */}
							{detail.multiple_choice_options.length > 0 && (
								<div>
									<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
										Options
									</h3>
									<div className="space-y-1.5">
										{detail.multiple_choice_options.map((opt) => (
											<div
												key={opt.option_label}
												className="flex items-start gap-2.5 text-sm"
											>
												<span className="font-semibold shrink-0 w-5">
													{opt.option_label}.
												</span>
												<span>{opt.option_text}</span>
											</div>
										))}
									</div>
								</div>
							)}

							<Separator />

							{/* Mark scheme */}
							<div>
								<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
									Mark scheme
								</h3>
								<MarkSchemeContent detail={detail} />
							</div>
						</div>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	)
}
