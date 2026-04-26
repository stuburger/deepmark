import "server-only"
import { Resource } from "sst"

import { HocuspocusProvider } from "@hocuspocus/provider"
import {
	buildSubmissionDocumentName,
	editorExtensions,
} from "@mcp-gcse/shared"
import { getSchema } from "@tiptap/core"
import type { Node as PmNode } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import { EditorView } from "@tiptap/pm/view"
import { Window } from "happy-dom"
import WebSocket from "ws"
import { ySyncPlugin } from "y-prosemirror"
import * as Y from "yjs"

/**
 * Open a HeadlessEditor for a submission, run a single dispatch, close.
 * Used by web server actions that need to write to the doc — e.g. the
 * teacher-override mutation.
 *
 * This is a slimmer cousin of `packages/backend/src/lib/collab/headless-editor.ts`.
 * Both files install happy-dom, open a real `EditorView` against a
 * Hocuspocus-bound Y.Doc, dispatch, and tear down. Two implementations
 * exist because:
 *   - The backend's HeadlessEditor lives in a non-published package
 *     (`@sst-streaming-http-mcp-server/backend`) that the web app
 *     deliberately doesn't depend on.
 *   - The web tier is a Next.js server runtime; this file is
 *     `import "server-only"` so a stray browser bundle never tries to
 *     pull in `ws`/`happy-dom`.
 *
 * If a third caller appears (or this duplication starts mattering),
 * extract into a `@mcp-gcse/collab-write` package.
 */

const SYNC_TIMEOUT_MS = 10_000
const FLUSH_TIMEOUT_MS = 5_000

let domInstalled = false
function ensureDom(): void {
	if (domInstalled) return
	const win = new Window()
	Object.assign(globalThis, {
		window: win,
		document: win.document,
		Node: win.Node,
		Element: win.Element,
		HTMLElement: win.HTMLElement,
		DocumentFragment: win.DocumentFragment,
		Range: win.Range,
		Selection: win.Selection,
		getSelection: win.getSelection?.bind(win),
		MutationObserver: win.MutationObserver,
	})
	domInstalled = true
}

let cachedSchema: ReturnType<typeof getSchema> | null = null
function getEditorSchema(): ReturnType<typeof getSchema> {
	if (!cachedSchema) cachedSchema = getSchema(editorExtensions)
	return cachedSchema
}

/**
 * Open editor for `submissionId`, run `op` against the live `EditorView`,
 * wait for the resulting Yjs ops to be acknowledged by the server, close.
 *
 * Throws on auth failure, sync timeout, flush timeout — caller's mutation
 * surfaces it as `{ ok: false, error: ... }`.
 */
export async function withSubmissionEditor<T>(
	submissionId: string,
	op: (view: EditorView, doc: Y.Doc) => T,
): Promise<T> {
	ensureDom()

	const stage = process.env.STAGE ?? "dev"
	const url = Resource.HocuspocusServer.url.replace(/^http/, "ws")
	const doc = new Y.Doc()
	const provider = new HocuspocusProvider({
		url,
		WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
		name: buildSubmissionDocumentName(stage, submissionId),
		document: doc,
		token: Resource.CollabServiceSecret.value,
	} as ConstructorParameters<typeof HocuspocusProvider>[0] & {
		WebSocketPolyfill: unknown
	})

	let view: EditorView | null = null
	try {
		await waitForSync(provider, SYNC_TIMEOUT_MS)

		const fragment = doc.getXmlFragment("doc")
		const state = EditorState.create({
			schema: getEditorSchema(),
			plugins: [ySyncPlugin(fragment)],
		})
		const mount = document.createElement("div")
		view = new EditorView({ mount }, { state })

		let result!: T
		doc.transact(() => {
			result = op(view as EditorView, doc)
		}, "teacher")

		await waitForFlush(provider, FLUSH_TIMEOUT_MS)
		return result
	} finally {
		try {
			view?.destroy()
		} catch {
			// teardown only — already flushed if we got past the op
		}
		provider.destroy()
		doc.destroy()
	}
}

