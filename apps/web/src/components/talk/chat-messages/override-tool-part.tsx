"use client"

import type { TalkTools } from "@/lib/talk/tools"
import type { useChat } from "@ai-sdk/react"
import type { ToolUIPart } from "ai"
import { toast } from "sonner"
import {
	type OverrideCardState,
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

/**
 * Pure derivation of the confirm-card's visible state from the SDK part.
 * Failure is no longer a separate `error` kind — mutation failures are
 * written to `addToolOutput` as `{ accepted: false, reason }` so the
 * model sees them; the card collapses to "dismissed" the same way as a
 * teacher dismissal. The teacher gets a Sonner toast at failure-time for
 * the human-facing signal.
 */
export function deriveOverrideCardState(args: {
	partState: string
	output?: { accepted?: boolean }
}): OverrideCardState {
	if (args.partState === "output-available") {
		return args.output?.accepted ? { kind: "accepted" } : { kind: "dismissed" }
	}
	return { kind: "pending" }
}

/**
 * Renders a `proposeTeacherOverride` tool-call part as a confirm card.
 * Pending → Accept/Dismiss buttons; once the teacher decides (or the
 * mutation fails), the part transitions to output-available and the
 * card collapses. Mutation failures route through addToolOutput so the
 * model can react on the next turn.
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
	})

	async function handleAccept() {
		// Re-narrow inside the async closure — TS doesn't carry the outer
		// `if (!input) return null` guard across the function boundary.
		if (!input) return
		if (!onProposeOverride) {
			toast.error("Override mutation not wired in this surface.")
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
			// Surface the failure to the teacher (toast) AND the model
			// (addToolOutput). The card collapses to "dismissed" — the
			// override didn't apply, the model can suggest a fix on the
			// next turn.
			toast.error(`Couldn't apply override: ${result.reason}`)
			addToolOutput({
				tool: "proposeTeacherOverride",
				toolCallId: part.toolCallId,
				output: { accepted: false, reason: result.reason },
			})
		}
	}

	function handleDismiss() {
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
