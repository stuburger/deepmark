"use client"

import { cn } from "@/lib/utils"

/**
 * Shape we read off a `tool-*` UIMessagePart at runtime. The AI SDK's typed
 * union splits per registered tool name; we narrow by reading the runtime
 * `type` field as a string. The fields we care about (`toolCallId`, `state`,
 * `input`, `output`, `errorText`) are stable across every tool-* part in the
 * SDK's union — cleanup item #2 will replace this with `isToolUIPart` once
 * the chat is fully typed.
 */
export type ToolPartShape = {
	type: string
	toolCallId: string
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error"
		| "approval-requested"
		| "approval-responded"
		| "output-denied"
	input?: Record<string, unknown>
	output?: { ok?: boolean; reason?: string; annotationId?: string }
	errorText?: string
}

const TOOL_LABELS: Record<string, string> = {
	"tool-addAnnotation": "annotation",
	"tool-updateAnnotation": "annotation update",
	"tool-removeAnnotation": "annotation removal",
	"tool-linkToScan": "scan navigation",
	"tool-proposeTeacherOverride": "score override",
}

/**
 * Compact inline status pill for a single tool call — DeepMark applying a
 * tick, succeeded, failed, etc. Renders three statuses derived from the
 * AI-SDK part state: pending (input-streaming / input-available),
 * ok (output-available with ok !== false), error (output-error or
 * output-available with ok === false).
 */
export function ToolCallPill({ part }: { part: ToolPartShape }) {
	const label = TOOL_LABELS[part.type] ?? part.type.replace(/^tool-/, "")
	const phraseRaw = part.input?.phrase
	const phrase =
		typeof phraseRaw === "string" ? `"${truncate(phraseRaw, 40)}"` : null

	let status: "pending" | "ok" | "error" = "pending"
	let detail: string | null = null
	if (part.state === "output-available") {
		const out = part.output
		if (out && out.ok === false) {
			status = "error"
			detail = out.reason ?? null
		} else {
			status = "ok"
		}
	} else if (part.state === "output-error") {
		status = "error"
		detail = part.errorText ?? null
	}

	return (
		<div
			className={cn(
				"mt-2 inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-mono text-[11px]",
				status === "ok" && "border-success/40 bg-success-50 text-success-700",
				status === "error" && "border-error/40 bg-error-50 text-error-700",
				status === "pending" &&
					"border-border-quiet bg-muted text-muted-foreground",
			)}
		>
			<span>
				{status === "pending" && "…"}
				{status === "ok" && "✓"}
				{status === "error" && "×"}
			</span>
			<span>
				{status === "pending" && `Applying ${label}`}
				{status === "ok" && `Applied ${label}`}
				{status === "error" && `Failed ${label}`}
				{phrase ? ` — ${phrase}` : ""}
			</span>
			{detail && status === "error" ? (
				<span className="text-muted-foreground"> · {truncate(detail, 80)}</span>
			) : null}
		</div>
	)
}

function truncate(s: string, max: number): string {
	return s.length > max ? `${s.slice(0, max)}…` : s
}
