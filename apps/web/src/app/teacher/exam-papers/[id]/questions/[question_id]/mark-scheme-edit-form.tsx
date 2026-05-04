"use client"

import { Button } from "@/components/ui/button"
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
	ActionValidationError,
	applyServerValidationErrors,
} from "@/lib/forms/apply-server-errors"
import { createMarkScheme, updateMarkScheme } from "@/lib/mark-scheme/manual"
import type { MarkSchemeInput } from "@/lib/mark-scheme/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"
import {
	type FieldPath,
	type FieldValues,
	type UseFormReturn,
	useFieldArray,
	useForm,
} from "react-hook-form"
import { z } from "zod"
import {
	useCreateMarkScheme,
	useUpdateMarkScheme,
} from "../../hooks/use-exam-paper-mutations"
import { MarkPointRow } from "./mark-point-row"

// ── Schemas ─────────────────────────────────────────────────────────────────

const mcqFormSchema = z.object({
	description: z.string().min(1, "Description is required"),
	guidance: z.string(),
	correctLabels: z.array(z.string()).min(1, "Select the correct answer"),
})

const writtenFormSchema = z.object({
	description: z.string().min(1, "Description is required"),
	guidance: z.string(),
	markPoints: z
		.array(
			z.object({
				criteria: z.string().min(1, "Mark point criteria is required"),
				description: z.string(),
				points: z.number().int().min(0, "Must be non-negative"),
			}),
		)
		.min(1, "At least one mark point is required"),
})

type McqFormValues = z.infer<typeof mcqFormSchema>
type WrittenFormValues = z.infer<typeof writtenFormSchema>

// ── Props ───────────────────────────────────────────────────────────────────

type McqOption = { option_label: string; option_text: string }

type McqProps = {
	questionType: "multiple_choice"
	multipleChoiceOptions: McqOption[]
	onSuccess?: () => void
	paperId?: string
	onDraftChange?: (input: MarkSchemeInput) => void
} & (
	| {
			markSchemeId?: never
			questionId: string
			initialDescription?: string
			initialGuidance?: string
			initialCorrectOptionLabels?: string[]
	  }
	| {
			questionId?: never
			markSchemeId: string
			markingMethod: string
			initialDescription: string
			initialGuidance: string
			initialCorrectOptionLabels: string[]
	  }
)

type WrittenProps = {
	questionType?: "written" | string
	onSuccess?: () => void
	paperId?: string
	onDraftChange?: (input: MarkSchemeInput) => void
} & (
	| {
			markSchemeId?: never
			questionId: string
			initialDescription?: string
			initialGuidance?: string
			initialMarkPoints?: Array<{
				criteria: string
				description?: string
				points: number
			}>
	  }
	| {
			questionId?: never
			markSchemeId: string
			markingMethod: string
			initialDescription: string
			initialGuidance: string
			initialMarkPoints: Array<{
				criteria: string
				description?: string
				points: number
			}>
	  }
)

// Keep the union export for external consumers (mark-scheme-form-with-autofill)
type McqCreate = McqProps & { markSchemeId?: never; questionId: string }
type McqEdit = McqProps & { questionId?: never; markSchemeId: string }
type WrittenCreate = WrittenProps & { markSchemeId?: never; questionId: string }
type WrittenEdit = WrittenProps & { questionId?: never; markSchemeId: string }

export type Props = (McqCreate | McqEdit | WrittenCreate | WrittenEdit) & {
	multipleChoiceOptions?: McqOption[]
	initialCorrectOptionLabels?: string[]
	initialMarkPoints?: Array<{
		criteria: string
		description?: string
		points: number
	}>
}

// ── Shared submit logic ─────────────────────────────────────────────────────

/**
 * Wraps both the TanStack-mutation path (when a `paperId` ties the form into
 * a paper detail page's optimistic cache) and the direct-server-action path
 * (standalone create/edit dialogs). In both cases, server-side validation
 * failures are routed through `applyServerValidationErrors` so per-field
 * messages land inline; only unmapped errors surface in the banner.
 */
