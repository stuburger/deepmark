/**
 * Minimal GitHub-flavoured markdown pipe-table parser.
 *
 * Handles the shape the extractor emits: a header row, a separator row of
 * dashes/alignment markers, and one or more data rows. Returns null when
 * the input isn't a recognisable table so the caller can fall back to
 * rendering the raw text.
 *
 * Deliberately does NOT parse inline markdown inside cells (no bold/italic
 * etc.) — GCSE table stimuli are plain data.
 */
export type ParsedMarkdownTable = {
	headers: string[]
	rows: string[][]
}

export function parseMarkdownTable(raw: string): ParsedMarkdownTable | null {
	const lines = raw
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0)
	if (lines.length < 2) return null

	const splitRow = (line: string): string[] =>
		line
			.replace(/^\||\|$/g, "")
			.split("|")
			.map((c) => c.trim())

	const headers = splitRow(lines[0] ?? "")
	if (headers.length === 0) return null

	const separatorCells = splitRow(lines[1] ?? "")
	const isSeparator =
		separatorCells.length === headers.length &&
		separatorCells.every((c) => /^:?-+:?$/.test(c))
	if (!isSeparator) return null

	const rows = lines
		.slice(2)
		.map(splitRow)
		.filter((r) => r.some((c) => c.length > 0))

	return { headers, rows }
}
