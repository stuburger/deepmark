import { HocuspocusProvider } from "@hocuspocus/provider"
import { DOC_FRAGMENT_NAME } from "@mcp-gcse/shared"
import { EditorState } from "@tiptap/pm/state"
import { EditorView } from "@tiptap/pm/view"
import { Resource } from "sst"
import WebSocket from "ws"
import { ySyncPlugin } from "y-prosemirror"
import * as Y from "yjs"
import { buildSubmissionDocumentName } from "./document-name"
import { getEditorSchema } from "./editor-schema"
import { ensureHeadlessDom } from "./headless-dom"

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_FLUSH_TIMEOUT_MS = 5_000

type HeadlessEditorOptions = {
	submissionId: string
	/** Origin label for ydoc.transact — used for telemetry / projection filters. */
	origin?: string
	/** Hocuspocus auth token. Defaults to the service token from SST resources. */
	token?: string
	/** Sync timeout in ms. */
	timeoutMs?: number
}

/**
 * Per-phase wall-clock costs of bringing up a HeadlessEditor. Surfaced on
 * the instance so the calling Lambda's wrapper (`withHeadlessEditor`) can
 * emit a single consolidated timing log per session — see issue tracker
 * "HeadlessEditor per Lambda invocation" for context. None of the phases
 * include the actual work the Lambda does in `fn`; that's measured by the
 * wrapper.
 *
 * - `ensureDomMs`  — `ensureHeadlessDom()` cost. Idempotent; first call in
 *                    a warm container does the real work, subsequent calls
 *                    are near-zero.
 * - `syncProviderMs` — TCP + TLS + WS upgrade + Hocuspocus auth (server
 *                    round-trips OpenAuth /introspect for user tokens, no
 *                    round-trip for the service secret) + initial Y.Doc
 *                    state transfer. The unavoidable cost.
 * - `createViewMs` — `new EditorView({...})` mounting onto a detached
 *                    `<div>` + ySyncPlugin populating the initial PM doc
 *                    from the bound XmlFragment.
 */
export type OpenTimings = {
	ensureDomMs: number
	syncProviderMs: number
	createViewMs: number
}

/**
 * A real ProseMirror editor running headless against a submission's Y.Doc
 * over Hocuspocus. The Lambda sees a `view: EditorView` and dispatches
 * normal PM transactions; ySyncPlugin's binding observes each dispatch and
 * writes the equivalent Yjs ops on the bound XmlFragment, which Hocuspocus
 * broadcasts to every connected client (live teacher editors included).
 *
 * Granularity is per `transact()` call: each call emits one Y update, one
 * wire packet, one applyUpdate on every reader. Multiple ops dispatched
 * inside a single `transact()` collapse to one update.
 *
 * Always use via the `withHeadlessEditor(...)` wrapper or try / finally —
 * the WS and the EditorView both need teardown to avoid leaks.
 */
export class HeadlessEditor {
	readonly view: EditorView
	readonly doc: Y.Doc
	readonly openTimings: OpenTimings
	private readonly provider: HocuspocusProvider
	private readonly origin: string

	private constructor(args: {
		view: EditorView
		doc: Y.Doc
		provider: HocuspocusProvider
		origin: string
		openTimings: OpenTimings
	}) {
		this.view = args.view
		this.doc = args.doc
		this.provider = args.provider
		this.origin = args.origin
		this.openTimings = args.openTimings
	}

	static async open(opts: HeadlessEditorOptions): Promise<HeadlessEditor> {
		const {
			submissionId,
			origin = "ai",
			token = Resource.CollabServiceSecret.value,
			timeoutMs = DEFAULT_TIMEOUT_MS,
		} = opts

		const tDom0 = performance.now()
		ensureHeadlessDom()
		const ensureDomMs = performance.now() - tDom0

		const url = Resource.HocuspocusServer.url.replace(/^http/, "ws")
		const doc = new Y.Doc()
		// Use the url-form constructor (passes WebSocketPolyfill directly)
		// rather than constructing HocuspocusProviderWebsocket separately —
		// the websocketProvider form is silently broken in @hocuspocus/provider
		// 4.x in Node, never emitting any events.
		const tSync0 = performance.now()
		const provider = new HocuspocusProvider({
			url,
			WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
			name: buildSubmissionDocumentName(submissionId),
			document: doc,
			token,
		} as ConstructorParameters<typeof HocuspocusProvider>[0] & {
			WebSocketPolyfill: unknown
		})

		try {
			await waitForSync(provider, timeoutMs)
		} catch (err) {
			provider.destroy()
			doc.destroy()
			throw err
		}
		const syncProviderMs = performance.now() - tSync0

		const tView0 = performance.now()
		const view = createHeadlessView(doc)
		const createViewMs = performance.now() - tView0

		return new HeadlessEditor({
			view,
			doc,
			provider,
			origin,
			openTimings: { ensureDomMs, syncProviderMs, createViewMs },
		})
	}

