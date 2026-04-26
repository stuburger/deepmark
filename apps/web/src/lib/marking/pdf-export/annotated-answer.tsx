import {
	type TextMark,
	type TextSegment,
	alignTokensToAnswer,
	deriveTextMarks,
} from "@mcp-gcse/shared"
import { Text, View } from "@react-pdf/renderer"
import type { Style } from "@react-pdf/types"
import { splitIntoSegments } from "../alignment/segments"
import { aoHex, aoLabel } from "../ao-palette"
import type { GradingResult, PageToken, StudentPaperAnnotation } from "../types"
import { styles } from "./styles"

// ── Colour maps (mirror download-pdf-button.tsx) ──────────────────────────

const MARK_COLOURS: Record<string, string> = {
	tick: "#16A34A",
	cross: "#DC2626",
	underline: "#3B82F6",
	double_underline: "#166534",
	box: "#9333EA",
	circle: "#D97706",
}

const CHAIN_BG: Record<string, string> = {
	reasoning: "#DBEAFE",
	evaluation: "#FEF3C7",
	judgement: "#EDE9FE",
}

// ── Public: compute marks from annotations + tokens for a question ────────

export function marksForQuestion(
	result: GradingResult,
	annotations: StudentPaperAnnotation[],
	pageTokens: PageToken[],
): TextMark[] {
	if (result.marking_method === "deterministic") return []
	const qTokens = pageTokens.filter((t) => t.question_id === result.question_id)
	if (qTokens.length === 0) return []
	const alignment = alignTokensToAnswer(result.student_answer, qTokens)
	if (Object.keys(alignment.tokenMap).length === 0) return []
	const qAnnotations = annotations.filter(
		(a) => a.question_id === result.question_id,
	)
	if (qAnnotations.length === 0) return []
	return deriveTextMarks(qAnnotations, alignment)
}

// ── Segment style derivation ──────────────────────────────────────────────

type SegmentStyle = {
	color?: string
	backgroundColor?: string
	textDecoration?: "underline"
	leadingSymbol?: "+" | "x" | null
	trailingAoLabels: { label: string; colour: string }[]
}

function deriveSegmentStyle(seg: TextSegment): SegmentStyle {
	let color: string | undefined
	let backgroundColor: string | undefined
	let textDecoration: "underline" | undefined
	let leadingSymbol: "+" | "x" | null = null
	const trailingAoLabels: { label: string; colour: string }[] = []

	for (const m of seg.marks) {
		const paint = MARK_COLOURS[m.type]
		if (paint) color = paint

		if (m.type === "underline" || m.type === "double_underline") {
			textDecoration = "underline"
		}
		// "box" originally rendered as a rectangle around the word. We skip the
		// outline in the react-pdf port (no inline borders) and keep the colour
		// change only — switching the font mid-answer would break the
		// handwriting flow in the answer box.
		if (m.type === "circle") {
			backgroundColor = "#FEF3C7"
		}
		if (m.type === "chain") {
			const ct = (m.attrs.chainType as string | undefined) ?? "reasoning"
			backgroundColor = CHAIN_BG[ct] ?? CHAIN_BG.reasoning
		}
		if (m.type === "tick") leadingSymbol = "+"
		if (m.type === "cross") leadingSymbol = "x"

		if (m.attrs.ao_category) {
			const label = aoLabel(m.attrs as Record<string, unknown>)
			const colour = aoHex(label)
			if (!trailingAoLabels.some((t) => t.label === label)) {
				trailingAoLabels.push({ label, colour })
			}
		}
	}

	return {
		color,
		backgroundColor,
		textDecoration,
		leadingSymbol,
		trailingAoLabels,
	}
}

// ── Renderer ──────────────────────────────────────────────────────────────

function Segment({ seg }: { seg: TextSegment }) {
	const style = deriveSegmentStyle(seg)
	const textStyle: Style = {}
	if (style.color) textStyle.color = style.color
	if (style.backgroundColor) textStyle.backgroundColor = style.backgroundColor
	if (style.textDecoration) textStyle.textDecoration = style.textDecoration

	return (
		<>
			{style.leadingSymbol ? (
				<Text
					style={{
						color: style.leadingSymbol === "+" ? "#16A34A" : "#DC2626",
						fontFamily: "Helvetica-Bold",
					}}
				>
					{style.leadingSymbol === "+" ? "+ " : "× "}
				</Text>
			) : null}
			<Text style={textStyle}>{seg.text}</Text>
			{style.trailingAoLabels.map((ao) => (
				<Text
					key={`ao-${ao.label}`}
					style={{
						color: ao.colour,
						fontFamily: "Helvetica-Bold",
						fontSize: 7,
					}}
				>
					{` [${ao.label}]`}
				</Text>
			))}
		</>
	)
}

export function AnnotatedAnswer({
	answerText,
	marks,
}: {
	answerText: string
	marks: TextMark[]
}) {
	const segments = splitIntoSegments(answerText, marks)
	return (
		<View style={styles.answerBox}>
			<Text style={styles.answerText}>
				{segments.map((seg, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: segments are derived from a stable text + mark set per render
					<Segment key={i} seg={seg} />
				))}
			</Text>
		</View>
	)
}
