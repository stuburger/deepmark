import { routeHandler } from "@/lib/authz"
import { getJobAnnotations } from "@/lib/marking/annotations/queries"
import { getStudentPaperJob } from "@/lib/marking/submissions/queries"
import { buildSubmissionPreamble } from "@/lib/talk/build-submission-preamble"
import {
	TALK_SYSTEM_PROMPT,
	formatUserMessageWithSelection,
} from "@/lib/talk/system-prompt"
import { createAnthropic } from "@ai-sdk/anthropic"
import {
	type ModelMessage,
	type SystemModelMessage,
	type UIMessage,
	convertToModelMessages,
	streamText,
} from "ai"
import { Resource } from "sst"
import { z } from "zod"

const selectionSchema = z.object({
	text: z.string().min(1),
	questionNumber: z.string().nullable().optional(),
})

const talkInputSchema = z.object({
	submissionId: z.string().optional(),
	selection: selectionSchema.optional(),
	messages: z.array(z.unknown()),
})

const ephemeral5m = {
	anthropic: {
		cacheControl: { type: "ephemeral" as const, ttl: "5m" as const },
	},
}

export const POST = routeHandler.authenticated(async (ctx, req) => {
	const parsed = talkInputSchema.safeParse(await req.json())
	if (!parsed.success) {
		return new Response("Invalid request", { status: 400 })
	}
	const { submissionId, selection, messages: rawMessages } = parsed.data

	const system: SystemModelMessage[] = [
		{
			role: "system",
			content: TALK_SYSTEM_PROMPT,
			providerOptions: ephemeral5m,
		},
	]

	if (submissionId) {
		const [jobResult, annResult] = await Promise.all([
			getStudentPaperJob({ jobId: submissionId }),
			getJobAnnotations({ jobId: submissionId }),
		])
		if (jobResult?.serverError || annResult?.serverError) {
			return new Response("Forbidden", { status: 403 })
		}
		const payload = jobResult?.data?.data
		if (!payload) {
			return new Response("Submission not found", { status: 404 })
		}
		const annotations = annResult?.data?.annotations ?? []
		const preamble = buildSubmissionPreamble({ payload, annotations })
		system.push({
			role: "system",
			content: preamble,
			providerOptions: ephemeral5m,
		})
	}

	let modelMessages: ModelMessage[]
	try {
		modelMessages = await convertToModelMessages(rawMessages as UIMessage[])
	} catch (err) {
		ctx.log.warn("talk: convertToModelMessages failed", { err: String(err) })
		return new Response("Invalid messages", { status: 400 })
	}

	if (selection) {
		injectSelectionIntoLastUserMessage(modelMessages, selection)
	}

	const anthropic = createAnthropic({
		apiKey: Resource.AnthropicApiKey.value,
	})

	const result = streamText({
		model: anthropic("claude-sonnet-4-6"),
		system,
		messages: modelMessages,
	})

	return result.toUIMessageStreamResponse()
})

function injectSelectionIntoLastUserMessage(
	messages: ModelMessage[],
	selection: z.infer<typeof selectionSchema>,
): void {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]
		if (m.role !== "user") continue
		if (typeof m.content === "string") {
			messages[i] = {
				...m,
				content: formatUserMessageWithSelection(m.content, selection),
			}
		} else {
			const wrapped = formatUserMessageWithSelection("", selection)
			messages[i] = {
				...m,
				content: [{ type: "text", text: wrapped }, ...m.content],
			}
		}
		return
	}
}
