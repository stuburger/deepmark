"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
	getSubmissionFeedback,
	upsertSubmissionFeedback,
} from "@/lib/marking/mutations"
import {
	FEEDBACK_CATEGORY_LABELS,
	type FeedbackCategory,
	type SubmissionFeedback,
	type SubmissionFeedbackRating,
	type UpsertSubmissionFeedbackInput,
} from "@/lib/marking/types"
import { queryKeys } from "@/lib/query-keys"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

const ALL_CATEGORIES = Object.keys(
	FEEDBACK_CATEGORY_LABELS,
) as FeedbackCategory[]

export function SubmissionFeedbackButton({
	submissionId,
}: {
	submissionId: string
}) {
	const queryClient = useQueryClient()
	const [dialogOpen, setDialogOpen] = useState(false)
	const [categories, setCategories] = useState<FeedbackCategory[]>([])
	const [comment, setComment] = useState("")

	const { data: feedback } = useQuery({
		queryKey: queryKeys.submissionFeedback(submissionId),
		queryFn: async () => {
			const result = await getSubmissionFeedback(submissionId)
			if (!result.ok) throw new Error(result.error)
			return result.feedback
		},
	})

	// Sync dialog state when feedback loads or dialog opens
	useEffect(() => {
		if (dialogOpen && feedback) {
			setCategories(feedback.categories ?? [])
			setComment(feedback.comment ?? "")
		}
	}, [dialogOpen, feedback])

	const mutation = useMutation({
		mutationFn: (input: UpsertSubmissionFeedbackInput) =>
			upsertSubmissionFeedback(submissionId, input),
		onMutate: async (input) => {
			await queryClient.cancelQueries({
				queryKey: queryKeys.submissionFeedback(submissionId),
			})
			const previous = queryClient.getQueryData<SubmissionFeedback | null>(
				queryKeys.submissionFeedback(submissionId),
			)
			queryClient.setQueryData<SubmissionFeedback | null>(
				queryKeys.submissionFeedback(submissionId),
				(old) =>
					({
						id: old?.id ?? "optimistic",
						submission_id: submissionId,
						rating: input.rating,
						categories: input.categories ?? null,
						comment: input.comment?.trim() || null,
						grading_run_id: old?.grading_run_id ?? null,
						created_at: old?.created_at ?? new Date(),
						updated_at: new Date(),
					}) satisfies SubmissionFeedback,
			)
			return { previous }
		},
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			setDialogOpen(false)
		},
		onError: (_err, _vars, context) => {
			queryClient.setQueryData(
				queryKeys.submissionFeedback(submissionId),
				context?.previous,
			)
			toast.error("Failed to save feedback")
		},
		onSettled: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.submissionFeedback(submissionId),
			})
		},
	})

	function handleThumbsUp() {
		mutation.mutate({ rating: "positive" })
	}

	function handleThumbsDown() {
		setCategories(feedback?.categories ?? [])
		setComment(feedback?.comment ?? "")
		setDialogOpen(true)
	}

	function toggleCategory(cat: FeedbackCategory) {
		setCategories((prev) =>
			prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
		)
	}

	function handleSubmitNegative() {
		mutation.mutate({
			rating: "negative",
			categories: categories.length > 0 ? categories : null,
			comment: comment.trim() || null,
		})
	}

	const isPositive = feedback?.rating === "positive"
	const isNegative = feedback?.rating === "negative"

	return (
		<>
			<div className="flex items-center gap-0.5">
				<Button
					variant={isPositive ? "default" : "ghost"}
					size="icon-xs"
					onClick={handleThumbsUp}
					disabled={mutation.isPending}
					title="Good marking"
					className={isPositive ? "text-white" : "text-muted-foreground"}
				>
					<ThumbsUp className="h-3.5 w-3.5" />
				</Button>
				<Button
					variant={isNegative ? "destructive" : "ghost"}
					size="icon-xs"
					onClick={handleThumbsDown}
					disabled={mutation.isPending}
					title="Poor marking"
				>
					<ThumbsDown className="h-3.5 w-3.5" />
				</Button>
			</div>

			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>What wasn&apos;t right?</DialogTitle>
						<DialogDescription>
							Help us improve by telling us what went wrong with this marking.
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-3">
						{ALL_CATEGORIES.map((cat) => (
							<label
								key={cat}
								htmlFor={`fb-${cat}`}
								className="flex items-center gap-3 cursor-pointer"
							>
								<Checkbox
									id={`fb-${cat}`}
									checked={categories.includes(cat)}
									onCheckedChange={() => toggleCategory(cat)}
								/>
								<span className="text-sm">{FEEDBACK_CATEGORY_LABELS[cat]}</span>
							</label>
						))}
					</div>

					<Textarea
						value={comment}
						onChange={(e) => setComment(e.target.value)}
						placeholder="Any additional details? (optional)"
						className="text-sm min-h-[80px] resize-none"
						rows={3}
					/>

					<DialogFooter>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={handleSubmitNegative}
							disabled={mutation.isPending}
						>
							{mutation.isPending ? (
								<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
							) : (
								<ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
							)}
							Submit feedback
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	)
}
