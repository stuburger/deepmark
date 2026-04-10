import { getLlmConfig } from "@/lib/infra/llm-config"
import { resolveModel } from "@/lib/infra/llm-runtime"
import {
	DeterministicMarker,
	Grader,
	LevelOfResponseMarker,
	LlmMarker,
	MarkerOrchestrator,
} from "@mcp-gcse/shared"

export const EXAMINER_SYSTEM_PROMPT =
	"You are an expert GCSE examiner. Mark the student's answer against the provided mark scheme. Return valid JSON matching the schema. Ignore spelling and grammar; focus on understanding and correct concepts. Be consistent and conservative: only award marks when there is clear evidence."

export async function createMarkerOrchestrator(): Promise<MarkerOrchestrator> {
	const config = await getLlmConfig("grading")
	const entries = config.map((entry) => ({
		model: resolveModel(entry),
		temperature: entry.temperature,
	}))
	const grader = new Grader(entries, {
		systemPrompt: EXAMINER_SYSTEM_PROMPT,
	})

	return new MarkerOrchestrator([
		new DeterministicMarker(),
		new LevelOfResponseMarker(grader),
		new LlmMarker(grader),
	])
}
