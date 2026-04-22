import { Page, Text, View } from "@react-pdf/renderer"
import { aoHex } from "../ao-palette"
import type { StudentPaperAnnotation } from "../types"
import { colors, styles } from "./styles"

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

function collectAoLabels(
	annotationsBySubmission: Record<string, StudentPaperAnnotation[]>,
): string[] {
	const labels = new Set<string>()
	for (const list of Object.values(annotationsBySubmission)) {
		for (const a of list) {
			if (a.overlay_type !== "annotation") continue
			const payload = a.payload as { ao_category?: string; ao_display?: string }
			const label = payload.ao_display ?? payload.ao_category
			if (label) labels.add(label)
		}
	}
	return [...labels].sort()
}

export function LegendPage({
	annotationsBySubmission,
}: {
	annotationsBySubmission: Record<string, StudentPaperAnnotation[]>
}) {
	const aoLabels = collectAoLabels(annotationsBySubmission)

	return (
		<Page size="A4" style={styles.page}>
			<Text style={styles.h1}>Annotation key</Text>

			<View style={{ marginTop: 12 }}>
				<Text style={[styles.h3, { color: colors.muted }]}>Mark signals</Text>
				{SIGNAL_KEY.map((s) => (
					<View
						key={s.signal}
						style={{ flexDirection: "row", marginBottom: 5 }}
					>
						<Text
							style={{
								width: 110,
								color: s.colour,
								fontFamily: "Helvetica-Bold",
								fontSize: 10,
							}}
						>
							{s.signal}
						</Text>
						<Text style={{ flex: 1, color: colors.muted, fontSize: 10 }}>
							{s.meaning}
						</Text>
					</View>
				))}
			</View>

			<View style={{ marginTop: 14 }}>
				<Text style={[styles.h3, { color: colors.muted }]}>
					Chain highlights
				</Text>
				{CHAIN_KEY.map((c) => (
					<View
						key={c.label}
						style={{
							flexDirection: "row",
							alignItems: "center",
							marginBottom: 5,
						}}
					>
						<View
							style={{
								width: 24,
								height: 10,
								backgroundColor: c.colour,
								marginRight: 10,
							}}
						/>
						<Text style={{ color: colors.muted, fontSize: 10 }}>{c.label}</Text>
					</View>
				))}
			</View>

			{aoLabels.length > 0 ? (
				<View style={{ marginTop: 14 }}>
					<Text style={[styles.h3, { color: colors.muted }]}>
						Assessment objectives (this class)
					</Text>
					<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
						{aoLabels.map((label) => (
							<Text
								key={label}
								style={{
									color: aoHex(label),
									fontFamily: "Helvetica-Bold",
									fontSize: 9,
									borderWidth: 0.5,
									borderColor: aoHex(label),
									paddingVertical: 2,
									paddingHorizontal: 6,
								}}
							>
								{label}
							</Text>
						))}
					</View>
				</View>
			) : null}

			<View style={styles.footer}>
				<Text>DeepMark</Text>
				<Text>Annotation key</Text>
			</View>
		</Page>
	)
}
