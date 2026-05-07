import { ResultsPanelSkeleton } from "./results-panel-skeleton"
import { ScanPanelSkeleton } from "./scan-panel-skeleton"
import { SubmissionToolbarSkeleton } from "./submission-toolbar-skeleton"

export function SubmissionViewSkeleton() {
	return (
		<div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-float">
			<SubmissionToolbarSkeleton />
			<div className="grid flex-1 grid-cols-[20%_1fr] overflow-hidden">
				<div className="border-r border-border">
					<ScanPanelSkeleton />
				</div>
				<ResultsPanelSkeleton />
			</div>
		</div>
	)
}
