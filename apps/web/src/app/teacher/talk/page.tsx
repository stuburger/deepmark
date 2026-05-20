"use client"

import { TalkToDeepMarkChat } from "@/components/talk/talk-to-deepmark-chat"
import type { TalkUIMessage } from "@/components/talk/types"
import { useGlobalAutoResume } from "@/lib/talk/conversations/use-auto-resume"

export default function TalkToDeepMarkPage() {
	const { isLoading, conversation: resumed } = useGlobalAutoResume()
	return (
		<div className="mx-auto flex h-full w-full max-w-[720px] flex-col px-2 py-6">
			{isLoading ? null : (
				<TalkToDeepMarkChat
					key={resumed?.id ?? "new"}
					conversationId={resumed?.id ?? null}
					initialMessages={
						resumed ? (resumed.messages as TalkUIMessage[]) : undefined
					}
				/>
			)}
		</div>
	)
}
