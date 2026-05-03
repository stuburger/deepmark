import { routeHandler } from "@/lib/authz"
import { createAnthropic } from "@ai-sdk/anthropic"
import { type UIMessage, convertToModelMessages, streamText } from "ai"
import { Resource } from "sst"

const SYSTEM_PROMPT = `You are DeepMark, an AI assistant for UK GCSE teachers using the DeepMark marking platform.

You help teachers understand:
- GCSE assessment objectives (AO1, AO2, AO3, AO4) across subjects
- The difference between point-based and level-of-response (LoR) marking
- How DeepMark grades student scripts (OCR → grading → annotation pipeline)
- How to interpret examiner-style feedback and mark allocations
- Subject-specific marking guidance (English Literature, Maths, Sciences, Humanities)

Style:
- British English. Concise, examiner-tone, plain prose.
- No emoji. No headers unless the answer needs structure.
- If you don't know something specific to the user's papers or students, say so.
- Don't fabricate marks, AO codes, or syllabus details — defer to the official spec.`

export const POST = routeHandler.authenticated(async (_ctx, req) => {
	const { messages } = (await req.json()) as { messages: UIMessage[] }

	const anthropic = createAnthropic({
		apiKey: Resource.AnthropicApiKey.value,
	})

	const result = streamText({
		model: anthropic("claude-sonnet-4-6"),
		system: SYSTEM_PROMPT,
		messages: await convertToModelMessages(messages),
	})

	return result.toUIMessageStreamResponse()
})
