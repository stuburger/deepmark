"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/components/ui/button-variants"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
	type EvalResult,
	evaluateStudentAnswer,
} from "@/lib/marking/evaluation"
import { CheckCircle2, FlaskConical, XCircle } from "lucide-react"
import { useState } from "react"

export function EvalDialog({
	questionId,
	open: controlledOpen,
	onOpenChange: controlledOnOpenChange,
	hideTrigger,
}: {
	questionId: string
	open?: boolean
	onOpenChange?: (open: boolean) => void
	hideTrigger?: boolean
}) {
	const [internalOpen, setInternalOpen] = useState(false)
	const open = controlledOpen !== undefined ? controlledOpen : internalOpen

	const [answer, setAnswer] = useState("")
	const [loading, setLoading] = useState(false)
	const [result, setResult] = useState<EvalResult | null>(null)
	const [error, setError] = useState<string | null>(null)

	function handleOpenChange(next: boolean) {
		if (controlledOpen !== undefined) {
			controlledOnOpenChange?.(next)
		} else {
			setInternalOpen(next)
		}
		if (!next) {
			setAnswer("")
			setResult(null)
			setError(null)
		}
	}

	async function handleGrade() {
		if (!answer.trim()) return
		setLoading(true)
		setResult(null)
		setError(null)

		const res = await evaluateStudentAnswer(questionId, answer)
		setLoading(false)

		if (!res.ok) {
			setError(res.error)
			return
		}
		setResult(res.result)
	}

	const scorePercent = result
		? Math.round((result.score / result.max_score) * 100)
		: 0

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			{!hideTrigger && (
				<DialogTrigger
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					<FlaskConical className="h-3.5 w-3.5 mr-1.5" />
					Test answer
				</DialogTrigger>
			)}
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Test a student answer</DialogTitle>
					<DialogDescription>
						Enter a student answer and grade it against the mark scheme. Results
						are not saved.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-2">
					<Textarea
						placeholder="Type or paste a student answer here…"
						value={answer}
						onChange={(e) => setAnswer(e.target.value)}
						rows={5}
						disabled={loading}
						className="resize-y"
					/>

					<Button
						onClick={handleGrade}
						disabled={loading || !answer.trim()}
						className="w-full"
					>
						{loading ? (
							<>
								<Spinner className="h-4 w-4 mr-2" />
								Grading…
							</>
						) : (
							"Grade answer"
						)}
					</Button>

					{error && <p className="text-sm text-destructive">{error}</p>}

					{result && (
						<div className="space-y-4 border-t pt-4">
							{/* Score chip */}
							<div className="flex items-center gap-3">
								<div
									className={`flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-semibold ${
										scorePercent >= 70
											? "bg-green-500/10 text-green-700 dark:text-green-400"
											: scorePercent >= 40
												? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
												: "bg-destructive/10 text-destructive"
									}`}
								>
									{result.score} / {result.max_score}
								</div>
								<span className="text-sm text-muted-foreground">
									{scorePercent}%
								</span>
							</div>

							{/* Overall reasoning */}
							<p className="text-sm leading-relaxed">{result.reasoning}</p>

							{/* Per mark point breakdown */}
							{result.awarded_points.length > 0 && (
								<div className="space-y-2">
									<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
										Mark points
									</p>
									<div className="space-y-2">
										{result.awarded_points.map((mp, i) => (
											<div
												key={i}
												className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
													mp.awarded
														? "border-green-500/30 bg-green-500/5"
														: "border-muted bg-muted/20"
												}`}
											>
												{mp.awarded ? (
													<CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
												) : (
													<XCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
												)}
												<div className="min-w-0 flex-1 space-y-1">
													<div className="flex items-center gap-2 flex-wrap">
														<span className="font-medium">
															{mp.description}
														</span>
														<Badge
															variant={mp.awarded ? "secondary" : "outline"}
															className="text-xs shrink-0"
														>
															{mp.awarded ? "Awarded" : "Not awarded"}
														</Badge>
													</div>
													<p className="text-xs text-muted-foreground">
														{mp.reason}
													</p>
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setResult(null)
									setAnswer("")
								}}
							>
								Test another answer
							</Button>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}
