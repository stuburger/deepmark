/**
 * Connection-lifecycle logger for Hocuspocus.
 *
 * Hocuspocus core only prints a startup banner — there's no built-in log
 * level. The official `@hocuspocus/extension-logger` is the alternative,
 * but it logs every hook (incl. per-tx onChange + onAwarenessUpdate) which
 * is way too noisy in steady state. This minimal extension logs just
 * connect/disconnect so we can see who's attached without flooding the
 * console on every cursor move.
 */

type ConnectionPayload = {
	documentName: string
	socketId: string
}

function shortDoc(documentName: string): string {
	return documentName.slice(-12)
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
}
