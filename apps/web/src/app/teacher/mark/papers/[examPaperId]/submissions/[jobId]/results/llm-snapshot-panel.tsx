"use client"

import { Badge } from "@/components/ui/badge"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
	CALL_MULTIPLIER_LABELS,
	LLM_CALL_SITE_DEFAULTS,
	MODEL_PRICING,
} from "@mcp-gcse/shared"
import { CircleDollarSign } from "lucide-react"
import { useState } from "react"

// ── Types ───────────────────────────────────────────────────────────────────

type LlmModelEntry = {
	provider: string
	model: string
	temperature: number
}

type EffectiveSummary = {
	total_calls: number
	fallback_calls: number
	prompt_tokens?: number
	completion_tokens?: number
}

type LlmRunSnapshot = {
	selected: Record<string, LlmModelEntry[]>
	effective: Record<string, EffectiveSummary>
}

type PhaseSnapshot = {
	label: string
	snapshot: LlmRunSnapshot
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULTS_BY_KEY = new Map(LLM_CALL_SITE_DEFAULTS.map((d) => [d.key, d]))

function displayName(key: string): string {
	return DEFAULTS_BY_KEY.get(key)?.display_name ?? key
}

function multiplierLabel(key: string): string | null {
	const m = DEFAULTS_BY_KEY.get(key)?.multiplier
	if (!m || m === "once") return null
	return CALL_MULTIPLIER_LABELS[m]
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
	return String(n)
}

function estimateCost(
	model: string,
	promptTokens: number,
	completionTokens: number,
): number | null {
	const pricing = MODEL_PRICING[model]
	if (!pricing) return null
	return (
		(promptTokens / 1_000_000) * pricing.input +
		(completionTokens / 1_000_000) * pricing.output
	)
}

function formatCost(cost: number): string {
	if (cost < 0.01) return "<$0.01"
	return `$${cost.toFixed(2)}`
}

function isSnapshot(value: unknown): value is LlmRunSnapshot {
	return (
		typeof value === "object" &&
		value !== null &&
		"selected" in value &&
		"effective" in value
	)
}

// ── Components ──────────────────────────────────────────────────────────────

function SnapshotTable({ snapshot }: { snapshot: LlmRunSnapshot }) {
	const callSiteKeys = Object.keys(snapshot.selected)
	if (callSiteKeys.length === 0) return null

	let phaseTotalCost = 0
	let phaseHasCost = false

	const rows = callSiteKeys.map((key) => {
		const primary = snapshot.selected[key]?.[0]
		const effective = snapshot.effective[key]
		if (!primary) return null

		const promptTokens = effective?.prompt_tokens ?? 0
		const completionTokens = effective?.completion_tokens ?? 0
		const totalTokens = promptTokens + completionTokens
		const hasTokens = totalTokens > 0
		const cost = hasTokens
			? estimateCost(primary.model, promptTokens, completionTokens)
			: null
		if (cost !== null) {
			phaseTotalCost += cost
			phaseHasCost = true
		}

		const hasFallback = effective && effective.fallback_calls > 0
		const mult = multiplierLabel(key)

		return (
			<TableRow key={key}>
				<TableCell className="text-xs font-medium">
					{displayName(key)}
				</TableCell>
				<TableCell className="text-xs font-mono">{primary.model}</TableCell>
				<TableCell className="text-right text-xs tabular-nums">
					{effective?.total_calls ?? "-"}
					{mult && (
						<span className="text-muted-foreground/60 ml-1">({mult})</span>
					)}
				</TableCell>
				<TableCell className="text-right text-xs tabular-nums">
					{hasTokens ? formatTokens(totalTokens) : "-"}
				</TableCell>
				<TableCell className="text-right text-xs tabular-nums">
					{cost !== null ? formatCost(cost) : "-"}
				</TableCell>
				<TableCell className="text-right">
					{hasFallback ? (
						<Badge variant="destructive" className="text-[10px] px-1.5">
							{effective.fallback_calls}
						</Badge>
					) : null}
				</TableCell>
			</TableRow>
		)
	})

	return (
		<div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-45">Call Site</TableHead>
						<TableHead>Model</TableHead>
						<TableHead className="text-right w-30">Calls</TableHead>
						<TableHead className="text-right w-20">Tokens</TableHead>
						<TableHead className="text-right w-17.5">Cost</TableHead>
						<TableHead className="text-right w-15" />
					</TableRow>
				</TableHeader>
				<TableBody>{rows}</TableBody>
			</Table>
			{phaseHasCost && (
				<div className="flex justify-end px-4 py-1.5 text-xs text-muted-foreground border-t bg-muted/30">
					Phase total: ~{formatCost(phaseTotalCost)}
				</div>
			)}
		</div>
	)
}

function PhaseSection({ label, snapshot }: PhaseSnapshot) {
	return (
		<div className="space-y-1">
			<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
				{label}
			</h4>
			<SnapshotTable snapshot={snapshot} />
		</div>
	)
}

// ── Public ───────────────────────────────────────────────────────────────────

type LlmSpendButtonProps = {
	ocrSnapshot?: unknown
	gradingSnapshot?: unknown
	enrichmentSnapshot?: unknown
	className?: string
}

export function LlmSpendButton({
	ocrSnapshot,
	gradingSnapshot,
	enrichmentSnapshot,
	className,
}: LlmSpendButtonProps) {
	const [open, setOpen] = useState(false)

	const phases: PhaseSnapshot[] = []
	if (isSnapshot(ocrSnapshot)) {
		phases.push({ label: "Answer Detection", snapshot: ocrSnapshot })
	}
	if (isSnapshot(gradingSnapshot)) {
		phases.push({ label: "Grading", snapshot: gradingSnapshot })
	}
	if (isSnapshot(enrichmentSnapshot)) {
		phases.push({ label: "Annotations", snapshot: enrichmentSnapshot })
	}

	if (phases.length === 0) return null

	let totalCost = 0
	let hasCost = false
	for (const phase of phases) {
		for (const key of Object.keys(phase.snapshot.effective)) {
			const eff = phase.snapshot.effective[key]
			const primary = phase.snapshot.selected[key]?.[0]
			if (!primary || !eff) continue
			const pt = eff.prompt_tokens ?? 0
			const ct = eff.completion_tokens ?? 0
			if (pt + ct === 0) continue
			const cost = estimateCost(primary.model, pt, ct)
			if (cost !== null) {
				totalCost += cost
				hasCost = true
			}
		}
	}

	return (
		<>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger
						render={
							<button
								type="button"
								onClick={() => setOpen(true)}
								className={cn(
									"inline-flex items-center justify-center h-7 w-7 rounded-md border bg-background text-muted-foreground border-border transition-colors",
									"hover:bg-muted hover:text-foreground",
									className,
								)}
								aria-label="LLM spend"
							>
								<CircleDollarSign className="h-3.5 w-3.5" />
							</button>
						}
					/>
					<TooltipContent side="bottom" sideOffset={6}>
						{hasCost ? `LLM spend ~${formatCost(totalCost)}` : "LLM config"}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className="max-w-3xl! p-0 overflow-hidden"
					onKeyDown={(e) => e.stopPropagation()}
				>
					<DialogHeader className="px-6 pt-5 pb-0">
						<DialogTitle>
							LLM Config
							{hasCost && (
								<span className="ml-2 text-sm font-normal text-muted-foreground">
									~{formatCost(totalCost)} total
								</span>
							)}
						</DialogTitle>
					</DialogHeader>
					<ScrollArea className="max-h-[70vh]">
						<div className="px-6 pb-6 pt-4 space-y-6">
							{phases.map((phase) => (
								<PhaseSection key={phase.label} {...phase} />
							))}
						</div>
					</ScrollArea>
				</DialogContent>
			</Dialog>
		</>
	)
}
