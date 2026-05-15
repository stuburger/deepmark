import type { PaperBundleLoRExtraction } from "./schema"

/**
 * Deterministic markdown renderer for level-of-response mark schemes.
 *
 * Same intermediate → byte-identical markdown. This is the repeatability
 * guarantee for LoR marking: extraction may go through an LLM, but the
 * canonical text the marker reads (and that we persist) is produced by pure
 * TS. New subject quirks land in `extras` and are appended verbatim — no
 * schema migration required.
 *
 * Layout:
 *   ## Indicative content
 *   {indicative_content}
 *
 *   ## Assessment dimensions
 *
 *   ### {ao_code} — {description} ({marks} marks)
 *
 *   **Level N ({lo}–{hi} marks)**
 *   - {bullet}
 *   - {bullet}
 *
 *   (repeats per level, then per dimension)
 *
 *   ## Marker notes
 *   {marker_notes}
 *
 *   {extras (verbatim, no header)}
 */
export function renderLoRMarkScheme(
	intermediate: PaperBundleLoRExtraction,
): string {
	const parts: string[] = []

	const indicative = intermediate.indicative_content.trim()
	if (indicative.length > 0) {
		parts.push("## Indicative content", "", indicative)
	}

	if (intermediate.ao_dimensions.length > 0) {
		if (parts.length > 0) parts.push("")
		parts.push("## Assessment dimensions")

		for (const dim of intermediate.ao_dimensions) {
			parts.push("", renderDimensionHeader(dim))
			for (const lvl of dim.levels) {
				parts.push("", renderLevelHeader(lvl.level, lvl.mark_range))
				for (const bullet of lvl.descriptor_bullets) {
					parts.push(`- ${bullet.trim()}`)
				}
			}
		}
	}

	const notes = intermediate.marker_notes?.trim()
	if (notes && notes.length > 0) {
		if (parts.length > 0) parts.push("")
		parts.push("## Marker notes", "", notes)
	}

	const extras = intermediate.extras?.trim()
	if (extras && extras.length > 0) {
		if (parts.length > 0) parts.push("")
		parts.push(extras)
	}

	return parts.join("\n")
}

function renderDimensionHeader(dim: {
	ao_code: string
	description: string
	marks: number
}): string {
	const code = dim.ao_code.trim()
	const description = dim.description.trim()
	const marksLabel = `${dim.marks} ${dim.marks === 1 ? "mark" : "marks"}`
	if (code.length > 0 && description.length > 0) {
		return `### ${code} — ${description} (${marksLabel})`
	}
	if (code.length > 0) {
		return `### ${code} (${marksLabel})`
	}
	if (description.length > 0) {
		return `### ${description} (${marksLabel})`
	}
	return `### Marking grid (${marksLabel})`
}

function renderLevelHeader(
	level: number,
	mark_range: readonly number[],
): string {
	const [lo, hi] = mark_range
	if (lo === undefined || hi === undefined) {
		return `**Level ${level}**`
	}
	if (lo === hi) {
		return `**Level ${level} (${lo} ${lo === 1 ? "mark" : "marks"})**`
	}
	return `**Level ${level} (${lo}–${hi} marks)**`
}
