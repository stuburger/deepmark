"use client"

import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet"
import type {
	GradingResult,
	StudentPaperAnnotation,
	TagPayload,
} from "@/lib/marking/types"
import type { ReactElement } from "react"

type Props = {
	gradingResults: GradingResult[]
	annotations?: StudentPaperAnnotation[]
	levelDescriptors: string | null
	trigger: ReactElement
}

const SIGNAL_KEY = [
	{ signal: "✓ Tick", meaning: "Creditworthy point", color: "text-green-600" },
	{
		signal: "✗ Cross",
		meaning: "Incorrect or irrelevant",
		color: "text-red-500",
	},
	{
		signal: "Underline",
		meaning: "Applied or contextualised knowledge",
		color: "text-blue-500",
	},
	{
		signal: "Double underline",
		meaning: "Developed reasoning or analysis chain",
		color: "text-green-600",
	},
	{ signal: "Box", meaning: "Key term or concept", color: "text-purple-500" },
	{
		signal: "Circle",
		meaning: "Vague or unclear expression",
		color: "text-amber-500",
	},
] as const

const QUALITY_KEY = [
	{
		label: "Strong (+)",
		meaning: "Clear, developed demonstration",
		color:
			"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
	},
	{
		label: "Partial (?)",
		meaning: "Attempted but underdeveloped",
		color:
			"bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
	},
	{
		label: "Incorrect (✗)",
		meaning: "Flawed reasoning",
		color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
	},
] as const

const CHAIN_KEY = [
	{
		color: "bg-blue-300",
		label: "Blue highlight",
		meaning: "Reasoning connective",
	},
	{
		color: "bg-amber-300",
		label: "Amber highlight",
		meaning: "Evaluation connective",
	},
	{
		color: "bg-violet-300",
		label: "Purple highlight",
		meaning: "Judgement indicator",
	},
] as const

const AO_LEGEND_STYLES: Record<string, string> = {
	AO1: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
	AO2: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
	AO3: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
}

/**
 * Sheet panel showing an annotation key/legend.
 * Static signal descriptions + dynamic AO labels from grading results.
 */
export function AnnotationLegend({
	gradingResults,
	annotations = [],
	levelDescriptors,
	trigger,
}: Props) {
	// Extract unique AO labels from tag annotations
	const aoLabels = [
		...new Set(
			annotations
				.filter((a) => a.overlay_type === "tag")
				.map((a) => (a.payload as TagPayload).category),
		),
	].sort()

	return (
		<Sheet>
			<SheetTrigger render={trigger} />
			<SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
				<SheetHeader>
					<SheetTitle>Annotation Legend</SheetTitle>
				</SheetHeader>
				<div className="flex-1 overflow-y-auto px-4 pb-6 space-y-6">
					{/* Signal key */}
					<section>
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
							Mark signals
						</h3>
						<div className="space-y-1.5">
							{SIGNAL_KEY.map((s) => (
								<div key={s.signal} className="flex items-center gap-2 text-xs">
									<span className={`font-semibold w-28 shrink-0 ${s.color}`}>
										{s.signal}
									</span>
									<span className="text-muted-foreground">{s.meaning}</span>
								</div>
							))}
						</div>
					</section>

					{/* Quality indicators */}
					<section>
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
							Quality indicators
						</h3>
						<div className="flex flex-wrap gap-1.5">
							{QUALITY_KEY.map((q) => (
								<div key={q.label} className="flex items-center gap-1.5">
									<span
										className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${q.color}`}
									>
										{q.label}
									</span>
									<span className="text-xs text-muted-foreground">
										{q.meaning}
									</span>
								</div>
							))}
						</div>
					</section>

					{/* Chain highlights */}
					<section>
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
							Chain highlights
						</h3>
						<div className="space-y-1.5">
							{CHAIN_KEY.map((c) => (
								<div key={c.label} className="flex items-center gap-2 text-xs">
									<span
										className={`inline-block w-4 h-3 rounded-sm ${c.color} opacity-50`}
									/>
									<span className="text-muted-foreground">{c.meaning}</span>
								</div>
							))}
						</div>
					</section>

					{/* Dynamic AOs for this paper */}
					{aoLabels.length > 0 && (
						<section>
							<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
								Assessment objectives (this paper)
							</h3>
							<div className="flex flex-wrap gap-1.5">
								{aoLabels.map((ao) => (
									<span
										key={ao}
										className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold ${AO_LEGEND_STYLES[ao] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
									>
										{ao}
									</span>
								))}
							</div>
							<p className="text-[10px] text-muted-foreground mt-1.5">
								AO definitions are subject-specific. See the level descriptors
								below for what each AO means for this paper.
							</p>
						</section>
					)}

					{/* Level descriptors */}
					{levelDescriptors && (
						<section>
							<details>
								<summary className="text-xs font-semibold uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground">
									Level descriptors
								</summary>
								<pre className="mt-2 text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed bg-zinc-50 dark:bg-zinc-900 rounded-md p-3">
									{levelDescriptors}
								</pre>
							</details>
						</section>
					)}
				</div>
			</SheetContent>
		</Sheet>
	)
}
