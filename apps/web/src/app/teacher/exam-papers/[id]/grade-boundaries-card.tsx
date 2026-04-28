"use client"

import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { updatePaperSettings } from "@/lib/exam-paper/paper/mutations"
import { queryKeys } from "@/lib/query-keys"
import {
	type BoundaryMode,
	GRADES,
	type GradeBoundary,
	boundariesEqual,
	convertBoundaries,
	getTypicalBoundaries,
	isTieredSubject,
} from "@mcp-gcse/shared"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, Save, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

type Tier = "foundation" | "higher"

type Props = {
	paperId: string
	subject: string
	paperTotal: number
	tier: Tier | null
	boundaries: GradeBoundary[] | null
	mode: BoundaryMode | null
}

function toDraft(boundaries: GradeBoundary[] | null): Record<string, string> {
	const map: Record<string, string> = {}
	for (const g of GRADES) map[g] = ""
	for (const b of boundaries ?? []) map[b.grade] = String(b.min_mark)
	return map
}

function parseDraft(
	draft: Record<string, string>,
	mode: BoundaryMode,
	paperTotal: number,
): GradeBoundary[] | { error: string } {
	const rows: GradeBoundary[] = []
	const upperBound = mode === "percent" ? 100 : Math.max(paperTotal, 1)
	const unitLabel = mode === "percent" ? "%" : "marks"
	for (const g of GRADES) {
		const raw = draft[g] ?? ""
		if (raw === "") return { error: "All 9 grades require a value" }
		const n = Number(raw)
		if (!Number.isFinite(n) || !Number.isInteger(n))
			return { error: `Grade ${g} must be an integer` }
		if (n < 0) return { error: `Grade ${g} must be at least 0 ${unitLabel}` }
		if (n > upperBound)
			return {
				error: `Grade ${g} must be at most ${upperBound} ${unitLabel}`,
			}
		rows.push({ grade: g, min_mark: n })
	}
	for (let i = 0; i < rows.length - 1; i++) {
		if (rows[i].min_mark <= rows[i + 1].min_mark) {
			return { error: "Values must strictly descend from 9 to 1" }
		}
	}
	return rows
}

