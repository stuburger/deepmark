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
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { AlertCircle, Loader2 } from "lucide-react"
import Link from "next/link"
import { scoreBadgeVariant, statusLabel } from "./stats-config"

export function SubmissionTables({
	completedSubmissions,
	activeSubmissions,
	failedSubmissions,
	examPaperId,
}: {
	completedSubmissions: SubmissionHistoryItem[]
	activeSubmissions: SubmissionHistoryItem[]
	failedSubmissions: SubmissionHistoryItem[]
	examPaperId: string
}) {
	return (
		<>
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
													href={`/teacher/exam-papers/${examPaperId}?job=${sub.id}`}
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
		</>
	)
}
