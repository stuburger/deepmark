import { ViewToggle } from "./view-toggle"

export function SubmissionsHeader({
	label,
	count,
	view,
	onViewChange,
}: {
	label?: string
	count: number
	view: "grid" | "table"
	onViewChange: (v: "grid" | "table") => void
}) {
	const countLabel = `${count} script${count !== 1 ? "s" : ""}`
	return (
		<div className="flex items-center justify-between gap-4">
			<p className="text-sm font-medium text-muted-foreground">
				{label ? `${label} · ${countLabel}` : countLabel}
			</p>
			{count > 0 && <ViewToggle value={view} onChange={onViewChange} />}
		</div>
	)
}
