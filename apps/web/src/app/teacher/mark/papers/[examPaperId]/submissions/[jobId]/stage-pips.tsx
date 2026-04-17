"use client"

import type { JobStages } from "@/lib/marking/stages/types"
import { StagePip } from "./stage-pip"
import {
	type StageRetriggerMutation,
	useStageData,
	useStageMutations,
} from "./stage-pips-hooks"

/**
 * Three-pip cluster showing OCR / grading / enrichment status independently.
 * Each pip's popover exposes the corresponding re-run action.
 *
 * Thin wrapper that binds the data + mutation hooks to the presentation
 * component below — callers pass only a jobId and navigation/annotate
 * callbacks. Use `StagePipsView` directly when you already hold the stages
 * and mutations (e.g. for tests or reuse in other toolbars).
 */
export function StagePips({
	jobId,
	onNavigateToJob,
	onReAnnotate,
}: {
	jobId: string
	onNavigateToJob: (newJobId: string) => void
	onReAnnotate?: () => void
}) {
	const stages = useStageData(jobId)
	const { ocrMutation, gradingMutation } = useStageMutations(
		jobId,
		onNavigateToJob,
	)

	if (!stages) return null

	return (
		<StagePipsView
			stages={stages}
			ocrMutation={ocrMutation}
			gradingMutation={gradingMutation}
			onReAnnotate={onReAnnotate}
		/>
	)
}

/**
 * Pure presentation — renders three pips and wires their popover re-run
 * actions to the supplied mutations. No data fetching or side effects.
 */
export function StagePipsView({
	stages,
	ocrMutation,
	gradingMutation,
	onReAnnotate,
}: {
	stages: JobStages
	ocrMutation: StageRetriggerMutation
	gradingMutation: StageRetriggerMutation
	onReAnnotate?: () => void
}) {
	return (
		<div className="flex items-center gap-1.5">
			<StagePip
				stageKey="ocr"
				stage={stages.ocr}
				onRerun={() => ocrMutation.mutate()}
				rerunDisabled={
					ocrMutation.isPending || stages.ocr.status === "generating"
				}
			/>
			<StagePip
				stageKey="grading"
				stage={stages.grading}
				onRerun={() => gradingMutation.mutate()}
				rerunDisabled={
					gradingMutation.isPending ||
					stages.grading.status === "generating" ||
					stages.ocr.status !== "done"
				}
			/>
			<StagePip
				stageKey="enrichment"
				stage={stages.enrichment}
				onRerun={onReAnnotate}
				rerunDisabled={
					!onReAnnotate ||
					stages.enrichment.status === "generating" ||
					stages.grading.status !== "done"
				}
			/>
		</div>
	)
}
