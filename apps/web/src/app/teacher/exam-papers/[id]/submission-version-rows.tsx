"use client"

import { Button } from "@/components/ui/button"
import { SoftChip } from "@/components/ui/soft-chip"
import { StatusDot } from "@/components/ui/status-dot"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDate } from "@/lib/format/date"
import { getSubmissionVersions } from "@/lib/marking/submissions/queries"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import {
	type BoundaryMode,
	type GradeBoundary,
	computeGrade,
} from "@mcp-gcse/shared"
import { useQuery } from "@tanstack/react-query"
import {
	PHASE_LABEL,
	isInFlightPhase,
	phaseStatusKind,
	scoreChipKind,
	submissionPhase,
} from "./submission-grid-config"

const COLUMN_COUNT = 7

export function SubmissionVersionRows({
	submissionId,
	gradeBoundaries,
	gradeBoundaryMode,
	onView,
}: {
	submissionId: string
	gradeBoundaries: GradeBoundary[] | null
	gradeBoundaryMode: BoundaryMode | null
	onView: (id: string) => void
}) {
	const { data: versions, isLoading } = useQuery({
		queryKey: queryKeys.jobVersions(submissionId),
		queryFn: async () => {
			const r = await getSubmissionVersions({ jobId: submissionId })
			return r?.data?.versions ?? []
		},
		staleTime: 30_000,
	})

	if (isLoading) {
		return (
			<TableRow className="bg-muted/30">
				<TableCell />
				<TableCell colSpan={COLUMN_COUNT - 1} className="py-2">
					<span className="text-xs text-muted-foreground italic">
						Loading prior versions…
					</span>
				</TableCell>
			</TableRow>
		)
	}

	const prior = (versions ?? []).filter((v) => v.id !== submissionId)
	if (prior.length === 0) return null

	const total = versions?.length ?? prior.length + 1

	return (
		<>
			{prior.map((v) => {
				const phase = submissionPhase(v.status)
				const inFlight = isInFlightPhase(phase)
				const indexInAll = (versions ?? []).findIndex((x) => x.id === v.id)
				const versionNumber = total - indexInAll
				const isMarked = v.status === "ocr_complete"
				const pct =
					isMarked && v.total_max > 0
						? Math.round((v.total_awarded / v.total_max) * 100)
						: null
				const grade = isMarked
					? computeGrade(
							v.total_awarded,
							v.total_max,
							gradeBoundaries,
							gradeBoundaryMode ?? "percent",
						)
					: null
				return (
					<TableRow
						key={v.id}
						className="bg-muted/30 hover:bg-muted/40 border-l-2 border-l-border-quiet"
					>
						<TableCell />
						<TableCell className="text-xs text-muted-foreground pl-8">
							<span className="inline-flex items-center gap-2 tabular-nums font-mono">
								v{versionNumber}
								{v.supersede_reason && (
									<span className="text-muted-foreground/70 not-italic font-sans">
										· {v.supersede_reason}
									</span>
								)}
							</span>
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
										{v.total_awarded}/{v.total_max}
									</span>
									<span className="ml-1.5 tabular-nums font-mono opacity-70">
										{pct}%
									</span>
								</SoftChip>
							) : (
								<SoftChip kind="neutral">
									<span className="tabular-nums font-mono">
										?/{v.total_max}
									</span>
								</SoftChip>
							)}
						</TableCell>
						<TableCell>
							<span className="tabular-nums font-mono text-sm text-muted-foreground">
								{grade ?? <span className="text-muted-foreground">—</span>}
							</span>
						</TableCell>
						<TableCell className="text-xs text-muted-foreground tabular-nums">
							{formatDate(v.created_at)}
						</TableCell>
						<TableCell>
							<div className="flex items-center justify-end gap-2">
								<Button
									type="button"
									size="sm"
									variant="ghost"
									onClick={() => onView(v.id)}
									className="h-7 px-2 text-xs"
								>
									View
								</Button>
							</div>
						</TableCell>
					</TableRow>
				)
			})}
		</>
	)
}
