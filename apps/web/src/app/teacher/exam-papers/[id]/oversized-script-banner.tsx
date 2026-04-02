import { AlertTriangle, Scissors } from "lucide-react"

export function OversizedScriptBanner({
	scriptId,
	pageCount,
	pagesPerScript,
	onSplit,
}: {
	scriptId: string
	pageCount: number
	pagesPerScript: number
	onSplit: (scriptId: string, splitAfterIndex: number) => void
}) {
	const midpoint = Math.floor(pageCount / 2) - 1
	return (
		<div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-400">
			<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
			<span>
				{pageCount} pages — expected ~{pagesPerScript}
			</span>
			<button
				type="button"
				onClick={() => onSplit(scriptId, midpoint)}
				className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium hover:bg-amber-500/20 transition-colors"
			>
				<Scissors className="h-3 w-3" />
				Split at midpoint
			</button>
		</div>
	)
}
