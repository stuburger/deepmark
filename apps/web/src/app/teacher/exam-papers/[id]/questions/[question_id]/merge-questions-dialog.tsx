"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { consolidateQuestions } from "@/lib/exam-paper/similarity"
import { useRouter } from "next/navigation"
import { useState } from "react"

type MergeCandidate = {
	id: string
	text: string
	question_number: string | null
	origin: string
	mark_scheme_id: string | null
	mark_scheme_description: string | null
}

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** The question currently being viewed — treated as "Question A" */
	currentQuestion: MergeCandidate
	/** The detected duplicate */
	similarQuestion: MergeCandidate
	examPaperId: string
}

function originLabel(origin: string) {
	switch (origin) {
		case "question_paper":
			return "Question Paper"
		case "mark_scheme":
			return "Mark Scheme PDF"
		case "exemplar":
			return "Exemplar"
		case "manual":
			return "Manual"
		default:
			return origin.replace(/_/g, " ")
	}
}

export function MergeQuestionsDialog({
	open,
	onOpenChange,
	currentQuestion,
	similarQuestion,
	examPaperId,
}: Props) {
	const router = useRouter()

	const bothHaveMarkSchemes =
		currentQuestion.mark_scheme_id !== null &&
		similarQuestion.mark_scheme_id !== null

	const [step, setStep] = useState<1 | 2>(1)
	const [keepTextFromId, setKeepTextFromId] = useState(currentQuestion.id)
	// ID of the question whose mark scheme to KEEP (the other's MS will be discarded)
	const [keepMarkSchemeFromId, setKeepMarkSchemeFromId] = useState(
		currentQuestion.mark_scheme_id !== null
			? currentQuestion.id
			: similarQuestion.id,
	)
	const [merging, setMerging] = useState(false)
	const [error, setError] = useState<string | null>(null)

	function reset() {
		setStep(1)
		setKeepTextFromId(currentQuestion.id)
		setKeepMarkSchemeFromId(
			currentQuestion.mark_scheme_id !== null
				? currentQuestion.id
				: similarQuestion.id,
		)
		setMerging(false)
		setError(null)
	}

	function handleOpenChange(next: boolean) {
		if (!merging) {
			onOpenChange(next)
			if (!next) reset()
		}
	}

	function handleNext() {
		if (bothHaveMarkSchemes) {
			setStep(2)
		} else {
			void handleConfirm()
		}
	}

	async function handleConfirm() {
		setMerging(true)
		setError(null)

		// keepId = question whose text we want to keep (it survives the merge)
		// discardId = the other question (gets deleted)
		const keepId = keepTextFromId
		const discardId =
			keepTextFromId === currentQuestion.id
				? similarQuestion.id
				: currentQuestion.id

		const keepQuestion =
			keepId === currentQuestion.id ? currentQuestion : similarQuestion
		const discardQuestion =
			discardId === currentQuestion.id ? currentQuestion : similarQuestion

		// discardMarkSchemeId: the mark scheme to DELETE rather than move.
		// If user wants to keep the discarded question's mark scheme, we must delete
		// the kept question's mark scheme (since keepId has the wrong one).
		// If user wants to keep the kept question's mark scheme, we delete the
		// discard question's mark scheme before the "move all" step.
		let discardMarkSchemeId: string | undefined
		if (bothHaveMarkSchemes) {
			if (keepMarkSchemeFromId === discardId) {
				// Keep discard's MS → delete keepQuestion's MS
				discardMarkSchemeId = keepQuestion.mark_scheme_id ?? undefined
			} else {
				// Keep keepQuestion's MS → delete discardQuestion's MS
				discardMarkSchemeId = discardQuestion.mark_scheme_id ?? undefined
			}
		}

		const result = await consolidateQuestions({
			keepQuestionId: keepId,
			discardQuestionId: discardId,
			discardMarkSchemeId,
		})

		setMerging(false)

		if (result?.serverError) {
			setError(result.serverError)
			return
		}
		if (result?.validationErrors) {
			const ve = result.validationErrors
			const fieldErrorList = Object.values(ve.fieldErrors).flat()
			const issue = ve.formErrors[0] ?? fieldErrorList[0]
			setError(issue ?? "Invalid input")
			return
		}

		onOpenChange(false)
		const survivingId = keepId
		router.push(`/teacher/exam-papers/${examPaperId}/questions/${survivingId}`)
		router.refresh()
	}

	const keptQuestion =
		keepTextFromId === currentQuestion.id ? currentQuestion : similarQuestion

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{step === 1
							? "Which question text would you like to keep?"
							: "Which mark scheme would you like to keep?"}
					</DialogTitle>
					<DialogDescription>
						{step === 1
							? "The other question will be deleted. Only one question will remain."
							: "Only one mark scheme will be kept. The other will be deleted."}
					</DialogDescription>
				</DialogHeader>

				{step === 1 && (
					<div className="space-y-3">
						{[currentQuestion, similarQuestion].map((q) => (
							<label
								key={q.id}
								className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
									keepTextFromId === q.id
										? "border-primary bg-primary/5"
										: "hover:bg-muted/50"
								}`}
							>
								<input
									type="radio"
									name="keep-text"
									value={q.id}
									checked={keepTextFromId === q.id}
									onChange={() => setKeepTextFromId(q.id)}
									className="mt-0.5 accent-primary"
									disabled={merging}
								/>
								<div className="min-w-0 flex-1">
									<p className="text-xs text-muted-foreground mb-1">
										Source: {originLabel(q.origin)}
										{q.question_number ? ` · Q${q.question_number}` : ""}
									</p>
									<p className="text-sm whitespace-pre-wrap">{q.text}</p>
								</div>
							</label>
						))}
					</div>
				)}

				{step === 2 && (
					<div className="space-y-3">
						{[currentQuestion, similarQuestion].map((q) => (
							<label
								key={q.id}
								className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
									keepMarkSchemeFromId === q.id
										? "border-primary bg-primary/5"
										: "hover:bg-muted/50"
								}`}
							>
								<input
									type="radio"
									name="keep-ms"
									value={q.id}
									checked={keepMarkSchemeFromId === q.id}
									onChange={() => setKeepMarkSchemeFromId(q.id)}
									className="mt-0.5 accent-primary"
									disabled={merging}
								/>
								<div className="min-w-0 flex-1">
									<p className="text-xs text-muted-foreground mb-1">
										Source: {originLabel(q.origin)}
										{q.question_number ? ` · Q${q.question_number}` : ""}
									</p>
									{q.mark_scheme_description ? (
										<p className="text-sm line-clamp-3">
											{q.mark_scheme_description}
										</p>
									) : (
										<p className="text-sm text-muted-foreground italic">
											No description available
										</p>
									)}
								</div>
							</label>
						))}
					</div>
				)}

				{error && <p className="text-sm text-destructive">{error}</p>}

				<div className="flex items-center justify-between gap-2 pt-1">
					<div className="text-xs text-muted-foreground">
						{step === 1 && bothHaveMarkSchemes && "Step 1 of 2"}
						{step === 2 && "Step 2 of 2"}
					</div>
					<div className="flex gap-2">
						{step === 2 && (
							<Button
								variant="outline"
								disabled={merging}
								onClick={() => setStep(1)}
							>
								Back
							</Button>
						)}
						<Button
							variant="outline"
							disabled={merging}
							onClick={() => handleOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							disabled={merging}
							onClick={step === 1 ? handleNext : handleConfirm}
						>
							{merging ? (
								<>
									<Spinner className="h-3.5 w-3.5 mr-1.5" />
									Merging…
								</>
							) : step === 1 && bothHaveMarkSchemes ? (
								"Next"
							) : (
								`Merge — keep "${keptQuestion.question_number ? `Q${keptQuestion.question_number}` : "this"}" question`
							)}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
