"use client"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { autofillMarkScheme } from "@/lib/mark-scheme/autofill"
import { Sparkles } from "lucide-react"
import { useState } from "react"
import { LorMarkSchemeEditForm } from "./lor-mark-scheme-edit-form"
import { MarkSchemeFormWithAutofill } from "./mark-scheme-form-with-autofill"

type McqOption = { option_label: string; option_text: string }

type MarkPoint = { criteria: string; description?: string; points: number }

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
	| {
			marking_method: "level_of_response"
			description: string
			content: string
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
	initialContent: string
	pointsTotal: number
}

export type MarkSchemeBodyProps = (
	| CreateMcqProps
	| CreateWrittenProps
	| EditMcqProps
	| EditWrittenProps
	| EditLorProps
) & {
	onSuccess?: () => void
	/** Closes the surrounding container (e.g. the unified question dialog). */
	onCancel?: () => void
	/** When provided, enables optimistic cache updates on the exam paper query. */
	paperId?: string
}

// ─── Body ─────────────────────────────────────────────────────────────────────

/**
 * The mark-scheme editor — embed inside any container (e.g. a tab in the
 * unified question dialog).
 */
export function MarkSchemeBody(props: MarkSchemeBodyProps) {
	const [autofilling, setAutofilling] = useState(false)
	const [autofillError, setAutofillError] = useState<string | null>(null)

	// Tracks autofill-provided values. Incrementing formKey remounts the form
	// with the new initial values — the user can then edit freely before saving.
	const [formKey, setFormKey] = useState(0)
	const [autofillValues, setAutofillValues] = useState<AutofillValues | null>(
		null,
	)

	const isLor =
		props.mode === "edit" && props.markingMethod === "level_of_response"

	const effectiveMarkingMethod = isLor ? "level_of_response" : undefined

	async function handleAutofill() {
		setAutofilling(true)
		setAutofillError(null)

		const result = await autofillMarkScheme(
			props.questionId,
			effectiveMarkingMethod,
		)

		setAutofilling(false)

		if (!result.ok) {
			setAutofillError(result.error)
			return
		}

		setAutofillValues(result.suggestion)
		setFormKey((k) => k + 1)
	}

	return (
		<div className="flex flex-col h-full min-h-0">
			<div className="shrink-0 flex items-center justify-end px-5 pt-3 pb-2">
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
			</div>

			{autofillError && (
				<p className="shrink-0 px-5 pb-2 text-sm text-destructive">
					{autofillError}
				</p>
			)}

			{isLor ? (
				<LorMarkSchemeEditForm
					key={formKey}
					markSchemeId={(props as EditLorProps).markSchemeId}
					initialDescription={
						autofillValues?.marking_method === "level_of_response"
							? autofillValues.description
							: (props as EditLorProps).initialDescription
					}
					initialGuidance={(props as EditLorProps).initialGuidance}
					initialContent={
						autofillValues?.marking_method === "level_of_response"
							? autofillValues.content
							: (props as EditLorProps).initialContent
					}
					pointsTotal={(props as EditLorProps).pointsTotal}
					paperId={props.paperId}
					onSuccess={props.onSuccess}
					onCancel={props.onCancel}
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
					autofillValues={
						autofillValues?.marking_method === "level_of_response"
							? null
							: autofillValues
					}
					paperId={props.paperId}
					onSuccess={props.onSuccess}
					onCancel={props.onCancel}
				/>
			)}
		</div>
	)
}
