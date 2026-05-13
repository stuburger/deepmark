"use client"

import { Badge } from "@/components/ui/badge"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { formatDateTime } from "@/lib/format/date"
import {
	scoreBadgeVariant,
	statusBadgeVariant,
	submissionHref,
} from "@/lib/marking/listing/format"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { StudentLinkCell } from "../mark/student-link-cell"

const STATUS_FILTERS = ["all", "marked", "processing", "failed"] as const
type StatusFilter = (typeof STATUS_FILTERS)[number]

const STATUS_LABEL: Record<StatusFilter, string> = {
	all: "All",
	marked: "Marked",
	processing: "Processing",
	failed: "Failed",
}

function matchesStatus(
	sub: SubmissionHistoryItem,
	filter: StatusFilter,
): boolean {
	if (filter === "all") return true
	if (filter === "marked") return sub.status === "ocr_complete"
	if (filter === "failed") return sub.status === "failed"
	// "processing" — anything not in a terminal state
	return sub.status !== "ocr_complete" && sub.status !== "failed"
}

export function BookmarksList({
	submissions,
}: {
	submissions: SubmissionHistoryItem[]
}) {
	const [status, setStatus] = useQueryState(
		"status",
		parseAsStringLiteral(STATUS_FILTERS).withDefault("all"),
	)

	const filtered = submissions.filter((s) => matchesStatus(s, status))

	return (
		<>
			<div className="flex flex-wrap items-center gap-2">
				{STATUS_FILTERS.map((f) => {
					const isActive = status === f
					return (
						<button
							key={f}
							type="button"
							onClick={() => setStatus(f === "all" ? null : f)}
							className={
								isActive
									? "rounded-md border border-primary bg-primary/15 px-3 py-1 text-xs font-medium text-primary"
									: "rounded-md border border-border-quiet bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							}
						>
							{STATUS_LABEL[f]}
						</button>
					)
				})}
			</div>

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Student</TableHead>
						<TableHead>Exam paper</TableHead>
						<TableHead>Score</TableHead>
						<TableHead>Submitted</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{filtered.map((sub) => {
						const href = submissionHref(sub)
						const scorePercent =
							sub.total_max > 0
								? Math.round((sub.total_awarded / sub.total_max) * 100)
								: null
						return (
							<TableRow
								key={sub.id}
								className="cursor-pointer hover:bg-muted/50"
							>
								<TableCell>
									<StudentLinkCell
										jobId={sub.id}
										studentId={sub.student_id}
										studentName={sub.student_name}
										detectedStudentNumber={sub.detected_student_number}
										href={href}
									/>
								</TableCell>
								<TableCell className="max-w-xs">
									{sub.exam_paper_id ? (
										<Link
											href={`/teacher/exam-papers/${sub.exam_paper_id}`}
											className="block truncate text-sm hover:underline underline-offset-4"
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
									{sub.status === "ocr_complete" && sub.total_max > 0 ? (
										<Badge
											variant={scoreBadgeVariant(
												sub.total_awarded,
												sub.total_max,
											)}
											className="tabular-nums"
										>
											{sub.total_awarded}/{sub.total_max}
											{scorePercent !== null && (
												<span className="ml-1 opacity-75">
													({scorePercent}%)
												</span>
											)}
										</Badge>
									) : (
										<Badge variant={statusBadgeVariant(sub.status)}>
											{sub.status === "ocr_complete"
												? "No results"
												: sub.status}
										</Badge>
									)}
								</TableCell>
								<TableCell className="whitespace-nowrap text-sm text-muted-foreground">
									{formatDateTime(sub.created_at)}
								</TableCell>
								<TableCell>
									<Link
										href={href}
										className="text-sm text-primary underline underline-offset-4 hover:no-underline"
									>
										{sub.status === "ocr_complete" ? "View" : "Details"}
									</Link>
								</TableCell>
							</TableRow>
						)
					})}
				</TableBody>
			</Table>

			{filtered.length === 0 && (
				<p className="py-6 text-center text-sm text-muted-foreground">
					No bookmarks match this filter.
				</p>
			)}
		</>
	)
}
