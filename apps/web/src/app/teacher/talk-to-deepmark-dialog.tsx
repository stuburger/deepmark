"use client"

import { TalkToDeepMarkChat } from "@/components/talk/talk-to-deepmark-chat"
import type { TalkUIMessage } from "@/components/talk/types"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { useGlobalAutoResume } from "@/lib/talk/conversations/use-auto-resume"

type TalkToDeepMarkDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
}

export function TalkToDeepMarkDialog({
	open,
	onOpenChange,
}: TalkToDeepMarkDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton
				className="!max-w-[720px] grid h-[80vh] grid-rows-[auto_1fr] gap-0 p-6 sm:!max-w-[720px]"
			>
				<DialogHeader className="sr-only">
					<DialogTitle>Talk to DeepMark</DialogTitle>
					<DialogDescription>
						Ask anything about marking, the GCSE syllabus, AOs, or your
						students' work.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col overflow-hidden">
					{/* Only mount the chat after the global auto-resume has resolved
					    so initialMessages is correct on first render. */}
					{open ? <DialogChat /> : null}
				</div>
			</DialogContent>
		</Dialog>
	)
}

function DialogChat() {
	const { isLoading, conversation: resumed } = useGlobalAutoResume()
	if (isLoading) return null
	return (
		<TalkToDeepMarkChat
			key={resumed?.id ?? "new"}
			conversationId={resumed?.id ?? null}
			initialMessages={
				resumed ? (resumed.messages as TalkUIMessage[]) : undefined
			}
		/>
	)
}
