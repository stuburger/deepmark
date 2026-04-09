"use client"

import {
	deleteQuestion,
	updateQuestion,
} from "@/lib/exam-paper/questions/mutations"
import type {
	ExamPaperDetail,
	ExamPaperQuestion,
	UnlinkedMarkScheme,
	UpdateQuestionInput,
} from "@/lib/exam-paper/types"
import { linkMarkSchemeToQuestion } from "@/lib/exam-paper/unlinked-schemes"
import {
	type MarkSchemeInput,
	createMarkScheme,
	updateMarkScheme,
} from "@/lib/mark-scheme/manual"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function patchExamPaper(
	queryClient: ReturnType<typeof useQueryClient>,
	paperId: string,
	patcher: (old: ExamPaperDetail) => ExamPaperDetail,
) {
	const previous = queryClient.getQueryData<ExamPaperDetail>(
		queryKeys.examPaper(paperId),
	)
	if (previous) {
		queryClient.setQueryData<ExamPaperDetail>(
			queryKeys.examPaper(paperId),
			patcher(previous),
		)
	}
	return previous
}

/** Map over questions nested inside sections. */
function mapQuestions(
	paper: ExamPaperDetail,
	fn: (q: ExamPaperQuestion) => ExamPaperQuestion,
): ExamPaperDetail {
	return {
		...paper,
		sections: paper.sections.map((s) => ({
			...s,
			questions: s.questions.map(fn),
		})),
	}
}

/** Filter out a question from whichever section contains it. */
function filterQuestions(
	paper: ExamPaperDetail,
	predicate: (q: ExamPaperQuestion) => boolean,
): ExamPaperDetail {
	return {
		...paper,
		sections: paper.sections.map((s) => ({
			...s,
			questions: s.questions.filter(predicate),
		})),
	}
}

// ─── useUpdateQuestion ────────────────────────────────────────────────────────

export function useUpdateQuestion(paperId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			questionId,
			input,
		}: {
			questionId: string
			input: UpdateQuestionInput
		}) => {
			const result = await updateQuestion(questionId, input)
			if (!result.ok) throw new Error(result.error)
			return result
		},
		onMutate: async ({ questionId, input }) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
			const previous = patchExamPaper(queryClient, paperId, (old) =>
				mapQuestions(old, (q) =>
					q.id === questionId
						? {
								...q,
								...(input.text !== undefined ? { text: input.text } : {}),
								...(input.points !== undefined ? { points: input.points } : {}),
								...(input.question_number !== undefined
									? { question_number: input.question_number }
									: {}),
							}
						: q,
				),
			)
			return { previous }
		},
		onError: (err, _, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKeys.examPaper(paperId), context.previous)
			}
			toast.error(err.message || "Failed to update question")
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
		},
	})
}

// ─── useDeleteQuestion ────────────────────────────────────────────────────────

export function useDeleteQuestion(paperId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async (questionId: string) => {
			const result = await deleteQuestion(questionId)
			if (!result.ok) throw new Error(result.error)
			return result
		},
		onMutate: async (questionId) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
			const previous = patchExamPaper(queryClient, paperId, (old) =>
				filterQuestions(old, (q) => q.id !== questionId),
			)
			return { previous }
		},
		onError: (err, _, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKeys.examPaper(paperId), context.previous)
			}
			toast.error(err.message || "Failed to delete question")
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
		},
	})
}

// ─── useCreateMarkScheme ──────────────────────────────────────────────────────

export function useCreateMarkScheme(paperId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			questionId,
			input,
		}: {
			questionId: string
			input: MarkSchemeInput
		}) => {
			const result = await createMarkScheme(questionId, input)
			if (!result.ok) throw new Error(result.error)
			return result
		},
		onMutate: async ({ questionId }) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
			const previous = patchExamPaper(queryClient, paperId, (old) =>
				mapQuestions(old, (q) =>
					q.id === questionId ? { ...q, mark_scheme_status: "linked" } : q,
				),
			)
			return { previous }
		},
		onError: (err, _, context) => {
			if (context?.previous) {
				queryClient.setQueryData(queryKeys.examPaper(paperId), context.previous)
			}
			toast.error(err.message || "Failed to create mark scheme")
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
		},
	})
}

// ─── useUpdateMarkScheme ──────────────────────────────────────────────────────

export function useUpdateMarkScheme(paperId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			markSchemeId,
			input,
		}: {
			markSchemeId: string
			questionId: string
			input: MarkSchemeInput
		}) => {
			const result = await updateMarkScheme(markSchemeId, input)
			if (!result.ok) throw new Error(result.error)
			return result
		},
		onError: (err) => {
			toast.error(err.message || "Failed to update mark scheme")
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
		},
	})
}

// ─── useLinkMarkScheme ────────────────────────────────────────────────────────

export function useLinkMarkScheme(paperId: string) {
	const queryClient = useQueryClient()

	return useMutation({
		mutationFn: async ({
			ghostQuestionId,
			targetQuestionId,
		}: {
			ghostQuestionId: string
			targetQuestionId: string
		}) => {
			const result = await linkMarkSchemeToQuestion(
				ghostQuestionId,
				targetQuestionId,
			)
			if (!result.ok) throw new Error(result.error)
			return result
		},
		onMutate: async ({ targetQuestionId }) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
			await queryClient.cancelQueries({
				queryKey: queryKeys.unlinkedMarkSchemes(paperId),
			})

			const previousPaper = queryClient.getQueryData<ExamPaperDetail>(
				queryKeys.examPaper(paperId),
			)
			const previousUnlinked = queryClient.getQueryData<UnlinkedMarkScheme[]>(
				queryKeys.unlinkedMarkSchemes(paperId),
			)

			// Optimistically mark the target question as linked
			if (previousPaper) {
				queryClient.setQueryData<ExamPaperDetail>(
					queryKeys.examPaper(paperId),
					mapQuestions(previousPaper, (q) =>
						q.id === targetQuestionId
							? { ...q, mark_scheme_status: "linked" }
							: q,
					),
				)
			}

			return { previousPaper, previousUnlinked }
		},
		onError: (err, _, context) => {
			if (context?.previousPaper) {
				queryClient.setQueryData(
					queryKeys.examPaper(paperId),
					context.previousPaper,
				)
			}
			if (context?.previousUnlinked) {
				queryClient.setQueryData(
					queryKeys.unlinkedMarkSchemes(paperId),
					context.previousUnlinked,
				)
			}
			toast.error(err.message || "Failed to link mark scheme")
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
			void queryClient.invalidateQueries({
				queryKey: queryKeys.unlinkedMarkSchemes(paperId),
			})
		},
	})
}
