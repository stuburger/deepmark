"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import {
	type LlmModelEntry,
	type LlmProvider,
	MODEL_DEFAULT_TEMPERATURE,
	PROVIDER_MODELS,
} from "@/lib/admin/llm-types"
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, Zap } from "lucide-react"
import { useRef, useState } from "react"

const ALL_MODELS: Array<{
	provider: LlmProvider
	model: string
	label: string
}> = (Object.entries(PROVIDER_MODELS) as [LlmProvider, string[]][]).flatMap(
	([provider, models]) =>
		models.map((model) => ({
			provider,
			model,
			label: `${model}  (${provider})`,
		})),
)

type ModelEntryWithKey = LlmModelEntry & { _key: number }

export function BulkUpdateModelsDialog({
	open,
	onOpenChange,
	onSave,
	isSaving,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	onSave: (models: LlmModelEntry[]) => void
	isSaving: boolean
}) {
	const nextKey = useRef(0)
	const [models, setModels] = useState<ModelEntryWithKey[]>([
		{
			provider: "google",
			model: "gemini-2.5-flash",
			temperature: 0.2,
			_key: nextKey.current++,
		},
	])

	function addModel() {
		setModels((prev) => [
			...prev,
			{
				provider: "google",
				model: "gemini-2.5-flash",
				temperature: 0.2,
				_key: nextKey.current++,
			},
		])
	}

	function removeModel(index: number) {
		setModels((prev) => prev.filter((_, i) => i !== index))
	}

	function moveModel(index: number, direction: -1 | 1) {
		setModels((prev) => {
			const next = [...prev]
			const target = index + direction
			if (target < 0 || target >= next.length) return prev
			const temp = next[index]
			next[index] = next[target]
			next[target] = temp
			return next
		})
	}

	function updateModel(index: number, patch: Partial<LlmModelEntry>) {
		setModels((prev) =>
			prev.map((m, i) => (i !== index ? m : { ...m, ...patch })),
		)
	}

	function selectModel(index: number, value: string) {
		const entry = ALL_MODELS.find((m) => `${m.provider}/${m.model}` === value)
		if (!entry) return
		updateModel(index, {
			provider: entry.provider,
			model: entry.model,
			temperature: MODEL_DEFAULT_TEMPERATURE[entry.model] ?? 0.2,
		})
	}

	function stripKeys(entries: ModelEntryWithKey[]): LlmModelEntry[] {
		return entries.map(({ _key, ...rest }) => rest)
	}

	const canSave =
		models.length > 0 && models.every((m) => m.provider && m.model)

	const hasOpenAi = models.some((m) => m.provider === "openai")

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Bulk Update All Call Sites</DialogTitle>
					<DialogDescription>
						Set the same model chain across all call sites. Configure the
						primary model and optional fallbacks.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					{models.map((model, index) => (
						<div
							key={model._key}
							className="flex items-center gap-2 rounded-lg border bg-muted/20 p-3"
						>
							<Badge
								variant={index === 0 ? "default" : "outline"}
								className="shrink-0 text-xs"
							>
								{index === 0 ? "Primary" : `Fallback ${index}`}
							</Badge>

							<NativeSelect
								size="sm"
								value={`${model.provider}/${model.model}`}
								onChange={(e) => selectModel(index, e.target.value)}
								className="flex-1"
							>
								{ALL_MODELS.map((m) => (
									<option
										key={`${m.provider}/${m.model}`}
										value={`${m.provider}/${m.model}`}
									>
										{m.label}
									</option>
								))}
							</NativeSelect>

							<div className="flex items-center gap-1 shrink-0">
								<label
									className="text-xs text-muted-foreground"
									htmlFor={`bulk-temp-${index}`}
								>
									Temp
								</label>
								{MODEL_DEFAULT_TEMPERATURE[model.model] === null ? (
									<span className="text-[10px] text-muted-foreground/60 w-16 text-center">
										n/a
									</span>
								) : (
									<Input
										id={`bulk-temp-${index}`}
										type="number"
										min={0}
										max={model.provider === "anthropic" ? 1 : 2}
										step={0.1}
										value={model.temperature}
										onChange={(e) =>
											updateModel(index, {
												temperature: Math.min(
													model.provider === "anthropic" ? 1 : 2,
													Math.max(0, Number(e.target.value)),
												),
											})
										}
										className="h-7 w-16 text-xs"
									/>
								)}
							</div>

							<div className="flex items-center gap-0.5 shrink-0">
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => moveModel(index, -1)}
									disabled={index === 0}
									title="Move up"
								>
									<ArrowUp className="h-3 w-3" />
								</Button>
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => moveModel(index, 1)}
									disabled={index === models.length - 1}
									title="Move down"
								>
									<ArrowDown className="h-3 w-3" />
								</Button>
								<Button
									variant="ghost"
									size="icon-xs"
									onClick={() => removeModel(index)}
									disabled={models.length <= 1}
									className="text-muted-foreground hover:text-destructive"
									title="Remove"
								>
									<Trash2 className="h-3 w-3" />
								</Button>
							</div>
						</div>
					))}

					<Button
						variant="outline"
						size="sm"
						onClick={addModel}
						className="w-full"
					>
						<Plus className="h-3.5 w-3.5 mr-1.5" />
						Add fallback
					</Button>
				</div>

				{hasOpenAi && (
					<p className="text-xs text-warning-600">
						OpenAI does not support PDF inputs. PDF call sites will be skipped.
					</p>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={!canSave || isSaving}
						onClick={() => onSave(stripKeys(models))}
					>
						{isSaving ? (
							<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
						) : (
							<Zap className="h-3.5 w-3.5 mr-1.5" />
						)}
						Apply to all call sites
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
