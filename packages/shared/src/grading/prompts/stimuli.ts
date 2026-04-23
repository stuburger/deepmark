import type { QuestionStimulusContext } from "../types"

/**
 * Render a question's stimuli as a `<Stimulus>` block for grading prompts.
 * Returns an empty string when the question has no attached content.
 *
 * The marker must read stimuli alongside the question — marks often require
 * the student to apply knowledge *to the case study context*. Without the
 * stimulus, point-based mark points and LoR level descriptors can't be
 * evaluated fairly.
 *
 * Content-type handling:
 *   - "text"  — render inline.
 *   - "table" — render inline; the content is already a markdown pipe-table
 *               which modern LLMs parse natively. The leading annotation
 *               helps the model frame the block as structured data.
 *   - "image" — currently emits a placeholder line. Image stimuli aren't
 *               yet produced by the extractor; when they are, this helper
 *               will also need to surface the image as a multimodal
 *               attachment to the grading call (the `content` field will
 *               carry an S3 key rather than inline bytes).
 */
export function renderStimuliBlock(
	stimuli: QuestionStimulusContext[] | undefined,
): string {
	if (!stimuli || stimuli.length === 0) return ""
	const rendered = stimuli.map(renderOne).join("\n\n")
	return `<Stimulus>\nThe question refers to the following source material. The student was expected to read and apply it.\n\n${rendered}\n</Stimulus>\n\n`
}

function renderOne(stim: QuestionStimulusContext): string {
	const kind = stim.contentType ?? "text"
	const header = `**${stim.label}**`

	if (kind === "table") {
		return `${header} (table)\n${stim.content.trim()}`
	}

	if (kind === "image") {
		// Placeholder until multimodal image attachments are wired into
		// grading calls.
		return `${header} (image — not available to marker in this call)`
	}

	return `${header}\n${stim.content.trim()}`
}
