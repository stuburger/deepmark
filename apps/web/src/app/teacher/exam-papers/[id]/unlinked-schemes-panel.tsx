import { Button } from "@/components/ui/button"
import type { UnlinkedMarkScheme } from "@/lib/exam-paper/queries"
import { AlertTriangle, Link2 } from "lucide-react"

export function UnlinkedSchemesPanel({
	items,
	onLink,
}: {
	items: UnlinkedMarkScheme[]
	onLink: (item: UnlinkedMarkScheme) => void
}) {
	if (items.length === 0) return null

	return (
		<div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
			<div className="flex items-center gap-2">
				<AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
				<p className="text-sm font-medium text-destructive">
					{items.length} unlinked mark scheme
					{items.length !== 1 ? "s" : ""} — created during ingestion but not
					matched to a question
				</p>
			</div>
			<div className="space-y-2">
				{items.map((item) => (
					<div
						key={item.markSchemeId}
						className="flex items-start justify-between gap-3 rounded-md bg-background border px-3 py-2.5"
					>
						<div className="min-w-0 flex-1">
							{item.ghostQuestionNumber && (
								<p className="text-xs text-muted-foreground mb-0.5">
									Extracted as Q{item.ghostQuestionNumber}
								</p>
							)}
							<p
								className="text-sm truncate"
								title={item.ghostQuestionText}
							>
								{item.ghostQuestionText}
							</p>
							{item.markSchemeDescription && (
								<p
									className="text-xs text-muted-foreground truncate mt-0.5"
									title={item.markSchemeDescription}
								>
									Mark scheme: {item.markSchemeDescription}
								</p>
							)}
							<p className="text-xs text-muted-foreground">
								{item.pointsTotal} mark
								{item.pointsTotal !== 1 ? "s" : ""}
							</p>
						</div>
						<Button
							size="sm"
							variant="outline"
							className="shrink-0"
							onClick={() => onLink(item)}
						>
							<Link2 className="h-3.5 w-3.5 mr-1.5" />
							Link to question
						</Button>
					</div>
				))}
			</div>
		</div>
	)
}
