"use client"

import type { TalkTools } from "@/lib/talk/tools"
import type { useChat } from "@ai-sdk/react"
import type { ToolUIPart } from "ai"
import { useState } from "react"
import {
	OverrideConfirmCard,
	type OverrideContextEntry,
} from "../override-confirm-card"
import type { TalkUIMessage } from "../types"

/** Callback the chat surface owns: server action that writes the override. */
export type OnProposeOverride = (input: {
	questionId: string
	suggestedScore: number
	reason: string
}) => Promise<{ ok: true } | { ok: false; reason: string }>

type OverridePart = Extract<
	ToolUIPart<TalkTools>,
	{ type: "tool-proposeTeacherOverride" }
>

export type OverrideCardState =
	| { kind: "pending" }
	| { kind: "accepted" }
	| { kind: "dismissed" }
	| { kind: "error"; reason: string }

/**
 * Pure derivation of the confirm-card's visible state from the SDK part
 * + the in-flight error reason. Lifted out of the JSX so the
 * pending/accepted/dismissed/error state machine can be tested without
 * rendering React.
 */
export function deriveOverrideCardState(args: {
	partState: string
	output?: { accepted?: boolean }
	errorReason: string | null
}): OverrideCardState {
	if (args.errorReason) return { kind: "error", reason: args.errorReason }
	if (args.partState === "output-available") {
		return args.output?.accepted ? { kind: "accepted" } : { kind: "dismissed" }
	}
	return { kind: "pending" }
}

/**
 * Renders a `proposeTeacherOverride` tool-call part as a confirm card.
 * Pending → Accept/Dismiss buttons; once the teacher decides, the part
 * transitions to output-available and the card collapses. Cleanup item
 * #6 will route mutation failures through addToolOutput instead of the
 * local errorReason state.
 */
export function OverrideToolPart({
	part,
	onProposeOverride,
	overrideContextByQuestion,
	addToolOutput,
}: {
	part: OverridePart
	onProposeOverride?: OnProposeOverride
	overrideContextByQuestion?: ReadonlyMap<string, OverrideContextEntry>
	addToolOutput: ReturnType<typeof useChat<TalkUIMessage>>["addToolOutput"]
}) {
	const [errorReason, setErrorReason] = useState<string | null>(null)
	// During input-streaming the input is DeepPartial; on output-error the
	// SDK may report it as undefined. In both cases we can't render the
	// confirm card; bail out silently.
	if (part.state === "input-streaming") return null
	if (part.state === "output-error" && !part.input) return null
	const input = part.input
	if (!input) return null

	const state = deriveOverrideCardState({
		partState: part.state,
		output: part.state === "output-available" ? part.output : undefined,
		errorReason,
	})

	async function handleAccept() {
		setErrorReason(null)
		// Re-narrow inside the async closure — TS doesn't carry the outer
		// `if (!input) return null` guard across the function boundary.
		if (!input) return
		if (!onProposeOverride) {
			addToolOutput({
				tool: "proposeTeacherOverride",
				toolCallId: part.toolCallId,
				output: {
					accepted: false,
					reason: "Override mutation not wired in this surface.",
				},
			})
			return
		}
		const result = await onProposeOverride(input)
		if (result.ok) {
			addToolOutput({
				tool: "proposeTeacherOverride",
				toolCallId: part.toolCallId,
				output: { accepted: true },
			})
		} else {
			setErrorReason(result.reason)
		}
	}

	function handleDismiss() {
		setErrorReason(null)
		addToolOutput({
			tool: "proposeTeacherOverride",
			toolCallId: part.toolCallId,
			output: {
				accepted: false,
				reason: "Teacher dismissed the suggestion.",
			},
		})
	}

	return (
		<OverrideConfirmCard
			input={input}
			state={state}
			context={overrideContextByQuestion?.get(input.questionId)}
			onAccept={handleAccept}
			onDismiss={handleDismiss}
		/>
	)
}
