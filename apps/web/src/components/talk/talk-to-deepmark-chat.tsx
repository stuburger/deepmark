"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { TooltipProvider } from "@/components/ui/tooltip"
import type {
	AddAnnotationInput,
	ProposeTeacherOverrideInput,
	RemoveAnnotationInput,
	UpdateAnnotationInput,
} from "@/lib/talk/tools"
import { cn } from "@/lib/utils"
import { useChat } from "@ai-sdk/react"
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai"
import { ArrowUp, Loader2, Sparkles, Square } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { ChipBadge } from "./chat-messages/chip-badge"
import { MessageBubble } from "./chat-messages/message-bubble"
import {
	type DispatchableToolCall,
	dispatchToolCall,
} from "./dispatch-tool-call"
import type { OverrideContextEntry } from "./override-confirm-card"
import type { Prefill, TalkUIMessage, ToolDispatchResult } from "./types"

export type { ToolDispatchResult } from "./types"

const SUGGESTIONS = [
	"Explain AO1 vs AO2 for English Literature",
	"How accurate is DeepMark's level-of-response marking?",
	"What's the difference between point-based and LoR marking?",
	"How should I interpret a 12-mark essay grade?",
]

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
	/**
	 * Tool-call dispatchers. Parent (ChatPanel) builds these using the
	 * editor handle from `EditorHandleProvider`; missing callbacks → the
	 * tool result is `{ ok: false, reason: "Not available." }` so the
	 * model can self-correct.
	 */
	onAddAnnotation?: (input: AddAnnotationInput) => Promise<ToolDispatchResult>
	onUpdateAnnotation?: (
		input: UpdateAnnotationInput,
	) => Promise<ToolDispatchResult>
	onRemoveAnnotation?: (
		input: RemoveAnnotationInput,
	) => Promise<ToolDispatchResult>
	onLinkToScan?: (input: {
		questionId: string
		tokenStart?: string
		tokenEnd?: string
	}) => void
	/**
	 * Fires when the teacher accepts a proposed override card. Resolves to
	 * `{ ok, reason? }` — `ok: true` becomes the tool's `accepted: true`
	 * result. The card handles the loading/error UI; this callback is just
	 * the mutation.
	 */
	onProposeOverride?: (
		input: ProposeTeacherOverrideInput,
	) => Promise<{ ok: true } | { ok: false; reason: string }>
	/**
	 * Per-question context used by the override card to render
	 * "current/max → suggested/max" deltas. Keyed by questionId.
	 */
	overrideContextByQuestion?: ReadonlyMap<string, OverrideContextEntry>
}

export function TalkToDeepMarkChat({
	className,
	submissionId,
	prefill,
	onPrefillConsumed,
	compact = false,
	onAddAnnotation,
	onUpdateAnnotation,
	onRemoveAnnotation,
	onLinkToScan,
	onProposeOverride,
	overrideContextByQuestion,
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

	// Single ref bag so the onToolCall closure always sees the latest
	// dispatchers. Writing the ref on every render is intentional — the
	// closure captures the ref identity, not the values, so updates are
	// picked up without re-creating the useChat instance.
	const callbacksRef = useRef({
		onAddAnnotation,
		onUpdateAnnotation,
		onRemoveAnnotation,
		onLinkToScan,
	})
	callbacksRef.current = {
		onAddAnnotation,
		onUpdateAnnotation,
		onRemoveAnnotation,
		onLinkToScan,
	}

	const { messages, sendMessage, status, stop, error, addToolOutput } =
		useChat<TalkUIMessage>({
			transport,
			onError: (err) => {
				toast.error(err.message || "Failed to reach DeepMark.")
			},
			onToolCall: async ({ toolCall }) => {
				// proposeTeacherOverride is human-in-the-loop — the confirm
				// card renders inline and writes the tool output on accept /
				// dismiss. We do nothing here; the card resolves it.
				if (toolCall.toolName === "proposeTeacherOverride") return
				if (toolCall.dynamic) return
				// Single boundary cast: the SDK's narrowed ToolCall union is
				// structurally identical to DispatchableToolCall (we
				// hand-rolled it to match), but the SDK's `ToolCall` lives
				// under `@ai-sdk/provider-utils` which is duplicated across
				// the workspace, so TypeScript treats it as nominally
				// distinct. Behaviour is sound — narrowing above ensures
				// only the four dispatchable variants reach here.
				const {
					onAddAnnotation,
					onUpdateAnnotation,
					onRemoveAnnotation,
					onLinkToScan,
				} = callbacksRef.current
				const result = await dispatchToolCall(
					toolCall as DispatchableToolCall,
					{
						addAnnotation: onAddAnnotation,
						updateAnnotation: onUpdateAnnotation,
						removeAnnotation: onRemoveAnnotation,
						linkToScan: onLinkToScan,
					},
				)
				addToolOutput({
					tool: toolCall.toolName,
					toolCallId: toolCall.toolCallId,
					output: result,
				})
			},
			// When all tool calls in the latest assistant turn have results,
			// auto-send to give the model a chance to react ("done", "I tried
			// X but it failed, let me try Y").
			sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
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
		const selection = chip
			? {
					text: chip.text,
					questionNumber: chip.questionNumber,
					questionId: chip.questionId ?? null,
				}
			: undefined
		// Stash the selection in message metadata so the chip can render
		// inside the user bubble — and so it round-trips through any future
		// persistence layer that reloads the message list. The model still
		// gets the selection via `body.selection` (route formats it into a
		// <selection> tag on the user message).
		sendMessage(
			{
				role: "user",
				parts: [{ type: "text", text: trimmed }],
				metadata: selection ? { selection } : undefined,
			},
			selection ? { body: { selection } } : undefined,
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
								<MessageBubble
									key={m.id}
									message={m}
									onProposeOverride={onProposeOverride}
									overrideContextByQuestion={overrideContextByQuestion}
									addToolOutput={addToolOutput}
								/>
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
							) : null}
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
