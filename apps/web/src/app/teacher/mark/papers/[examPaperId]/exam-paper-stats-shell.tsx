"use client"

import { Badge } from "@/components/ui/badge"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { getExamPaperStats, listMySubmissions } from "@/lib/mark-actions"
import type { ExamPaperStats, SubmissionHistoryItem } from "@/lib/mark-actions"
import { queryKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef } from "react"

const TERMINAL_STATUSES = new Set(["ocr_complete", "failed", "cancelled"])

function scoreBadgeVariant(
	pct: number,
): "default" | "secondary" | "destructive" | "outline" {
	if (pct >= 70) return "default"
	if (pct >= 40) return "secondary"
	return "destructive"
}

function statusLabel(status: string) {
	switch (status) {
		case "pending":
			return "Queued"
		case "processing":
			return "Reading pages…"
		case "extracting":
		case "extracted":
			return "Extracting text…"
		case "grading":
			return "Marking…"
		case "ocr_complete":
			return null // show score instead
		case "failed":
			return "Failed"
		case "cancelled":
			return "Cancelled"
		default:
			return "Processing…"
	}
}

export function ExamPaperStatsShell({
	examPaperId,
	initialStats,
	initialSubmissions,
}: {
	examPaperId: string
	initialStats: ExamPaperStats
	initialSubmissions: SubmissionHistoryItem[]
}) {
	const queryClient = useQueryClient()

	// Live submissions — polls while any submission for this paper is active
	const { data: submissions } = useQuery({
		queryKey: queryKeys.submissions(examPaperId),
		queryFn: async () => {
			const r = await listMySubmissions()
			if (!r.ok) return []
			return r.submissions.filter((s) => s.exam_paper_id === examPaperId)
		},
		initialData: initialSubmissions,
		refetchInterval: (q) => {
			const subs = q.state.data ?? []
			const hasActive = subs.some((s) => !TERMINAL_STATUSES.has(s.status))
			return hasActive ? 3000 : false
		},
	})

	// Stats — refetch when a submission transitions to completed
	const { data: stats } = useQuery({
		queryKey: queryKeys.examPaperStats(examPaperId),
		queryFn: async () => {
			const r = await getExamPaperStats(examPaperId)
			return r.ok ? r.stats : initialStats
		},
		initialData: initialStats,
		staleTime: 30 * 1000,
	})

	// When any in-progress submission transitions to terminal, invalidate stats
	const prevStatusesRef = useRef<Record<string, string>>({})
	useEffect(() => {
		let statsStale = false
		for (const sub of submissions) {
			const prev = prevStatusesRef.current[sub.id]
			if (
				prev !== undefined &&
				prev !== sub.status &&
				TERMINAL_STATUSES.has(sub.status)
			) {
				statsStale = true
			}
			prevStatusesRef.current[sub.id] = sub.status
		}
		if (statsStale) {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.examPaperStats(examPaperId),
			})
		}
	}, [submissions, examPaperId, queryClient])

	const completedSubmissions = submissions.filter(
		(s) => s.status === "ocr_complete",
	)
	const activeSubmissions = submissions.filter(
		(s) => !TERMINAL_STATUSES.has(s.status),
	)

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<Link
						href="/teacher/mark"
						className="text-sm text-muted-foreground hover:text-foreground"
					>
						← Mark history
					</Link>
					<CardTitle className="text-2xl">{stats.exam_paper_title}</CardTitle>
					<CardDescription>
						Performance summary across {stats.submission_count} submission
						{stats.submission_count !== 1 ? "s" : ""}
					</CardDescription>
				</CardHeader>
			</Card>

			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
				<Card>
					<CardContent className="pt-4">
						<p className="text-2xl font-bold">{stats.submission_count}</p>
						<p className="text-xs text-muted-foreground">Papers marked</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-2xl font-bold">{stats.avg_total_percent}%</p>
						<p className="text-xs text-muted-foreground">Average score</p>
					</CardContent>
				</Card>
			</div>

			{stats.question_stats.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Per-question averages</CardTitle>
						<CardDescription>
							How students performed on each question.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-12">#</TableHead>
									<TableHead>Question</TableHead>
									<TableHead className="w-28 text-right">Avg score</TableHead>
									<TableHead className="w-32">Performance</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{stats.question_stats.map((q) => (
									<TableRow key={q.question_id}>
										<TableCell className="text-muted-foreground font-mono text-xs">
											Q{q.question_number}
										</TableCell>
										<TableCell>
											<p
												className="text-sm truncate max-w-sm"
												title={q.question_text}
											>
												{q.question_text}
											</p>
										</TableCell>
										<TableCell className="text-right tabular-nums">
											<Badge variant={scoreBadgeVariant(q.avg_percent)}>
												{q.avg_awarded}/{q.max_score} ({q.avg_percent}%)
											</Badge>
										</TableCell>
										<TableCell>
											<Progress value={q.avg_percent} className="h-2" />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

			{/* Active (in-progress) submissions */}
			{activeSubmissions.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							Processing
						</CardTitle>
						<CardDescription>
							{activeSubmissions.length} submission
							{activeSubmissions.length !== 1 ? "s" : ""} currently being marked
							— updating automatically.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Student</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{activeSubmissions.map((sub) => (
									<TableRow key={sub.id}>
										<TableCell>
											{sub.student_name ?? (
												<span className="italic text-muted-foreground">
													Unknown student
												</span>
											)}
										</TableCell>
										<TableCell>
											<span className="flex items-center gap-1.5 text-sm text-muted-foreground">
												<Loader2 className="h-3 w-3 animate-spin shrink-0" />
												{statusLabel(sub.status) ?? sub.status}
											</span>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

			{/* Completed submissions */}
			{completedSubmissions.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Individual results</CardTitle>
						<CardDescription>All submissions for this paper.</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Student</TableHead>
									<TableHead className="text-right">Score</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{completedSubmissions.map((sub) => {
									const pct =
										sub.total_max > 0
											? Math.round((sub.total_awarded / sub.total_max) * 100)
											: 0
									return (
										<TableRow key={sub.id}>
											<TableCell>
												{sub.student_name ?? (
													<span className="italic text-muted-foreground">
														Unknown student
													</span>
												)}
											</TableCell>
											<TableCell className="text-right">
												<Badge
													variant={scoreBadgeVariant(pct)}
													className="tabular-nums"
												>
													{sub.total_awarded}/{sub.total_max} ({pct}%)
												</Badge>
											</TableCell>
											<TableCell>
												<Link
													href={`/teacher/mark/papers/${examPaperId}/submissions/${sub.id}`}
													className="text-sm text-primary underline underline-offset-4 hover:no-underline"
												>
													View
												</Link>
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</div>
	)
}