function useMarkSchemeSubmit<T extends FieldValues>({
	markSchemeId,
	questionId,
	paperId,
	onSuccess,
	form,
	fieldMap,
}: {
	markSchemeId?: string
	questionId?: string
	paperId?: string
	onSuccess?: () => void
	form: UseFormReturn<T>
	fieldMap?: Partial<Record<string, FieldPath<T>>>
}) {
	const isEdit = markSchemeId !== undefined
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const [saved, setSaved] = useState(false)
	const [submitError, setSubmitError] = useState<string | null>(null)

	const createHook = useCreateMarkScheme(paperId ?? "")
	const updateHook = useUpdateMarkScheme(paperId ?? "")
	const effectivelyPending =
		isPending || createHook.isPending || updateHook.isPending

	function applyValidationErrors(err: ActionValidationError) {
		const banner = applyServerValidationErrors(
			form,
			err.validationErrors,
			fieldMap,
		)
		if (banner) setSubmitError(banner)
	}

	function submit(input: MarkSchemeInput) {
		setSubmitError(null)
		setSaved(false)

		if (paperId) {
			const onError = (err: Error) => {
				if (err instanceof ActionValidationError) {
					applyValidationErrors(err)
					return
				}
				setSubmitError(err.message)
			}
			if (isEdit && markSchemeId) {
				updateHook.mutate(
					{ markSchemeId, questionId: "", input },
					{
						onSuccess: () => {
							setSaved(true)
							onSuccess?.()
						},
						onError,
					},
				)
			} else if (questionId) {
				createHook.mutate(
					{ questionId, input },
					{
						onSuccess: () => {
							setSaved(true)
							onSuccess?.()
						},
						onError,
					},
				)
			}
		} else {
			startTransition(async () => {
				if (!isEdit && !questionId) {
					setSubmitError("Missing question ID")
					return
				}
				if (isEdit && !markSchemeId) {
					setSubmitError("Missing mark scheme ID")
					return
				}
				const result =
					isEdit && markSchemeId
						? await updateMarkScheme({ markSchemeId, input })
						: await createMarkScheme({
								questionId: questionId as string,
								input,
							})
				if (result?.serverError) {
					setSubmitError(result.serverError)
					return
				}
				if (result?.validationErrors) {
					applyValidationErrors(
						new ActionValidationError(result.validationErrors),
					)
					return
				}
				setSaved(true)
				if (onSuccess) {
					onSuccess()
				} else {
					router.refresh()
				}
			})
		}
	}

	return { submit, saved, setSaved, submitError, effectivelyPending, isEdit }
}

// ── Exported component ──────────────────────────────────────────────────────

export function MarkSchemeEditForm(props: Props & { onCancel?: () => void }) {
	if (props.questionType === "multiple_choice") {
		return <McqForm {...props} />
	}
	return <WrittenForm {...props} />
}

// ── MCQ form ────────────────────────────────────────────────────────────────

