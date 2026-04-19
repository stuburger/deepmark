import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { ViewToggle } from "./view-toggle"

export function SubmissionsHeader({
	markedCount,
	inProgressCount,
	view,
	onViewChange,
	onRefresh,
	isRefreshing,
}: {
	markedCount: number
	inProgressCount: number
	view: "list" | "table"
	onViewChange: (v: "list" | "table") => void
	onRefresh: () => void
	isRefreshing: boolean
}) {
	const parts: string[] = []
	if (markedCount > 0) parts.push(`${markedCount} Marked`)
	if (inProgressCount > 0) parts.push(`${inProgressCount} In progress`)
	const label = parts.join(", ")

	return (
		<div className="flex items-center justify-between gap-4">
			<p className="text-sm font-medium text-muted-foreground">{label}</p>
			<div className="flex items-center gap-2">
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
				<ViewToggle value={view} onChange={onViewChange} />
			</div>
		</div>
	)
}
