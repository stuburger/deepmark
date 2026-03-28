"use client"

import { Button } from "@/components/ui/button"
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { MarkSchemeInput } from "@/lib/dashboard-actions"
import { createMarkScheme, updateMarkScheme } from "@/lib/dashboard-actions"
import { CheckCircle2, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
	useCreateMarkScheme,
	useUpdateMarkScheme,
} from "../../hooks/use-exam-paper-mutations"

type MarkPointRow = { description: string; points: string }

type McqOption = { option_label: string; option_text: string }

// ---- shared base fields ----
type BaseCreate = {
	markSchemeId?: never
	questionId: string
}
type BaseEdit = {
	questionId?: never
	markSchemeId: string
	initialDescription: string
	initialGuidance: string
	markingMethod: string
}

// ---- MCQ variants (question_type === "multiple_choice") ----
type McqCreate = BaseCreate & {
	questionType: "multiple_choice"
	multipleChoiceOptions: McqOption[]
	initialDescription?: string
	initialGuidance?: string
	initialCorrectOptionLabels?: string[]
	initialMarkPoints?: never
}
type McqEdit = BaseEdit & {
	questionType: "multiple_choice"
	multipleChoiceOptions: McqOption[]
	initialCorrectOptionLabels: string[]
	initialMarkPoints?: never
}

// ---- Written variants ----
type WrittenCreate = BaseCreate & {
	questionType?: "written" | string
	multipleChoiceOptions?: never
	initialDescription?: string
	initialGuidance?: string
	initialCorrectOptionLabels?: never
	initialMarkPoints?: Array<{ description: string; points: number }>
}
type WrittenEdit = BaseEdit & {
	questionType?: "written" | string
	multipleChoiceOptions?: never
	initialCorrectOptionLabels?: never
	initialMarkPoints: Array<{ description: string; points: number }>
}

type Props = (McqCreate | McqEdit | WrittenCreate | WrittenEdit) & {
	onSuccess?: () => void
	/** When provided, enables optimistic cache updates on the exam paper query. */
	paperId?: string
}

