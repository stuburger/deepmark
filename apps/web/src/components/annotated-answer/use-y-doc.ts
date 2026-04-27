"use client"

import { getCollabToken } from "@/lib/collab/get-collab-token"
import { HocuspocusProvider } from "@hocuspocus/provider"
import { buildSubmissionDocumentName } from "@mcp-gcse/shared"
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

export type UseYDocResult = {
	doc: Y.Doc | null
	provider: HocuspocusProvider | null
	synced: boolean
}

// ─── Module-scope cache ──────────────────────────────────────────────────────
//
// Y.Doc instances are cached across `useYDoc` mounts so navigating between
// recently-visited submissions doesn't tear down the WebSocket and re-sync
// from scratch. Entries are reference-counted; when the last consumer
// unmounts, the entry stays warm for `IDLE_GRACE_MS` to absorb fast
// back-navigation, then is destroyed. Up to `MAX_IDLE` idle entries are
// retained at once — older ones are evicted in LRU order.

type CacheEntry = {
	doc: Y.Doc
	provider: HocuspocusProvider | null
	idb: IndexeddbPersistence
	refCount: number
	idbSynced: boolean
	wsSynced: boolean
	listeners: Set<() => void>
	destroyTimer: ReturnType<typeof setTimeout> | null
}

const MAX_IDLE = 3
const IDLE_GRACE_MS = 30_000

// Persist on globalThis so the cache survives Next.js Fast Refresh module
// re-evaluation. Without this, HMR creates a fresh `cache` Map on every save:
// old components' `release()` calls hit the new (empty) cache, refCounts stay
// stuck at >0 in the orphaned old map, and old HocuspocusProviders never get
// destroyed — they linger as a second "client" on the same submission and
// produce a self-amplifying awareness echo loop.
type CacheStore = {
	cache: Map<string, CacheEntry>
	idleOrder: string[]
}
const CACHE_KEY = "__deepmark_useYDoc_cache__"
const globalStore = globalThis as unknown as Record<string, CacheStore>
if (!globalStore[CACHE_KEY]) {
	globalStore[CACHE_KEY] = {
		cache: new Map<string, CacheEntry>(),
		idleOrder: [],
	}
}
const store = globalStore[CACHE_KEY]
const cache = store.cache
const idleOrder = store.idleOrder

function notifyListeners(entry: CacheEntry): void {
	for (const l of entry.listeners) l()
}

function createEntry(submissionId: string): CacheEntry {
	const doc = new Y.Doc()
	const idb = new IndexeddbPersistence(
		`deepmark-annotations-${submissionId}`,
		doc,
	)

	const entry: CacheEntry = {
		doc,
		provider: null,
		idb,
		refCount: 0,
		idbSynced: false,
		wsSynced: COLLAB_MODE === "indexeddb-only",
		listeners: new Set(),
		destroyTimer: null,
	}

	idb.once("synced", () => {
		entry.idbSynced = true
		notifyListeners(entry)
	})

	if (COLLAB_MODE === "collab") {
		entry.provider = new HocuspocusProvider({
			url: toWebsocketUrl(COLLAB_URL),
			name: buildSubmissionDocumentName(STAGE, submissionId),
			document: doc,
			token: async () => {
				const token = await getCollabToken()
				if (!token) {
					throw new Error("No active session for collab connection")
				}
				return token
			},
			onSynced: () => {
				entry.wsSynced = true
				notifyListeners(entry)
			},
			onAuthenticationFailed: ({ reason }) => {
				console.warn("[useYDoc] auth failed:", reason)
			},
		})
	}

	return entry
}

function destroyEntry(entry: CacheEntry): void {
	if (entry.destroyTimer) {
		clearTimeout(entry.destroyTimer)
		entry.destroyTimer = null
	}
	entry.provider?.destroy()
	entry.idb.destroy()
	entry.doc.destroy()
}

function evictId(submissionId: string): void {
	const idx = idleOrder.indexOf(submissionId)
	if (idx !== -1) idleOrder.splice(idx, 1)
	const entry = cache.get(submissionId)
	if (entry && entry.refCount === 0) {
		cache.delete(submissionId)
		destroyEntry(entry)
	}
}

function acquire(submissionId: string): CacheEntry {
	let entry = cache.get(submissionId)
	if (entry) {
		if (entry.destroyTimer) {
			clearTimeout(entry.destroyTimer)
			entry.destroyTimer = null
		}
		const idleIdx = idleOrder.indexOf(submissionId)
		if (idleIdx !== -1) idleOrder.splice(idleIdx, 1)
	} else {
		entry = createEntry(submissionId)
		cache.set(submissionId, entry)
	}
	entry.refCount++
	return entry
}

function release(submissionId: string): void {
	const entry = cache.get(submissionId)
	if (!entry) return
	entry.refCount--
	if (entry.refCount > 0) return

	idleOrder.unshift(submissionId)
	while (idleOrder.length > MAX_IDLE) {
		const evict = idleOrder.pop()
		if (evict !== undefined) evictId(evict)
	}

	entry.destroyTimer = setTimeout(() => {
		evictId(submissionId)
	}, IDLE_GRACE_MS)
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Owns the Y.Doc lifecycle for a single submission.
 *
 * - Hydrates instantly from IndexedDB (offline cache + multi-tab sync).
 * - Syncs with the Hocuspocus server over WebSocket (unless COLLAB_MODE is
 *   `indexeddb-only`, in which case no WebSocket connection is opened).
 * - `synced` flips true once every attached provider has signalled sync.
 * - Backed by a module-scope LRU cache (see above): unmounting + remounting
 *   for the same submissionId within `IDLE_GRACE_MS` reuses the live doc
 *   instead of tearing down the WebSocket.
 *
 * Callers should gate rendering the editor on `synced=true` so AI
 * annotations applied server-side don't race an empty initial doc.
 */
export function useYDoc(submissionId: string): UseYDocResult {
	const [, forceRender] = useState(0)

	useEffect(() => {
		const entry = acquire(submissionId)
		const listener = () => forceRender((n) => n + 1)
		entry.listeners.add(listener)
		// If the entry was already synced before we subscribed, fire once
		// so the consumer's first post-effect render observes synced=true.
		listener()
		return () => {
			entry.listeners.delete(listener)
			release(submissionId)
		}
	}, [submissionId])

	const entry = cache.get(submissionId)
	if (!entry) {
		return { doc: null, provider: null, synced: false }
	}
	return {
		doc: entry.doc,
		provider: entry.provider,
		synced: entry.idbSynced && entry.wsSynced,
	}
}
