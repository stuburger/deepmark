"use client"

import { ScrollArea } from "@/components/ui/scroll-area"
import type { MarkingPhase } from "@/lib/marking/stages/phase"
import type {
	StudentPaperAnnotation,
	StudentPaperJobPayload,
	TeacherOverride,
} from "@/lib/marking/types"
import { CancelledPanel } from "./cancelled"
import { FailedPanel } from "./failed"
import { MarkingResults } from "./results/index"
/**
 * Results panel — always renders the editor (MarkingResults), regardless of
 * pipeline phase. In-progress stage status is surfaced by the StagePips in
 * the submission toolbar, not by replacing the editor with a spinner.
 *
 * Failed and cancelled phases show a banner *above* the editor so the
 * teacher still sees whatever partial data was captured (extracted answers,
 * partial grading) before the failure.
 */
type SharedPanelProps = {
	jobId: string
	data: StudentPaperJobPayload
	phase: MarkingPhase
	activeQuestionNumber: string | null
	overridesByQuestionId?: Map<string, TeacherOverride>
	onDerivedAnnotations?: (annotations: StudentPaperAnnotation[]) => void
	onTokenHighlight?: (tokenIds: string[] | null) => void
}

export function ResultsPanel({
	jobId,
	data,
	phase,
	activeQuestionNumber,
	overridesByQuestionId,
	onDerivedAnnotations,
	onTokenHighlight,
}: SharedPanelProps) {
	return (
		<ScrollArea
			data-results-panel
			className="h-full w-full bg-zinc-100 dark:bg-zinc-900"
		>
			<div className="p-4 space-y-5 w-full">
				{phase === "failed" && <FailedPanel data={data} jobId={jobId} />}
				{phase === "cancelled" && <CancelledPanel />}

				<MarkingResults
					jobId={jobId}
					data={data}
					activeQuestionNumber={activeQuestionNumber}
					overridesByQuestionId={overridesByQuestionId}
					onDerivedAnnotations={onDerivedAnnotations}
					onTokenHighlight={onTokenHighlight}
				/>
			</div>
		</ScrollArea>
	)
}
