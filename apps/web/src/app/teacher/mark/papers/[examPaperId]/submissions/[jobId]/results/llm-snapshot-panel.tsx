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
import { LLM_CALL_SITE_DEFAULTS } from "@mcp-gcse/shared"
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

const DISPLAY_NAMES = new Map(
	LLM_CALL_SITE_DEFAULTS.map((d) => [d.key, d.display_name]),
)

function displayName(key: string): string {
	return DISPLAY_NAMES.get(key) ?? key
}

function formatModel(entry: LlmModelEntry): string {
	return entry.model
}

function formatProvider(provider: string): string {
	return provider.charAt(0).toUpperCase() + provider.slice(1)
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

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-[200px]">Call Site</TableHead>
					<TableHead>Provider</TableHead>
					<TableHead>Model</TableHead>
					<TableHead className="text-right w-[60px]">Temp</TableHead>
					<TableHead className="text-right w-[60px]">Calls</TableHead>
					<TableHead className="text-right w-[80px]">Fallbacks</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{callSiteKeys.map((key) => {
					const primary = snapshot.selected[key]?.[0]
					const effective = snapshot.effective[key]
					if (!primary) return null

					const hasFallback =
						effective && effective.fallback_calls > 0

					return (
						<TableRow key={key}>
							<TableCell className="text-xs font-medium">
								{displayName(key)}
							</TableCell>
							<TableCell className="text-xs text-muted-foreground">
								{formatProvider(primary.provider)}
							</TableCell>
							<TableCell className="text-xs font-mono">
								{formatModel(primary)}
							</TableCell>
							<TableCell className="text-right text-xs tabular-nums">
								{primary.temperature}
							</TableCell>
							<TableCell className="text-right text-xs tabular-nums">
								{effective?.total_calls ?? "-"}
							</TableCell>
							<TableCell className="text-right">
								{hasFallback ? (
									<Badge variant="destructive" className="text-[10px] px-1.5">
										{effective.fallback_calls}
									</Badge>
								) : (
									<span className="text-xs text-muted-foreground">0</span>
								)}
							</TableCell>
						</TableRow>
					)
				})}
			</TableBody>
		</Table>
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
		phases.push({ label: "OCR", snapshot: ocrSnapshot })
	}
	if (isSnapshot(gradingSnapshot)) {
		phases.push({ label: "Grading", snapshot: gradingSnapshot })
	}
	if (isSnapshot(enrichmentSnapshot)) {
		phases.push({ label: "Enrichment", snapshot: enrichmentSnapshot })
	}

	if (phases.length === 0) return null

	const totalCallSites = phases.reduce(
		(sum, p) => sum + Object.keys(p.snapshot.selected).length,
		0,
	)

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-2">
				<ChevronRight
					className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
				/>
				<Cpu className="h-3.5 w-3.5" />
				<span>
					LLM Config ({totalCallSites} call site
					{totalCallSites !== 1 ? "s" : ""})
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
