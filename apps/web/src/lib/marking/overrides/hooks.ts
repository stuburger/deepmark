"use client"

import {
	deleteTeacherOverride,
	saveQuestionFeedbackBullets,
	upsertTeacherOverride,
} from "@/lib/marking/overrides/mutations"
import { getTeacherOverrides } from "@/lib/marking/submissions/queries"
import type {
	TeacherOverride,
	UpsertTeacherOverrideInput,
} from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { toast } from "sonner"

export function useTeacherOverrides(submissionId: string | undefined) {
	const { data: overrides = [] } = useQuery({
		queryKey: queryKeys.teacherOverrides(submissionId ?? ""),
		queryFn: async () => {
			if (!submissionId) return []
			const r = await getTeacherOverrides(submissionId)
			return r.ok ? r.overrides : []
		},
		enabled: !!submissionId,
		staleTime: Number.POSITIVE_INFINITY,
	})

	const overridesByQuestionId = useMemo(
		() => new Map(overrides.map((o) => [o.question_id, o])),
		[overrides],
	)

	return { overrides, overridesByQuestionId }
}

export function useTeacherOverrideMutations(submissionId: string | undefined) {
	const queryClient = useQueryClient()
	const key = queryKeys.teacherOverrides(submissionId ?? "")

	const upsertMutation = useMutation({
		mutationFn: async ({
			questionId,
			input,
		}: {
			questionId: string
			input: UpsertTeacherOverrideInput
		}) => {
			if (!submissionId) throw new Error("No submission")
			const r = await upsertTeacherOverride(submissionId, questionId, input)
			if (!r.ok) throw new Error(r.error)
			return r.override
		},
		onMutate: async ({ questionId, input }) => {
			await queryClient.cancelQueries({ queryKey: key })
			const previous = queryClient.getQueryData<TeacherOverride[]>(key)
			queryClient.setQueryData<TeacherOverride[]>(key, (old = []) => {
				const existing = old.find((o) => o.question_id === questionId)
				if (existing) {
					return old.map((o) =>
						o.question_id === questionId
							? { ...o, ...input, updated_at: new Date() }
							: o,
					)
				}
				return [
					...old,
					{
						id: `optimistic-${questionId}`,
						submission_id: submissionId ?? "",
						question_id: questionId,
						score_override: input.score_override,
						reason: input.reason ?? null,
						feedback_override: input.feedback_override ?? null,
						created_at: new Date(),
						updated_at: new Date(),
					},
				]
			})
			return { previous }
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(key, context.previous)
			}
			toast.error("Failed to save override")
		},
		// No `onSettled` invalidate — the optimistic cache value is the
		// authoritative read until the next natural refetch. Otherwise the
		// invalidation fires before the projection Lambda lands the
		// `TeacherOverride` row in PG (~2s after the doc snapshot
		// debounces), the refetch returns the pre-override state, and the
		// UI flickers back. Doc-as-truth: we trust the dispatch we just
		// performed; PG catches up in the background.
	})

	const deleteMutation = useMutation({
		mutationFn: async (questionId: string) => {
			if (!submissionId) throw new Error("No submission")
			const r = await deleteTeacherOverride(submissionId, questionId)
			if (!r.ok) throw new Error(r.error)
		},
		onMutate: async (questionId) => {
			await queryClient.cancelQueries({ queryKey: key })
			const previous = queryClient.getQueryData<TeacherOverride[]>(key)
			queryClient.setQueryData<TeacherOverride[]>(key, (old = []) =>
				old.filter((o) => o.question_id !== questionId),
			)
			return { previous }
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(key, context.previous)
			}
			toast.error("Failed to reset override")
		},
		// See `upsertMutation` above — no invalidation to avoid pre-projection
		// flicker.
	})

	const feedbackBulletsMutation = useMutation({
		mutationFn: async ({
			questionId,
			patch,
		}: {
			questionId: string
			patch: { whatWentWell?: string[]; evenBetterIf?: string[] }
		}) => {
			if (!submissionId) throw new Error("No submission")
			const r = await saveQuestionFeedbackBullets(
				submissionId,
				questionId,
				patch,
			)
			if (!r.ok) throw new Error(r.error)
		},
		onError: () => toast.error("Failed to save feedback"),
		// Doc is the source of truth; Hocuspocus echoes the change back to
		// the browser within ms. No optimistic cache update needed — the
		// editor's NodeView re-renders from `node.attrs` once the echo arrives.
	})

	return {
		upsertOverride: upsertMutation.mutate,
		deleteOverride: deleteMutation.mutate,
		saveFeedbackBullets: feedbackBulletsMutation.mutate,
		isSaving: upsertMutation.isPending,
	}
}
