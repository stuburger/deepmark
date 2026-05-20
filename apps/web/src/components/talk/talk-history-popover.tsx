"use client"

import { Button } from "@/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { queryKeys } from "@/lib/query-keys"
import { deleteConversation } from "@/lib/talk/conversations/mutations"
import {
	type ConversationSummary,
	listConversations,
} from "@/lib/talk/conversations/queries"
import { cn } from "@/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Clock, Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

/**
 * Compact history of the caller's past Talk to DeepMark conversations.
 * Anchored to a clock-icon trigger; rows show title + submission chips +
 * relative timestamp. Clicking a row calls `onSelect(conversationId)`;
 * the chat component re-mounts (keyed on conversationId) and pre-seeds
 * the messages.
 */
export function TalkHistoryPopover({
	currentConversationId,
	onSelect,
	onDelete,
}: {
	currentConversationId: string | null
	onSelect: (conversationId: string) => void
	/** Notified after a successful delete (so the host can clear local state if needed). */
	onDelete?: (conversationId: string) => void
}) {
	const queryClient = useQueryClient()
	const { data, isLoading, isError } = useQuery({
		queryKey: queryKeys.talkConversations(),
		queryFn: async () => {
			const result = await listConversations({})
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data?.conversations ?? []
		},
		staleTime: 30_000,
	})

	const deleteMutation = useMutation({
		mutationFn: async (conversationId: string) => {
			const result = await deleteConversation({ conversationId })
			if (result?.serverError) throw new Error(result.serverError)
			return conversationId
		},
		onSuccess: (conversationId) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.talkConversations() })
			onDelete?.(conversationId)
			toast.success("Conversation deleted")
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to delete")
		},
	})

	return (
		<Popover>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Open conversation history"
						className="h-6 w-6 text-muted-foreground hover:text-foreground"
					>
						<Clock className="h-3.5 w-3.5" aria-hidden />
					</Button>
				}
			/>
			<PopoverContent
				align="end"
				side="bottom"
				sideOffset={6}
				className="w-72 max-h-80 overflow-y-auto p-0"
			>
				<div className="px-3 py-2 border-b border-border-quiet">
					<div className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
						Past conversations
					</div>
				</div>
				{isLoading ? (
					<div className="flex items-center gap-2 px-3 py-3 text-[12px] text-muted-foreground">
						<Loader2 className="size-3 animate-spin" />
						Loading…
					</div>
				) : isError ? (
					<div className="px-3 py-3 text-[12px] text-destructive">
						Couldn't load history.
					</div>
				) : !data || data.length === 0 ? (
					<div className="px-3 py-4 text-[12px] text-muted-foreground">
						No past conversations yet.
					</div>
				) : (
					<ul className="flex flex-col">
						{data.map((c) => (
							<TalkHistoryRow
								key={c.id}
								conversation={c}
								isCurrent={c.id === currentConversationId}
								onSelect={() => onSelect(c.id)}
								onDelete={() => deleteMutation.mutate(c.id)}
								isDeleting={
									deleteMutation.isPending && deleteMutation.variables === c.id
								}
							/>
						))}
					</ul>
				)}
			</PopoverContent>
		</Popover>
	)
}

function TalkHistoryRow({
	conversation,
	isCurrent,
	onSelect,
	onDelete,
	isDeleting,
}: {
	conversation: ConversationSummary
	isCurrent: boolean
	onSelect: () => void
	onDelete: () => void
	isDeleting: boolean
}) {
	const title = conversation.title || "New conversation"
	const refs = conversation.submission_refs
	const refLabel = refs[0]
		? (refs[0].student_name ?? refs[0].exam_paper_title)
		: null
	const extraCount = refs.length > 1 ? refs.length - 1 : 0

	return (
		<li
			className={cn(
				"group flex items-start gap-2 px-3 py-2 hover:bg-muted border-b border-border-quiet last:border-b-0",
				isCurrent && "bg-muted",
			)}
		>
			<button
				type="button"
				onClick={onSelect}
				className="flex-1 min-w-0 text-left"
			>
				<div className="truncate text-[12px] font-medium text-foreground">
					{title}
				</div>
				<div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
					{refLabel ? (
						<span className="truncate">
							{refLabel}
							{extraCount > 0 ? ` +${extraCount}` : ""}
						</span>
					) : (
						<span>No submission</span>
					)}
					<span aria-hidden>·</span>
					<span>{relativeTime(conversation.updated_at)}</span>
				</div>
			</button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Delete conversation"
				onClick={onDelete}
				disabled={isDeleting}
				className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
			>
				{isDeleting ? (
					<Loader2 className="size-3 animate-spin" />
				) : (
					<Trash2 className="size-3" aria-hidden />
				)}
			</Button>
		</li>
	)
}

function relativeTime(iso: string): string {
	const ts = new Date(iso).getTime()
	if (Number.isNaN(ts)) return "—"
	const diffMs = Date.now() - ts
	const diffMin = Math.round(diffMs / 60_000)
	if (diffMin < 1) return "just now"
	if (diffMin < 60) return `${diffMin}m ago`
	const diffHr = Math.round(diffMin / 60)
	if (diffHr < 24) return `${diffHr}h ago`
	const diffDay = Math.round(diffHr / 24)
	if (diffDay < 7) return `${diffDay}d ago`
	return new Date(iso).toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
	})
}
