"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { Trash2 } from "lucide-react"
import { formatDate, scoreColour, statusLabel } from "./submission-grid-config"

export function SubmissionTable({
	submissions,
	onView,
	onDeleteRequest,
}: {
	submissions: SubmissionHistoryItem[]
	onView: (id: string) => void
	onDeleteRequest: (id: string) => void
}) {
	if (submissions.length === 0) return null

	return (
		<Card>
			<CardContent className="pt-4">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Student</TableHead>
							<TableHead>Score</TableHead>
							<TableHead>Date</TableHead>
							<TableHead className="w-20" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{submissions.map((sub) => {
							const pct =
								sub.total_max > 0
									? Math.round((sub.total_awarded / sub.total_max) * 100)
									: null
							const colours = scoreColour(pct)
							return (
								<TableRow key={sub.id} className="group">
									<TableCell className="text-sm">
										{sub.student_name ?? (
											<span className="text-muted-foreground italic">
												Unnamed
											</span>
										)}
									</TableCell>
									<TableCell>
										{pct !== null ? (
											<span
												className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${colours?.chip}`}
											>
												{sub.total_awarded}/{sub.total_max} · {pct}%
											</span>
										) : (
											<span className="text-xs text-muted-foreground capitalize">
												{statusLabel(sub.status)}
											</span>
										)}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground tabular-nums">
										{formatDate(sub.created_at)}
									</TableCell>
									<TableCell>
										<div className="flex items-center justify-end gap-2">
											<button
												type="button"
												onClick={() => onView(sub.id)}
												className="text-xs text-muted-foreground hover:text-foreground transition-colors"
											>
												View
											</button>
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
							)
						})}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	)
}
