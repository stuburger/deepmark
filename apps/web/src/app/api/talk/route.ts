import { routeHandler } from "@/lib/authz"
import { db } from "@/lib/db"
import { getJobAnnotations } from "@/lib/marking/annotations/queries"
import { getStudentPaperJob } from "@/lib/marking/submissions/queries"
import { buildSubmissionPreamble } from "@/lib/talk/build-submission-preamble"
import {
	TALK_SYSTEM_PROMPT,
	formatUserMessageWithSelection,
} from "@/lib/talk/system-prompt"
import { buildTalkTools } from "@/lib/talk/tools"
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
	questionId: z.string().nullable().optional(),
	tokenStart: z.string().nullable().optional(),
	tokenEnd: z.string().nullable().optional(),
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
		const markSchemesById = await loadMarkSchemesForResults(payload)
		const preamble = buildSubmissionPreamble({
			payload,
			annotations,
			markSchemesById,
		})
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
		// Tools only register in editor mode (submissionId present). General-
		// assistant mode (dashboard, /teacher/talk) sees no tools so the model
		// answers in prose.
		// No `execute` fns — tool calls pass through the stream and the client
		// resolves each via `onToolCall` / `addToolResult`.
		tools: buildTalkTools(submissionId),
	})

	return result.toUIMessageStreamResponse()
})

/**
 * Loads MarkScheme.content for every distinct mark_scheme_id present on the
 * payload's grading results. Direct db read by id is safe here — the caller
 * is already viewer-authz'd on the submission, and these ids come from a
 * payload they're authorised to see.
 */
async function loadMarkSchemesForResults(payload: {
	grading_results: ReadonlyArray<{ mark_scheme_id?: string | null }>
}): Promise<Map<string, string | null>> {
	const ids = new Set<string>()
	for (const r of payload.grading_results) {
		if (r.mark_scheme_id) ids.add(r.mark_scheme_id)
	}
	if (ids.size === 0) return new Map()
	const rows = await db.markScheme.findMany({
		where: { id: { in: Array.from(ids) } },
		select: { id: true, content: true },
	})
	return new Map(rows.map((r) => [r.id, r.content]))
}

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