export function MarkSchemeEditForm(props: Props) {
	const isEdit = props.markSchemeId !== undefined
	const isMcq = props.questionType === "multiple_choice"
	const router = useRouter()
	const [isPending, startTransition] = useTransition()

	// Optimistic hooks — active only when paperId is known (exam paper context)
	const createHook = useCreateMarkScheme(props.paperId ?? "")
	const updateHook = useUpdateMarkScheme(props.paperId ?? "")

	const [description, setDescription] = useState(() => {
		if (isEdit) return props.initialDescription
		return (props as McqCreate | WrittenCreate).initialDescription ?? ""
	})
	const [guidance, setGuidance] = useState(() => {
		if (isEdit) return props.initialGuidance
		return (props as McqCreate | WrittenCreate).initialGuidance ?? ""
	})

	// MCQ state — which option labels are ticked as correct
	const [correctLabels, setCorrectLabels] = useState<string[]>(() => {
		if (isMcq && isEdit) {
			return (props as McqEdit).initialCorrectOptionLabels ?? []
		}
		if (isMcq && !isEdit) {
			return (props as McqCreate).initialCorrectOptionLabels ?? []
		}
		return []
	})

	// Point-based state
	const [markPoints, setMarkPoints] = useState<MarkPointRow[]>(() => {
		if (!isMcq && isEdit) {
			const init = (props as WrittenEdit).initialMarkPoints
			if (init && init.length > 0) {
				return init.map((mp) => ({
					description: mp.description,
					points: String(mp.points),
				}))
			}
		}
		if (!isMcq && !isEdit) {
			const init = (props as WrittenCreate).initialMarkPoints
			if (init && init.length > 0) {
				return init.map((mp) => ({
					description: mp.description,
					points: String(mp.points),
				}))
			}
		}
		return [{ description: "", points: "1" }]
	})

	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState(false)

	const isHookPending = createHook.isPending || updateHook.isPending
	const effectivelyPending = isPending || isHookPending

	// For written edit: only show mark points if the existing method is point_based
	const showMarkPoints =
		!isMcq &&
		(!isEdit ||
			(props as WrittenEdit & BaseEdit).markingMethod === "point_based")

	const totalPoints = markPoints.reduce((sum, mp) => {
		const n = Number.parseInt(mp.points, 10)
		return sum + (Number.isNaN(n) ? 0 : n)
	}, 0)

	function toggleCorrectLabel(label: string) {
		setCorrectLabels((prev) =>
			prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
		)
		setSaved(false)
	}

	function addMarkPoint() {
		setMarkPoints((prev) => [...prev, { description: "", points: "1" }])
		setSaved(false)
	}

	function removeMarkPoint(index: number) {
		setMarkPoints((prev) => prev.filter((_, i) => i !== index))
		setSaved(false)
	}

	function updateMarkPoint(
		index: number,
		field: "description" | "points",
		value: string,
	) {
		setMarkPoints((prev) =>
			prev.map((mp, i) => (i === index ? { ...mp, [field]: value } : mp)),
		)
		setSaved(false)
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault()
		setError(null)
		setSaved(false)

		const trimmedDescription = description.trim()
		if (!trimmedDescription) {
			setError("Description is required")
			return
		}

		if (isMcq) {
			if (correctLabels.length === 0) {
				setError("Select at least one correct answer")
				return
			}
		} else if (showMarkPoints) {
			for (const mp of markPoints) {
				if (!mp.description.trim()) {
					setError("All mark points must have a description")
					return
				}
				const pts = Number.parseInt(mp.points, 10)
				if (Number.isNaN(pts) || pts < 0) {
					setError("Mark point values must be non-negative numbers")
					return
				}
			}
		}

		const baseInput = {
			description: trimmedDescription,
			guidance: guidance.trim() || null,
		}

		const input: MarkSchemeInput = isMcq
			? {
					...baseInput,
					marking_method: "deterministic" as const,
					correct_option_labels: correctLabels,
				}
			: {
					...baseInput,
					marking_method: "point_based" as const,
					mark_points: showMarkPoints
						? markPoints.map((mp) => ({
								description: mp.description.trim(),
								points: Number.parseInt(mp.points, 10),
							}))
						: [],
				}

		if (props.paperId) {
			// Use optimistic mutation hooks in exam paper context
			if (isEdit) {
				updateHook.mutate(
					{
						markSchemeId: props.markSchemeId,
						questionId: "",
						input,
					},
					{
						onSuccess: () => {
							setSaved(true)
							props.onSuccess?.()
						},
						onError: (err) => setError(err.message),
					},
				)
			} else {
				createHook.mutate(
					{ questionId: props.questionId, input },
					{
						onSuccess: () => {
							setSaved(true)
							props.onSuccess?.()
						},
						onError: (err) => setError(err.message),
					},
				)
			}
		} else {
			// Standalone page fallback — no cache to update
			startTransition(async () => {
				const result = isEdit
					? await updateMarkScheme(props.markSchemeId, input)
					: await createMarkScheme(props.questionId, input)

				if (!result.ok) {
					setError(result.error)
					return
				}

				setSaved(true)
				if (props.onSuccess) {
					props.onSuccess()
				} else {
					router.refresh()
				}
			})
		}
	}

	return (
		<form onSubmit={handleSubmit}>
			<FieldGroup>
				<Field>
					<FieldLabel>Description</FieldLabel>
					<Textarea
						value={description}
						onChange={(e) => {
							setDescription(e.target.value)
							setSaved(false)
						}}
						rows={3}
						disabled={effectivelyPending}
						placeholder={
							isMcq
								? "e.g. The correct answer is B."
								: "Describe what a correct answer should include…"
						}
						className="resize-y text-sm"
					/>
					<FieldError>
						{error?.includes("Description") ? error : null}
					</FieldError>
				</Field>

				{/* MCQ: correct answer picker */}
				{isMcq && (
					<Field>
						<FieldLabel>Correct answer(s)</FieldLabel>
						<div className="space-y-2">
							{(props as McqCreate | McqEdit).multipleChoiceOptions.map(
								(opt) => {
									const checked = correctLabels.includes(opt.option_label)
									return (
										<label
											key={opt.option_label}
											className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
												checked
													? "border-green-500/60 bg-green-500/5"
													: "hover:bg-muted/50"
											}`}
										>
											<input
												type="checkbox"
												checked={checked}
												onChange={() => toggleCorrectLabel(opt.option_label)}
												disabled={effectivelyPending}
												className="mt-0.5 accent-primary"
											/>
											<span className="shrink-0 font-mono font-medium text-sm w-4">
												{opt.option_label}
											</span>
											<span className="text-sm">{opt.option_text}</span>
										</label>
									)
								},
							)}
						</div>
						<FieldError>
							{error?.includes("correct answer") ? error : null}
						</FieldError>
					</Field>
				)}

				{/* Written: point-based mark points */}
				{showMarkPoints && (
					<Field>
						<FieldLabel>
							Mark points
							<span className="ml-2 text-xs font-normal text-muted-foreground">
								{totalPoints} mark{totalPoints !== 1 ? "s" : ""} total
							</span>
						</FieldLabel>
						<div className="space-y-2">
							{markPoints.map((mp, i) => (
								<div key={i} className="flex items-center gap-2">
									<Input
										value={mp.description}
										onChange={(e) =>
											updateMarkPoint(i, "description", e.target.value)
										}
										disabled={effectivelyPending}
										placeholder={`Mark point ${i + 1}`}
										className="flex-1 text-sm"
									/>
									<Input
										type="number"
										min={0}
										value={mp.points}
										onChange={(e) =>
											updateMarkPoint(i, "points", e.target.value)
										}
										disabled={effectivelyPending}
										className="w-16 text-sm"
										aria-label="Points"
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => removeMarkPoint(i)}
										disabled={effectivelyPending || markPoints.length <= 1}
										className="shrink-0 text-muted-foreground hover:text-destructive"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
							))}
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={addMarkPoint}
							disabled={effectivelyPending}
							className="mt-2"
						>
							<Plus className="h-3.5 w-3.5 mr-1.5" />
							Add mark point
						</Button>
						<FieldError>
							{error?.includes("mark point") ? error : null}
						</FieldError>
					</Field>
				)}

				<Field>
					<FieldLabel>
						Guidance
						<span className="ml-1 text-xs font-normal text-muted-foreground">
							(optional)
						</span>
					</FieldLabel>
					<Textarea
						value={guidance}
						onChange={(e) => {
							setGuidance(e.target.value)
							setSaved(false)
						}}
						rows={2}
						disabled={effectivelyPending}
						placeholder="Additional guidance for markers…"
						className="resize-y text-sm"
					/>
				</Field>
			</FieldGroup>

			{error &&
				!error.includes("Description") &&
				!error.includes("mark point") &&
				!error.includes("correct answer") && (
					<p className="mt-3 text-sm text-destructive">{error}</p>
				)}

			<div className="mt-4 flex items-center gap-3">
				<Button type="submit" size="sm" disabled={effectivelyPending}>
					{effectivelyPending ? (
						<>
							<Spinner className="h-3.5 w-3.5 mr-1.5" />
							Saving…
						</>
					) : isEdit ? (
						"Save changes"
					) : (
						"Create mark scheme"
					)}
				</Button>

				{saved && (
					<span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
						<CheckCircle2 className="h-4 w-4" />
						Saved
					</span>
				)}
			</div>
		</form>
	)
}
