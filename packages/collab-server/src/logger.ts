/**
 * Diagnostic logger extension for Hocuspocus.
 *
 * Aim: surface "where does the WS traffic come from?" without cluttering
 * the steady-state logs. Toggle on via COLLAB_LOG=verbose to inspect
 * every message; off (default) keeps just the lifecycle lines.
 */

type AwarenessUpdate = {
	documentName: string
	added: number[]
	updated: number[]
	removed: number[]
	transactionOrigin: unknown
	states: { clientId: number; [key: string]: unknown }[]
}

type DocChange = {
	documentName: string
	clientsCount: number
	transactionOrigin: unknown
	update: Uint8Array
}

type ConnectionPayload = {
	documentName: string
	socketId: string
}

const verbose = process.env.COLLAB_LOG === "verbose"

function shortDoc(documentName: string): string {
	return documentName.slice(-12)
}

function summariseStates(
	states: { clientId: number; [key: string]: unknown }[],
): string {
	return states
		.map((s) => {
			const user = (s as { user?: { name?: string } }).user
			const cursor = (s as { cursor?: unknown }).cursor
			const name = user?.name ?? "?"
			const hasCursor = cursor != null ? "✓" : "✗"
			return `${s.clientId}:${name}(cursor=${hasCursor})`
		})
		.join(", ")
}

export class CollabLogger {
	async onConnect(data: ConnectionPayload): Promise<void> {
		console.log(
			`[collab][connect] doc=${shortDoc(data.documentName)} sock=${data.socketId}`,
		)
	}

	async onDisconnect(data: ConnectionPayload): Promise<void> {
		console.log(
			`[collab][disconnect] doc=${shortDoc(data.documentName)} sock=${data.socketId}`,
		)
	}

	async onChange(data: DocChange): Promise<void> {
		console.log(
			`[collab][doc-update] doc=${shortDoc(data.documentName)} bytes=${data.update.byteLength} clients=${data.clientsCount}`,
		)
	}

	async onAwarenessUpdate(data: AwarenessUpdate): Promise<void> {
		// This fires on every cursor move + heartbeat from any peer. The
		// message rate here IS the per-second WS traffic the user is seeing.
		const counts = `+${data.added.length}/~${data.updated.length}/-${data.removed.length}`
		const allIds = [...data.added, ...data.updated, ...data.removed]
		const ids = allIds.join(",")
		const summary = verbose ? ` states=[${summariseStates(data.states)}]` : ""
		console.log(
			`[collab][awareness] doc=${shortDoc(data.documentName)} ${counts} clients=[${ids}]${summary}`,
		)
	}
}
