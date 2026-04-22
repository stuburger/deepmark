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
import { scoreBadgeVariant, statusLabel } from "./stats-config"

type StatusKind = "marked" | "processing" | "failed" | "cancelled"

function statusKind(status: string): StatusKind {
	if (status === "ocr_complete") return "marked"
	if (status === "failed") return "failed"
	if (status === "cancelled") return "cancelled"
	return "processing"
}

function gradeLabel(pct: number): string {
	if (pct >= 70) return "A"
	if (pct >= 55) return "B"
	if (pct >= 40) return "C"
	if (pct >= 25) return "D"
	return "U"
}

function PendingScoreCell({ status }: { status: string }) {
	const kind = statusKind(status)
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
							<TableHead className="w-24">Score</TableHead>
							<TableHead className="w-40">Percentage</TableHead>
							<TableHead className="w-16">Grade</TableHead>
							<TableHead className="w-28">Date</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{submissions.map((sub) => {
							const kind = statusKind(sub.status)
							const isMarked = kind === "marked"
							const pct =
								isMarked && sub.total_max > 0
									? Math.round((sub.total_awarded / sub.total_max) * 100)
									: null
							const href = `/teacher/mark/papers/${examPaperId}/submissions/${sub.id}`
							const dash = (
								<span className="text-xs text-muted-foreground">—</span>
							)
							return (
								<TableRow key={sub.id} className="cursor-pointer">
									<TableCell>
										<Checkbox
											checked={selectedIds.has(sub.id)}
											onCheckedChange={(checked) => toggleOne(sub.id, checked)}
											disabled={!isMarked}
											aria-label={`Select ${sub.student_name ?? "submission"}`}
										/>
									</TableCell>
									<TableCell>
										<Link href={href} className="block">
											{sub.student_name ?? (
												<span className="italic text-muted-foreground">
													Unknown student
												</span>
											)}
										</Link>
									</TableCell>
									<TableCell>
										<Link href={href} className="block tabular-nums">
											{isMarked ? (
												`${sub.total_awarded}/${sub.total_max}`
											) : (
												<PendingScoreCell status={sub.status} />
											)}
										</Link>
									</TableCell>
									<TableCell>
										<Link href={href} className="block">
											{pct !== null ? (
												<div className="space-y-1">
													<Badge
														variant={scoreBadgeVariant(pct)}
														className="tabular-nums"
													>
														{pct}%
													</Badge>
													<Progress value={pct} className="h-1.5" />
												</div>
											) : (
												dash
											)}
										</Link>
									</TableCell>
									<TableCell>
										<Link href={href} className="block">
											{pct !== null ? (
												<Badge variant={scoreBadgeVariant(pct)}>
													{gradeLabel(pct)}
												</Badge>
											) : (
												dash
											)}
										</Link>
									</TableCell>
									<TableCell>
										<Link
											href={href}
											className="block text-sm text-muted-foreground"
										>
											{sub.created_at.toLocaleDateString(undefined, {
												day: "numeric",
												month: "short",
												year: "numeric",
											})}
										</Link>
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
