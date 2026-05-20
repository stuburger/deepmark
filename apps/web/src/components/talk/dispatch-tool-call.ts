import type {
	AddAnnotationInput,
	RemoveAnnotationInput,
	UpdateAnnotationInput,
} from "@/lib/talk/tools"
import type { ToolDispatchResult } from "./types"

/**
 * Minimal runtime shape we read off a SDK tool-call object. We rely on
 * `toolName` for dispatch and `input` as a plain bag — every concrete
 * tool's input is then cast to its Zod-inferred type at the call site.
 * Cleanup item #2 will eliminate the casts once useChat is fully typed.
 */
type ToolCallShape = {
	toolName: string
	toolCallId: string
	input: Record<string, unknown>
}

/** Surface-provided dispatchers. Absent callbacks resolve to `notAvailable`. */
export type ToolCallbacks = {
	addAnnotation?: (i: AddAnnotationInput) => Promise<ToolDispatchResult>
	updateAnnotation?: (i: UpdateAnnotationInput) => Promise<ToolDispatchResult>
	removeAnnotation?: (i: RemoveAnnotationInput) => Promise<ToolDispatchResult>
	linkToScan?: (i: {
		questionId: string
		tokenStart?: string
		tokenEnd?: string
	}) => void
}

/**
 * Dispatch a single tool call to the parent-supplied callback. Unknown
 * tools or absent callbacks resolve to `{ ok: false, reason }` so the
 * model can self-correct on the next turn.
 *
 * `proposeTeacherOverride` is NOT routed through here — the chat handles
 * it inline via the confirm-card path; this dispatcher is for the
 * fire-and-forget client tools only.
 */
export async function dispatchToolCall(
	toolCall: unknown,
	cbs: ToolCallbacks,
): Promise<ToolDispatchResult> {
	const tc = toolCall as ToolCallShape
	switch (tc.toolName) {
		case "addAnnotation": {
			if (!cbs.addAnnotation) return notAvailable()
			return cbs.addAnnotation(tc.input as AddAnnotationInput)
		}
		case "updateAnnotation": {
			if (!cbs.updateAnnotation) return notAvailable()
			return cbs.updateAnnotation(tc.input as UpdateAnnotationInput)
		}
		case "removeAnnotation": {
			if (!cbs.removeAnnotation) return notAvailable()
			return cbs.removeAnnotation(tc.input as RemoveAnnotationInput)
		}
		case "linkToScan": {
			cbs.linkToScan?.(
				tc.input as {
					questionId: string
					tokenStart?: string
					tokenEnd?: string
				},
			)
			return { ok: true }
		}
		default:
			return { ok: false, reason: `Unknown tool: ${tc.toolName}` }
	}
}

function notAvailable(): ToolDispatchResult {
	return {
		ok: false,
		reason: "Tool callback not wired in this surface. Try again later.",
	}
}
