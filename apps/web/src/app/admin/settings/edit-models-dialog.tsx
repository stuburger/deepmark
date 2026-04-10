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
import type {
	LlmCallSiteRow,
	LlmModelEntry,
	LlmProvider,
} from "@/lib/admin/llm-types"
import { PROVIDER_MODELS } from "@/lib/admin/llm-types"
import {
	ArrowDown,
	ArrowUp,
	Loader2,
	Plus,
	RotateCcw,
	Trash2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

const PROVIDERS: LlmProvider[] = ["google", "openai", "anthropic"]

type ModelEntryWithKey = LlmModelEntry & { _key: number }

export function EditModelsDialog({
	callSite,
	open,
	onOpenChange,
	onSave,
	onReset,
	isSaving,
	isResetting,
}: {
	callSite: LlmCallSiteRow
	open: boolean
	onOpenChange: (open: boolean) => void
	onSave: (models: LlmModelEntry[]) => void
	onReset: () => void
	isSaving: boolean
	isResetting: boolean
}) {
	const nextKey = useRef(0)
	function withKeys(entries: LlmModelEntry[]): ModelEntryWithKey[] {
		return entries.map((m) => ({ ...m, _key: nextKey.current++ }))
	}

	const [models, setModels] = useState<ModelEntryWithKey[]>(() =>
		withKeys(callSite.models),
	)

	// Reset local state when the dialog opens with a different call site
	useEffect(() => {
		setModels(callSite.models.map((m) => ({ ...m, _key: nextKey.current++ })))
	}, [callSite.models])

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
			prev.map((m, i) => {
				if (i !== index) return m
				const updated = { ...m, ...patch }
				// When provider changes, reset to first available model for that provider
				if (patch.provider && patch.provider !== m.provider) {
					const availableModels = PROVIDER_MODELS[patch.provider]
					updated.model = availableModels?.[0] ?? ""
				}
				return updated
			}),
		)
	}

	function stripKeys(entries: ModelEntryWithKey[]): LlmModelEntry[] {
		return entries.map(({ _key, ...rest }) => rest)
	}

	const canSave =
		models.length > 0 && models.every((m) => m.provider && m.model)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>{callSite.display_name}</DialogTitle>
					<DialogDescription>
						{callSite.description ??
							"Configure the model fallback chain for this call site."}
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
								value={model.provider}
								onChange={(e) =>
									updateModel(index, {
										provider: e.target.value as LlmProvider,
									})
								}
							>
								{PROVIDERS.map((p) => (
									<option key={p} value={p}>
										{p}
									</option>
								))}
							</NativeSelect>

							<NativeSelect
								size="sm"
								value={model.model}
								onChange={(e) => updateModel(index, { model: e.target.value })}
								className="flex-1"
							>
								{(PROVIDER_MODELS[model.provider] ?? []).map((m) => (
									<option key={m} value={m}>
										{m}
									</option>
								))}
							</NativeSelect>

							<div className="flex items-center gap-1 shrink-0">
								<label
									className="text-xs text-muted-foreground"
									htmlFor={`temp-${index}`}
								>
									Temp
								</label>
								<Input
									id={`temp-${index}`}
									type="number"
									min={0}
									max={2}
									step={0.1}
									value={model.temperature}
									onChange={(e) =>
										updateModel(index, {
											temperature: Math.min(
												2,
												Math.max(0, Number(e.target.value)),
											),
										})
									}
									className="h-7 w-16 text-xs"
								/>
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

				<DialogFooter className="flex items-center justify-between sm:justify-between">
					<Button
						variant="ghost"
						size="sm"
						onClick={onReset}
						disabled={isResetting}
						className="text-muted-foreground"
					>
						{isResetting ? (
							<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
						) : (
							<RotateCcw className="h-3.5 w-3.5 mr-1.5" />
						)}
						Reset to defaults
					</Button>
					<div className="flex items-center gap-2">
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
							{isSaving && (
								<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
							)}
							Save
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
