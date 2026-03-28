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
} from "@/lib/dashboard-actions"
import { CheckCircle2, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useUpdateMarkScheme } from "../../hooks/use-exam-paper-mutations"

type LevelRow = {
	level: string
	minMark: string
	maxMark: string
	descriptor: string
	aoRequirementsText: string
}

type CapRow = {
	condition: string
	maxLevel: string
	maxMark: string
	reason: string
}

type Props = {
	markSchemeId: string
	initialDescription: string
	initialGuidance: string
	onSuccess?: () => void
	/** When provided, enables optimistic cache updates on the exam paper query. */
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

	const [description, setDescription] = useState(initialDescription)
	const [guidance, setGuidance] = useState(initialGuidance)
	const [commandWord, setCommandWord] = useState(
		initialMarkingRules?.command_word ?? "",
	)
	const [itemsRequired, setItemsRequired] = useState(
		initialMarkingRules?.items_required != null
			? String(initialMarkingRules.items_required)
			: "",
	)
	const [levels, setLevels] = useState<LevelRow[]>(() => {
		const initialLevels = initialMarkingRules?.levels ?? []
		if (initialLevels.length > 0) {
			return initialLevels.map((level) => ({
				level: String(level.level),
				minMark: String(level.mark_range[0]),
				maxMark: String(level.mark_range[1]),
				descriptor: level.descriptor,
				aoRequirementsText: (level.ao_requirements ?? []).join("\n"),
			}))
		}
		return [
			{
				level: "1",
				minMark: "1",
				maxMark: "1",
				descriptor: "",
				aoRequirementsText: "",
			},
		]
	})
	const [caps, setCaps] = useState<CapRow[]>(() => {
		const initialCaps = initialMarkingRules?.caps ?? []
		return initialCaps.map((cap) => ({
			condition: cap.condition,
			maxLevel: cap.max_level != null ? String(cap.max_level) : "",
			maxMark: cap.max_mark != null ? String(cap.max_mark) : "",
			reason: cap.reason,
		}))
	})

	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState(false)
	const effectivelyPending = isPending || updateHook.isPending

	function updateLevel(index: number, key: keyof LevelRow, value: string) {
		setLevels((prev) =>
			prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
		)
		setSaved(false)
	}

	function addLevel() {
		setLevels((prev) => [
			...prev,
			{
				level: String(prev.length + 1),
				minMark: "",
				maxMark: "",
				descriptor: "",
				aoRequirementsText: "",
			},
		])
		setSaved(false)
	}

	function removeLevel(index: number) {
		setLevels((prev) => prev.filter((_, i) => i !== index))
		setSaved(false)
	}

	function updateCap(index: number, key: keyof CapRow, value: string) {
		setCaps((prev) =>
			prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
		)
		setSaved(false)
	}

	function addCap() {
		setCaps((prev) => [
			...prev,
			{ condition: "", maxLevel: "", maxMark: "", reason: "" },
		])
		setSaved(false)
	}

	function removeCap(index: number) {
		setCaps((prev) => prev.filter((_, i) => i !== index))
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

		if (levels.length === 0) {
			setError("At least one level descriptor is required")
			return
		}

		const parsedItemsRequired =
			itemsRequired.trim() === ""
				? undefined
				: Number.parseInt(itemsRequired, 10)
		if (
			parsedItemsRequired != null &&
			(Number.isNaN(parsedItemsRequired) || parsedItemsRequired < 0)
		) {
			setError("Items required must be a non-negative number")
			return
		}

		const parsedLevels = []
		for (const row of levels) {
			const levelNum = Number.parseInt(row.level, 10)
			const min = Number.parseInt(row.minMark, 10)
			const max = Number.parseInt(row.maxMark, 10)
			const descriptor = row.descriptor.trim()

			if (
				Number.isNaN(levelNum) ||
				Number.isNaN(min) ||
				Number.isNaN(max) ||
				!descriptor
			) {
				setError("Each level needs a level number, mark range, and descriptor")
				return
			}
			if (levelNum < 1 || min < 0 || max < 0 || min > max) {
				setError("Level numbers and mark ranges are invalid")
				return
			}

			const aoRequirements = row.aoRequirementsText
				.split("\n")
				.map((item) => item.trim())
				.filter(Boolean)

			parsedLevels.push({
				level: levelNum,
				mark_range: [min, max] as [number, number],
				descriptor,
				...(aoRequirements.length > 0
					? { ao_requirements: aoRequirements }
					: {}),
			})
		}

		const parsedCaps = []
		for (const cap of caps) {
			const condition = cap.condition.trim()
			const reason = cap.reason.trim()
			const maxLevel =
				cap.maxLevel.trim() === ""
					? undefined
					: Number.parseInt(cap.maxLevel, 10)
			const maxMark =
				cap.maxMark.trim() === "" ? undefined : Number.parseInt(cap.maxMark, 10)

			if (!condition || !reason) {
				setError("Each cap needs both a condition and reason")
				return
			}
			if (maxLevel == null && maxMark == null) {
				setError("Each cap needs a max level or max mark")
				return
			}
			if (maxLevel != null && maxMark != null) {
				setError("Use either max level or max mark for each cap, not both")
				return
			}
			if ((maxLevel != null && Number.isNaN(maxLevel)) || maxLevel === 0) {
				setError("Cap max level must be a positive number")
				return
			}
			if (
				(maxMark != null && Number.isNaN(maxMark)) ||
				(maxMark != null && maxMark < 0)
			) {
				setError("Cap max mark must be a non-negative number")
				return
			}

			parsedCaps.push({
				condition,
				reason,
				...(maxLevel != null ? { max_level: maxLevel } : {}),
				...(maxMark != null ? { max_mark: maxMark } : {}),
			})
		}

		const markingRules: MarkingRulesInput = {
			...(commandWord.trim() ? { command_word: commandWord.trim() } : {}),
			...(parsedItemsRequired != null
				? { items_required: parsedItemsRequired }
				: {}),
			levels: parsedLevels,
			...(parsedCaps.length > 0 ? { caps: parsedCaps } : {}),
		}

		const input = {
			marking_method: "level_of_response" as const,
			description: trimmedDescription,
			guidance: guidance.trim() || null,
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
					onError: (err) => setError(err.message),
				},
			)
		} else {
			startTransition(async () => {
				const result = await updateMarkScheme(markSchemeId, input)
				if (!result.ok) {
					setError(result.error)
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
						className="resize-y text-sm"
					/>
				</Field>

				<div className="grid grid-cols-2 gap-4">
					<Field>
						<FieldLabel>Command word</FieldLabel>
						<Input
							value={commandWord}
							onChange={(e) => {
								setCommandWord(e.target.value)
								setSaved(false)
							}}
							disabled={effectivelyPending}
							placeholder="e.g. Explain"
						/>
					</Field>
					<Field>
						<FieldLabel>Items required</FieldLabel>
						<Input
							type="number"
							min={0}
							value={itemsRequired}
							onChange={(e) => {
								setItemsRequired(e.target.value)
								setSaved(false)
							}}
							disabled={effectivelyPending}
							placeholder="optional"
						/>
					</Field>
				</div>

				<Field>
					<FieldLabel>Levels</FieldLabel>
					<FieldDescription>
						Define mark bands and descriptors used by the LOR marker.
					</FieldDescription>
					<div className="space-y-3">
						{levels.map((row, i) => (
							<div key={i} className="rounded-md border p-3 space-y-3">
								<div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
									<Input
										type="number"
										min={1}
										value={row.level}
										onChange={(e) => updateLevel(i, "level", e.target.value)}
										disabled={effectivelyPending}
										placeholder="Level"
									/>
									<Input
										type="number"
										min={0}
										value={row.minMark}
										onChange={(e) => updateLevel(i, "minMark", e.target.value)}
										disabled={effectivelyPending}
										placeholder="Min mark"
									/>
									<Input
										type="number"
										min={0}
										value={row.maxMark}
										onChange={(e) => updateLevel(i, "maxMark", e.target.value)}
										disabled={effectivelyPending}
										placeholder="Max mark"
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										onClick={() => removeLevel(i)}
										disabled={effectivelyPending || levels.length <= 1}
										className="text-muted-foreground hover:text-destructive"
									>
										<Trash2 className="h-4 w-4" />
									</Button>
								</div>
								<Textarea
									value={row.descriptor}
									onChange={(e) => updateLevel(i, "descriptor", e.target.value)}
									disabled={effectivelyPending}
									rows={3}
									placeholder="Level descriptor"
									className="resize-y text-sm"
								/>
								<Textarea
									value={row.aoRequirementsText}
									onChange={(e) =>
										updateLevel(i, "aoRequirementsText", e.target.value)
									}
									disabled={effectivelyPending}
									rows={2}
									placeholder="AO requirements (one per line, optional)"
									className="resize-y text-sm"
								/>
							</div>
						))}
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={addLevel}
						disabled={effectivelyPending}
						className="mt-2"
					>
						<Plus className="h-3.5 w-3.5 mr-1.5" />
						Add level
					</Button>
				</Field>

				<Field>
					<FieldLabel>Caps (optional)</FieldLabel>
					<div className="space-y-3">
						{caps.map((cap, i) => (
							<div key={i} className="rounded-md border p-3 space-y-2">
								<Input
									value={cap.condition}
									onChange={(e) => updateCap(i, "condition", e.target.value)}
									disabled={effectivelyPending}
									placeholder="Condition"
								/>
								<div className="grid grid-cols-2 gap-2">
									<Input
										type="number"
										min={1}
										value={cap.maxLevel}
										onChange={(e) => updateCap(i, "maxLevel", e.target.value)}
										disabled={effectivelyPending}
										placeholder="Max level (or leave blank)"
									/>
									<Input
										type="number"
										min={0}
										value={cap.maxMark}
										onChange={(e) => updateCap(i, "maxMark", e.target.value)}
										disabled={effectivelyPending}
										placeholder="Max mark (or leave blank)"
									/>
								</div>
								<Input
									value={cap.reason}
									onChange={(e) => updateCap(i, "reason", e.target.value)}
									disabled={effectivelyPending}
									placeholder="Reason"
								/>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => removeCap(i)}
									disabled={effectivelyPending}
									className="text-muted-foreground hover:text-destructive"
								>
									<Trash2 className="h-4 w-4 mr-1.5" />
									Remove cap
								</Button>
							</div>
						))}
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={addCap}
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

				<FieldError>{error}</FieldError>
			</FieldGroup>

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
