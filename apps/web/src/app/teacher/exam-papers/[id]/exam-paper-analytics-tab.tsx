import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import type { ExamPaperStats } from "@/lib/marking/types"
import { Loader2 } from "lucide-react"

export function ExamPaperAnalyticsTab({
	stats,
	loading,
}: {
	stats: ExamPaperStats | null
	loading: boolean
}) {
	if (loading) {
		return (
			<div className="flex items-center justify-center py-16">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (!stats || stats.submission_count === 0) {
		return (
			<div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
				No completed submissions yet. Analytics will appear here once student
				scripts have been marked.
			</div>
		)
	}

	return (
		<>
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
						<h3 className="text-sm font-semibold">Per-question averages</h3>
						<p className="text-xs text-muted-foreground">
							How students performed on each question.
						</p>
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
								{stats.question_stats.map((q) => {
									const colour =
										q.avg_percent >= 70
											? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
											: q.avg_percent >= 40
												? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
												: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
									return (
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
												<span
													className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${colour}`}
												>
													{q.avg_awarded}/{q.max_score} ({q.avg_percent}%)
												</span>
											</TableCell>
											<TableCell>
												<Progress value={q.avg_percent} className="h-2" />
											</TableCell>
										</TableRow>
									)
								})}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</>
	)
}
