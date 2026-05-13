"use client"

import { Button } from "@/components/ui/button"
import { SoftChip } from "@/components/ui/soft-chip"
import { StatusDot } from "@/components/ui/status-dot"
import { TableCell, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/format/date"
import {
	PHASE_LABEL,
	isInFlightPhase,
	phaseStatusKind,
	scoreChipKind,
	submissionPhase,
} from "@/lib/marking/listing/phase"
import { toggleBookmark } from "@/lib/marking/submissions/mutations"
import { getSubmissionVersions } from "@/lib/marking/submissions/queries"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Bookmark } from "lucide-react"
import { toast } from "sonner"

// Cross-paper context: matches the 7-column SubmissionsListTable layout
// (bookmark · student · exam paper · status · score · date · actions).
// Differs from the paper-detail version rows (which has 8 cols incl. grade
// and a leading checkbox).
const COLUMN_COUNT = 7

export function SubmissionsListVersionRows({
	submissionId,
	onView,
}: {
	submissionId: string
	onView: (id: string) => void
}) {
	const queryClient = useQueryClient()
	const { data: versions, isLoading } = useQuery({
		queryKey: queryKeys.jobVersions(submissionId),
		queryFn: async () => {
			const r = await getSubmissionVersions({ jobId: submissionId })
			return r?.data?.versions ?? []
		},
		staleTime: 30_000,
	})

	const bookmarkMutation = useMutation({
		mutationFn: async (vars: { jobId: string; bookmarked: boolean }) => {
			const r = await toggleBookmark(vars)
			if (r?.serverError) throw new Error(r.serverError)
			return r?.data
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to update bookmark",
			)
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.bookmarks() })
			queryClient.invalidateQueries({
				queryKey: queryKeys.bookmarkedSubmissions(),
			})
			queryClient.invalidateQueries({ queryKey: queryKeys.mySubmissions() })
			queryClient.invalidateQueries({
				queryKey: queryKeys.jobVersions(submissionId),
			})
		},
	})

	if (isLoading) {
		return (
			<TableRow className="bg-muted/30">
				<TableCell colSpan={COLUMN_COUNT} className="py-2">
					<span className="text-xs italic text-muted-foreground">
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
				return (
					<TableRow
						key={v.id}
						className="border-l-2 border-l-border-quiet bg-muted/30 hover:bg-muted/40"
					>
						<TableCell>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								aria-pressed={v.is_bookmarked}
								aria-label={
									v.is_bookmarked
										? `Remove bookmark from v${versionNumber}`
										: `Bookmark v${versionNumber}`
								}
								onClick={() =>
									bookmarkMutation.mutate({
										jobId: v.id,
										bookmarked: !v.is_bookmarked,
									})
								}
								className={cn(
									"h-7 w-7 p-0",
									v.is_bookmarked
										? "text-primary hover:text-primary"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Bookmark
									className="h-3.5 w-3.5"
									fill={v.is_bookmarked ? "currentColor" : "none"}
								/>
							</Button>
						</TableCell>
						<TableCell className="pl-8 text-xs text-muted-foreground">
							<span className="inline-flex items-center gap-2 font-mono tabular-nums">
								v{versionNumber}
								{v.supersede_reason && (
									<span className="font-sans not-italic text-muted-foreground/70">
										· {v.supersede_reason}
									</span>
								)}
							</span>
						</TableCell>
						<TableCell />
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
									<span className="font-mono tabular-nums">
										{v.total_awarded}/{v.total_max}
									</span>
									<span className="ml-1.5 font-mono tabular-nums opacity-70">
										{pct}%
									</span>
								</SoftChip>
							) : (
								<SoftChip kind="neutral">
									<span className="font-mono tabular-nums">
										?/{v.total_max}
									</span>
								</SoftChip>
							)}
						</TableCell>
						<TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-muted-foreground">
							{formatDateTime(v.created_at)}
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
