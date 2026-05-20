"use client"

import { cn } from "@/lib/utils"
import type { useChat } from "@ai-sdk/react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { OverrideContextEntry } from "../override-confirm-card"
import type { Prefill, TalkUIMessage } from "../types"
import { ChipBadge } from "./chip-badge"
import { type OnProposeOverride, OverrideToolPart } from "./override-tool-part"
import { type TalkToolPart, ToolCallPill } from "./tool-call-pill"

/**
 * Structural type guard for the tool-call message parts. The SDK ships
 * `isToolUIPart`, but its type predicate references the top-level `ai`
 * package's `UIMessagePart`, which has a different declaration identity
 * from `@ai-sdk/react`'s bundled-`ai` `UIMessagePart` (dual-package
 * hazard). The runtime check is dead simple and identity-agnostic so we
 * inline it here.
 */
export function isTalkToolPart(p: { type: string }): p is TalkToolPart {
	return p.type.startsWith("tool-") || p.type === "dynamic-tool"
}

/**
 * Which renderer the bubble should use for a tool part. Pure dispatch
 * decision lifted out so it can be tested without React.
 */
export function pickToolRenderer(part: TalkToolPart): "override" | "pill" {
	return part.type === "tool-proposeTeacherOverride" ? "override" : "pill"
}

/**
 * Single message in the chat. Two variants:
 *   - user: right-aligned card; optionally renders its selection chip
 *     (read from `message.metadata.selection`) above the typed text.
 *   - assistant: left-aligned plain prose; renders markdown + a tool-call
 *     pill per tool part, with `proposeTeacherOverride` getting the inline
 *     confirm card instead of a pill.
 *
 * Returns null for messages that have nothing visible (no text, no tool
 * parts, no chip) so streaming placeholder rows don't paint until content
 * lands.
 */
export function MessageBubble({
	message,
	onProposeOverride,
	overrideContextByQuestion,
	addToolOutput,
}: {
	message: TalkUIMessage
	onProposeOverride?: OnProposeOverride
	overrideContextByQuestion?: ReadonlyMap<string, OverrideContextEntry>
	addToolOutput: ReturnType<typeof useChat<TalkUIMessage>>["addToolOutput"]
}) {
	const isUser = message.role === "user"
	const text = message.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("")
	const selectionChip: Prefill | null = message.metadata?.selection
		? {
				text: message.metadata.selection.text,
				questionNumber: message.metadata.selection.questionNumber,
				questionId: message.metadata.selection.questionId,
			}
		: null

	const toolParts = !isUser ? message.parts.filter(isTalkToolPart) : []

	if (!text && toolParts.length === 0 && !selectionChip) return null

	return (
		<div
			className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
		>
			<div
				className={cn(
					"max-w-[85%] text-sm leading-[1.55]",
					isUser
						? "rounded-md border border-border bg-card px-3.5 py-2.5 text-foreground shadow-tile"
						: "text-foreground",
				)}
			>
				{isUser && selectionChip ? (
					<div className={cn("flex flex-wrap", text ? "mb-1.5" : null)}>
						<ChipBadge chip={selectionChip} />
					</div>
				) : null}
				{text ? (
					isUser ? (
						<div className="whitespace-pre-wrap">{text}</div>
					) : (
						<AssistantMarkdown text={text} />
					)
				) : null}
				{toolParts.map((p) => {
					if (pickToolRenderer(p) === "override") {
						// pickToolRenderer narrows runtime; re-check the type
						// discriminator so TS sees the OverridePart variant.
						if (p.type !== "tool-proposeTeacherOverride") return null
						return (
							<OverrideToolPart
								key={p.toolCallId}
								part={p}
								onProposeOverride={onProposeOverride}
								overrideContextByQuestion={overrideContextByQuestion}
								addToolOutput={addToolOutput}
							/>
						)
					}
					return <ToolCallPill key={p.toolCallId} part={p} />
				})}
			</div>
		</div>
	)
}

/**
 * Markdown renderer for assistant prose. We don't use
 * @tailwindcss/typography (not installed); each markdown element maps to
 * a JSX component with explicit design-token classes so nothing leaks
 * into global style and we stay within the `text-foreground`,
 * `border-border-quiet` etc. vocabulary.
 */
function AssistantMarkdown({ text }: { text: string }) {
	return (
		<ReactMarkdown
			remarkPlugins={[remarkGfm]}
			components={{
				p: ({ children }) => (
					<p className="[&:not(:first-child)]:mt-3">{children}</p>
				),
				strong: ({ children }) => (
					<strong className="font-semibold">{children}</strong>
				),
				em: ({ children }) => <em className="italic">{children}</em>,
				ul: ({ children }) => (
					<ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
				),
				ol: ({ children }) => (
					<ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
				),
				li: ({ children }) => <li>{children}</li>,
				code: ({ children }) => (
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
						{children}
					</code>
				),
				pre: ({ children }) => (
					<pre className="my-2 overflow-x-auto rounded bg-muted p-3 font-mono text-[11px]">
						{children}
					</pre>
				),
				h1: ({ children }) => (
					<h3 className="mt-3 mb-1 font-semibold text-foreground">
						{children}
					</h3>
				),
				h2: ({ children }) => (
					<h3 className="mt-3 mb-1 font-semibold text-foreground">
						{children}
					</h3>
				),
				h3: ({ children }) => (
					<h3 className="mt-3 mb-1 font-semibold text-foreground">
						{children}
					</h3>
				),
				h4: ({ children }) => (
					<h4 className="mt-3 mb-1 font-semibold text-foreground">
						{children}
					</h4>
				),
				blockquote: ({ children }) => (
					<blockquote className="my-2 border-l-2 border-border-quiet pl-3 italic text-muted-foreground">
						{children}
					</blockquote>
				),
				a: ({ href, children }) => (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary underline underline-offset-2 hover:no-underline"
					>
						{children}
					</a>
				),
				hr: () => <hr className="my-3 border-border-quiet" />,
				table: ({ children }) => (
					<div className="my-2 overflow-x-auto">
						<table className="w-full border-collapse text-[12px]">
							{children}
						</table>
					</div>
				),
				th: ({ children }) => (
					<th className="border border-border-quiet px-2 py-1 text-left font-semibold">
						{children}
					</th>
				),
				td: ({ children }) => (
					<td className="border border-border-quiet px-2 py-1 align-top">
						{children}
					</td>
				),
			}}
		>
			{text}
		</ReactMarkdown>
	)
}