	/**
	 * Run `fn` against the live editor view. Any transactions dispatched
	 * inside fn flow through ySyncPlugin's binding to the bound XmlFragment,
	 * collapsed under a single Y.transact labelled with this editor's
	 * origin. Multiple `transact()` calls produce multiple Yjs updates and
	 * therefore multiple wire packets — that's what backs the progressive
	 * "feels alive" UX on the teacher's browser.
	 */
	transact<T>(fn: (view: EditorView) => T): T {
		let result: T | undefined
		this.doc.transact(() => {
			result = fn(this.view)
		}, this.origin)
		return result as T
	}

	/**
	 * Wait until the server has acknowledged every locally-emitted Y update.
	 *
	 * The provider increments `unsyncedChanges` synchronously inside
	 * `documentUpdateHandler` whenever our Y.Doc emits an update, then
	 * decrements it from `applySyncStatusMessage` when the server's ack
	 * comes back over the wire. Waiting for the counter to hit zero is a
	 * direct read on the condition we actually care about — versus the old
	 * `setTimeout(100)` which was a guess that could silently drop ops
	 * under TCP backpressure, GC pauses, or Lambda concurrency contention.
	 *
	 * Throws on timeout (default 5s). A flush timeout means the WS is
	 * wedged or the server is unreachable — both are real failures the
	 * caller's SQS handler should propagate so the message gets retried,
	 * not silent data loss.
	 *
	 * Note: this guarantees the server has the ops in memory; it does NOT
	 * wait for Hocuspocus's debounced snapshot to land in S3 (that's
	 * ~2s and asynchronous to us). The projection Lambda picks up the
	 * snapshot when it eventually fires.
	 */
	async flush(timeoutMs: number = DEFAULT_FLUSH_TIMEOUT_MS): Promise<void> {
		if (this.provider.unsyncedChanges === 0) return

		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.provider.off("unsyncedChanges", onChange)
				reject(
					new Error(
						`Hocuspocus flush timed out after ${timeoutMs}ms with ${this.provider.unsyncedChanges} unsynced changes`,
					),
				)
			}, timeoutMs)

			const onChange = ({ number }: { number: number }) => {
				if (number > 0) return
				clearTimeout(timer)
				this.provider.off("unsyncedChanges", onChange)
				resolve()
			}

			this.provider.on("unsyncedChanges", onChange)

			// Race window: the counter may have hit zero between the synchronous
			// check above and the listener registration. Re-check once.
			if (this.provider.unsyncedChanges === 0) {
				clearTimeout(timer)
				this.provider.off("unsyncedChanges", onChange)
				resolve()
			}
		})
	}

	/** Tear down the EditorView, WebSocket, and local Y.Doc. */
	close(): void {
		this.view.destroy()
		this.provider.destroy()
		this.doc.destroy()
	}
}

/**
 * Build a headless EditorView bound to the given Y.Doc's `doc` fragment.
 * Used by `HeadlessEditor.open` and by unit tests that exercise ops
 * against a local Y.Doc without standing up Hocuspocus.
 *
 * The view is mounted on a detached `<div>` — never rendered, never read
 * back. ySyncPlugin populates the initial PM doc from the fragment in its
 * `view()` lifecycle hook, so this returns a fully-synced view.
 */
export function createHeadlessView(doc: Y.Doc): EditorView {
	ensureHeadlessDom()
	const fragment = doc.getXmlFragment(DOC_FRAGMENT_NAME)
	const state = EditorState.create({
		schema: getEditorSchema(),
		plugins: [ySyncPlugin(fragment)],
	})
	const mount = document.createElement("div")
	return new EditorView({ mount }, { state })
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
