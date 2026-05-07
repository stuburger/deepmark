import type { TextMark, TextSegment } from "@mcp-gcse/shared"
import type { CSSProperties } from "react"
import { splitIntoSegments } from "../../alignment/segments"
import { clipMarksToLine, deriveSegmentStyle, splitIntoLines } from "../marks"

/**
 * Render the OCR'd `student_answer` with inline annotation marks
 * (tick / cross / underline / box / circle / chain / AO labels).
 *
 * The line-by-line shape mirrors the legacy @react-pdf renderer: each
 * `\n` in the answer text becomes a separate `.answer-text` paragraph,
 * marks are clipped to that line, and the line is broken into segments
 * at mark boundaries. This keeps the leading "+" / "×" glyphs at the
 * start of each visible line a mark covers and avoids the ambiguous
 * "marked text contains a newline" CSS rendering.
 */
export function AnnotatedAnswer({
	answerText,
	marks,
}: {
	answerText: string
	marks: TextMark[]
}) {
	const lines = splitIntoLines(answerText)
	return (
		<div className="answer-box">
			{lines.map((line, i) => {
				if (line.text.length === 0) {
					// Blank lines act as paragraph spacers — render a non-breaking
					// space so the line height contributes to layout.
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: line index is stable per answer text
						<p key={`line-${i}`} className="answer-text">
							{" "}
						</p>
					)
				}
				const lineMarks = clipMarksToLine(marks, line.start, line.end)
				const segments = splitIntoSegments(line.text, lineMarks)
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: line index is stable per answer text
					<p key={`line-${i}`} className="answer-text">
						{segments.map((seg, j) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: segments derive from a stable text + mark set per line
							<Segment key={j} seg={seg} />
						))}
					</p>
				)
			})}
		</div>
	)
}

function Segment({ seg }: { seg: TextSegment }) {
	const style = deriveSegmentStyle(seg)
	const inline: CSSProperties = {}
	if (style.backgroundColor) inline.backgroundColor = style.backgroundColor
	if (style.textDecoration) inline.textDecoration = style.textDecoration
	if (style.textDecorationColor) {
		inline.textDecorationColor = style.textDecorationColor
	}
	if (style.outline) inline.outline = style.outline

	return (
		<>
			{style.leadingSymbol ? (
				<span
					style={{
						color: style.leadingSymbol === "+" ? "#16A34A" : "#DC2626",
						fontWeight: 700,
					}}
				>
					{style.leadingSymbol === "+" ? "+ " : "× "}
				</span>
			) : null}
			<span style={inline}>{seg.text}</span>
			{style.trailingAoLabels.map((ao) => (
				<span
					key={`ao-${ao.label}`}
					className="ao-label"
					style={{ color: ao.colour }}
				>
					{` [${ao.label}]`}
				</span>
			))}
		</>
	)
}