export function GradeBoundariesCard({
	paperId,
	subject,
	paperTotal,
	tier,
	boundaries,
	mode,
}: Props) {
	const queryClient = useQueryClient()
	const tiered = isTieredSubject(subject)
	const effectiveMode: BoundaryMode = mode ?? "percent"
	const [draft, setDraft] = useState<Record<string, string>>(() =>
		toDraft(boundaries),
	)
	const [validationError, setValidationError] = useState<string | null>(null)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [undoTarget, setUndoTarget] = useState<{
		boundaries: GradeBoundary[] | null
		mode: BoundaryMode | null
	} | null>(null)

	// Resync draft when the server-side boundaries change (Generate, Reset, Clear,
	// or a mode toggle that converted values).
	useEffect(() => {
		setDraft(toDraft(boundaries))
		setValidationError(null)
	}, [boundaries])

	const save = useMutation({
		mutationFn: (input: {
			tier?: Tier | null
			grade_boundaries?: GradeBoundary[] | null
			grade_boundary_mode?: BoundaryMode | null
		}) => updatePaperSettings(paperId, input),
		onSuccess: (result) => {
			if (!result.ok) {
				toast.error(result.error)
				return
			}
			void queryClient.invalidateQueries({
				queryKey: queryKeys.examPaper(paperId),
			})
		},
		onError: () => toast.error("Failed to save grade boundaries"),
	})

	const typicals = getTypicalBoundaries(subject, tier)
	const isTypical =
		boundaries !== null &&
		typicals !== null &&
		effectiveMode === "percent" &&
		boundariesEqual(boundaries, typicals)

	function handleSave() {
		if (!boundaries) return
		const parsed = parseDraft(draft, effectiveMode, paperTotal)
		if ("error" in parsed) {
			setValidationError(parsed.error)
			return
		}
		setValidationError(null)
		if (boundariesEqual(parsed, boundaries)) {
			setDialogOpen(false)
			return
		}
		save.mutate(
			{ grade_boundaries: parsed },
			{
				onSuccess: (result) => {
					if (result.ok) setDialogOpen(false)
				},
			},
		)
	}

	function handleCellChange(grade: string, raw: string) {
		setDraft((prev) => ({ ...prev, [grade]: raw.replace(/[^0-9]/g, "") }))
	}

	function handleOpenChange(nextOpen: boolean) {
		if (!nextOpen) {
			setDraft(toDraft(boundaries))
			setValidationError(null)
		}
		setDialogOpen(nextOpen)
	}

	const savedDraft = toDraft(boundaries)
	const isDirty = GRADES.some((g) => (draft[g] ?? "") !== (savedDraft[g] ?? ""))

	function handleTierChange(next: Tier | null) {
		if (next === tier) return
		save.mutate({ tier: next })
	}

	function handleModeChange(next: BoundaryMode) {
		if (next === effectiveMode) return
		if (!boundaries) {
			save.mutate({ grade_boundary_mode: next })
			return
		}
		if (next === "raw" && paperTotal <= 0) {
			toast.error("Set the paper's total marks before switching to raw")
			return
		}
		const converted = convertBoundaries(
			boundaries,
			effectiveMode,
			next,
			paperTotal,
		)
		save.mutate({
			grade_boundary_mode: next,
			grade_boundaries: converted,
		})
	}

	function generate() {
		const template = getTypicalBoundaries(subject, tier)
		if (!template) {
			toast.error("No typical boundaries available for this subject")
			return
		}
		setUndoTarget({ boundaries, mode })
		save.mutate({
			grade_boundary_mode: "percent",
			grade_boundaries: template,
		})
	}

	function resetToTypical() {
		if (!typicals) return
		save.mutate({
			grade_boundary_mode: "percent",
			grade_boundaries: typicals,
		})
	}

	function clearBoundaries() {
		save.mutate({ grade_boundaries: null, grade_boundary_mode: null })
	}

	function undoGenerate() {
		if (undoTarget === null) return
		save.mutate({
			grade_boundaries: undoTarget.boundaries,
			grade_boundary_mode: undoTarget.mode,
		})
		setUndoTarget(null)
	}

	useEffect(() => {
		if (undoTarget === null) return
		const t = setTimeout(() => setUndoTarget(null), 5000)
		return () => clearTimeout(t)
	}, [undoTarget])

	const saving = save.isPending
	const rawModeDisabled = paperTotal <= 0
	const unitLabel = effectiveMode === "percent" ? "%" : `/ ${paperTotal}`

	return (
		<>
			{/* Inline trigger — just the rail (or a "Set up" prompt when empty) */}
			<button
				type="button"
				onClick={() => setDialogOpen(true)}
				className="mx-auto block w-full max-w-4xl rounded-md py-2 text-left transition-colors hover:bg-muted/40"
			>
				<div className="mb-1 flex items-center gap-2">
					<span className="text-xs font-medium text-muted-foreground">
						Levels
					</span>
					{saving && (
						<Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
					)}
				</div>
				{boundaries ? (
					<BoundaryTimeline
						boundaries={boundaries}
						mode={effectiveMode}
						paperTotal={paperTotal}
					/>
				) : (
					<p className="text-xs text-muted-foreground">+ Set up levels</p>
				)}
			</button>

			<Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Levels</DialogTitle>
					</DialogHeader>

					<div className="space-y-4 pt-2">
						<div className="flex items-center justify-end gap-2 flex-wrap">
							{tiered && (
								<ToggleGroup
									value={tier ? [tier] : []}
									onValueChange={(values) => {
										const next = values[0]
										handleTierChange(
											next === "foundation" || next === "higher" ? next : null,
										)
									}}
									variant="outline"
									size="sm"
								>
									<ToggleGroupItem value="foundation">
										Foundation
									</ToggleGroupItem>
									<ToggleGroupItem value="higher">Higher</ToggleGroupItem>
								</ToggleGroup>
							)}
							<ToggleGroup
								value={[effectiveMode]}
								onValueChange={(values) => {
									const next = values[0]
									if (next === "percent" || next === "raw")
										handleModeChange(next)
								}}
								variant="outline"
								size="sm"
								title={
									rawModeDisabled
										? "Set the paper's total marks to enable raw mode"
										: undefined
								}
							>
								<ToggleGroupItem value="percent">%</ToggleGroupItem>
								<ToggleGroupItem value="raw" disabled={rawModeDisabled}>
									Raw
								</ToggleGroupItem>
							</ToggleGroup>
						</div>

						{boundaries ? (
							<PopulatedRow
								draft={draft}
								validationError={validationError}
								unitLabel={unitLabel}
								onCellChange={handleCellChange}
								onSubmit={handleSave}
								disabled={saving}
							/>
						) : (
							<EmptyState
								tier={tier}
								tiered={tiered}
								hasTemplate={typicals !== null}
								onGenerate={generate}
								onEnterManually={() => {
									const upper = effectiveMode === "percent" ? 90 : paperTotal
									const step = upper / 9
									const seeded: GradeBoundary[] = GRADES.map((g, i) => ({
										grade: g,
										min_mark: Math.max(0, Math.round(upper - i * step)),
									}))
									save.mutate({ grade_boundaries: seeded })
								}}
								disabled={saving}
							/>
						)}

						{boundaries && (
							<div className="flex items-center justify-end gap-1">
								{undoTarget !== null && (
									<Button variant="ghost" size="sm" onClick={undoGenerate}>
										Undo generate
									</Button>
								)}
								{!isTypical && typicals !== null && (
									<Button variant="ghost" size="sm" onClick={resetToTypical}>
										Reset to typical
									</Button>
								)}
								<Button
									variant="ghost"
									size="sm"
									className="text-muted-foreground hover:text-destructive"
									onClick={clearBoundaries}
								>
									Clear
								</Button>
							</div>
						)}
					</div>

					{boundaries && (
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => handleOpenChange(false)}
								disabled={saving}
							>
								Cancel
							</Button>
							<Button
								onClick={handleSave}
								disabled={!isDirty || saving}
							>
								<Save className="h-3.5 w-3.5 mr-1.5" />
								{saving ? "Saving…" : "Save"}
							</Button>
						</DialogFooter>
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}

function PopulatedRow({
	draft,
	validationError,
	unitLabel,
	onCellChange,
	onSubmit,
	disabled,
}: {
	draft: Record<string, string>
	validationError: string | null
	unitLabel: string
	onCellChange: (grade: string, value: string) => void
	onSubmit: () => void
	disabled: boolean
}) {
	return (
		<div className="space-y-1">
			<div className="grid grid-cols-9 gap-1.5">
				{GRADES.map((g) => (
					<div key={g} className="flex flex-col items-center gap-1">
						<span className="text-xs font-medium text-muted-foreground tabular-nums">
							{g}
						</span>
						<Input
							inputMode="numeric"
							value={draft[g] ?? ""}
							onChange={(e) => onCellChange(g, e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault()
									onSubmit()
								}
							}}
							disabled={disabled}
							className="h-8 text-center tabular-nums px-1"
							aria-label={`Grade ${g} minimum ${unitLabel}`}
						/>
					</div>
				))}
			</div>
			<p className="text-[11px] text-muted-foreground text-right tabular-nums">
				{unitLabel}
			</p>
			{validationError ? (
				<p className="text-xs text-destructive">{validationError}</p>
			) : null}
		</div>
	)
}

function BoundaryTimeline({
	boundaries,
	mode,
	paperTotal,
}: {
	boundaries: GradeBoundary[]
	mode: BoundaryMode
	paperTotal: number
}) {
	const upper = mode === "percent" ? 100 : Math.max(paperTotal, 1)
	const labelSuffix = mode === "percent" ? "%" : ""

	const sorted = [...boundaries].sort((a, b) => a.min_mark - b.min_mark)

	return (
		<div className="px-2 pt-2 pb-1">
			<div className="relative h-9">
				<div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gradient-to-r from-red-500/25 via-amber-500/30 to-emerald-500/45" />

				{sorted.map((b) => {
					const pct = Math.min(100, Math.max(0, (b.min_mark / upper) * 100))
					return (
						<div
							key={b.grade}
							className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5"
							style={{ left: `${pct}%` }}
						>
							<span className="text-[10px] font-semibold tabular-nums leading-none rounded px-1 py-0.5 bg-background border shadow-sm">
								{b.grade}
							</span>
							<span className="h-1 w-px bg-foreground/50" />
							<span className="text-[10px] font-medium text-muted-foreground tabular-nums leading-none">
								{b.min_mark}
								{labelSuffix}
							</span>
						</div>
					)
				})}
			</div>
			<div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
				<span>0</span>
				<span>{mode === "percent" ? "100%" : paperTotal}</span>
			</div>
		</div>
	)
}

function EmptyState({
	tier,
	tiered,
	hasTemplate,
	onGenerate,
	onEnterManually,
	disabled,
}: {
	tier: Tier | null
	tiered: boolean
	hasTemplate: boolean
	onGenerate: () => void
	onEnterManually: () => void
	disabled: boolean
}) {
	const needsTier = tiered && tier === null

	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs text-muted-foreground">
				{needsTier
					? "Pick a tier above, then generate typical boundaries — or enter your own."
					: "Generate typical GCSE boundaries as a starting point — you can edit any value or switch to raw marks after."}
			</p>
			<div className="flex items-center gap-2 flex-wrap">
				<Button
					size="sm"
					onClick={onGenerate}
					disabled={disabled || needsTier || !hasTemplate}
				>
					<Sparkles className="h-3.5 w-3.5" />
					{tier
						? `Generate typical ${tier === "higher" ? "Higher" : "Foundation"} boundaries`
						: "Generate typical boundaries"}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={onEnterManually}
					disabled={disabled}
				>
					Enter manually
				</Button>
			</div>
		</div>
	)
}
