"use client"

import { QuickAssignStudentDialog } from "@/components/marking/quick-assign-student-dialog"
import { ShareDialog } from "@/components/sharing/share-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { SoftChip } from "@/components/ui/soft-chip"
import { StatusDot } from "@/components/ui/status-dot"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatDate } from "@/lib/format/date"
import {
	PHASE_LABEL,
	isInFlightPhase,
	phaseStatusKind,
	scoreChipKind,
	submissionPhase,
} from "@/lib/marking/listing/phase"
import {
	NAME_COLLATOR,
	PHASE_RANK,
	compareNullable,
	pctFor,
} from "@/lib/marking/listing/sort"
import { toggleBookmark } from "@/lib/marking/submissions/mutations"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import {
	type BoundaryMode,
	type GradeBoundary,
	computeGrade,
} from "@mcp-gcse/shared"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Bookmark,
	ChevronRight,
	Link2,
	Pencil,
	Share2,
	Trash2,
} from "lucide-react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { Fragment, useMemo, useState } from "react"
import { toast } from "sonner"
import { SubmissionVersionRows } from "./submission-version-rows"

const SORT_KEYS = [
	"bookmarked",
	"student",
	"status",
	"score",
	"grade",
	"date",
] as const
type SortKey = (typeof SORT_KEYS)[number]

const SORT_DIRS = ["asc", "desc"] as const
type SortDir = (typeof SORT_DIRS)[number]

// Default direction applied when first selecting a column. Names sort A→Z;
// scores/grades/dates sort newest/highest first because that's what teachers
// usually want to see at the top.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
	bookmarked: "desc",
	student: "asc",
	status: "asc",
	score: "desc",
	grade: "desc",
	date: "desc",
}

// Convert grade label to a numeric rank for sorting. "9" → 9, "U" → 0, null →
// sentinel handled at compare-time so unmarked rows always end up last.
function gradeRank(grade: string | null): number | null {
	if (grade === null) return null
	if (grade === "U") return 0
	return Number(grade)
}

