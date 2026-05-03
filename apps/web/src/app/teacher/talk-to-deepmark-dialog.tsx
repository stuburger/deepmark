"use client"

import { TalkToDeepMarkChat } from "@/components/talk/talk-to-deepmark-chat"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"

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
					<TalkToDeepMarkChat />
				</div>
			</DialogContent>
		</Dialog>
	)
}
