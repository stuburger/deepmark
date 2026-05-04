"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { MarkSchemeInput } from "@/lib/mark-scheme/types"
import {
	type EvalResult,
	evaluateStudentAnswer,
} from "@/lib/marking/evaluation"
import { CheckCircle2, XCircle } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

/**
 * The "test answer" panel — embed inside any container (e.g. a tab in the
 * unified question dialog).
 */
export function EvalBody({
	questionId,
	markSchemeDraft,
}: {
	questionId: string
	markSchemeDraft: MarkSchemeInput | null
}) {
	const [answer, setAnswer] = useState("")
	const [loading, setLoading] = useState(false)
	const [result, setResult] = useState<EvalResult | null>(null)

	async function handleGrade() {
		if (!answer.trim()) return
		setLoading(true)
		setResult(null)

		const res = await evaluateStudentAnswer({
			questionId,
			studentAnswer: answer,
			markSchemeDraft,
		})
		setLoading(false)

		if (res?.serverError) {
			toast.error(res.serverError)
			return
		}
		if (!res?.data) {
			toast.error("Evaluation failed")
			return
		}
		setResult(res.data.result)
	}

	const scorePercent = result
		? Math.round((result.score / result.max_score) * 100)
		: 0

	return (
		<div className="space-y-4 pt-2">
			<Textarea
				placeholder="Type or paste a student answer here…"
				value={answer}
				onChange={(e) => {
					setAnswer(e.target.value)
					setResult(null)
				}}
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

			{result && (
				<div className="space-y-4 border-t pt-4">
					<div className="flex items-center gap-3">
						<div
							className={`flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-semibold ${
								scorePercent >= 70
									? "bg-success/10 text-success-700 dark:text-success-400"
									: scorePercent >= 40
										? "bg-warning/10 text-warning-700 dark:text-warning-400"
										: "bg-destructive/10 text-destructive"
							}`}
						>
							{result.score} / {result.max_score}
						</div>
						<span className="text-sm text-muted-foreground">
							{scorePercent}%
						</span>
					</div>

					<p className="text-sm leading-relaxed">{result.reasoning}</p>

					{result.awarded_points.length > 0 && (
						<div className="space-y-2">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
								Mark points
							</p>
							<div className="space-y-2">
								{result.awarded_points.map((mp, i) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: static mark point list
										key={i}
										className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${
											mp.awarded
												? "border-success/30 bg-success/5"
												: "border-muted bg-muted/20"
										}`}
									>
										{mp.awarded ? (
											<CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-success-600" />
										) : (
											<XCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
										)}
										<div className="min-w-0 flex-1 space-y-1">
											<div className="flex items-center gap-2 flex-wrap">
												<span className="font-medium">{mp.description}</span>
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
	)
}
