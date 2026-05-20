"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { ArrowUp, AtSign, Loader2, Sparkles, Square, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const SUGGESTIONS = [
	"Explain AO1 vs AO2 for English Literature",
	"How accurate is DeepMark's level-of-response marking?",
	"What's the difference between point-based and LoR marking?",
	"How should I interpret a 12-mark essay grade?",
]

type Prefill = {
	text: string
	questionNumber: string | null
	questionId?: string | null
	tokenStart?: string | null
	tokenEnd?: string | null
}

type TalkToDeepMarkChatProps = {
	className?: string
	/**
	 * Scopes the conversation to a single submission. When set, the server
	 * builds a cached preamble (paper, questions, marking decisions,
	 * annotations) and the chat operates in editor mode. Absent → general
	 * assistant mode.
	 */
	submissionId?: string
	/**
	 * Pushes a selection in from the parent (e.g. the editor's BubbleMenu).
	 * The component captures it into an internal chip and immediately calls
	 * `onPrefillConsumed` so the parent's state can clear; re-selecting the
	 * same text re-fires this path.
	 */
	prefill?: Prefill | null
	onPrefillConsumed?: () => void
	/**
	 * Suppresses the big "Talk to DeepMark" intro headline + suggestion grid.
	 * Use in tight sidebar surfaces (editor chat panel) where the host has
	 * its own framing.
	 */
	compact?: boolean
}

export function TalkToDeepMarkChat({
	className,
	submissionId,
	prefill,
	onPrefillConsumed,
	compact = false,
}: TalkToDeepMarkChatProps) {
	const [input, setInput] = useState("")
	const [chip, setChip] = useState<Prefill | null>(null)
	const scrollRef = useRef<HTMLDivElement>(null)
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/talk",
				body: () => (submissionId ? { submissionId } : {}),
			}),
		[submissionId],
	)

	const { messages, sendMessage, status, stop, error } = useChat({
		transport,
		onError: (err) => {
			toast.error(err.message || "Failed to reach DeepMark.")
		},
	})

	const isStreaming = status === "submitted" || status === "streaming"
	const hasMessages = messages.length > 0

	// Ingest parent-driven prefill into the chip slot. We replace any existing
	// chip — Phase 5 ships single-chip selection; multi-chip can come later.
	// Focus the textarea so the teacher can type immediately after clicking
	// "Talk to DeepMark" in the editor bubble.
	useEffect(() => {
		if (!prefill) return
		setChip(prefill)
		onPrefillConsumed?.()
		// rAF gives the LHS panel a tick to mount the textarea when the chat
		// is being opened for the first time alongside the prefill.
		requestAnimationFrame(() => textareaRef.current?.focus())
	}, [prefill, onPrefillConsumed])

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every message/token update
	useEffect(() => {
		scrollRef.current?.scrollTo({
			top: scrollRef.current.scrollHeight,
			behavior: "smooth",
		})
	}, [messages])

	function submit() {
		const trimmed = input.trim()
		// Allow submitting with just a chip and no typed input — the model
		// still gets the <selection> block and can respond to it.
		if (!trimmed && !chip) return
		if (isStreaming) return
		sendMessage(
			{ text: trimmed },
			chip
				? {
						body: {
							selection: {
								text: chip.text,
								questionNumber: chip.questionNumber,
								questionId: chip.questionId ?? null,
								tokenStart: chip.tokenStart ?? null,
								tokenEnd: chip.tokenEnd ?? null,
							},
						},
					}
				: undefined,
		)
		setInput("")
		setChip(null)
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		submit()
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault()
			submit()
		}
	}

	const sendDisabled = (!input.trim() && !chip) || isStreaming
	const showIntro = !compact && !hasMessages

	return (
		<TooltipProvider>
			<div
				className={cn(
					"flex w-full flex-col",
					hasMessages || compact ? "h-full" : "py-8",
					className,
				)}
			>
				{showIntro && (
					<div className="flex flex-col items-center gap-2 pb-8 text-center">
						<Sparkles className="size-8 text-primary" />
						<h1 className="font-editorial text-[clamp(28px,4vw,40px)] leading-[1.1] tracking-[-0.01em] text-foreground">
							Talk to DeepMark.
						</h1>
						<p className="max-w-[520px] text-[13px] text-muted-foreground">
							Ask anything about marking, the GCSE syllabus, AOs, or your
							students' work.
						</p>
					</div>
				)}

				{(hasMessages || compact) && (
					<div ref={scrollRef} className="flex-1 overflow-y-auto pb-6">
						<div className="flex flex-col gap-5">
							{messages.map((m) => (
								<MessageBubble key={m.id} message={m} />
							))}
							{status === "submitted" && (
								<div className="flex items-center gap-2 text-[12px] text-muted-foreground">
									<Loader2 className="size-3 animate-spin" />
									Thinking…
								</div>
							)}
						</div>
					</div>
				)}

				<form onSubmit={handleSubmit} className="w-full">
					<div className="rounded-md border border-border bg-card shadow-tile">
						{chip && (
							<div className="flex flex-wrap gap-1 px-3 pt-2.5">
								<ChipBadge chip={chip} onRemove={() => setChip(null)} />
							</div>
						)}
						<Textarea
							ref={textareaRef}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={
								chip ? "Ask about the selected passage…" : "Ask anything…"
							}
							rows={hasMessages || compact ? 2 : 3}
							className="w-full resize-none border-0 bg-transparent px-4 py-3 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
						/>
						<div className="flex items-center justify-end gap-2 px-3 pb-3">
							{error ? (
								<span className="mr-auto font-mono text-[9px] uppercase tracking-[0.05em] text-destructive">
									Error · try again
								</span>
							) : (
								<span className="mr-auto font-mono text-[9px] uppercase tracking-[0.05em] text-ink-tertiary">
									Claude · Anthropic
								</span>
							)}
							{isStreaming ? (
								<Button
									type="button"
									variant="secondary"
									onClick={() => stop()}
								>
									<Square className="size-3.5" />
									Stop
								</Button>
							) : (
								<Button type="submit" variant="confirm" disabled={sendDisabled}>
									<ArrowUp className="size-3.5" />
									Send
								</Button>
							)}
						</div>
					</div>
				</form>

				{showIntro && (
					<div className="flex w-full flex-col gap-2 pt-6">
						<span className="font-mono text-[9px] uppercase tracking-[0.1em] text-ink-secondary">
							Try asking
						</span>
						<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{SUGGESTIONS.map((s) => (
								<Button
									key={s}
									type="button"
									variant="secondary"
									onClick={() => sendMessage({ text: s })}
									className="h-auto justify-start whitespace-normal py-2 text-left text-[12px] font-normal"
								>
									{s}
								</Button>
							))}
						</div>
					</div>
				)}
			</div>
		</TooltipProvider>
	)
}

