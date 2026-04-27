"use client"

import { McqOptions } from "@/components/mcq-options"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { UngradedBadge } from "@/components/ungraded-badge"
import { resolveTeacherOverride } from "@/lib/marking/overrides/resolve"
import type { TeacherOverride } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import { type McqRow, mcqTableAttrsSchema } from "@mcp-gcse/shared"
import { NodeViewWrapper } from "@tiptap/react"
import { Check, X } from "lucide-react"
import { useDocOps } from "./doc-ops-context"
import { useGradingData } from "./grading-data-context"

/**
 * Per-row override resolution — same precedence as the question-block path
 * (doc attr wins, PG row fallback). Centralised in
 * `@/lib/marking/overrides/resolve` so this logic is pinned by a unit test.
 */
function rowOverride(
	row: McqRow,
	pgRow: TeacherOverride | undefined,
) {
	return resolveTeacherOverride(
		row.teacherOverride ?? null,
		row.teacherFeedbackOverride ?? null,
		pgRow,
	)
}

/** Shared grid template so header, data rows, and footer columns align. */
const ROW_GRID =
	"grid grid-cols-[2.5rem_4rem_4rem_1.25rem_4.5rem] gap-x-2 items-center"

export function McqTableView({
	node,
}: {
	node: { attrs: Record<string, unknown> }
}) {
	// Doc/React boundary: parse once so the row-render loop below works
	// against a typed shape without `as` casts.
	const { results } = mcqTableAttrsSchema.parse(node.attrs)
	const { overridesByQuestionId, activeQuestionNumber } = useGradingData()
	const { saveOverride } = useDocOps()

	const totalAwarded = results.reduce((sum, r) => {
		const override = rowOverride(r, overridesByQuestionId.get(r.questionId))
		return sum + (override?.score_override ?? r.awardedScore ?? 0)
	}, 0)
	const totalMax = results.reduce((sum, r) => sum + r.maxScore, 0)
	const hasUngraded = results.some((r) => {
		const override = rowOverride(r, overridesByQuestionId.get(r.questionId))
		return r.awardedScore === null && !override
	})

	if (results.length === 0) return null

	return (
		<NodeViewWrapper className="py-4 border-b border-dashed border-zinc-200 dark:border-zinc-700 last:border-0">
			<div contentEditable={false}>
				<p className="font-mono text-[10px] font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 mb-2">
					Multiple Choice
				</p>

				{/* Header */}
				<div
					className={cn(
						ROW_GRID,
						"py-1 text-[10px] text-muted-foreground font-medium border-b border-zinc-200 dark:border-zinc-700",
					)}
				>
					<span>Q</span>
					<span>Correct</span>
					<span>Student</span>
					<span />
					<span className="text-right">Mark</span>
				</div>

				{/* Data rows */}
				{results.map((r) => {
					const override = rowOverride(
						r,
						overridesByQuestionId.get(r.questionId),
					)
					const effectiveScore = override?.score_override ?? r.awardedScore
					const isUngraded = effectiveScore === null
					const isCorrect = !isUngraded && effectiveScore === r.maxScore
					const isActive = activeQuestionNumber === r.questionNumber

					return (
						<Popover key={r.questionId}>
							{/* nativeButton={false} — the trigger is a <div> because the row
							    is a CSS grid; a <button> would collapse the columns. The
							    inner score-override badge has its own nested popover so we
							    cannot form a single native <button> for the whole row. */}
							<PopoverTrigger
								nativeButton={false}
								render={
									<div
										id={`question-${r.questionNumber}`}
										role="button"
										tabIndex={0}
										className={cn(
											ROW_GRID,
											"w-full text-left text-xs py-1.5 cursor-pointer rounded-sm transition-colors hover:bg-muted/50",
											isActive && "bg-blue-500/20",
										)}
									>
										<span className="font-mono text-muted-foreground">
											Q{r.questionNumber}
										</span>
										<span>{r.correctLabels[0] ?? "–"}</span>
										<span className="font-medium">
											{r.studentAnswer?.trim() || "–"}
										</span>
										<span>
											{isUngraded ? (
												<span className="text-muted-foreground text-xs">–</span>
											) : isCorrect ? (
												<Check
													className="h-3.5 w-3.5 text-emerald-500"
													strokeWidth={3}
												/>
											) : (
												<X
													className="h-3.5 w-3.5 text-red-500"
													strokeWidth={3}
												/>
											)}
										</span>
										<span
											role="button"
											tabIndex={0}
											title={
												override
													? "Click to revert to AI mark"
													: "Click to toggle mark"
											}
											className="text-right cursor-pointer"
											onMouseDown={(e) => e.stopPropagation()}
											onClick={(e) => {
												e.stopPropagation()
												if (override) {
													saveOverride(r.questionId, null)
												} else {
													saveOverride(r.questionId, {
														score_override:
															(r.awardedScore ?? 0) >= r.maxScore ? 0 : r.maxScore,
														reason: null,
														feedback_override: undefined,
													})
												}
											}}
											onKeyDown={(e) => {
												if (e.key === "Enter" || e.key === " ") {
													e.preventDefault()
													e.stopPropagation()
													if (override) {
														saveOverride(r.questionId, null)
													} else {
														saveOverride(r.questionId, {
															score_override:
																(r.awardedScore ?? 0) >= r.maxScore ? 0 : r.maxScore,
															reason: null,
															feedback_override: undefined,
														})
													}
												}
											}}
										>
											{isUngraded ? (
												<UngradedBadge maxScore={r.maxScore} shape="rect" />
											) : (
												<span
													className={cn(
														"font-semibold tabular-nums",
														override
															? "text-blue-500"
															: isCorrect
																? "text-emerald-600"
																: "text-red-500",
													)}
												>
													{effectiveScore}/{r.maxScore}
												</span>
											)}
										</span>
									</div>
								}
							/>
							<PopoverContent side="right" align="start" className="w-64">
								{r.questionText && (
									<p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2 leading-snug">
										{r.questionText}
									</p>
								)}
								<McqOptions
									options={r.options}
									correctLabels={r.correctLabels}
									studentAnswer={r.studentAnswer}
								/>
							</PopoverContent>
						</Popover>
					)
				})}

				{/* Total row */}
				<div
					className={cn(
						ROW_GRID,
						"py-1.5 text-xs font-semibold border-t border-zinc-200 dark:border-zinc-700",
					)}
				>
					<span>Total</span>
					<span />
					<span />
					<span />
					<span className="text-right tabular-nums">
						{totalAwarded}/{totalMax}
					</span>
				</div>
			</div>
		</NodeViewWrapper>
	)
}
