"use client"

import { TalkToDeepMarkChat } from "@/components/talk/talk-to-deepmark-chat"
import { Button } from "@/components/ui/button"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { FileText, Sparkles } from "lucide-react"

/**
 * Editor-side chat panel — thin shell around TalkToDeepMarkChat. Owns the
 * sidebar header (switch-to-scan + DeepMark label); the chat itself manages
 * messages, the selection chip, and per-call request body (submissionId +
 * selection).
 *
 * Selection-driven context: the host pushes a {text, questionNumber} pair as
 * `prefill`; TalkToDeepMarkChat captures it into a chip and calls
 * `onPrefillConsumed`. Sending the next message attaches the chip to the
 * outgoing request as `selection`, which the route injects into the user
 * message inside a <selection> tag.
 */
export function ChatPanel({
	submissionId,
	onSwitchToScan,
	prefill,
	onPrefillConsumed,
}: {
	submissionId: string
	studentName: string | null
	onSwitchToScan: () => void
	prefill?: { text: string; questionNumber: string | null } | null
	onPrefillConsumed?: () => void
}) {
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

				<div className="flex-1 min-h-0 overflow-hidden px-3 py-3">
					<TalkToDeepMarkChat
						submissionId={submissionId}
						prefill={prefill}
						onPrefillConsumed={onPrefillConsumed}
						compact
					/>
				</div>
			</div>
		</TooltipProvider>
	)
}