function waitForSync(
	provider: HocuspocusProvider,
	timeoutMs: number,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error(`Hocuspocus sync timed out after ${timeoutMs}ms`))
		}, timeoutMs)
		provider.on("synced", () => {
			clearTimeout(timer)
			resolve()
		})
		provider.on("authenticationFailed", ({ reason }: { reason: string }) => {
			clearTimeout(timer)
			reject(new Error(`Hocuspocus auth failed: ${reason}`))
		})
	})
}

function waitForFlush(
	provider: HocuspocusProvider,
	timeoutMs: number,
): Promise<void> {
	if (provider.unsyncedChanges === 0) return Promise.resolve()
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			provider.off("unsyncedChanges", onChange)
			reject(
				new Error(
					`Hocuspocus flush timed out after ${timeoutMs}ms with ${provider.unsyncedChanges} unsynced changes`,
				),
			)
		}, timeoutMs)
		const onChange = ({ number }: { number: number }) => {
			if (number > 0) return
			clearTimeout(timer)
			provider.off("unsyncedChanges", onChange)
			resolve()
		}
		provider.on("unsyncedChanges", onChange)
		if (provider.unsyncedChanges === 0) {
			clearTimeout(timer)
			provider.off("unsyncedChanges", onChange)
			resolve()
		}
	})
}

// ─── Block-targeted ops ──────────────────────────────────────────────────────
// These are the web-tier subset of `packages/backend/src/lib/collab/editor-ops.ts`
// — only the ops that web server actions need (currently teacher overrides).
// The full Lambda-side editor-ops module remains the canonical home for any
// op the grade Lambda dispatches.

export type WebTeacherOverride = {
	score: number | null
	reason: string | null
	feedback: string | null
	setBy: string | null
	setAt: string | null
}

/**
 * Apply a teacher score / feedback override to the named question. Two
 * paths matching the rest of the editor-ops module: questionAnswer block
 * via setNodeMarkup, OR a row inside the doc's mcqTable via
 * setNodeMarkup on the table with an updated `results` array.
 */
export function dispatchTeacherOverride(
	view: EditorView,
	questionId: string,
	override: WebTeacherOverride | null,
	feedbackOverride: string | null,
): void {
	const { state, dispatch } = view

	const block = findQuestionBlock(state.doc, questionId)
	if (block) {
		const nodePos = block.start - 1
		dispatch(
			state.tr.setNodeMarkup(nodePos, undefined, {
				...block.node.attrs,
				teacherOverride: override,
				teacherFeedbackOverride: feedbackOverride,
			}),
		)
		return
	}

	const table = findMcqTable(state.doc)
	if (!table) return
	const results = (table.node.attrs.results as Array<Record<string, unknown>>) ?? []
	const idx = results.findIndex((r) => r.questionId === questionId)
	if (idx === -1) return
	const updated = [...results]
	updated[idx] = {
		...updated[idx],
		teacherOverride: override,
		teacherFeedbackOverride: feedbackOverride,
	}
	const tablePos = table.start - 1
	dispatch(
		state.tr.setNodeMarkup(tablePos, undefined, {
			...table.node.attrs,
			results: updated,
		}),
	)
}

function findQuestionBlock(
	doc: PmNode,
	questionId: string,
): { node: PmNode; start: number } | null {
	let result: { node: PmNode; start: number } | null = null
	doc.descendants((node, pos) => {
		if (result) return false
		if (
			node.type.name === "questionAnswer" &&
			node.attrs.questionId === questionId
		) {
			result = { node, start: pos + 1 }
			return false
		}
	})
	return result
}

function findMcqTable(doc: PmNode): { node: PmNode; start: number } | null {
	let result: { node: PmNode; start: number } | null = null
	doc.descendants((node, pos) => {
		if (result) return false
		if (node.type.name === "mcqTable") {
			result = { node, start: pos + 1 }
			return false
		}
	})
	return result
}
