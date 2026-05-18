"use client"

import { cn } from "@/lib/utils"
import { AlertCircle, Check, Loader2 } from "lucide-react"

/**
 * 4-pill stepper for the wizard surfaces (/papers/new and /sessions/[id]).
 * Pure presentational — the consumer derives each pill's state from session
 * facts (`exam_paper_id`, `batchIngestJob.status`, `error`) and passes the
 * resulting flags down.
 *
 * Visual language mirrors the editor's tick mark pattern shipped 2026-05-14
 * (AcquiredLabel) — completed pills carry the same green-highlight + check.
 */

export type StepperStep = "upload" | "extract" | "scripts" | "done"

export type StepperState = {
	current: StepperStep
	/** False when the teacher dropped no scripts PDF — Scripts pill is skipped. */
	hasScripts: boolean
	extractDone: boolean
	extractFailed: boolean
	segmentationDone: boolean
	segmentationFailed: boolean
}

export function PaperSetupStepper(props: StepperState) {
	const steps: { key: StepperStep; label: string }[] = [
		{ key: "upload", label: "Upload" },
		{ key: "extract", label: "Extract" },
		{ key: "scripts", label: "Scripts" },
		{ key: "done", label: "Done" },
	]

	return (
		<ol className="flex items-center gap-2" aria-label="Paper setup progress">
			{steps.map((step, idx) => {
				const state = deriveState(step.key, props)
				return (
					<li key={step.key} className="flex items-center gap-2">
						<Pill label={step.label} state={state} />
						{idx < steps.length - 1 && (
							<span aria-hidden className="h-px w-6 bg-border-quiet" />
						)}
					</li>
				)
			})}
		</ol>
	)
}

type PillState =
	/** Reached but no backend work is happening (Upload while waiting for the
	 * teacher to drop files, Done while waiting for the Start-marking click). */
	| "active"
	/** Reached AND backend work is in flight — spinner. */
	| "inProgress"
	| "completed"
	| "pending"
	| "skipped"
	| "failed"

function Pill({ label, state }: { label: string; state: PillState }) {
	const classes = cn(
		"inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors duration-300 ease-out",
		state === "completed" && "bg-success-200 text-foreground",
		(state === "active" || state === "inProgress") &&
			"bg-accent text-foreground",
		state === "pending" && "text-muted-foreground",
		state === "skipped" && "text-ink-tertiary",
		state === "failed" && "bg-destructive/10 text-destructive",
	)
	return (
		<span className={classes}>
			{state === "completed" && (
				<Check aria-hidden className="size-3.5 text-success" />
			)}
			{state === "inProgress" && (
				<Loader2 aria-hidden className="size-3.5 animate-spin text-primary" />
			)}
			{state === "failed" && <AlertCircle aria-hidden className="size-3.5" />}
			<span>{label}</span>
			{state === "skipped" && (
				<span className="text-[10px] uppercase tracking-wide opacity-60">
					· skipped
				</span>
			)}
		</span>
	)
}

function deriveState(step: StepperStep, props: StepperState): PillState {
	const {
		current,
		hasScripts,
		extractDone,
		extractFailed,
		segmentationDone,
		segmentationFailed,
	} = props

	if (step === "upload") {
		// Upload has no backend phase — the teacher is either still on this
		// step (no spinner — they're deciding) or has moved past it (tick).
		return current === "upload" ? "active" : "completed"
	}
	if (step === "extract") {
		if (extractFailed) return "failed"
		if (extractDone) return "completed"
		// Bundle is genuinely running the moment we're on this step.
		return current === "extract" ? "inProgress" : "pending"
	}
	if (step === "scripts") {
		if (!hasScripts) return "skipped"
		if (segmentationFailed) return "failed"
		if (segmentationDone) return "completed"
		return current === "scripts" ? "inProgress" : "pending"
	}
	// done — terminal "you arrived, click Start marking" — no spinner.
	const allDone = extractDone && (segmentationDone || !hasScripts)
	if (extractFailed || segmentationFailed) return "pending"
	if (allDone) return current === "done" ? "active" : "completed"
	return "pending"
}
