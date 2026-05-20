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

export type PillStatus = "pending" | "ok" | "error"

export type PillDisplay = {
	label: string
	status: PillStatus
	phrase: string | null
	detail: string | null
}

/** Subset of a tool-call part this module reads — kept loose so the
 *  derivation is testable without depending on SDK-side types. */
export type PillPartInput = {
	toolName: string
	state: string
	input?: unknown
	output?: unknown
	errorText?: string
}

/**
 * Pure derivation of what the pill should show. Lifted out of the JSX so
 * the (interesting) state-machine logic — pending / ok / error and detail
 * extraction across the three input/output states — can be tested without
 * mounting React or a DOM.
 */
export function derivePillDisplay(part: PillPartInput): PillDisplay {
	const label = TOOL_LABELS[part.toolName] ?? part.toolName

	const phraseRaw =
		part.input && typeof part.input === "object"
			? (part.input as { phrase?: unknown }).phrase
			: undefined
	const phrase =
		typeof phraseRaw === "string" ? `"${truncate(phraseRaw, 40)}"` : null

	let status: PillStatus = "pending"
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

	return { label, status, phrase, detail }
}

/**
 * Compact inline status pill for a single tool call — DeepMark applying a
 * tick, succeeded, failed, etc.
 */
export function ToolCallPill({ part }: { part: TalkToolPart }) {
	const { label, status, phrase, detail } = derivePillDisplay({
		toolName: getToolName(part),
		state: part.state,
		input: part.input,
		output: "output" in part ? part.output : undefined,
		errorText: "errorText" in part ? part.errorText : undefined,
	})

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
