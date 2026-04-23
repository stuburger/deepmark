import type { QuestionStimulusContext } from "../types"

/**
 * Render a question's stimuli as a `<Stimulus>` block for grading prompts.
 * Returns an empty string when the question has no attached content.
 *
 * The marker must read stimuli alongside the question — marks often require
 * the student to apply knowledge *to the case study context*. Without the
 * stimulus, point-based mark points and LoR level descriptors can't be
 * evaluated fairly.
 */
export function renderStimuliBlock(
	stimuli: QuestionStimulusContext[] | undefined,
): string {
	if (!stimuli || stimuli.length === 0) return ""
	const rendered = stimuli
		.map((s) => `**${s.label}**\n${s.content.trim()}`)
		.join("\n\n")
	return `<Stimulus>\nThe question refers to the following source material. The student was expected to read and apply it.\n\n${rendered}\n</Stimulus>\n\n`
}