function ChipBadge({
	chip,
	onRemove,
}: {
	chip: Prefill
	onRemove: () => void
}) {
	const label = chip.questionNumber ? `Q${chip.questionNumber}` : "Selection"
	const preview =
		chip.text.length > 240 ? `${chip.text.slice(0, 240)}…` : chip.text
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<span className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-foreground/95 pl-1.5 pr-0.5 py-0.5 text-[11px] font-medium text-primary">
						<AtSign className="h-2.5 w-2.5 text-primary" aria-hidden />
						<span className="font-mono">{label}</span>
						<button
							type="button"
							onClick={onRemove}
							aria-label={`Remove ${label} context`}
							className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-sm text-background/60 hover:text-background hover:bg-white/10 transition-colors"
						>
							<X className="h-2.5 w-2.5" aria-hidden />
						</button>
					</span>
				}
			/>
			<TooltipContent side="top" sideOffset={4} className="max-w-xs">
				<span className="block whitespace-pre-wrap text-xs leading-snug">
					{preview}
				</span>
			</TooltipContent>
		</Tooltip>
	)
}

function MessageBubble({
	message,
}: {
	message: ReturnType<typeof useChat>["messages"][number]
}) {
	const isUser = message.role === "user"
	const text = message.parts
		.filter((p): p is { type: "text"; text: string } => p.type === "text")
		.map((p) => p.text)
		.join("")

	if (!text) return null

	return (
		<div
			className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
		>
			<div
				className={cn(
					"max-w-[85%] text-sm leading-[1.55]",
					isUser
						? "whitespace-pre-wrap rounded-md border border-border bg-card px-3.5 py-2.5 text-foreground shadow-tile"
						: "text-foreground",
				)}
			>
				{isUser ? text : <AssistantMarkdown text={text} />}
			</div>
		</div>
	)
}

/**
 * Renders assistant text as markdown. We don't use @tailwindcss/typography
 * (not installed); instead each markdown element maps to a JSX component
 * with explicit design-token classes so nothing leaks into the global
 * style and we stay within our `text-foreground`, `border-border-quiet`,
 * etc. vocabulary.
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
