"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
import { CheckCircle2, GraduationCap, Loader2, Sparkles } from "lucide-react"
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
	const isCustomised =
		boundaries !== null &&
		typicals !== null &&
		effectiveMode === "percent" &&
		!boundariesEqual(boundaries, typicals)
	const isTypical =
		boundaries !== null &&
		typicals !== null &&
		effectiveMode === "percent" &&
		!isCustomised

	function handleCellBlur() {
		if (!boundaries) return
		const parsed = parseDraft(draft, effectiveMode, paperTotal)
		if ("error" in parsed) {
			setValidationError(parsed.error)
			return
		}
		setValidationError(null)
		if (boundariesEqual(parsed, boundaries)) return
		save.mutate({ grade_boundaries: parsed })
	}

	function handleCellChange(grade: string, raw: string) {
		setDraft((prev) => ({ ...prev, [grade]: raw.replace(/[^0-9]/g, "") }))
	}

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
		// Typical templates are percent-based — align mode accordingly.
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

	const statusBadge = (() => {
		if (saving)
			return (
				<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
					<Loader2 className="h-3 w-3 animate-spin" />
					Saving…
				</span>
			)
		if (isTypical)
			return (
				<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
					<CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
					typical {tier ?? ""}
				</span>
			)
		if (isCustomised)
			return (
				<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
					<CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
					customised
				</span>
			)
		if (boundaries !== null)
			return (
				<span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
					<CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
					{effectiveMode === "raw" ? "raw marks" : "custom"}
				</span>
			)
		return <span className="text-xs text-muted-foreground italic">not set</span>
	})()

	const unitLabel = effectiveMode === "percent" ? "%" : `/ ${paperTotal}`

	return (
		<Card>
			<CardContent className="pt-4 space-y-3">
				<div className="flex items-center justify-between gap-3 flex-wrap">
					<div className="flex items-center gap-2">
						<GraduationCap className="h-4 w-4 text-muted-foreground" />
						<p className="text-sm font-medium">Grade boundaries</p>
						{statusBadge}
					</div>

					<div className="flex items-center gap-2 shrink-0">
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
								<ToggleGroupItem value="foundation">Foundation</ToggleGroupItem>
								<ToggleGroupItem value="higher">Higher</ToggleGroupItem>
							</ToggleGroup>
						)}
						<ToggleGroup
							value={[effectiveMode]}
							onValueChange={(values) => {
								const next = values[0]
								if (next === "percent" || next === "raw") handleModeChange(next)
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
				</div>

				{boundaries ? (
					<PopulatedRow
						draft={draft}
						validationError={validationError}
						unitLabel={unitLabel}
						onCellChange={handleCellChange}
						onCellBlur={handleCellBlur}
						disabled={saving}
					/>
				) : (
					<EmptyState
						tier={tier}
						tiered={tiered}
						hasTemplate={typicals !== null}
						onGenerate={generate}
						onEnterManually={() => {
							// Seed a sensible descending placeholder based on current mode.
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
					<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
						<span>
							{isTypical
								? "Typical values — edit any cell to customise."
								: isCustomised
									? "Verify against your board's published boundaries."
									: effectiveMode === "raw"
										? `Raw marks out of ${paperTotal}. Higher grade wins at exact thresholds.`
										: "Enter each grade's minimum percentage."}
						</span>
						<div className="flex items-center gap-1">
							{undoTarget !== null && (
								<Button variant="ghost" size="xs" onClick={undoGenerate}>
									Undo generate
								</Button>
							)}
							{!isTypical && typicals !== null && (
								<Button variant="ghost" size="xs" onClick={resetToTypical}>
									Reset to typical
								</Button>
							)}
							<Button
								variant="ghost"
								size="xs"
								className="text-muted-foreground hover:text-destructive"
								onClick={clearBoundaries}
							>
								Clear
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}

function PopulatedRow({
	draft,
	validationError,
	unitLabel,
	onCellChange,
	onCellBlur,
	disabled,
}: {
	draft: Record<string, string>
	validationError: string | null
	unitLabel: string
	onCellChange: (grade: string, value: string) => void
	onCellBlur: () => void
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
							onBlur={onCellBlur}
							onKeyDown={(e) => {
								if (e.key === "Enter") e.currentTarget.blur()
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
