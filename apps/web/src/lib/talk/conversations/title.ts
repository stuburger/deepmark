/**
 * Pure helpers for deriving a conversation's display title.
 *
 * Currently a one-shot snip of the first user message — collapse
 * whitespace, trim, truncate at ~60 chars. The history popover and the
 * `+`-new-conversation button both read this. LLM-summarised titles can
 * come later as a batch refresh if teacher feedback says snips read
 * poorly.
 *
 * The "first user message" is whatever role-`user` message has the
 * earliest position in the array. If no user message has yet been sent
 * (server persists optimistically before the first turn streams), we
 * return null and the UI shows "New conversation".
 */

const MAX_TITLE_LENGTH = 60

type MessageLike = {
	role: string
	parts?: ReadonlyArray<{ type: string; text?: string }>
}

export function deriveConversationTitle(
	messages: ReadonlyArray<MessageLike>,
): string | null {
	const firstUserText = extractFirstUserText(messages)
	if (firstUserText === null) return null
	return truncateTitle(firstUserText)
}

function extractFirstUserText(
	messages: ReadonlyArray<MessageLike>,
): string | null {
	for (const m of messages) {
		if (m.role !== "user") continue
		const parts = m.parts ?? []
		const text = parts
			.filter((p) => p.type === "text" && typeof p.text === "string")
			.map((p) => p.text as string)
			.join(" ")
			.trim()
		if (text) return text
	}
	return null
}

/**
 * Collapse internal whitespace runs to single spaces, trim, and cap at
 * MAX_TITLE_LENGTH chars (excluding the ellipsis). Exported separately
 * because the truncation rule is reusable for any title-like surface.
 */
export function truncateTitle(raw: string): string {
	const collapsed = raw.replace(/\s+/g, " ").trim()
	if (collapsed.length <= MAX_TITLE_LENGTH) return collapsed
	return `${collapsed.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`
}
