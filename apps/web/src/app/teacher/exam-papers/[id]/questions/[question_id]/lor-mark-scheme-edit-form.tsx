"use client"

import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { updateMarkScheme } from "@/lib/mark-scheme/manual"
import type { MarkSchemeInput } from "@/lib/mark-scheme/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useUpdateMarkScheme } from "../../hooks/use-exam-paper-mutations"
import { FormFooter } from "./mark-scheme-edit-form"

// ── Schema ──────────────────────────────────────────────────────────────────

const formSchema = z.object({
	description: z.string().min(1, "Description is required"),
	content: z.string().min(1, "Mark scheme content is required"),
	guidance: z.string(),
})

type FormValues = z.infer<typeof formSchema>

// ── Props ───────────────────────────────────────────────────────────────────

type Props = {
	markSchemeId: string
	initialDescription: string
	initialGuidance: string
	initialContent: string
	pointsTotal: number
	onSuccess?: () => void
	onCancel?: () => void
	paperId?: string
	onDraftChange?: (input: MarkSchemeInput) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export function LorMarkSchemeEditForm({
	markSchemeId,
	initialDescription,
	initialGuidance,
	initialContent,
	pointsTotal,
	onSuccess,
	onCancel,
	paperId,
	onDraftChange,
}: Props) {
	const router = useRouter()
	const [isPending, startTransition] = useTransition()
	const updateHook = useUpdateMarkScheme(paperId ?? "")
	const [saved, setSaved] = useState(false)
	const [submitError, setSubmitError] = useState<string | null>(null)
	const effectivelyPending = isPending || updateHook.isPending

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			description: initialDescription,
			content: initialContent,
			guidance: initialGuidance,
		},
	})

	const toInput = useCallback(
		(values: FormValues): MarkSchemeInput => {
			return {
				marking_method: "level_of_response",
				description: values.description.trim(),
				guidance: values.guidance.trim() || null,
				content: values.content,
				points_total: pointsTotal,
			}
		},
		[pointsTotal],
	)

	useEffect(() => {
		onDraftChange?.(toInput(form.getValues()))
		const subscription = form.watch(() => {
			onDraftChange?.(toInput(form.getValues()))
		})
		return () => subscription.unsubscribe()
	}, [form, onDraftChange, toInput])

	function onSubmit(values: FormValues) {
		setSubmitError(null)
		setSaved(false)

		const input = toInput(values)

		if (paperId) {
			updateHook.mutate(
				{ markSchemeId, questionId: "", input },
				{
					onSuccess: () => {
						setSaved(true)
						onSuccess?.()
					},
					onError: (err) => setSubmitError(err.message),
				},
			)
		} else {
			startTransition(async () => {
				const result = await updateMarkScheme(markSchemeId, input)
				if (!result.ok) {
					setSubmitError(result.error)
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
							{...form.register("description")}
							rows={2}
							disabled={effectivelyPending}
							className="resize-y text-sm"
							onChange={(e) => {
								form.register("description").onChange(e)
								setSaved(false)
							}}
						/>
						<FieldError>
							{form.formState.errors.description?.message}
						</FieldError>
					</Field>

					<Field>
						<FieldLabel>Mark scheme content</FieldLabel>
						<FieldDescription>
							The complete mark scheme as markdown: level descriptors,
							indicative content, exemplar answers, marker notes.
						</FieldDescription>
						<Textarea
							{...form.register("content")}
							rows={16}
							disabled={effectivelyPending}
							placeholder="## Level descriptors&#10;### Level 3 (7–9 marks)&#10;...&#10;&#10;## Indicative content&#10;Answers may include:&#10;- ...&#10;&#10;## Exemplar answer (Level 3)&#10;..."
							className="resize-y text-sm font-mono"
							onChange={(e) => {
								form.register("content").onChange(e)
								setSaved(false)
							}}
						/>
						<FieldError>{form.formState.errors.content?.message}</FieldError>
					</Field>

					<Field>
						<FieldLabel>
							Guidance
							<span className="ml-1 text-xs font-normal text-muted-foreground">
								(optional)
							</span>
						</FieldLabel>
						<Textarea
							{...form.register("guidance")}
							rows={2}
							disabled={effectivelyPending}
							placeholder="Additional guidance for markers…"
							className="resize-y text-sm"
							onChange={(e) => {
								form.register("guidance").onChange(e)
								setSaved(false)
							}}
						/>
					</Field>
				</FieldGroup>

				{submitError && (
					<p className="mt-3 text-sm text-destructive">{submitError}</p>
				)}
			</div>

			<FormFooter
				pending={effectivelyPending}
				saved={saved}
				onCancel={onCancel}
			/>
		</form>
	)
}
