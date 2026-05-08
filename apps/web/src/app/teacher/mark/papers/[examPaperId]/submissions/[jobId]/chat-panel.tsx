"use client"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { AtSign, FileText, Mic, Send, Sparkles, X } from "lucide-react"
import { useEffect, useState } from "react"

const STARTER_PROMPTS = [
	"Why did this question lose marks?",
	"How does this compare to the class?",
	"Draft feedback for the lowest-scoring answer",
	"Explain level-of-response marking",
] as const

type ContextChip = {
	id: string
	questionNumber: string | null
	text: string
}

/**
 * Talk to DeepMark — non-functional shell. Mirrors Geoff v7's editor chat
 * (welcome + chips + input). Send is a no-op until the chat backend lands.
 *
 * Selection-driven context attaches to the input via `prefill`: the host
 * pushes a {text, questionNumber} pair, which becomes a Cursor-style chip
 * above the textarea. The chip is the visible representation of the
 * referenced passage — full text is kept on the chip and will travel with
 * the eventual send payload (alongside `submissionId`), but isn't dumped
 * into the prompt the user is composing.
 */
export function ChatPanel({
	submissionId: _submissionId,
	studentName,
	onSwitchToScan,
	prefill,
	onPrefillConsumed,
}: {
	/**
	 * Reserved for the future send payload — the chat backend will need to
	 * scope each turn to a single submission so context (chips, marking
	 * results, OCR) can be hydrated server-side. Not used in the shell.
	 */
	submissionId: string
	studentName: string | null
	onSwitchToScan: () => void
	prefill?: { text: string; questionNumber: string | null } | null
	onPrefillConsumed?: () => void
}) {
	const [chips, setChips] = useState<ContextChip[]>([])
	const [draft, setDraft] = useState("")

	useEffect(() => {
		if (!prefill) return
		setChips((prev) => [
			...prev,
			{
				id: crypto.randomUUID(),
				questionNumber: prefill.questionNumber,
				text: prefill.text,
			},
		])
		onPrefillConsumed?.()
	}, [prefill, onPrefillConsumed])

	const removeChip = (id: string) => {
		setChips((prev) => prev.filter((c) => c.id !== id))
	}

	return (
		<TooltipProvider>
			<div className="flex flex-col h-full bg-card">
				<div className="shrink-0 flex items-center gap-1 border-b bg-background px-3 h-9">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={onSwitchToScan}
									aria-label="Switch to scan view"
									className="h-6 w-6 text-muted-foreground hover:text-foreground"
								>
									<FileText className="h-3.5 w-3.5" aria-hidden />
								</Button>
							}
						/>
						<TooltipContent side="bottom" sideOffset={6}>
							Show scan
						</TooltipContent>
					</Tooltip>

					<div className="h-3.5 w-px bg-border mx-1" />

					<span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
						<Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
						DeepMark
					</span>
				</div>

				<ScrollArea className="flex-1 min-h-0">
					<div className="px-4 py-4 space-y-3">
						<p className="text-sm leading-relaxed text-muted-foreground">
							<span className="font-medium text-foreground">
								Ask me anything
							</span>{" "}
							about{" "}
							{studentName ? (
								<span className="font-medium text-primary">
									{studentName}'s
								</span>
							) : (
								"this"
							)}{" "}
							paper — mark scheme, AO objectives, or their performance.
						</p>

						<div className="flex flex-col gap-1.5 pt-1">
							{STARTER_PROMPTS.map((prompt) => (
								<button
									key={prompt}
									type="button"
									onClick={() => setDraft(prompt)}
									className={cn(
										"text-left text-xs leading-snug rounded-md border border-border-quiet bg-card px-2.5 py-1.5",
										"text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors",
									)}
								>
									{prompt}
								</button>
							))}
						</div>
					</div>
				</ScrollArea>

				<div className="shrink-0 border-t bg-background px-3 py-2 space-y-1.5">
					{chips.length > 0 && (
						<div className="flex flex-wrap gap-1">
							{chips.map((chip) => (
								<ContextChipBadge
									key={chip.id}
									chip={chip}
									onRemove={() => removeChip(chip.id)}
								/>
							))}
						</div>
					)}
					<div
						className={cn(
							"flex items-end gap-1 rounded-md border border-input bg-card px-2 py-1.5",
							"focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
						)}
					>
						<Textarea
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder={
								chips.length > 0
									? "Ask about the selected passage…"
									: "Ask DeepMark…"
							}
							rows={1}
							className="min-h-5 max-h-24 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:border-transparent"
						/>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										size="icon"
										disabled
										aria-label="Voice input"
										className="h-6 w-6 text-muted-foreground"
									>
										<Mic className="h-3.5 w-3.5" aria-hidden />
									</Button>
								}
							/>
							<TooltipContent side="top" sideOffset={6}>
								Voice input — coming soon
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										size="icon"
										disabled
										aria-label="Send message"
										className="h-6 w-6"
									>
										<Send className="h-3 w-3" aria-hidden />
									</Button>
								}
							/>
							<TooltipContent side="top" sideOffset={6}>
								Sending — coming soon
							</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</div>
		</TooltipProvider>
	)
}

function ContextChipBadge({
	chip,
	onRemove,
}: {
	chip: ContextChip
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
