import {
	DeterministicMarker,
	Grader,
	LevelOfResponseMarker,
	LlmMarker,
	type LlmRunner,
	MarkerOrchestrator,
} from "@mcp-gcse/shared"

export const EXAMINER_SYSTEM_PROMPT =
	"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Ignore spelling and grammar; focus on understanding and correct concepts. Be consistent and conservative: only award marks when there is clear evidence."

export async function createMarkerOrchestrator(
	llm: LlmRunner,
): Promise<MarkerOrchestrator> {
	const { entries, onEffective } = await llm.prepareGrader("grading")
	const grader = new Grader(entries, {
		systemPrompt: EXAMINER_SYSTEM_PROMPT,
		onEffective,
	})

	return new MarkerOrchestrator([
		new DeterministicMarker(),
		new LevelOfResponseMarker(grader),
		new LlmMarker(grader),
	])
}