function McqForm(props: Props & { onCancel?: () => void }) {
	const form = useForm<McqFormValues>({
		resolver: zodResolver(mcqFormSchema),
		defaultValues: {
			description: props.initialDescription ?? "",
			guidance: props.initialGuidance ?? "",
			correctLabels: props.initialCorrectOptionLabels ?? [],
		},
	})

	const { submit, saved, setSaved, submitError, effectivelyPending } =
		useMarkSchemeSubmit({ ...props, form })

	const toInput = useCallback((values: McqFormValues): MarkSchemeInput => {
		return {
			marking_method: "deterministic",
			description: values.description.trim(),
			guidance: values.guidance.trim() || null,
			correct_option_labels: values.correctLabels,
		}
	}, [])

	useEffect(() => {
		props.onDraftChange?.(toInput(form.getValues()))
		const subscription = form.watch(() => {
			props.onDraftChange?.(toInput(form.getValues()))
		})
		return () => subscription.unsubscribe()
	}, [form, props.onDraftChange, toInput])

	// Single-select for now: the deterministic grader treats correctLabels as an
	// exact-match set, so multi-select would require teachers to think about
	// "student must tick all of these" semantics. GCSE MCQs are almost always
	// one-correct; revisit if a subject genuinely needs multi-select.
	function selectCorrectLabel(label: string) {
		const current = form.getValues("correctLabels")
		if (current.length === 1 && current[0] === label) return
		form.setValue("correctLabels", [label], { shouldValidate: true })
		setSaved(false)
	}

	function onSubmit(values: McqFormValues) {
		submit(toInput(values))
	}

	const options = props.multipleChoiceOptions ?? []

	return (
		<form
			onSubmit={form.handleSubmit(onSubmit)}
			className="flex flex-col flex-1 min-h-0"
		>
			<div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
				<FieldGroup>
					<Field>
						<FieldLabel>Description</FieldLabel>
						<Textarea
							{...form.register("description", {
								onChange: () => setSaved(false),
							})}
							rows={3}
							disabled={effectivelyPending}
							placeholder="e.g. The correct answer is B."
							className="resize-y text-sm"
						/>
						<FieldError>
							{form.formState.errors.description?.message}
						</FieldError>
					</Field>

					<Field>
						<FieldLabel>Correct answer</FieldLabel>
						<div className="space-y-2">
							{options.map((opt) => {
								const checked = form
									.watch("correctLabels")
									.includes(opt.option_label)
								return (
									<label
										key={opt.option_label}
										className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
											checked
												? "border-success/60 bg-success/5"
												: "hover:bg-muted/50"
										}`}
									>
										<input
											type="checkbox"
											checked={checked}
											onChange={() => selectCorrectLabel(opt.option_label)}
											disabled={effectivelyPending}
											className="mt-0.5 accent-primary"
										/>
										<span className="shrink-0 font-mono font-medium text-sm w-4">
											{opt.option_label}
										</span>
										<span className="text-sm">{opt.option_text}</span>
									</label>
								)
							})}
						</div>
						<FieldError>
							{form.formState.errors.correctLabels?.message}
						</FieldError>
					</Field>

					<GuidanceField
						register={form.register}
						disabled={effectivelyPending}
						onDirty={() => setSaved(false)}
					/>
				</FieldGroup>

				{submitError && (
					<p className="mt-3 text-sm text-destructive">{submitError}</p>
				)}
			</div>
			<FormFooter
				pending={effectivelyPending}
				saved={saved}
				onCancel={props.onCancel}
			/>
		</form>
	)
}

// ── Written form ────────────────────────────────────────────────────────────

function WrittenForm(props: Props & { onCancel?: () => void }) {
	const isEditUpfront = "markSchemeId" in props && Boolean(props.markSchemeId)
	const showMarkPoints =
		!isEditUpfront ||
		("markingMethod" in props && props.markingMethod === "point_based")

	const form = useForm<WrittenFormValues>({
		resolver: zodResolver(writtenFormSchema),
		defaultValues: {
			description: props.initialDescription ?? "",
			guidance: props.initialGuidance ?? "",
			markPoints: (() => {
				const init = props.initialMarkPoints
				if (init && init.length > 0) {
					return init.map((mp) => ({
						criteria: mp.criteria,
						description: mp.description ?? "",
						points: mp.points,
					}))
				}
				return [{ criteria: "", description: "", points: 1 }]
			})(),
		},
	})

	const { submit, saved, setSaved, submitError, effectivelyPending } =
		useMarkSchemeSubmit({ ...props, form })

	const markPointFields = useFieldArray({
		control: form.control,
		name: "markPoints",
	})

	const watchedPoints = form.watch("markPoints")
	// Each mark point is now fixed at 1 mark (see onSubmit), so the total is
	// just the number of mark points.
	const totalPoints = watchedPoints.length

	const toInput = useCallback(
		(values: WrittenFormValues): MarkSchemeInput => {
			return {
				marking_method: "point_based",
				description: values.description.trim(),
				guidance: values.guidance.trim() || null,
				// Each mark point is fixed at 1 mark; description has been removed from
				// the editor (it was a label-only field that wasn't used downstream).
				mark_points: showMarkPoints
					? values.markPoints.map((mp) => ({
							criteria: mp.criteria.trim(),
							description: "",
							points: 1,
						}))
					: [],
			}
		},
		[showMarkPoints],
	)

	useEffect(() => {
		props.onDraftChange?.(toInput(form.getValues()))
		const subscription = form.watch(() => {
			props.onDraftChange?.(toInput(form.getValues()))
		})
		return () => subscription.unsubscribe()
	}, [form, props.onDraftChange, toInput])

	function onSubmit(values: WrittenFormValues) {
		submit(toInput(values))
	}

	return (
		<form
			onSubmit={form.handleSubmit(onSubmit)}
			className="flex flex-col flex-1 min-h-0"
		>
			<div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
				<FieldGroup>
					<Field>
						<FieldLabel>Description</FieldLabel>
						<Textarea
							{...form.register("description", {
								onChange: () => setSaved(false),
							})}
							rows={3}
							disabled={effectivelyPending}
							placeholder="Describe what a correct answer should include…"
							className="resize-y text-sm"
						/>
						<FieldError>
							{form.formState.errors.description?.message}
						</FieldError>
					</Field>

					{showMarkPoints && (
						<Field>
							<div className="flex items-center justify-between gap-2">
								<FieldLabel className="m-0">
									Mark points
									<span className="ml-2 text-xs font-normal text-muted-foreground">
										{totalPoints} mark{totalPoints !== 1 ? "s" : ""} total
									</span>
								</FieldLabel>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => {
										markPointFields.append({
											criteria: "",
											description: "",
											points: 1,
										})
										setSaved(false)
									}}
									disabled={effectivelyPending}
									className="h-7 px-2 text-xs"
								>
									<Plus className="h-3.5 w-3.5 mr-1" />
									Add mark point
								</Button>
							</div>
							<div className="space-y-2">
								{markPointFields.fields.map((field, i) => (
									<MarkPointRow
										key={field.id}
										criteria={watchedPoints[i]?.criteria ?? ""}
										index={i}
										disabled={effectivelyPending}
										isOnly={markPointFields.fields.length <= 1}
										onChange={(value) => {
											form.setValue(`markPoints.${i}.criteria`, value)
											setSaved(false)
										}}
										onRemove={() => {
											markPointFields.remove(i)
											setSaved(false)
										}}
									/>
								))}
							</div>
							<FieldError>
								{form.formState.errors.markPoints?.message}
							</FieldError>
						</Field>
					)}

					<GuidanceField
						register={form.register}
						disabled={effectivelyPending}
						onDirty={() => setSaved(false)}
					/>
				</FieldGroup>

				{submitError && (
					<p className="mt-3 text-sm text-destructive">{submitError}</p>
				)}
			</div>
			<FormFooter
				pending={effectivelyPending}
				saved={saved}
				onCancel={props.onCancel}
			/>
		</form>
	)
}

// ── Shared UI pieces ────────────────────────────────────────────────────────

function GuidanceField({
	register,
	disabled,
	onDirty,
}: {
	register: (name: "guidance", opts?: { onChange: () => void }) => object
	disabled: boolean
	onDirty: () => void
}) {
	return (
		<Field>
			<FieldLabel>
				Guidance
				<span className="ml-1 text-xs font-normal text-muted-foreground">
					(optional)
				</span>
			</FieldLabel>
			<Textarea
				{...register("guidance", { onChange: onDirty })}
				rows={2}
				disabled={disabled}
				placeholder="Additional guidance for markers…"
				className="resize-y text-sm"
			/>
		</Field>
	)
}

export function FormFooter({
	pending,
	saved,
	onCancel,
}: {
	pending: boolean
	saved: boolean
	onCancel?: () => void
}) {
	return (
		<div className="shrink-0 flex items-center justify-end gap-3 border-t bg-background px-5 py-3">
			{saved && (
				<span className="flex items-center gap-1.5 text-sm text-success-600 dark:text-success-400">
					<CheckCircle2 className="h-4 w-4" />
					Saved
				</span>
			)}
			{onCancel && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={onCancel}
					disabled={pending}
				>
					Close
				</Button>
			)}
			<Button type="submit" size="sm" disabled={pending}>
				{pending ? (
					<>
						<Spinner className="h-3.5 w-3.5 mr-1.5" />
						Saving…
					</>
				) : (
					"Save"
				)}
			</Button>
		</div>
	)
}
