"use client"

import type { TalkTools } from "@/lib/talk/tools"
import { cn } from "@/lib/utils"
import { type DynamicToolUIPart, type ToolUIPart, getToolName } from "ai"

export type TalkToolPart = ToolUIPart<TalkTools> | DynamicToolUIPart

const TOOL_LABELS: Record<string, string> = {
	addAnnotation: "annotation",
	updateAnnotation: "annotation update",
	removeAnnotation: "annotation removal",
	linkToScan: "scan navigation",
	proposeTeacherOverride: "score override",
}

/**
 * Compact inline status pill for a single tool call — DeepMark applying a
 * tick, succeeded, failed, etc. Renders three statuses derived from the
 * AI-SDK part state: pending (input-streaming / input-available),
 * ok (output-available with ok !== false), error (output-error or
 * output-available with ok === false).
 */
export function ToolCallPill({ part }: { part: TalkToolPart }) {
	const toolName = getToolName(part)
	const label = TOOL_LABELS[toolName] ?? toolName

	// All client-tool outputs share the ToolDispatchResult shape
	// (`{ ok: boolean; reason?: string }`); narrowing here is purely a
	// runtime read of the discriminator.
	const phraseRaw =
		part.input && typeof part.input === "object"
			? (part.input as { phrase?: unknown }).phrase
			: undefined
	const phrase =
		typeof phraseRaw === "string" ? `"${truncate(phraseRaw, 40)}"` : null

	let status: "pending" | "ok" | "error" = "pending"
	let detail: string | null = null
	if (part.state === "output-available") {
		const out = part.output as { ok?: boolean; reason?: string } | undefined
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
