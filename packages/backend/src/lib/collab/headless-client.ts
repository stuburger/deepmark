import {
	HocuspocusProvider,
	HocuspocusProviderWebsocket,
} from "@hocuspocus/provider"
import { Resource } from "sst"
import WebSocket from "ws"
import * as Y from "yjs"

const STAGE = process.env.STAGE ?? "dev"

function toWebsocketUrl(httpUrl: string): string {
	return httpUrl.replace(/^http/, "ws")
}

export function buildSubmissionDocumentName(submissionId: string): string {
	return `${STAGE}:submission:${submissionId}`
}

/**
 * Connects to Hocuspocus as a headless service client, runs the given
 * mutator against the Y.Doc (synchronously applying ops inside a transact),
 * waits for the write to flush, then disconnects.
 *
 * Uses the shared CollabServiceSecret as the auth token — the collab server
 * recognises it and grants the "service" role, bypassing per-user ACL checks.
 *
 * Provider/websocket are constructed fresh per call so each Lambda invocation
 * has a clean connection and doesn't leak state across invocations.
 */
export async function connectAndMutate(
	submissionId: string,
	mutator: (doc: Y.Doc) => void,
	options: {
		origin?: string
		timeoutMs?: number
	} = {},
): Promise<void> {
	const { origin = "service", timeoutMs = 30_000 } = options

	const url = toWebsocketUrl(Resource.HocuspocusServer.url)
	const token = Resource.CollabServiceSecret.value

	const socket = new HocuspocusProviderWebsocket({
		url,
		// Node environment — provide ws as the WebSocket impl
		WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
	})

	const doc = new Y.Doc()
	const provider = new HocuspocusProvider({
		websocketProvider: socket,
		name: buildSubmissionDocumentName(submissionId),
		document: doc,
		token,
	})

	try {
		await waitForSync(provider, timeoutMs)
		doc.transact(() => mutator(doc), origin)
		// Give the provider a beat to flush the update over the wire before
		// tearing down. Hocuspocus's client-side send loop is microtask-driven;
		// a single macrotask is enough in practice, but we add a small buffer.
		await new Promise((resolve) => setTimeout(resolve, 100))
	} finally {
		provider.destroy()
		socket.destroy()
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
