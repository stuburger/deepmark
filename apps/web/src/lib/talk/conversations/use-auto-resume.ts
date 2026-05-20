"use client"

import { queryKeys } from "@/lib/query-keys"
import { useQuery } from "@tanstack/react-query"
import {
	type ConversationDetail,
	getRecentConversationForSubmission,
	getRecentConversationGlobal,
} from "./queries"

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export type AutoResumeResult = {
	/** True until the per-surface initial fetch resolves. Render a skeleton. */
	isLoading: boolean
	/** Conversation to attach to, or null = start blank. */
	conversation: ConversationDetail | null
}

/**
 * Editor-surface auto-resume: most-recent conversation for THIS submission,
 * IF its `updated_at` is within 24h. Older conversations stay reachable via
 * the history popover but don't auto-attach (teacher likely moved on).
 */
export function useEditorAutoResume(submissionId: string): AutoResumeResult {
	const { data, isLoading } = useQuery({
		queryKey: queryKeys.talkRecentForSubmission(submissionId),
		queryFn: async () => {
			const result = await getRecentConversationForSubmission({ submissionId })
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data?.conversation ?? null
		},
		staleTime: 30_000,
	})

	const conversation = isFresh(data) ? data : null
	return { isLoading, conversation }
}

/**
 * Dashboard / standalone-surface auto-resume: most-recent conversation
 * overall, regardless of age. No freshness cap — the teacher is
 * explicitly returning to chat, give them whatever they had open last.
 */
export function useGlobalAutoResume(): AutoResumeResult {
	const { data, isLoading } = useQuery({
		queryKey: queryKeys.talkRecentGlobal(),
		queryFn: async () => {
			const result = await getRecentConversationGlobal()
			if (result?.serverError) throw new Error(result.serverError)
			return result?.data?.conversation ?? null
		},
		staleTime: 30_000,
	})
	return { isLoading, conversation: data ?? null }
}

function isFresh(
	conv: ConversationDetail | null | undefined,
): conv is ConversationDetail {
	if (!conv) return false
	const ts = new Date(conv.updated_at).getTime()
	if (Number.isNaN(ts)) return false
	return Date.now() - ts < TWENTY_FOUR_HOURS_MS
}
