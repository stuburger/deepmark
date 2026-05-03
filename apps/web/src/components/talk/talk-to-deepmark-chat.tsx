"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { ArrowUp, Loader2, Sparkles, Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const SUGGESTIONS = [
	"Explain AO1 vs AO2 for English Literature",
	"How accurate is DeepMark's level-of-response marking?",
	"What's the difference between point-based and LoR marking?",
	"How should I interpret a 12-mark essay grade?",
]

type TalkToDeepMarkChatProps = {
	// Layout-neutral by default — parents (page or dialog) set their own bounds.
	className?: string
}

export function TalkToDeepMarkChat({ className }: TalkToDeepMarkChatProps) {
	const [input, setInput] = useState("")
	const scrollRef = useRef<HTMLDivElement>(null)

	const { messages, sendMessage, status, stop, error } = useChat({
		transport: new DefaultChatTransport({ api: "/api/talk" }),
		onError: (err) => {
			toast.error(err.message || "Failed to reach DeepMark.")
		},
	})

	const isStreaming = status === "submitted" || status === "streaming"
	const hasMessages = messages.length > 0

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every message/token update
	useEffect(() => {
		scrollRef.current?.scrollTo({
			top: scrollRef.current.scrollHeight,
			behavior: "smooth",
		})
	}, [messages])

	function submit() {
		const trimmed = input.trim()
		if (!trimmed || isStreaming) return
		sendMessage({ text: trimmed })
		setInput("")
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

	return (
		<div
			className={cn(
				"flex w-full flex-col",
				hasMessages ? "h-full" : "py-8",
				className,
			)}
		>
			{!hasMessages && (
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

			{hasMessages && (
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
					<Textarea
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask anything…"
						rows={hasMessages ? 2 : 3}
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
							<Button type="button" variant="secondary" onClick={() => stop()}>
								<Square className="size-3.5" />
								Stop
							</Button>
						) : (
							<Button type="submit" variant="confirm" disabled={!input.trim()}>
								<ArrowUp className="size-3.5" />
								Send
							</Button>
						)}
					</div>
				</div>
			</form>

			{!hasMessages && (
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
	)
}

function MessageBubble({
	message,
}: { message: ReturnType<typeof useChat>["messages"][number] }) {
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
					"max-w-[85%] whitespace-pre-wrap text-sm leading-[1.55]",
					isUser
						? "rounded-md border border-border bg-card px-3.5 py-2.5 text-foreground shadow-tile"
						: "text-foreground",
				)}
			>
				{text}
			</div>
		</div>
	)
}
