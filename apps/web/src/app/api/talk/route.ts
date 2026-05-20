import { routeHandler } from "@/lib/authz"
import { getMarkSchemeContents } from "@/lib/mark-scheme/queries"
import { getJobAnnotations } from "@/lib/marking/annotations/queries"
import { getStudentPaperJob } from "@/lib/marking/submissions/queries"
import { buildSubmissionPreamble } from "@/lib/talk/build-submission-preamble"
import {
	ensureConversation,
	persistConversationTurn,
} from "@/lib/talk/conversations/mutations"
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

const TALK_MODEL = "claude-sonnet-4-6"

const selectionSchema = z.object({
	text: z.string().min(1),
	questionNumber: z.string().nullable().optional(),
	questionId: z.string().nullable().optional(),
})

const talkInputSchema = z.object({
	conversationId: z.string().nullable().optional(),
	submissionId: z.string().optional(),
	mentionedSubmissionIds: z.array(z.string()).optional(),
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
	const {
		conversationId: incomingConversationId,
		submissionId,
		mentionedSubmissionIds,
		selection,
		messages: rawMessages,
	} = parsed.data

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

	// Submissions this turn references — drives the join table writes on
	// persistence. Always includes the editor-bound submissionId (when
	// set) plus any client-supplied @-mentions, deduped.
	const submissionRefs: { submission_id: string }[] = []
	const seenSubmissions = new Set<string>()
	for (const id of [
		...(submissionId ? [submissionId] : []),
		...(mentionedSubmissionIds ?? []),
	]) {
		if (seenSubmissions.has(id)) continue
		seenSubmissions.add(id)
		submissionRefs.push({ submission_id: id })
	}

	// Pre-resolve the conversation id BEFORE streaming so we can ship it
	// to the client on the `start` part event. Light upsert — creates an
	// empty row (or verifies ownership of an existing one) and writes
	// any new submission joins. The expensive JSONB write happens once
	// in `onFinish` via persistConversationTurn.
	let resolvedConversationId: string | null = null
	try {
		const initial = await ensureConversation({
			conversationId: incomingConversationId ?? null,
			model: TALK_MODEL,
			submissionRefs,
		})
		resolvedConversationId = initial?.data?.conversationId ?? null
	} catch (err) {
		ctx.log.error("talk: failed to ensure conversation pre-stream", {
			err: String(err),
		})
		return new Response("Failed to start conversation", { status: 500 })
	}

	const anthropic = createAnthropic({
		apiKey: Resource.AnthropicApiKey.value,
	})

	const result = streamText({
		model: anthropic(TALK_MODEL),
		system,
		messages: modelMessages,
		tools: buildTalkTools(submissionId),
	})

	return result.toUIMessageStreamResponse({
		// Surface the resolved conversation id on every assistant turn's
		// metadata. The client uses this to pin to a brand-new conversation
		// on its first reply (and to confirm it's still pointing at the
		// same row on subsequent turns).
		messageMetadata: ({ part }) => {
			if (part.type === "start" || part.type === "finish") {
				return resolvedConversationId
					? { conversationId: resolvedConversationId }
					: undefined
			}
			return undefined
		},
		onFinish: async ({ messages }) => {
			if (!resolvedConversationId) return
			// Single JSONB write per turn. `messages` is the original list
			// plus the assistant response. Joins were already inserted by
			// `ensureConversation`; title is lazily derived on the first
			// turn (when the row's title is still null).
			try {
				await persistConversationTurn({
					conversationId: resolvedConversationId,
					messages: messages as unknown as Array<{ role: string }>,
				})
				ctx.log.info("talk: turn persisted", {
					conversationId: resolvedConversationId,
					turns: messages.length,
				})
			} catch (err) {
				ctx.log.error("talk: failed to persist final turn", {
					err: String(err),
				})
			}
		},
	})
})

/**
 * Loads MarkScheme.content for every distinct mark_scheme_id present on the
 * payload's grading results. The caller is already viewer-authz'd on the
 * submission and the ids come from a payload they're authorised to see, so
 * the underlying server action uses `authenticatedAction` rather than
 * per-row resource authz.
 */
async function loadMarkSchemesForResults(payload: {
	grading_results: ReadonlyArray<{ mark_scheme_id?: string | null }>
}): Promise<Map<string, string | null>> {
	const ids = new Set<string>()
	for (const r of payload.grading_results) {
		if (r.mark_scheme_id) ids.add(r.mark_scheme_id)
	}
	if (ids.size === 0) return new Map()
	const result = await getMarkSchemeContents({ ids: Array.from(ids) })
	const contents = result?.data?.contents ?? {}
	return new Map(Object.entries(contents))
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
