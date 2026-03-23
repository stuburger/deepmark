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
import Link from "next/link"
import { notFound } from "next/navigation"

function scoreBadgeVariant(
	pct: number,
): "default" | "secondary" | "destructive" | "outline" {
	if (pct >= 70) return "default"
	if (pct >= 40) return "secondary"
	return "destructive"
}

export default async function ExamPaperStatsPage({
	params,
}: {
	params: Promise<{ examPaperId: string }>
}) {
	const { examPaperId } = await params
	const [statsResult, historyResult] = await Promise.all([
		getExamPaperStats(examPaperId),
		listMySubmissions(),
	])

	if (!statsResult.ok) notFound()

	const { stats } = statsResult
	const submissions = historyResult.ok
		? historyResult.submissions.filter(
				(s) => s.exam_paper_id === examPaperId && s.status === "ocr_complete",
			)
		: []

	return (
		<div className="space-y-6">
			<div>
				<Link
					href="/teacher/mark"
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← Mark history
				</Link>
				<h1 className="mt-2 text-2xl font-semibold">
					{stats.exam_paper_title}
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Performance summary across {stats.submission_count} submission
					{stats.submission_count !== 1 ? "s" : ""}
				</p>
			</div>

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

			{submissions.length > 0 && (
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
									<TableHead></TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{submissions.map((sub) => {
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
