"use client"

import type { MarkSchemeInput } from "@/lib/mark-scheme/types"
import { MarkSchemeEditForm } from "./mark-scheme-edit-form"

type McqOption = { option_label: string; option_text: string }

type MarkPoint = { criteria: string; description?: string; points: number }

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

export function MarkSchemeFormWithAutofill({
	props,
	autofillValues,
	paperId,
	onSuccess,
	onCancel,
	onDraftChange,
}: {
	props: CreateMcqProps | CreateWrittenProps | EditMcqProps | EditWrittenProps
	autofillValues: AutofillValues | null
	paperId?: string
	onSuccess?: () => void
	onCancel?: () => void
	onDraftChange?: (input: MarkSchemeInput) => void
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
					paperId={paperId}
					onSuccess={onSuccess}
					onCancel={onCancel}
					onDraftChange={onDraftChange}
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
				paperId={paperId}
				onSuccess={onSuccess}
				onCancel={onCancel}
				onDraftChange={onDraftChange}
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
				paperId={paperId}
				onSuccess={onSuccess}
				onCancel={onCancel}
				onDraftChange={onDraftChange}
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
			paperId={paperId}
			onSuccess={onSuccess}
			onCancel={onCancel}
			onDraftChange={onDraftChange}
		/>
	)
}
