"use client"

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
import { autofillMarkScheme } from "@/lib/autofill-mark-scheme-actions"
import {
	type MarkingRulesInput,
	createMarkScheme,
	updateMarkScheme,
} from "@/lib/dashboard-actions"
import { CheckCircle2, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { LorMarkSchemeEditForm } from "./lor-mark-scheme-edit-form"
import { MarkSchemeEditForm } from "./mark-scheme-edit-form"

type McqOption = { option_label: string; option_text: string }

type MarkPoint = { description: string; points: number }

// ─── Shared autofill-aware state ──────────────────────────────────────────────

type AutofillValues =
	| {
			marking_method: "deterministic"
			description: string
			correct_option_labels: string[]
	  }
	| {
			marking_method: "point_based"
			description: string
			guidance: string
			mark_points: MarkPoint[]
	  }

// ─── Props ────────────────────────────────────────────────────────────────────

type CreateMcqProps = {
	mode: "create"
	questionId: string
	questionType: "multiple_choice"
	multipleChoiceOptions: McqOption[]
}

type CreateWrittenProps = {
	mode: "create"
	questionId: string
	questionType?: "written" | string
	multipleChoiceOptions?: never
}

type EditMcqProps = {
	mode: "edit"
	questionId: string
	markSchemeId: string
	markingMethod: "deterministic"
	multipleChoiceOptions: McqOption[]
	initialDescription: string
	initialGuidance: string
	initialCorrectOptionLabels: string[]
}

type EditWrittenProps = {
	mode: "edit"
	questionId: string
	markSchemeId: string
	markingMethod: "point_based"
	multipleChoiceOptions?: never
	initialDescription: string
	initialGuidance: string
	initialMarkPoints: MarkPoint[]
}

type EditLorProps = {
	mode: "edit"
	questionId: string
	markSchemeId: string
	markingMethod: "level_of_response"
	multipleChoiceOptions?: never
	initialDescription: string
	initialGuidance: string
	initialMarkingRules: MarkingRulesInput | null
}

export type MarkSchemeDialogProps =
	| CreateMcqProps
	| CreateWrittenProps
	| EditMcqProps
	| EditWrittenProps
	| EditLorProps

// ─── Component ────────────────────────────────────────────────────────────────

export function MarkSchemeDialog(props: MarkSchemeDialogProps) {
	const router = useRouter()
	const [open, setOpen] = useState(false)
	const [autofilling, setAutofilling] = useState(false)
	const [autofillError, setAutofillError] = useState<string | null>(null)

	// Tracks autofill-provided values. Incrementing formKey remounts the form
	// with the new initial values — the user can then edit freely before saving.
	const [formKey, setFormKey] = useState(0)
	const [autofillValues, setAutofillValues] = useState<AutofillValues | null>(
		null,
	)

	// Quick generate + save (no dialog)
	const [quickSaving, setQuickSaving] = useState(false)
	const [quickSaved, setQuickSaved] = useState(false)
	const [quickError, setQuickError] = useState<string | null>(null)

	const isLor =
		props.mode === "edit" && props.markingMethod === "level_of_response"

	async function handleAutofill() {
		setAutofilling(true)
		setAutofillError(null)

		const result = await autofillMarkScheme(props.questionId)

		setAutofilling(false)

		if (!result.ok) {
			setAutofillError(result.error)
			return
		}

		setAutofillValues(result.suggestion)
		setFormKey((k) => k + 1)
	}

	async function handleQuickGenerate() {
		setQuickSaving(true)
		setQuickSaved(false)
		setQuickError(null)

		const autofill = await autofillMarkScheme(props.questionId)
		if (!autofill.ok) {
			setQuickSaving(false)
			setQuickError(autofill.error)
			return
		}

		const suggestion = autofill.suggestion
		const input =
			suggestion.marking_method === "deterministic"
				? {
						marking_method: "deterministic" as const,
						description: suggestion.description,
						guidance: null,
						correct_option_labels: suggestion.correct_option_labels,
					}
				: {
						marking_method: "point_based" as const,
						description: suggestion.description,
						guidance: suggestion.guidance || null,
						mark_points: suggestion.mark_points,
					}

		const result =
			props.mode === "create"
				? await createMarkScheme(props.questionId, input)
				: await updateMarkScheme(
						(props as EditMcqProps | EditWrittenProps).markSchemeId,
						input,
					)

		setQuickSaving(false)

		if (!result.ok) {
			setQuickError(result.error)
			return
		}

		setQuickSaved(true)
		router.refresh()
		setTimeout(() => setQuickSaved(false), 3000)
	}

	function handleOpenChange(next: boolean) {
		setOpen(next)
		if (!next) {
			setAutofillError(null)
		}
	}

	const triggerLabel =
		props.mode === "create" ? "Add mark scheme" : "Edit mark scheme"
	const dialogTitle =
		props.mode === "create" ? "Create mark scheme" : "Edit mark scheme"
	const dialogDescription =
		props.mode === "create"
			? "Add a mark scheme for this question. Use Autofill to generate a suggestion."
			: "Edit the mark scheme for this question. Use Autofill to regenerate a suggestion."

	return (
		<div className="flex items-center gap-1">
			{!isLor && (
				<>
					{quickError && (
						<span className="text-xs text-destructive">{quickError}</span>
					)}
					{quickSaved ? (
						<span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
							<CheckCircle2 className="h-3.5 w-3.5" />
							Saved
						</span>
					) : (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleQuickGenerate}
							disabled={quickSaving}
							title="Generate & save mark scheme automatically"
							className="text-muted-foreground hover:text-foreground"
						>
							{quickSaving ? (
								<Spinner className="h-3.5 w-3.5" />
							) : (
								<Sparkles className="h-3.5 w-3.5" />
							)}
						</Button>
					)}
				</>
			)}
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogTrigger
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					{triggerLabel}
				</DialogTrigger>

				<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<div className="flex items-center justify-between gap-3">
							<DialogTitle>{dialogTitle}</DialogTitle>
							{!isLor && (
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={handleAutofill}
									disabled={autofilling}
									className="shrink-0"
								>
									{autofilling ? (
										<>
											<Spinner className="h-3.5 w-3.5 mr-1.5" />
											Generating…
										</>
									) : (
										<>
											<Sparkles className="h-3.5 w-3.5 mr-1.5" />
											Autofill
										</>
									)}
								</Button>
							)}
						</div>
						<DialogDescription>{dialogDescription}</DialogDescription>
					</DialogHeader>

					{autofillError && (
						<p className="text-sm text-destructive -mt-2">{autofillError}</p>
					)}

					<div className="pt-1">
						{isLor ? (
							<LorMarkSchemeEditForm
								markSchemeId={(props as EditLorProps).markSchemeId}
								initialDescription={(props as EditLorProps).initialDescription}
								initialGuidance={(props as EditLorProps).initialGuidance}
								initialMarkingRules={
									(props as EditLorProps).initialMarkingRules
								}
							/>
						) : (
							<MarkSchemeFormWithAutofill
								key={formKey}
								props={
									props as
										| CreateMcqProps
										| CreateWrittenProps
										| EditMcqProps
										| EditWrittenProps
								}
								autofillValues={autofillValues}
							/>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}

// ─── Inner form renderer (re-mounts on formKey change) ────────────────────────

function MarkSchemeFormWithAutofill({
	props,
	autofillValues,
}: {
	props: CreateMcqProps | CreateWrittenProps | EditMcqProps | EditWrittenProps
	autofillValues: AutofillValues | null
}) {
	const isMcq =
		(props.mode === "create" && props.questionType === "multiple_choice") ||
		(props.mode === "edit" && props.markingMethod === "deterministic")

	if (props.mode === "create") {
		if (isMcq) {
			const autofill =
				autofillValues?.marking_method === "deterministic"
					? autofillValues
					: null
			return (
				<MarkSchemeEditForm
					questionId={props.questionId}
					questionType="multiple_choice"
					multipleChoiceOptions={
						(props as CreateMcqProps).multipleChoiceOptions
					}
					initialDescription={autofill?.description}
					initialCorrectOptionLabels={autofill?.correct_option_labels}
				/>
			)
		}
		const autofill =
			autofillValues?.marking_method === "point_based" ? autofillValues : null
		return (
			<MarkSchemeEditForm
				questionId={props.questionId}
				initialDescription={autofill?.description}
				initialGuidance={autofill?.guidance}
				initialMarkPoints={autofill?.mark_points}
			/>
		)
	}

	// Edit mode
	if (props.markingMethod === "deterministic") {
		const autofill =
			autofillValues?.marking_method === "deterministic" ? autofillValues : null
		return (
			<MarkSchemeEditForm
				markSchemeId={props.markSchemeId}
				markingMethod="deterministic"
				questionType="multiple_choice"
				multipleChoiceOptions={props.multipleChoiceOptions}
				initialDescription={autofill?.description ?? props.initialDescription}
				initialGuidance={props.initialGuidance}
				initialCorrectOptionLabels={
					autofill?.correct_option_labels ?? props.initialCorrectOptionLabels
				}
			/>
		)
	}

	// point_based edit
	const autofill =
		autofillValues?.marking_method === "point_based" ? autofillValues : null
	return (
		<MarkSchemeEditForm
			markSchemeId={(props as EditWrittenProps).markSchemeId}
			markingMethod="point_based"
			initialDescription={autofill?.description ?? props.initialDescription}
			initialGuidance={autofill?.guidance ?? props.initialGuidance}
			initialMarkPoints={
				autofill?.mark_points ?? (props as EditWrittenProps).initialMarkPoints
			}
		/>
	)
}
