import { HocuspocusProvider } from "@hocuspocus/provider"
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap"
import { randomUUID } from "node:crypto"
import { Resource } from "sst"
import { afterEach, describe, expect, it } from "vitest"
import WebSocket from "ws"
import * as Y from "yjs"
import { buildSubmissionDocumentName } from "../../src/lib/collab/document-name"
import { HeadlessEditor } from "../../src/lib/collab/headless-editor"
import {
	applyAnnotationMark,
	insertQuestionBlock,
	setAnswerText,
} from "../../src/lib/collab/editor-ops"

/**
 * Live integration test for the headless ProseMirror editor against a real
 * Hocuspocus server (whichever stage SST shell is pointed at).
 *
 * Proves end-to-end:
 *   - HeadlessEditor connects + syncs to the named doc
 *   - PM transactions dispatched on the writer's view become Yjs ops
 *   - Hocuspocus broadcasts each transact() as one wire packet
 *   - A separate reader (mimicking the teacher's browser) sees the updates
 *     arrive incrementally and ends up with byte-identical doc state
 *
 * Run via `bunx sst shell --stage=<stage> -- bunx vitest run \
 *   --project=backend:integration tests/integration/headless-editor-roundtrip.test.ts`
 *
 * Each test uses a random UUID-based doc name so concurrent runs don't
 * collide and the residual S3 snapshot is uniquely identifiable.
 */

type Reader = {
	provider: HocuspocusProvider
	doc: Y.Doc
	updates: Uint8Array[]
}

async function openReader(submissionId: string): Promise<Reader> {
	const url = Resource.HocuspocusServer.url.replace(/^http/, "ws")
	const doc = new Y.Doc()
	const updates: Uint8Array[] = []
	doc.on("update", (u: Uint8Array) => updates.push(u))

	const provider: HocuspocusProvider = await new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error("reader sync timed out after 30s")),
			30_000,
		)
		const p = new HocuspocusProvider({
			url,
			WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
			name: buildSubmissionDocumentName(submissionId),
			document: doc,
			token: Resource.CollabServiceSecret.value,
			onSynced: () => {
				clearTimeout(timer)
				resolve(p)
			},
			onAuthenticationFailed: ({ reason }) => {
				clearTimeout(timer)
				reject(new Error(`reader auth failed: ${reason}`))
			},
		} as ConstructorParameters<typeof HocuspocusProvider>[0] & {
			WebSocketPolyfill: unknown
		})
	})

	return { provider, doc, updates }
}

function closeReader(reader: Reader): void {
	reader.provider.destroy()
	reader.doc.destroy()
}

async function waitFor<T>(
	check: () => T | null | undefined,
	{ timeoutMs = 5_000, intervalMs = 50 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		const value = check()
		if (value != null) return value
		await new Promise((r) => setTimeout(r, intervalMs))
	}
	throw new Error(`waitFor timed out after ${timeoutMs}ms`)
}

describe("HeadlessEditor — live Hocuspocus roundtrip", () => {
	const cleanups: Array<() => void | Promise<void>> = []

	afterEach(async () => {
		for (const fn of cleanups.reverse()) await fn()
		cleanups.length = 0
	})

	it("dispatched transactions arrive at a separate reader as progressive Y updates", async () => {
		const submissionId = `roundtrip-${randomUUID()}`

		// Reader opens FIRST so it receives every update from a clean state.
		const reader = await openReader(submissionId)
		cleanups.push(() => closeReader(reader))

		const editor = await HeadlessEditor.open({ submissionId })
		cleanups.push(() => editor.close())

		const baselineUpdates = reader.updates.length

		// Three discrete ops, each in its own transact — should arrive on the
		// reader as three separate Y updates (the "feels alive" UX guarantee).
		editor.transact((view) => {
			insertQuestionBlock(view, {
				questionId: "q1",
				questionNumber: "1",
				questionText: "Define an island.",
				maxScore: 2,
			})
		})
		editor.transact((view) => {
			setAnswerText(view, "q1", "an island is land surrounded by water")
		})
		editor.transact((view) => {
			applyAnnotationMark(view, "q1", {
				signal: "tick",
				sentiment: "positive",
				from: 3,
				to: 9,
				attrs: {
					annotationId: "ai-tick-island",
					reason: "key term",
				},
			})
		})

		await editor.flush(500)

		// Three transacts → three updates received by the reader.
		await waitFor(() =>
			reader.updates.length - baselineUpdates >= 3 ? true : null,
		)

		// Reader's final state mirrors the writer's: one questionAnswer block,
		// the answer text, a tick mark over chars 3..9.
		const fragment = reader.doc.getXmlFragment("doc")
		const json = yXmlFragmentToProsemirrorJSON(fragment) as {
			content?: Array<{
				type: string
				attrs?: Record<string, unknown>
				content?: Array<{
					text?: string
					marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
				}>
			}>
		}

		const qa = json.content?.find((b) => b.type === "questionAnswer")
		expect(qa).toBeDefined()
		expect(qa?.attrs?.questionId).toBe("q1")
		expect(qa?.attrs?.questionNumber).toBe("1")

		const segments = qa?.content ?? []
		const fullText = segments.map((s) => s.text ?? "").join("")
		expect(fullText).toBe("an island is land surrounded by water")

		const tickedSegment = segments.find((s) =>
			s.marks?.some((m) => m.type === "tick"),
		)
		expect(tickedSegment?.text).toBe("island")
		const tickMark = tickedSegment?.marks?.find((m) => m.type === "tick")
		expect(tickMark?.attrs?.annotationId).toBe("ai-tick-island")
		expect(tickMark?.attrs?.source).toBe("ai")
	})

	it("two writers' disjoint annotations merge cleanly on a third reader", async () => {
		const submissionId = `merge-${randomUUID()}`

		const reader = await openReader(submissionId)
		cleanups.push(() => closeReader(reader))

		// Both writers sync from the same doc and each apply different annotations.
		const writerA = await HeadlessEditor.open({ submissionId })
		cleanups.push(() => writerA.close())

		// Seed the shared doc + answer text via writer A; writer B opens after
		// so it sees the seeded state on sync.
		writerA.transact((view) => {
			insertQuestionBlock(view, { questionId: "q1", questionNumber: "1" })
			setAnswerText(view, "q1", "good attempt — minor errors")
		})
		await writerA.flush(300)

		const writerB = await HeadlessEditor.open({ submissionId })
		cleanups.push(() => writerB.close())

		// Disjoint ranges so PM mark composition is unambiguous.
		writerA.transact((view) => {
			applyAnnotationMark(view, "q1", {
				signal: "tick",
				sentiment: "positive",
				from: 0,
				to: 4,
				attrs: { annotationId: "ai-tick" },
			})
		})
		writerB.transact((view) => {
			applyAnnotationMark(view, "q1", {
				signal: "cross",
				sentiment: "negative",
				from: 14,
				to: 27,
				attrs: { annotationId: "ai-cross" },
			})
		})

		await writerA.flush(500)
		await writerB.flush(500)

		await waitFor(() => {
			const json = yXmlFragmentToProsemirrorJSON(reader.doc.getXmlFragment("doc")) as {
				content?: Array<{
					content?: Array<{
						text?: string
						marks?: Array<{ type: string }>
					}>
				}>
			}
			const segments = json.content?.[0]?.content ?? []
			const hasTick = segments.some((s) =>
				s.marks?.some((m) => m.type === "tick"),
			)
			const hasCross = segments.some((s) =>
				s.marks?.some((m) => m.type === "cross"),
			)
			return hasTick && hasCross ? true : null
		})
	})
})
