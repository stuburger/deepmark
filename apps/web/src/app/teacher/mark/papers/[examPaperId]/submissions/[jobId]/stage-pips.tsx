"use client"

import type { JobStages } from "@/lib/marking/stages/types"
import { StagePip } from "./stage-pip"
import {
	type StageRetriggerMutation,
	useStageData,
	useStageMutations,
} from "./stage-pips-hooks"

/**
 * Three-pip cluster showing OCR / grading / annotation status independently.
 * Each pip's popover exposes the corresponding re-run action.
 *
 * Thin wrapper that binds the data + mutation hooks to the presentation
 * component below — callers pass only a jobId and a navigation callback. Use
 * `StagePipsView` directly when you already hold the stages and mutations
 * (e.g. for tests or reuse in other toolbars).
 */
export function StagePips({
	jobId,
	onNavigateToJob,
}: {
	jobId: string
	onNavigateToJob: (newJobId: string) => void
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
		/>
	)
}

/**
 * Pure presentation — renders three pips and wires their popover re-run
 * actions to the supplied mutations. No data fetching or side effects.
 *
 * The annotation pip's re-run triggers the grading mutation: annotations live
 * inside the grade Lambda, so regenerating them means re-grading (which
 * creates a new superseded submission — we intentionally have no in-place
 * re-run path).
 */
export function StagePipsView({
	stages,
	ocrMutation,
	gradingMutation,
}: {
	stages: JobStages
	ocrMutation: StageRetriggerMutation
	gradingMutation: StageRetriggerMutation
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
				stageKey="annotation"
				stage={stages.annotation}
				onRerun={() => gradingMutation.mutate()}
				rerunDisabled={
					gradingMutation.isPending ||
					stages.annotation.status === "generating" ||
					stages.grading.status !== "done"
				}
			/>
		</div>
	)
}
