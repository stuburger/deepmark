"use client"

import { Badge } from "@/components/ui/badge"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	CALL_MULTIPLIER_LABELS,
	LLM_CALL_SITE_DEFAULTS,
	MODEL_PRICING,
} from "@mcp-gcse/shared"
import { ChevronRight, Cpu } from "lucide-react"
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

const DEFAULTS_BY_KEY = new Map(
	LLM_CALL_SITE_DEFAULTS.map((d) => [d.key, d]),
)

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
	if (cost < 0.01) return `<$0.01`
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
				<TableCell className="text-xs font-mono">
					{primary.model}
				</TableCell>
				<TableCell className="text-right text-xs tabular-nums">
					{effective?.total_calls ?? "-"}
					{mult && (
						<span className="text-muted-foreground/60 ml-1">
							({mult})
						</span>
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
						<TableHead className="w-[180px]">Call Site</TableHead>
						<TableHead>Model</TableHead>
						<TableHead className="text-right w-[120px]">Calls</TableHead>
						<TableHead className="text-right w-[80px]">Tokens</TableHead>
						<TableHead className="text-right w-[70px]">Cost</TableHead>
						<TableHead className="text-right w-[60px]" />
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

export function LlmSnapshotPanel({
	ocrSnapshot,
	gradingSnapshot,
	enrichmentSnapshot,
}: {
	ocrSnapshot?: unknown
	gradingSnapshot?: unknown
	enrichmentSnapshot?: unknown
}) {
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

	// Compute total cost across all phases
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
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
				<ChevronRight
					className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
				/>
				<Cpu className="h-3.5 w-3.5" />
				<span>
					LLM Config
					{hasCost && (
						<span className="ml-1.5 text-muted-foreground/70">
							~{formatCost(totalCost)}
						</span>
					)}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="space-y-4 pt-1 pb-2">
					{phases.map((phase) => (
						<PhaseSection key={phase.label} {...phase} />
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
}
