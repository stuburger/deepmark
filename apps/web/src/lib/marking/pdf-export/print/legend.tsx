import { aoHex } from "../../ao-palette"
import type { StudentPaperAnnotation } from "../../types"

const SIGNAL_KEY = [
	{ signal: "+  Tick", meaning: "Creditworthy point", colour: "#16A34A" },
	{ signal: "×  Cross", meaning: "Incorrect or irrelevant", colour: "#DC2626" },
	{
		signal: "Underline",
		meaning: "Applied or contextualised knowledge",
		colour: "#3B82F6",
	},
	{
		signal: "Double underline",
		meaning: "Developed reasoning or analysis chain",
		colour: "#166534",
	},
	{ signal: "Box", meaning: "Key term or concept", colour: "#9333EA" },
	{
		signal: "Circle",
		meaning: "Vague or unclear expression",
		colour: "#D97706",
	},
] as const

const CHAIN_KEY = [
	{ colour: "#DBEAFE", label: "Reasoning connective" },
	{ colour: "#FEF3C7", label: "Evaluation connective" },
	{ colour: "#EDE9FE", label: "Judgement indicator" },
] as const

export function collectAoLabels(
	annotationsBySubmission: Record<string, StudentPaperAnnotation[]>,
): string[] {
	const labels = new Set<string>()
	for (const list of Object.values(annotationsBySubmission)) {
		for (const a of list) {
			if (a.overlay_type !== "annotation") continue
			const payload = a.payload as {
				ao_category?: string
				ao_display?: string
			}
			const label = payload.ao_display ?? payload.ao_category
			if (label) labels.add(label)
		}
	}
	return [...labels].sort()
}

/**
 * Class-level annotation key. Rendered between cover and student sections
 * when `includeAnnotations` is on and any submission carries annotations.
 *
 * Mirrors the legacy @react-pdf `LegendPage` (apps/web/src/lib/marking/
 * pdf-export/legend-page.tsx) — same signal copy, same colours, same
 * AO collection rule.
 */
export function Legend({ aoLabels }: { aoLabels: string[] }) {
	return (
		<section className="legend">
			<h1 className="h1">Annotation key</h1>

			<div className="legend-block">
				<h3 className="h3 muted">Mark signals</h3>
				{SIGNAL_KEY.map((s) => (
					<div key={s.signal} className="legend-row">
						<span
							className="legend-signal"
							style={{ color: s.colour, fontWeight: 700 }}
						>
							{s.signal}
						</span>
						<span className="legend-meaning muted">{s.meaning}</span>
					</div>
				))}
			</div>

			<div className="legend-block">
				<h3 className="h3 muted">Chain highlights</h3>
				{CHAIN_KEY.map((c) => (
					<div key={c.label} className="legend-row legend-chain-row">
						<span
							className="legend-swatch"
							style={{ backgroundColor: c.colour }}
						/>
						<span className="muted">{c.label}</span>
					</div>
				))}
			</div>

			{aoLabels.length > 0 ? (
				<div className="legend-block">
					<h3 className="h3 muted">Assessment objectives (this class)</h3>
					<div className="legend-ao-row">
						{aoLabels.map((label) => (
							<span
								key={label}
								className="legend-ao-badge"
								style={{ color: aoHex(label), borderColor: aoHex(label) }}
							>
								{label}
							</span>
						))}
					</div>
				</div>
			) : null}
		</section>
	)
}
