"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { updatePaperSettings } from "@/lib/exam-paper/paper/mutations"
import { queryKeys } from "@/lib/query-keys"
import {
	GRADES,
	type GradeBoundary,
	boundariesEqual,
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
	tier: Tier | null
	boundaries: GradeBoundary[] | null
}

function toDraft(boundaries: GradeBoundary[] | null): Record<string, string> {
	const map: Record<string, string> = {}
	for (const g of GRADES) map[g] = ""
	for (const b of boundaries ?? []) map[b.grade] = String(b.min_percent)
	return map
}

function parseDraft(
	draft: Record<string, string>,
): GradeBoundary[] | { error: string } {
	const rows: GradeBoundary[] = []
	for (const g of GRADES) {
		const raw = draft[g] ?? ""
		if (raw === "") return { error: "All 9 grades require a percentage" }
		const n = Number(raw)
		if (!Number.isFinite(n) || !Number.isInteger(n))
			return { error: `Grade ${g} must be an integer` }
		if (n < 0 || n > 100)
			return { error: `Grade ${g} must be between 0 and 100` }
		rows.push({ grade: g, min_percent: n })
	}
	for (let i = 0; i < rows.length - 1; i++) {
		if (rows[i].min_percent <= rows[i + 1].min_percent) {
			return { error: "Percentages must strictly descend from 9 to 1" }
		}
	}
	return rows
}

export function GradeBoundariesCard({
	paperId,
	subject,
	tier,
	boundaries,
}: Props) {
	const queryClient = useQueryClient()
	const tiered = isTieredSubject(subject)
	const [draft, setDraft] = useState<Record<string, string>>(() =>
		toDraft(boundaries),
	)
	const [validationError, setValidationError] = useState<string | null>(null)
	const [undoTarget, setUndoTarget] = useState<GradeBoundary[] | null>(null)

	// Resync draft when the server-side boundaries change (e.g. Generate, Reset, Clear).
	useEffect(() => {
		setDraft(toDraft(boundaries))
		setValidationError(null)
	}, [boundaries])

	const save = useMutation({
		mutationFn: (input: {
			tier?: Tier | null
			grade_boundaries?: GradeBoundary[] | null
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
		!boundariesEqual(boundaries, typicals)
	const isTypical = boundaries !== null && typicals !== null && !isCustomised

	function handleCellBlur() {
		if (!boundaries) return // empty state, nothing to auto-save
		const parsed = parseDraft(draft)
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

	function generate() {
		const template = getTypicalBoundaries(subject, tier)
		if (!template) {
			toast.error("No typical boundaries available for this subject")
			return
		}
		setUndoTarget(boundaries)
		save.mutate({ grade_boundaries: template })
	}

	function resetToTypical() {
		if (!typicals) return
		save.mutate({ grade_boundaries: typicals })
	}

	function clearBoundaries() {
		save.mutate({ grade_boundaries: null })
	}

	function undoGenerate() {
		save.mutate({ grade_boundaries: undoTarget })
		setUndoTarget(null)
	}

	// Clear undo affordance 5s after Generate.
	useEffect(() => {
		if (undoTarget === null) return
		const t = setTimeout(() => setUndoTarget(null), 5000)
		return () => clearTimeout(t)
	}, [undoTarget])

	const saving = save.isPending
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
		return <span className="text-xs text-muted-foreground italic">not set</span>
	})()

	return (
		<Card>
			<CardContent className="pt-4 space-y-3">
				<div className="flex items-center justify-between gap-3 flex-wrap">
					<div className="flex items-center gap-2">
						<GraduationCap className="h-4 w-4 text-muted-foreground" />
						<p className="text-sm font-medium">Grade boundaries</p>
						{statusBadge}
					</div>

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
							className="shrink-0"
						>
							<ToggleGroupItem value="foundation">Foundation</ToggleGroupItem>
							<ToggleGroupItem value="higher">Higher</ToggleGroupItem>
						</ToggleGroup>
					)}
				</div>

				{boundaries ? (
					<PopulatedRow
						draft={draft}
						validationError={validationError}
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
							const zeros: GradeBoundary[] = GRADES.map((g, i) => ({
								grade: g,
								min_percent: 90 - i * 10,
							}))
							save.mutate({ grade_boundaries: zeros })
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
	onCellChange,
	onCellBlur,
	disabled,
}: {
	draft: Record<string, string>
	validationError: string | null
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
							aria-label={`Grade ${g} minimum percentage`}
						/>
					</div>
				))}
			</div>
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
					: "Generate typical GCSE boundaries as a starting point — you can edit any value after."}
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
