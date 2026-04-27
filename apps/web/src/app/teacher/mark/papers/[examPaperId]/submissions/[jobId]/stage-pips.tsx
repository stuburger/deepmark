"use client"

import type { JobStages } from "@/lib/marking/stages/types"
import { StagePip } from "./stage-pip"
import {
	type StageRetriggerMutation,
	useStageData,
	useStageMutations,
} from "./stage-pips-hooks"

/**
 * Two-pip cluster showing OCR + grading status. Annotations now run inside
 * the grade Lambda (see `student-paper-grade.ts:markGradingRunComplete` —
 * `status`, `completed_at`, and `annotations_completed_at` are all set in
 * the same atomic UPDATE), so a separate annotation pip would always
 * duplicate the grading pip's signal.
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
 * Pure presentation — renders the OCR + grading pips and wires their
 * popover re-run actions to the supplied mutations. No data fetching or
 * side effects.
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
		</div>
	)
}
