"use client"

import { Button } from "@/components/ui/button"
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import {
	type MarkingRulesInput,
	updateMarkScheme,
} from "@/lib/mark-scheme/manual"
import { zodResolver } from "@hookform/resolvers/zod"
import { CheckCircle2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useFieldArray, useForm } from "react-hook-form"
import { z } from "zod/v4"
import { useUpdateMarkScheme } from "../../hooks/use-exam-paper-mutations"
import { CapBlock } from "./cap-block"
import { LevelBlock } from "./level-block"

// ── Schema ──────────────────────────────────────────────────────────────────

const levelSchema = z.object({
	level: z.number().int().min(1, "Level must be at least 1"),
	minMark: z.number().int().min(0, "Min mark must be non-negative"),
	maxMark: z.number().int().min(0, "Max mark must be non-negative"),
	descriptor: z.string().min(1, "Descriptor is required"),
	aoRequirementsText: z.string(),
})

const capSchema = z
	.object({
		condition: z.string().min(1, "Condition is required"),
		maxLevel: z.string(),
		maxMark: z.string(),
		reason: z.string().min(1, "Reason is required"),
	})
	.refine((cap) => cap.maxLevel.trim() !== "" || cap.maxMark.trim() !== "", {
		message: "Each cap needs a max level or max mark",
	})
	.refine((cap) => !(cap.maxLevel.trim() !== "" && cap.maxMark.trim() !== ""), {
		message: "Use either max level or max mark, not both",
	})

const formSchema = z
	.object({
		description: z.string().min(1, "Description is required"),
		guidance: z.string(),
		commandWord: z.string(),
		itemsRequired: z.string(),
		levels: z.array(levelSchema).min(1, "At least one level is required"),
		caps: z.array(capSchema),
	})
	.refine((data) => data.levels.every((l) => l.minMark <= l.maxMark), {
		message: "Min mark must not exceed max mark",
		path: ["levels"],
	})

type FormValues = z.infer<typeof formSchema>

// ── Props ───────────────────────────────────────────────────────────────────

type Props = {
	markSchemeId: string
	initialDescription: string
	initialGuidance: string
	onSuccess?: () => void
	paperId?: string
	initialMarkingRules: {
		command_word?: string
		items_required?: number
		levels?: Array<{
			level: number
			mark_range: [number, number]
			descriptor: string
			ao_requirements?: string[]
		}>
		caps?: Array<{
			condition: string
			max_level?: number
			max_mark?: number
			reason: string
		}>
	} | null
}

// ── Component ───────────────────────────────────────────────────────────────

