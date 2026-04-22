"use client"

import { Badge } from "@/components/ui/badge"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
	TERMINAL_STATUSES,
	scoreBadgeVariant,
	statusLabel,
} from "./stats-config"

type StatusKind = "marked" | "processing" | "failed" | "cancelled"

function statusKind(status: string): StatusKind {
	if (status === "ocr_complete") return "marked"
	if (status === "failed") return "failed"
	if (status === "cancelled") return "cancelled"
	return "processing"
}

function StatusCell({ status }: { status: string }) {
	const kind = statusKind(status)
	if (kind === "marked") {
		return <Badge variant="outline">Marked</Badge>
	}
	if (kind === "failed") {
		return (
			<Badge variant="destructive" className="gap-1">
				<AlertCircle className="h-3 w-3" />
				Failed
			</Badge>
		)
	}
	if (kind === "cancelled") {
		return <Badge variant="outline">Cancelled</Badge>
	}
	return (
		<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
			<Loader2 className="h-3 w-3 animate-spin shrink-0" />
			{statusLabel(status) ?? "Processing…"}
		</span>
	)
}

export function SubmissionTables({
	submissions,
	examPaperId,
	selectedIds,
	onSelectionChange,
}: {
	submissions: SubmissionHistoryItem[]
	examPaperId: string
	selectedIds: Set<string>
	onSelectionChange: (ids: Set<string>) => void
}) {
	if (submissions.length === 0) return null

	const selectableIds = submissions
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
		<Card>
			<CardHeader>
				<CardTitle>Submissions</CardTitle>
				<CardDescription>All submissions for this paper.</CardDescription>
			</CardHeader>
			<CardContent>
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
							<TableHead>Student</TableHead>
							<TableHead className="w-32">Status</TableHead>
							<TableHead className="w-48">Score</TableHead>
							<TableHead className="text-right w-20" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{submissions.map((sub) => {
							const kind = statusKind(sub.status)
							const pct =
								kind === "marked" && sub.total_max > 0
									? Math.round((sub.total_awarded / sub.total_max) * 100)
									: null
							const isMarked = kind === "marked"
							return (
								<TableRow key={sub.id}>
									<TableCell>
										<Checkbox
											checked={selectedIds.has(sub.id)}
											onCheckedChange={(checked) => toggleOne(sub.id, checked)}
											disabled={!isMarked}
											aria-label={`Select ${sub.student_name ?? "submission"}`}
										/>
									</TableCell>
									<TableCell>
										{sub.student_name ?? (
											<span className="italic text-muted-foreground">
												Unknown student
											</span>
										)}
									</TableCell>
									<TableCell>
										<StatusCell status={sub.status} />
									</TableCell>
									<TableCell>
										{pct !== null ? (
											<div className="space-y-1">
												<Badge
													variant={scoreBadgeVariant(pct)}
													className="tabular-nums"
												>
													{sub.total_awarded}/{sub.total_max} ({pct}%)
												</Badge>
												<Progress value={pct} className="h-1.5" />
											</div>
										) : (
											<span className="text-xs text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell className="text-right">
										{isMarked || !TERMINAL_STATUSES.has(sub.status) ? (
											<Link
												href={`/teacher/exam-papers/${examPaperId}?job=${sub.id}`}
												className="text-sm text-primary underline underline-offset-4 hover:no-underline"
											>
												View →
											</Link>
										) : null}
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
