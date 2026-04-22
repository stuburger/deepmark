import { ExportMenu } from "@/components/marking/export-menu"
import { Button } from "@/components/ui/button"
import type { SubmissionHistoryItem } from "@/lib/marking/types"
import { RefreshCw } from "lucide-react"

export function SubmissionsHeader({
	paperId,
	submissions,
	selectedIds,
	markedCount,
	inProgressCount,
	onRefresh,
	isRefreshing,
}: {
	paperId: string
	submissions: SubmissionHistoryItem[]
	selectedIds: Set<string>
	markedCount: number
	inProgressCount: number
	onRefresh: () => void
	isRefreshing: boolean
}) {
	const parts: string[] = []
	if (markedCount > 0) parts.push(`${markedCount} Marked`)
	if (inProgressCount > 0) parts.push(`${inProgressCount} In progress`)
	if (selectedIds.size > 0) parts.push(`${selectedIds.size} Selected`)
	const label = parts.join(", ")

	return (
		<div className="flex items-center justify-between gap-4">
			<p className="text-sm font-medium text-muted-foreground">{label}</p>
			<div className="flex items-center gap-2">
				{markedCount > 0 && (
					<ExportMenu
						paperId={paperId}
						submissions={submissions}
						selectedIds={selectedIds}
					/>
				)}
				<Button
					variant="ghost"
					size="icon-xs"
					onClick={onRefresh}
					disabled={isRefreshing}
					title="Refresh submissions"
				>
					<RefreshCw
						className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
					/>
				</Button>
			</div>
		</div>
	)
}
