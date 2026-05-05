"use client"

import { ShareDialog } from "@/components/sharing/share-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { SoftChip } from "@/components/ui/soft-chip"
import { StatusDot } from "@/components/ui/status-dot"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { Share2, Trash2 } from "lucide-react"
import {
	PHASE_LABEL,
	formatDate,
	isInFlightPhase,
	phaseStatusKind,
	scoreChipKind,
	submissionPhase,
} from "./submission-grid-config"

export function SubmissionTable({
	submissions,
	onView,
	onDeleteRequest,
	selectedIds,
	onSelectionChange,
}: {
	submissions: SubmissionHistoryItem[]
	onView: (id: string) => void
	onDeleteRequest: (id: string) => void
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
			<CardContent className="pt-4">
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
							<TableHead>Score</TableHead>
							<TableHead>Date</TableHead>
							<TableHead className="w-20" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{submissions.map((sub) => {
							const isMarked = sub.status === "ocr_complete"
							const phase = submissionPhase(sub.status)
							const inFlight = isInFlightPhase(phase)
							const pct =
								isMarked && sub.total_max > 0
									? Math.round((sub.total_awarded / sub.total_max) * 100)
									: null
							return (
								<TableRow key={sub.id} className="group">
									<TableCell>
										<Checkbox
											checked={selectedIds.has(sub.id)}
											onCheckedChange={(checked) => toggleOne(sub.id, checked)}
											disabled={!isMarked}
											aria-label={`Select ${sub.student_name ?? "submission"}`}
										/>
									</TableCell>
									<TableCell className="text-sm">
										{sub.student_name ?? (
											<span className="text-muted-foreground italic">
												Unnamed
											</span>
										)}
									</TableCell>
									<TableCell>
										<span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
											<StatusDot
												kind={phaseStatusKind(phase)}
												className={cn(inFlight && "animate-pulse")}
											/>
											{PHASE_LABEL[phase]}
										</span>
									</TableCell>
									<TableCell>
										{pct !== null ? (
											<SoftChip kind={scoreChipKind(pct)}>
												<span className="tabular-nums font-mono">
													{sub.total_awarded}/{sub.total_max}
												</span>
												<span className="ml-1.5 tabular-nums font-mono opacity-70">
													{pct}%
												</span>
											</SoftChip>
										) : (
											<SoftChip kind="neutral">
												<span className="tabular-nums font-mono">
													?/{sub.total_max}
												</span>
											</SoftChip>
										)}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground tabular-nums">
										{formatDate(sub.created_at)}
									</TableCell>
									<TableCell>
										<div className="flex items-center justify-end gap-2">
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() => onView(sub.id)}
												className="h-7 px-2 text-xs"
											>
												View
											</Button>
											<ShareDialog
												resourceType="student_submission"
												resourceId={sub.id}
												trigger={
													<Button
														type="button"
														size="sm"
														variant="ghost"
														className="h-7 px-2 text-xs gap-1"
													>
														<Share2 className="h-3.5 w-3.5" />
														Share
													</Button>
												}
											/>
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
