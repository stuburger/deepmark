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
 * Per-message metadata persisted with the UIMessage by the AI SDK.
 *
 * - `selection`: chip the teacher attached at send-time (user messages).
 *   Round-trips through reload and DB storage; the model never sees it
 *   (the route threads selection through `body.selection` for the
 *   server-side <selection> wrapper).
 * - `conversationId`: server-emitted on each assistant turn so the
 *   client can pin to the persisted conversation row (especially on the
 *   first turn of a brand-new conversation, where the id is unknown
 *   until the server creates it).
 */
export type TalkMetadata = {
	selection?: {
		text: string
		questionNumber: string | null
		questionId: string | null
	}
	conversationId?: string
}

export type TalkUIMessage = UIMessage<TalkMetadata, UIDataTypes, TalkTools>

/** Result returned by every client-side tool dispatcher. */
export type ToolDispatchResult =
	| { ok: true; annotationId?: string }
	| { ok: false; reason: string }
