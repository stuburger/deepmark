import type { TalkTools } from "@/lib/talk/tools"
import type { UIMessage } from "@ai-sdk/react"
import type { UIDataTypes } from "ai"

/** Selection forwarded from the editor (or any future @-mention surface) into chat. */
export type Prefill = {
	text: string
	questionNumber: string | null
	questionId?: string | null
}

/**
 * Per-message metadata persisted with the UIMessage by the AI SDK. The
 * selection chip the teacher attached to a message lives here so it
 * round-trips through reload and (once persistence lands) DB storage.
 * The model never sees metadata — the route still threads selection
 * through `body.selection` for the server-side <selection> wrapper.
 */
export type TalkMetadata = {
	selection?: {
		text: string
		questionNumber: string | null
		questionId: string | null
	}
}

export type TalkUIMessage = UIMessage<TalkMetadata, UIDataTypes, TalkTools>

/** Result returned by every client-side tool dispatcher. */
export type ToolDispatchResult =
	| { ok: true; annotationId?: string }
	| { ok: false; reason: string }
