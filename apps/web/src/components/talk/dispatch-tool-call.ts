import type {
	AddAnnotationInput,
	LinkToScanInput,
	RemoveAnnotationInput,
	UpdateAnnotationInput,
} from "@/lib/talk/tools"
import type { ToolDispatchResult } from "./types"

/** Surface-provided dispatchers. Absent callbacks resolve to `notAvailable`. */
export type ToolCallbacks = {
	addAnnotation?: (i: AddAnnotationInput) => Promise<ToolDispatchResult>
	updateAnnotation?: (i: UpdateAnnotationInput) => Promise<ToolDispatchResult>
	removeAnnotation?: (i: RemoveAnnotationInput) => Promise<ToolDispatchResult>
	linkToScan?: (i: LinkToScanInput) => void
}

/**
 * Tool-call union this dispatcher handles. Structurally identical to the
 * SDK's `ToolCall<NAME, INPUT>` for our four fire-and-forget tools
 * (proposeTeacherOverride is handled inline via the confirm card and is
 * deliberately NOT here). We can't import the SDK's `ToolCall` directly
 * because `ai` doesn't re-export it and `@ai-sdk/provider-utils` is
 * duplicated across the workspace; the caller passes the SDK type
 * through a single boundary cast on the orchestration side.
 */
export type DispatchableToolCall =
	| {
			toolName: "addAnnotation"
			toolCallId: string
			input: AddAnnotationInput
	  }
	| {
			toolName: "updateAnnotation"
			toolCallId: string
			input: UpdateAnnotationInput
	  }
	| {
			toolName: "removeAnnotation"
			toolCallId: string
			input: RemoveAnnotationInput
	  }
	| {
			toolName: "linkToScan"
			toolCallId: string
			input: LinkToScanInput
	  }

/**
 * Dispatch a single tool call to the parent-supplied callback. Absent
 * callbacks resolve to `{ ok: false, reason }` so the model can self-
 * correct on the next turn.
 */
export async function dispatchToolCall(
	toolCall: DispatchableToolCall,
	cbs: ToolCallbacks,
): Promise<ToolDispatchResult> {
	switch (toolCall.toolName) {
		case "addAnnotation":
			if (!cbs.addAnnotation) return notAvailable()
			return cbs.addAnnotation(toolCall.input)
		case "updateAnnotation":
			if (!cbs.updateAnnotation) return notAvailable()
			return cbs.updateAnnotation(toolCall.input)
		case "removeAnnotation":
			if (!cbs.removeAnnotation) return notAvailable()
			return cbs.removeAnnotation(toolCall.input)
		case "linkToScan":
			cbs.linkToScan?.(toolCall.input)
			return { ok: true }
	}
}

function notAvailable(): ToolDispatchResult {
	return {
		ok: false,
		reason: "Tool callback not wired in this surface. Try again later.",
	}
}
