"use client"

import { Button } from "@/components/ui/button"
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { updateMarkScheme } from "@/lib/mark-scheme/manual"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useUpdateMarkScheme } from "../../hooks/use-exam-paper-mutations"

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
	paperId?: string
}

// ── Component ───────────────────────────────────────────────────────────────

export function LorMarkSchemeEditForm({
	markSchemeId,
	initialDescription,
	initialGuidance,
	initialContent,
	pointsTotal,
	onSuccess,
	paperId,
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

	function onSubmit(values: FormValues) {
		setSubmitError(null)
		setSaved(false)

		const input = {
			marking_method: "level_of_response" as const,
			description: values.description.trim(),
			guidance: values.guidance.trim() || null,
			content: values.content,
			points_total: pointsTotal,
		}

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
		<form onSubmit={form.handleSubmit(onSubmit)}>
			<FieldGroup>
				<Field>
					<FieldLabel>Mark scheme content</FieldLabel>
					<FieldDescription>
						The complete mark scheme as markdown: level descriptors, indicative
						content, exemplar answers, marker notes.
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
					<FieldError>{form.formState.errors.description?.message}</FieldError>
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

			<div className="mt-4 flex items-center gap-3">
				<Button type="submit" size="sm" disabled={effectivelyPending}>
					{effectivelyPending ? (
						<>
							<Spinner className="h-3.5 w-3.5 mr-1.5" />
							Saving…
						</>
					) : (
						"Save changes"
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
