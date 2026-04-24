"use client"

import { getCollabToken } from "@/lib/collab/get-collab-token"
import { HocuspocusProvider } from "@hocuspocus/provider"
import { useEffect, useState } from "react"
import { IndexeddbPersistence } from "y-indexeddb"
import * as Y from "yjs"

const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL ?? "http://localhost:1234"
const STAGE = process.env.NEXT_PUBLIC_STAGE ?? "dev"

/**
 * Rollback kill-switch (K-9). Set at build time via env:
 *
 *   collab         — (default) IndexedDB + HocuspocusProvider. Full collab.
 *   indexeddb-only — IndexedDB only. Teacher edits persist locally, no sync
 *                    across tabs or devices. Useful if Hocuspocus is down.
 *
 * Flag is read at module load, not per-render — flipping it requires a
 * redeploy. Acceptable for demo-day incident recovery.
 */
type CollabMode = "collab" | "indexeddb-only"
const COLLAB_MODE: CollabMode =
	process.env.NEXT_PUBLIC_DEEPMARK_COLLAB_MODE === "indexeddb-only"
		? "indexeddb-only"
		: "collab"

function toWebsocketUrl(httpUrl: string): string {
	return httpUrl.replace(/^http/, "ws")
}

function buildDocumentName(submissionId: string): string {
	return `${STAGE}:submission:${submissionId}`
}

export type UseYDocResult = {
	doc: Y.Doc | null
	provider: HocuspocusProvider | null
	synced: boolean
}

/**
 * Owns the Y.Doc lifecycle for a single submission.
 *
 * - Hydrates instantly from IndexedDB (offline cache + multi-tab sync).
 * - Syncs with the Hocuspocus server over WebSocket (unless COLLAB_MODE is
 *   `indexeddb-only`, in which case no WebSocket connection is opened).
 * - `synced` flips true once every attached provider has signalled sync.
 * - Tears down fully on unmount or submissionId change.
 *
 * Callers should gate rendering the editor on `synced=true` so AI
 * annotations applied server-side don't race an empty initial doc.
 */
export function useYDoc(submissionId: string): UseYDocResult {
	const [state, setState] = useState<UseYDocResult>({
		doc: null,
		provider: null,
		synced: false,
	})

	useEffect(() => {
		const doc = new Y.Doc()
		const idb = new IndexeddbPersistence(
			`deepmark-annotations-${submissionId}`,
			doc,
		)

		let idbSynced = false
		let wsSynced = COLLAB_MODE === "indexeddb-only"

		const maybeMarkSynced = () => {
			if (idbSynced && wsSynced) {
				setState((prev) => ({ ...prev, synced: true }))
			}
		}

		idb.once("synced", () => {
			idbSynced = true
			maybeMarkSynced()
		})

		const provider =
			COLLAB_MODE === "collab"
				? new HocuspocusProvider({
						url: toWebsocketUrl(COLLAB_URL),
						name: buildDocumentName(submissionId),
						document: doc,
						token: async () => {
							const token = await getCollabToken()
							if (!token) {
								throw new Error("No active session for collab connection")
							}
							return token
						},
						onSynced: () => {
							wsSynced = true
							maybeMarkSynced()
						},
						onAuthenticationFailed: ({ reason }) => {
							console.warn("[useYDoc] auth failed:", reason)
						},
					})
				: null

		setState({ doc, provider, synced: false })

		return () => {
			provider?.destroy()
			idb.destroy()
			doc.destroy()
		}
	}, [submissionId])

	return state
}