export function SubmissionTable({
	examPaperId,
	submissions,
	gradeBoundaries,
	gradeBoundaryMode,
	onView,
	onDeleteRequest,
	selectedIds,
	onSelectionChange,
}: {
	examPaperId: string
	submissions: SubmissionHistoryItem[]
	gradeBoundaries: GradeBoundary[] | null
	gradeBoundaryMode: BoundaryMode | null
	onView: (id: string) => void
	onDeleteRequest: (id: string) => void
	selectedIds: Set<string>
	onSelectionChange: (ids: Set<string>) => void
}) {
	const queryClient = useQueryClient()
	const bookmarkMutation = useMutation({
		mutationFn: async (vars: { jobId: string; bookmarked: boolean }) => {
			const r = await toggleBookmark(vars)
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onMutate: async (vars) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.submissions(examPaperId),
			})
			const previous = queryClient.getQueryData(
				queryKeys.submissions(examPaperId),
			)
			queryClient.setQueryData<
				(SubmissionHistoryItem & { version_count: number })[]
			>(queryKeys.submissions(examPaperId), (old) =>
				old?.map((s) =>
					s.id === vars.jobId ? { ...s, is_bookmarked: vars.bookmarked } : s,
				),
			)
			return { previous }
		},
		onError: (err, _vars, context) => {
			if (context?.previous !== undefined) {
				queryClient.setQueryData(
					queryKeys.submissions(examPaperId),
					context.previous,
				)
			}
			toast.error(
				err instanceof Error ? err.message : "Failed to update bookmark",
			)
		},
		onSettled: (_data, _err, vars) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks() })
			queryClient.invalidateQueries({
				queryKey: queryKeys.submissions(examPaperId),
			})
			queryClient.invalidateQueries({
				queryKey: queryKeys.studentJob(vars.jobId),
			})
		},
	})
	const [sort, setSort] = useQueryState("sort", parseAsStringLiteral(SORT_KEYS))
	const [dir, setDir] = useQueryState("dir", parseAsStringLiteral(SORT_DIRS))
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
	const [assigningJob, setAssigningJob] = useState<{
		jobId: string
		detectedNumber: string | null
		currentStudentId: string | null
	} | null>(null)

	function toggleExpand(id: string) {
		const next = new Set(expandedIds)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		setExpandedIds(next)
	}

	const sorted = useMemo(() => {
		if (!sort) return submissions
		const order: 1 | -1 = dir === "asc" ? 1 : -1
		const list = [...submissions]
		list.sort((a, b) => {
			switch (sort) {
				case "bookmarked":
					return order * ((a.is_bookmarked ? 1 : 0) - (b.is_bookmarked ? 1 : 0))
				case "student":
					return (
						order *
						NAME_COLLATOR.compare(a.student_name ?? "", b.student_name ?? "")
					)
				case "status":
					return (
						order *
						(PHASE_RANK[submissionPhase(a.status)] -
							PHASE_RANK[submissionPhase(b.status)])
					)
				case "score":
					return compareNullable(pctFor(a), pctFor(b), order)
				case "grade": {
					const ag = gradeRank(
						computeGrade(
							a.total_awarded,
							a.total_max,
							gradeBoundaries,
							gradeBoundaryMode ?? "percent",
						),
					)
					const bg = gradeRank(
						computeGrade(
							b.total_awarded,
							b.total_max,
							gradeBoundaries,
							gradeBoundaryMode ?? "percent",
						),
					)
					return compareNullable(ag, bg, order)
				}
				case "date":
					return order * (a.created_at.getTime() - b.created_at.getTime())
			}
		})
		return list
	}, [submissions, sort, dir, gradeBoundaries, gradeBoundaryMode])

	function handleSort(key: SortKey) {
		if (sort === key) {
			void setDir(dir === "asc" ? "desc" : "asc")
		} else {
			void setSort(key)
			void setDir(DEFAULT_DIR[key])
		}
	}

	if (submissions.length === 0) return null

	const selectableIds = sorted
		.filter((s) => s.status === "ocr_complete")
		.map((s) => s.id)
	const allSelected =
		selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id))
	const someSelected =
		selectableIds.some((id) => selectedIds.has(id)) && !allSelected

	function toggleAll(checked: boolean) {
		const next = new Set(selectedIds)
		if (checked) {
			for (const id of selectableIds) next.add(id)
		} else {
			for (const id of selectableIds) next.delete(id)
		}
		onSelectionChange(next)
	}

	function toggleOne(id: string, checked: boolean) {
		const next = new Set(selectedIds)
		if (checked) next.add(id)
		else next.delete(id)
		onSelectionChange(next)
	}

	return (
		<TooltipProvider>
			{assigningJob && (
				<QuickAssignStudentDialog
					open={true}
					onOpenChange={(open) => {
						if (!open) setAssigningJob(null)
					}}
					jobId={assigningJob.jobId}
					detectedNumber={assigningJob.detectedNumber}
					currentStudentId={assigningJob.currentStudentId}
					onLinked={() =>
						queryClient.invalidateQueries({
							queryKey: queryKeys.submissions(examPaperId),
						})
					}
				/>
			)}
			<Card>
				<CardContent className="pt-4">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8">
									<Checkbox
										checked={allSelected}
										indeterminate={someSelected}
										onCheckedChange={toggleAll}
										disabled={selectableIds.length === 0}
										aria-label="Select all marked submissions"
									/>
								</TableHead>
								<TableHead className="w-8">
									<button
										type="button"
										onClick={() => handleSort("bookmarked")}
										aria-label="Sort by bookmarked"
										className={cn(
											"-ml-1 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
											sort === "bookmarked" && "text-foreground",
										)}
										title="Bookmarked"
									>
										<Bookmark className="h-3.5 w-3.5" />
									</button>
								</TableHead>
								<SortableHeader
									label="Student"
									columnKey="student"
									activeKey={sort}
									activeDir={dir}
									onSort={handleSort}
								/>
								<SortableHeader
									label="Status"
									columnKey="status"
									activeKey={sort}
									activeDir={dir}
									onSort={handleSort}
									className="w-32"
								/>
								<SortableHeader
									label="Score"
									columnKey="score"
									activeKey={sort}
									activeDir={dir}
									onSort={handleSort}
								/>
								<SortableHeader
									label="Grade"
									columnKey="grade"
									activeKey={sort}
									activeDir={dir}
									onSort={handleSort}
									className="w-20"
								/>
								<SortableHeader
									label="Date"
									columnKey="date"
									activeKey={sort}
									activeDir={dir}
									onSort={handleSort}
								/>
								<TableHead className="w-20" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{sorted.map((sub) => {
								const isMarked = sub.status === "ocr_complete"
								const phase = submissionPhase(sub.status)
								const inFlight = isInFlightPhase(phase)
								const pct =
									isMarked && sub.total_max > 0
										? Math.round((sub.total_awarded / sub.total_max) * 100)
										: null
								const grade = isMarked
									? computeGrade(
											sub.total_awarded,
											sub.total_max,
											gradeBoundaries,
											gradeBoundaryMode ?? "percent",
										)
									: null
								const versionCount = sub.version_count ?? 1
								const hasPriorVersions = versionCount > 1
								const isExpanded = expandedIds.has(sub.id)
								return (
									<Fragment key={sub.id}>
										<TableRow className="group">
											<TableCell>
												<Checkbox
													checked={selectedIds.has(sub.id)}
													onCheckedChange={(checked) =>
														toggleOne(sub.id, checked)
													}
													disabled={!isMarked}
													aria-label={`Select ${sub.student_name ?? "submission"}`}
												/>
											</TableCell>
											<TableCell>
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																type="button"
																variant="ghost"
																size="sm"
																aria-pressed={sub.is_bookmarked}
																aria-label={
																	sub.is_bookmarked
																		? `Remove bookmark from ${sub.student_name ?? "submission"}`
																		: `Bookmark ${sub.student_name ?? "submission"}`
																}
																onClick={() =>
																	bookmarkMutation.mutate({
																		jobId: sub.id,
																		bookmarked: !sub.is_bookmarked,
																	})
																}
																className={cn(
																	"h-7 w-7 p-0",
																	sub.is_bookmarked
																		? "text-primary hover:text-primary"
																		: "text-muted-foreground hover:text-foreground",
																)}
															>
																<Bookmark
																	className="h-3.5 w-3.5"
																	fill={
																		sub.is_bookmarked ? "currentColor" : "none"
																	}
																/>
															</Button>
														}
													/>
													<TooltipContent side="right" sideOffset={4}>
														{sub.is_bookmarked ? "Bookmarked" : "Bookmark"}
													</TooltipContent>
												</Tooltip>
											</TableCell>
											<TableCell className="text-sm">
												<div className="flex items-center gap-1.5">
													{hasPriorVersions ? (
														<button
															type="button"
															onClick={() => toggleExpand(sub.id)}
															aria-label={
																isExpanded ? "Hide history" : "Show history"
															}
															className="-ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
														>
															<ChevronRight
																className={cn(
																	"h-3.5 w-3.5 transition-transform",
																	isExpanded && "rotate-90",
																)}
															/>
														</button>
													) : null}
													<span>
														{sub.student_name ?? (
															<span className="text-muted-foreground italic">
																Unnamed
															</span>
														)}
													</span>
													{sub.student_id === null ? (
														<>
															{sub.detected_student_number && (
																<span className="rounded-sm border border-border-quiet bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
																	{sub.detected_student_number}
																</span>
															)}
															<Button
																type="button"
																variant="ghost"
																size="sm"
																className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
																onClick={() =>
																	setAssigningJob({
																		jobId: sub.id,
																		detectedNumber: sub.detected_student_number,
																		currentStudentId: null,
																	})
																}
															>
																<Link2 className="size-3" strokeWidth={1.5} />
																Link
															</Button>
														</>
													) : (
														<Button
															type="button"
															variant="ghost"
															size="sm"
															aria-label={`Change linked student for ${sub.student_name ?? "submission"}`}
															className="h-6 w-6 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100"
															onClick={() =>
																setAssigningJob({
																	jobId: sub.id,
																	detectedNumber: sub.detected_student_number,
																	currentStudentId: sub.student_id,
																})
															}
														>
															<Pencil className="size-3" strokeWidth={1.5} />
														</Button>
													)}
													{hasPriorVersions && (
														<span className="text-[10px] tabular-nums font-mono text-muted-foreground">
															v{versionCount}
														</span>
													)}
												</div>
											</TableCell>
											<TableCell>
												<span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
													<StatusDot
														kind={
															phase === "done" && !sub.is_confirmed
																? "info"
																: phaseStatusKind(phase)
														}
														className={cn(inFlight && "animate-pulse")}
													/>
													{phase === "done" && sub.is_confirmed
														? "Confirmed"
														: PHASE_LABEL[phase]}
												</span>
											</TableCell>
											<TableCell>
												{pct !== null ? (
													<SoftChip kind={scoreChipKind(pct)}>
														<span className="tabular-nums font-mono">
															{sub.total_awarded}/{sub.total_max}
														</span>
														<span className="ml-1.5 tabular-nums font-mono opacity-70">
															{pct}%
														</span>
													</SoftChip>
												) : (
													<SoftChip kind="neutral">
														<span className="tabular-nums font-mono">
															?/{sub.total_max}
														</span>
													</SoftChip>
												)}
											</TableCell>
											<TableCell>
												<span className="tabular-nums font-mono text-sm">
													{grade ?? (
														<span className="text-muted-foreground">—</span>
													)}
												</span>
											</TableCell>
											<TableCell className="text-xs text-muted-foreground tabular-nums">
												{formatDate(sub.created_at)}
											</TableCell>
											<TableCell>
												<div className="flex items-center justify-end gap-2">
													<Button
														type="button"
														size="sm"
														variant="ghost"
														onClick={() => onView(sub.id)}
														className="h-7 px-2 text-xs"
													>
														View
													</Button>
													<ShareDialog
														resourceType="student_submission"
														resourceId={sub.id}
														trigger={
															<Button
																type="button"
																size="sm"
																variant="ghost"
																className="h-7 px-2 text-xs gap-1"
															>
																<Share2 className="h-3.5 w-3.5" />
																Share
															</Button>
														}
													/>
													<Button
														size="sm"
														variant="ghost"
														className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
														title="Delete submission"
														onClick={() => onDeleteRequest(sub.id)}
													>
														<Trash2 className="h-3.5 w-3.5" />
														<span className="sr-only">Delete submission</span>
													</Button>
												</div>
											</TableCell>
										</TableRow>
										{isExpanded && hasPriorVersions && (
											<SubmissionVersionRows
												submissionId={sub.id}
												gradeBoundaries={gradeBoundaries}
												gradeBoundaryMode={gradeBoundaryMode}
												onView={onView}
											/>
										)}
									</Fragment>
								)
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</TooltipProvider>
	)
}

function SortableHeader({
	label,
	columnKey,
	activeKey,
	activeDir,
	onSort,
	className,
}: {
	label: string
	columnKey: SortKey
	activeKey: SortKey | null
	activeDir: SortDir | null
	onSort: (key: SortKey) => void
	className?: string
}) {
	const isActive = activeKey === columnKey
	const Icon = !isActive
		? ArrowUpDown
		: activeDir === "asc"
			? ArrowUp
			: ArrowDown
	return (
		<TableHead className={className}>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => onSort(columnKey)}
				className={cn(
					"-ml-2 h-7 px-2 text-xs font-medium gap-1",
					isActive ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{label}
				<Icon className="h-3 w-3" />
			</Button>
		</TableHead>
	)
}
