"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowRight, Check, Loader2, X } from "lucide-react"
import { useState } from "react"

/**
 * Inline confirm card rendered for the `proposeTeacherOverride` tool call.
 * DeepMark cannot apply teacher-override scores directly — it can only
 * suggest one. The card surfaces the suggestion with Accept / Dismiss
 * buttons; the teacher's click is what writes the override.
 *
 * Three visible states derived from the AI-SDK message part:
 *   - input-available → pending (buttons live)
 *   - output-available + accepted → collapsed "Accepted" line
 *   - output-available + !accepted → collapsed "Dismissed" line
 *
 * `isApplying` is a transient local state covering the time between the
 * Accept click and the server action resolving — buttons disable, label
 * flips to "Applying…".
 */

export type OverrideToolInput = {
	questionId: string
	suggestedScore: number
	reason: string
}

export type OverrideContextEntry = {
	questionNumber: string
	currentScore: number
	maxScore: number
}

type CardState =
	| { kind: "pending" }
	| { kind: "accepted" }
	| { kind: "dismissed" }
	| { kind: "error"; reason: string }

type OverrideConfirmCardProps = {
	input: OverrideToolInput
	state: CardState
	context?: OverrideContextEntry
	onAccept: () => Promise<void>
	onDismiss: () => void
}

export function OverrideConfirmCard({
	input,
	state,
	context,
	onAccept,
	onDismiss,
}: OverrideConfirmCardProps) {
	const [isApplying, setIsApplying] = useState(false)

	const questionLabel = context
		? `Q${context.questionNumber}`
		: `Question ${input.questionId.slice(-6)}`
	const maxScore = context?.maxScore

	// Collapsed states once the teacher has decided.
	if (state.kind === "accepted") {
		return (
			<div className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-success/40 bg-success-50 px-2 py-1 font-mono text-[11px] text-success-700">
				<Check className="size-3" aria-hidden />
				<span>
					Override accepted — {questionLabel} → {input.suggestedScore}
					{maxScore ? `/${maxScore}` : ""}
				</span>
			</div>
		)
	}
	if (state.kind === "dismissed") {
		return (
			<div className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-border-quiet bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground">
				<X className="size-3" aria-hidden />
				<span>
					Override dismissed — {questionLabel} → {input.suggestedScore}
					{maxScore ? `/${maxScore}` : ""}
				</span>
			</div>
		)
	}

	// Pending or error — show the full card.
	async function handleAccept() {
		if (isApplying) return
		setIsApplying(true)
		try {
			await onAccept()
		} finally {
			setIsApplying(false)
		}
	}

	return (
		<div
			className={cn(
				"mt-2 max-w-md rounded-md border bg-card shadow-tile",
				state.kind === "error" ? "border-destructive" : "border-border",
			)}
		>
			<div className="px-3 pt-2.5 pb-1.5">
				<div className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
					Suggested score override
				</div>
				<div className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-foreground">
					<span>{questionLabel}</span>
					{context ? (
						<>
							<span className="font-mono text-muted-foreground">
								{context.currentScore}/{context.maxScore}
							</span>
							<ArrowRight
								className="size-3 text-muted-foreground"
								aria-hidden
							/>
							<span className="font-mono">
								{input.suggestedScore}/{context.maxScore}
							</span>
						</>
					) : (
						<span className="font-mono">{input.suggestedScore}</span>
					)}
				</div>
				<p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
					{input.reason}
				</p>
				{state.kind === "error" ? (
					<p className="mt-1.5 text-[12px] leading-snug text-destructive">
						Couldn't apply: {state.reason}
					</p>
				) : null}
			</div>
			<div className="flex items-center justify-end gap-1.5 border-t border-border-quiet px-2 py-1.5">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onDismiss}
					disabled={isApplying}
					className="h-7 text-[11px]"
				>
					Dismiss
				</Button>
				<Button
					type="button"
					variant="confirm"
					size="sm"
					onClick={handleAccept}
					disabled={isApplying}
					className="h-7 text-[11px]"
				>
					{isApplying ? (
						<>
							<Loader2 className="size-3 animate-spin" />
							Applying…
						</>
					) : (
						"Accept change"
					)}
				</Button>
			</div>
		</div>
	)
}
