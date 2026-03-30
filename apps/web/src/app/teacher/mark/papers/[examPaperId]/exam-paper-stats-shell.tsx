"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { getActiveBatchForPaper } from "@/lib/batch-actions"
import type { ActiveBatchInfo } from "@/lib/batch-actions"
import { getExamPaperStats, listMySubmissions } from "@/lib/mark-actions"
import type { ExamPaperStats, SubmissionHistoryItem } from "@/lib/mark-actions"
import { queryKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Loader2, Users } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts"
import { BatchMarkingDialog } from "../../../exam-papers/[id]/batch-marking-dialog"

const TERMINAL_STATUSES = new Set(["ocr_complete", "failed", "cancelled"])

const GRADE_BANDS = [
	{ label: "0–20%", min: 0, max: 20 },
	{ label: "20–40%", min: 20, max: 40 },
	{ label: "40–60%", min: 40, max: 60 },
	{ label: "60–80%", min: 60, max: 80 },
	{ label: "80–100%", min: 80, max: 101 },
]

const BAND_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a"]

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
			return null
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
	const [batchOpen, setBatchOpen] = useState(false)

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

	const { data: stats } = useQuery({
		queryKey: queryKeys.examPaperStats(examPaperId),
		queryFn: async () => {
			const r = await getExamPaperStats(examPaperId)
			return r.ok ? r.stats : initialStats
		},
		initialData: initialStats,
		staleTime: 30 * 1000,
	})

	const { data: activeBatch } = useQuery<ActiveBatchInfo>({
		queryKey: ["activeBatch", examPaperId],
		queryFn: async () => {
			const r = await getActiveBatchForPaper(examPaperId)
			return r.ok ? r.batch : null
		},
		refetchInterval: (q) => {
			const b = q.state.data
			return b?.status === "marking" ? 3000 : false
		},
	})

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
	const failedSubmissions = submissions.filter((s) => s.status === "failed")

	const gradeBandData = GRADE_BANDS.map((band, i) => ({
		label: band.label,
		count: completedSubmissions.filter((s) => {
			const pct = s.total_max > 0 ? (s.total_awarded / s.total_max) * 100 : 0
			return pct >= band.min && pct < band.max
		}).length,
		color: BAND_COLORS[i]!,
	}))

	const batchCompleteCount =
		activeBatch?.student_jobs.filter((j) => j.status === "ocr_complete")
			.length ?? 0

	return (
		<div className="space-y-6">
			{/* Header */}
			<Card>
				<CardHeader>
					<div className="flex items-start justify-between gap-4">
						<div>
							<Link
								href="/teacher/mark"
								className="text-sm text-muted-foreground hover:text-foreground"
							>
								← Mark history
							</Link>
							<CardTitle className="text-2xl mt-1">
								{stats.exam_paper_title}
							</CardTitle>
							<CardDescription>
								Performance summary across {stats.submission_count} submission
								{stats.submission_count !== 1 ? "s" : ""}
							</CardDescription>
						</div>
						<Button onClick={() => setBatchOpen(true)} className="shrink-0">
							<Users className="h-4 w-4 mr-2" />
							Mark class
						</Button>
					</div>
				</CardHeader>
			</Card>

			{/* KPI strip */}
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<Card>
					<CardContent className="pt-4">
						<p className="text-2xl font-bold">{stats.submission_count}</p>
						<p className="text-xs text-muted-foreground">Total marked</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-2xl font-bold">{stats.avg_total_percent}%</p>
						<p className="text-xs text-muted-foreground">Average score</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4">
						<p className="text-2xl font-bold text-destructive">
							{failedSubmissions.length}
						</p>
						<p className="text-xs text-muted-foreground">
							Failed / needs re-mark
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent className="pt-4 flex items-start gap-2">
						{activeSubmissions.length > 0 && (
							<Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5 shrink-0" />
						)}
						<div>
							<p className="text-2xl font-bold">{activeSubmissions.length}</p>
							<p className="text-xs text-muted-foreground">In progress</p>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Active batch progress */}
			{activeBatch?.status === "marking" &&
				activeBatch.total_student_jobs > 0 && (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								Batch marking in progress
							</CardTitle>
							<CardDescription>
								{batchCompleteCount} of {activeBatch.total_student_jobs} scripts
								marked · {activeBatch.total_student_jobs - batchCompleteCount}{" "}
								in progress
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Progress
								value={
									(batchCompleteCount / activeBatch.total_student_jobs) * 100
								}
							/>
						</CardContent>
					</Card>
				)}

			{/* Grade distribution chart */}
			{completedSubmissions.length >= 3 && (
				<Card>
					<CardHeader>
						<CardTitle>Grade distribution</CardTitle>
						<CardDescription>
							Number of students in each score band.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ResponsiveContainer width="100%" height={200}>
							<BarChart data={gradeBandData} barCategoryGap="30%">
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis
									dataKey="label"
									tick={{ fontSize: 12 }}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									allowDecimals={false}
									tick={{ fontSize: 12 }}
									axisLine={false}
									tickLine={false}
									width={30}
								/>
								<Tooltip
									formatter={(value) => [value, "Students"]}
									cursor={{ fill: "hsl(var(--muted))" }}
								/>
								<Bar dataKey="count" radius={[4, 4, 0, 0]}>
									{gradeBandData.map((entry) => (
										<Cell key={entry.label} fill={entry.color} />
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</CardContent>
				</Card>
			)}

			{/* Per-question averages */}
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

			{/* Active submissions */}
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

			{/* Individual results */}
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
									<TableHead className="w-40">Score</TableHead>
									<TableHead className="text-right w-20" />
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
											<TableCell>
												<div className="space-y-1">
													<div className="flex items-center justify-between text-xs">
														<Badge
															variant={scoreBadgeVariant(pct)}
															className="tabular-nums"
														>
															{sub.total_awarded}/{sub.total_max} ({pct}%)
														</Badge>
													</div>
													<Progress value={pct} className="h-1.5" />
												</div>
											</TableCell>
											<TableCell className="text-right">
												<Link
													href={`/teacher/mark/papers/${examPaperId}/submissions/${sub.id}`}
													className="text-sm text-primary underline underline-offset-4 hover:no-underline"
												>
													View →
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

			{/* Failed submissions */}
			{failedSubmissions.length > 0 && (
				<Card className="border-destructive/50">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-destructive">
							<AlertCircle className="h-4 w-4" />
							Failed submissions
						</CardTitle>
						<CardDescription>
							These scripts failed to process and may need re-uploading.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Student</TableHead>
									<TableHead>Error</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{failedSubmissions.map((sub) => (
									<TableRow key={sub.id}>
										<TableCell>
											{sub.student_name ?? (
												<span className="italic text-muted-foreground">
													Unknown student
												</span>
											)}
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											Failed
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}

			<BatchMarkingDialog
				examPaperId={examPaperId}
				open={batchOpen}
				onOpenChange={setBatchOpen}
			/>
		</div>
	)
}
