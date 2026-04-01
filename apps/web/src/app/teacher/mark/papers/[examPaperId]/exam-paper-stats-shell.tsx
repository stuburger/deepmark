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
import { getActiveBatchForPaper } from "@/lib/batch/mutations"
import type { ActiveBatchInfo } from "@/lib/batch/mutations"
import { getExamPaperStats, listMySubmissions } from "@/lib/marking/queries"
import type { ExamPaperStats, SubmissionHistoryItem } from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Users } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { UploadScriptsDialog } from "../../../exam-papers/[id]/upload-scripts-dialog"
import { GradeDistributionChart } from "./grade-distribution-chart"
import {
	BAND_COLORS,
	GRADE_BANDS,
	TERMINAL_STATUSES,
	scoreBadgeVariant,
} from "./stats-config"
import { SubmissionTables } from "./submission-tables"

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
				<GradeDistributionChart data={gradeBandData} />
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

			<SubmissionTables
				completedSubmissions={completedSubmissions}
				activeSubmissions={activeSubmissions}
				failedSubmissions={failedSubmissions}
				examPaperId={examPaperId}
			/>

			<UploadScriptsDialog
				examPaperId={examPaperId}
				open={batchOpen}
				onOpenChange={setBatchOpen}
			/>
		</div>
	)
}
