"use client"

import { ShareDialog } from "@/components/sharing/share-dialog"
import { Button } from "@/components/ui/button"
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
import { formatDateTime } from "@/lib/format/date"
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
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Bookmark,
	ChevronRight,
	Share2,
} from "lucide-react"
import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { Fragment, type ReactNode, useState } from "react"
import { toast } from "sonner"
import { SubmissionsListVersionRows } from "./submissions-list-version-rows"

const SORT_KEYS = ["bookmarked", "student", "status", "score", "date"] as const
type SortKey = (typeof SORT_KEYS)[number]

const SORT_DIRS = ["asc", "desc"] as const
type SortDir = (typeof SORT_DIRS)[number]

// Default direction applied when first selecting a column. Names sort A→Z;
// scores/dates sort newest/highest first because that's what teachers
// usually want to see at the top.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
	bookmarked: "desc",
	student: "asc",
	status: "asc",
	score: "desc",
	date: "desc",
}

type Row = SubmissionHistoryItem & { version_count: number }

export function SubmissionsListTable({
	submissions,
	onView,
	toolbar,
	emptyState,
}: {
	submissions: Row[]
	onView: (id: string) => void
	/** Filter chips or other controls rendered above the table. */
	toolbar?: ReactNode
	/** Rendered when `submissions` is empty (after any client-side filtering by toolbar). */
	emptyState?: ReactNode
}) {
	const queryClient = useQueryClient()
	const [sort, setSort] = useQueryState("sort", parseAsStringLiteral(SORT_KEYS))
	const [dir, setDir] = useQueryState("dir", parseAsStringLiteral(SORT_DIRS))
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

	const bookmarkMutation = useMutation({
		mutationFn: async (vars: { jobId: string; bookmarked: boolean }) => {
			const r = await toggleBookmark(vars)
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to update bookmark",
			)
		},
		onSettled: (_data, _err, vars) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks() })
			queryClient.invalidateQueries({
				queryKey: queryKeys.bookmarkedSubmissions(),
			})
			queryClient.invalidateQueries({ queryKey: queryKeys.mySubmissions() })
			queryClient.invalidateQueries({
				queryKey: queryKeys.jobVersions(vars.jobId),
			})
			queryClient.invalidateQueries({
				queryKey: queryKeys.studentJob(vars.jobId),
			})
		},
	})

	function toggleExpand(id: string) {
		const next = new Set(expandedIds)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		setExpandedIds(next)
	}

	const sorted = sortRows(submissions, sort, dir)

	function handleSort(key: SortKey) {
		if (sort === key) {
			void setDir(dir === "asc" ? "desc" : "asc")
		} else {
			void setSort(key)
			void setDir(DEFAULT_DIR[key])
		}
	}

	return (
		<TooltipProvider>
			<div className="space-y-4">
				{toolbar}
				{submissions.length === 0 && emptyState ? (
					emptyState
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-8">
									<button
										type="button"
										onClick={() => handleSort("bookmarked")}
										aria-label="Sort by bookmarked"
										className={cn(
											"-ml-1 inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
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
								<TableHead>Exam paper</TableHead>
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
								const versionCount = sub.version_count ?? 1
								const hasPriorVersions = versionCount > 1
								const isExpanded = expandedIds.has(sub.id)
								const href = `/teacher/submissions/${sub.id}`
								return (
									<Fragment key={sub.id}>
										<TableRow className="group">
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
															className="-ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
														>
															<ChevronRight
																className={cn(
																	"h-3.5 w-3.5 transition-transform",
																	isExpanded && "rotate-90",
																)}
															/>
														</button>
													) : null}
													<Link
														href={href}
														className="font-medium hover:underline"
													>
														{sub.student_name ?? (
															<span className="italic text-muted-foreground">
																Unnamed
															</span>
														)}
													</Link>
													{hasPriorVersions && (
														<span className="font-mono text-[10px] tabular-nums text-muted-foreground">
															v{versionCount}
														</span>
													)}
												</div>
											</TableCell>
											<TableCell className="max-w-xs">
												{sub.exam_paper_id ? (
													<Link
														href={`/teacher/exam-papers/${sub.exam_paper_id}`}
														className="block truncate text-sm underline-offset-4 hover:underline"
													>
														{sub.exam_paper_title ?? "Unknown paper"}
													</Link>
												) : (
													<span className="text-sm text-muted-foreground">
														{sub.exam_paper_title ?? "—"}
													</span>
												)}
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
														<span className="font-mono tabular-nums">
															{sub.total_awarded}/{sub.total_max}
														</span>
														<span className="ml-1.5 font-mono tabular-nums opacity-70">
															{pct}%
														</span>
													</SoftChip>
												) : (
													<SoftChip kind="neutral">
														<span className="font-mono tabular-nums">
															?/{sub.total_max}
														</span>
													</SoftChip>
												)}
											</TableCell>
											<TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
												{formatDateTime(sub.created_at)}
											</TableCell>
											<TableCell>
												<div className="flex items-center justify-end gap-1">
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
																className="h-7 gap-1 px-2 text-xs"
															>
																<Share2 className="h-3.5 w-3.5" />
																Share
															</Button>
														}
													/>
												</div>
											</TableCell>
										</TableRow>
										{isExpanded && hasPriorVersions && (
											<SubmissionsListVersionRows
												submissionId={sub.id}
												onView={onView}
											/>
										)}
									</Fragment>
								)
							})}
						</TableBody>
					</Table>
				)}
			</div>
		</TooltipProvider>
	)
}

function sortRows(
	rows: Row[],
	key: SortKey | null,
	direction: SortDir | null,
): Row[] {
	if (!key) return rows
	const order: 1 | -1 = direction === "asc" ? 1 : -1
	const out = [...rows]
	out.sort((a, b) => {
		switch (key) {
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
			case "date":
				return order * (a.created_at.getTime() - b.created_at.getTime())
		}
	})
	return out
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
					"-ml-2 h-7 gap-1 px-2 text-xs font-medium",
					isActive ? "text-foreground" : "text-muted-foreground",
				)}
			>
				{label}
				<Icon className="h-3 w-3" />
			</Button>
		</TableHead>
	)
}