export function LorMarkSchemeEditForm({
	markSchemeId,
	initialDescription,
	initialGuidance,
	onSuccess,
	paperId,
	initialMarkingRules,
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
			guidance: initialGuidance,
			commandWord: initialMarkingRules?.command_word ?? "",
			itemsRequired:
				initialMarkingRules?.items_required != null
					? String(initialMarkingRules.items_required)
					: "",
			levels: (() => {
				const init = initialMarkingRules?.levels ?? []
				if (init.length > 0) {
					return init.map((l) => ({
						level: l.level,
						minMark: l.mark_range[0],
						maxMark: l.mark_range[1],
						descriptor: l.descriptor,
						aoRequirementsText: (l.ao_requirements ?? []).join("\n"),
					}))
				}
				return [
					{
						level: 1,
						minMark: 1,
						maxMark: 1,
						descriptor: "",
						aoRequirementsText: "",
					},
				]
			})(),
			caps: (initialMarkingRules?.caps ?? []).map((cap) => ({
				condition: cap.condition,
				maxLevel: cap.max_level != null ? String(cap.max_level) : "",
				maxMark: cap.max_mark != null ? String(cap.max_mark) : "",
				reason: cap.reason,
			})),
		},
	})

	const levelFields = useFieldArray({ control: form.control, name: "levels" })
	const capFields = useFieldArray({ control: form.control, name: "caps" })

	function onSubmit(values: FormValues) {
		setSubmitError(null)
		setSaved(false)

		const parsedItemsRequired =
			values.itemsRequired.trim() === ""
				? undefined
				: Number.parseInt(values.itemsRequired, 10)

		const parsedLevels = values.levels.map((row) => {
			const aoRequirements = row.aoRequirementsText
				.split("\n")
				.map((item) => item.trim())
				.filter(Boolean)
			return {
				level: row.level,
				mark_range: [row.minMark, row.maxMark] as [number, number],
				descriptor: row.descriptor.trim(),
				...(aoRequirements.length > 0
					? { ao_requirements: aoRequirements }
					: {}),
			}
		})

		const parsedCaps = values.caps.map((cap) => {
			const maxLevel =
				cap.maxLevel.trim() === ""
					? undefined
					: Number.parseInt(cap.maxLevel, 10)
			const maxMark =
				cap.maxMark.trim() === "" ? undefined : Number.parseInt(cap.maxMark, 10)
			return {
				condition: cap.condition.trim(),
				reason: cap.reason.trim(),
				...(maxLevel != null ? { max_level: maxLevel } : {}),
				...(maxMark != null ? { max_mark: maxMark } : {}),
			}
		})

		const markingRules: MarkingRulesInput = {
			...(values.commandWord.trim()
				? { command_word: values.commandWord.trim() }
				: {}),
			...(parsedItemsRequired != null
				? { items_required: parsedItemsRequired }
				: {}),
			levels: parsedLevels,
			...(parsedCaps.length > 0 ? { caps: parsedCaps } : {}),
		}

		const input = {
			marking_method: "level_of_response" as const,
			description: values.description.trim(),
			guidance: values.guidance.trim() || null,
			marking_rules: markingRules,
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
					<FieldLabel>Description</FieldLabel>
					<Textarea
						{...form.register("description")}
						rows={3}
						disabled={effectivelyPending}
						className="resize-y text-sm"
						onChange={(e) => {
							form.register("description").onChange(e)
							setSaved(false)
						}}
					/>
					<FieldError>{form.formState.errors.description?.message}</FieldError>
				</Field>

				<div className="grid grid-cols-2 gap-4">
					<Field>
						<FieldLabel>Command word</FieldLabel>
						<Input
							{...form.register("commandWord")}
							disabled={effectivelyPending}
							placeholder="e.g. Explain"
							onChange={(e) => {
								form.register("commandWord").onChange(e)
								setSaved(false)
							}}
						/>
					</Field>
					<Field>
						<FieldLabel>Items required</FieldLabel>
						<Input
							{...form.register("itemsRequired")}
							type="number"
							min={0}
							disabled={effectivelyPending}
							placeholder="optional"
							onChange={(e) => {
								form.register("itemsRequired").onChange(e)
								setSaved(false)
							}}
						/>
					</Field>
				</div>

				<Field>
					<FieldLabel>Levels</FieldLabel>
					<FieldDescription>
						Define mark bands and descriptors used by the LOR marker.
					</FieldDescription>
					<div className="space-y-3">
						{levelFields.fields.map((field, i) => (
							<LevelBlock
								key={field.id}
								row={{
									level: String(form.watch(`levels.${i}.level`)),
									minMark: String(form.watch(`levels.${i}.minMark`)),
									maxMark: String(form.watch(`levels.${i}.maxMark`)),
									descriptor: form.watch(`levels.${i}.descriptor`),
									aoRequirementsText: form.watch(
										`levels.${i}.aoRequirementsText`,
									),
								}}
								index={i}
								disabled={effectivelyPending}
								isOnly={levelFields.fields.length <= 1}
								onChange={(key, value) => {
									switch (key) {
										case "level":
											form.setValue(
												`levels.${i}.level`,
												Number.parseInt(value, 10) || 0,
											)
											break
										case "minMark":
											form.setValue(
												`levels.${i}.minMark`,
												Number.parseInt(value, 10) || 0,
											)
											break
										case "maxMark":
											form.setValue(
												`levels.${i}.maxMark`,
												Number.parseInt(value, 10) || 0,
											)
											break
										case "descriptor":
											form.setValue(`levels.${i}.descriptor`, value)
											break
										case "aoRequirementsText":
											form.setValue(`levels.${i}.aoRequirementsText`, value)
											break
									}
									setSaved(false)
								}}
								onRemove={() => {
									levelFields.remove(i)
									setSaved(false)
								}}
							/>
						))}
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							levelFields.append({
								level: levelFields.fields.length + 1,
								minMark: 0,
								maxMark: 0,
								descriptor: "",
								aoRequirementsText: "",
							})
							setSaved(false)
						}}
						disabled={effectivelyPending}
						className="mt-2"
					>
						<Plus className="h-3.5 w-3.5 mr-1.5" />
						Add level
					</Button>
					<FieldError>{form.formState.errors.levels?.message}</FieldError>
				</Field>

				<Field>
					<FieldLabel>Caps (optional)</FieldLabel>
					<div className="space-y-3">
						{capFields.fields.map((field, i) => (
							<CapBlock
								key={field.id}
								cap={{
									condition: form.watch(`caps.${i}.condition`),
									maxLevel: form.watch(`caps.${i}.maxLevel`),
									maxMark: form.watch(`caps.${i}.maxMark`),
									reason: form.watch(`caps.${i}.reason`),
								}}
								index={i}
								disabled={effectivelyPending}
								onChange={(key, value) => {
									form.setValue(`caps.${i}.${key}`, value)
									setSaved(false)
								}}
								onRemove={() => {
									capFields.remove(i)
									setSaved(false)
								}}
							/>
						))}
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => {
							capFields.append({
								condition: "",
								maxLevel: "",
								maxMark: "",
								reason: "",
							})
							setSaved(false)
						}}
						disabled={effectivelyPending}
						className="mt-2"
					>
						<Plus className="h-3.5 w-3.5 mr-1.5" />
						Add cap
					</Button>
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
