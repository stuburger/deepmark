"use client"

import type { ProposeTeacherOverrideInput } from "@/lib/talk/tools"
import type { useChat } from "@ai-sdk/react"
import { useState } from "react"
import {
	OverrideConfirmCard,
	type OverrideContextEntry,
} from "../override-confirm-card"
import type { TalkUIMessage } from "../types"
import type { ToolPartShape } from "./tool-call-pill"

/** Callback the chat surface owns: server action that writes the override. */
export type OnProposeOverride = (
	input: ProposeTeacherOverrideInput,
) => Promise<{ ok: true } | { ok: false; reason: string }>

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
	part: ToolPartShape
	onProposeOverride?: OnProposeOverride
	overrideContextByQuestion?: ReadonlyMap<string, OverrideContextEntry>
	addToolOutput: ReturnType<typeof useChat<TalkUIMessage>>["addToolOutput"]
}) {
	const [errorReason, setErrorReason] = useState<string | null>(null)
	const input = part.input as
		| {
				questionId: string
				suggestedScore: number
				reason: string
		  }
		| undefined
	if (!input) return null

	let state:
		| { kind: "pending" }
		| { kind: "accepted" }
		| { kind: "dismissed" }
		| { kind: "error"; reason: string }
	if (errorReason) {
		state = { kind: "error", reason: errorReason }
	} else if (part.state === "output-available") {
		const accepted = (part.output as { accepted?: boolean } | undefined)
			?.accepted
		state = accepted ? { kind: "accepted" } : { kind: "dismissed" }
	} else {
		state = { kind: "pending" }
	}

	async function handleAccept() {
		setErrorReason(null)
		if (!onProposeOverride || !input) {
			addToolOutput({
				tool: "proposeTeacherOverride" as never,
				toolCallId: part.toolCallId,
				output: {
					accepted: false,
					reason: "Override mutation not wired in this surface.",
				} as never,
			})
			return
		}
		const result = await onProposeOverride(input)
		if (result.ok) {
			addToolOutput({
				tool: "proposeTeacherOverride" as never,
				toolCallId: part.toolCallId,
				output: { accepted: true } as never,
			})
		} else {
			setErrorReason(result.reason)
		}
	}

	function handleDismiss() {
		setErrorReason(null)
		addToolOutput({
			tool: "proposeTeacherOverride" as never,
			toolCallId: part.toolCallId,
			output: {
				accepted: false,
				reason: "Teacher dismissed the suggestion.",
			} as never,
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
