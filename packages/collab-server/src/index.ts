import { Database } from "@hocuspocus/extension-database"
import { Server } from "@hocuspocus/server"
import { parseDocumentName } from "@mcp-gcse/shared/collab"
import { AuthFailure, verifyOpenAuthToken } from "./auth"
import { loadSnapshot, saveSnapshot } from "./persistence"

const port = Number(process.env.PORT ?? 1234)

const server = new Server({
	port,
	name: "deepmark-collab",

	async onAuthenticate({ token, documentName }) {
		if (!token) {
			throw new AuthFailure("missing auth token")
		}

		const claims = await verifyOpenAuthToken(token)

		const parsed = parseDocumentName(documentName)
		if (!parsed) {
			throw new AuthFailure(`invalid document name: ${documentName}`)
		}

		// Service tokens (minted by backend Lambdas in K-6) bypass per-user ACL.
		if (claims.role === "service") {
			return { userId: claims.userId, role: "service" as const }
		}

		// TODO(K-2): per-submission ACL check for user tokens. For the demo a
		// valid OpenAuth user token is sufficient; revisit before paid rollout.
		// Shape: call an internal `/api/collab/authorize` endpoint on the Next.js
		// app with { userId, submissionId } and expect 200/403.

		return { userId: claims.userId, role: "user" as const }
	},

	extensions: [
		new Database({
			fetch: ({ documentName }) => loadSnapshot(documentName),
			store: ({ documentName, state }) => saveSnapshot(documentName, state),
		}),
	],
})

server.listen().then(() => {
	console.log(`[collab-server] listening on :${port}`)
})

// Graceful shutdown — `tsx watch` (used by `bun run dev`) and SST's
// DevCommand don't reliably propagate signals through the bun → tsx → Node
// chain, so without explicit handlers a Ctrl-C on `sst dev` can leave this
// process alive and holding port 1234. Hocuspocus's `destroy()` flushes
// pending document persistence and closes the WebSocket server.
let shuttingDown = false
async function shutdown(signal: NodeJS.Signals): Promise<void> {
	if (shuttingDown) return
	shuttingDown = true
	console.log(`[collab-server] received ${signal}, shutting down`)
	try {
		await server.destroy()
	} catch (err) {
		console.error("[collab-server] shutdown error:", err)
	}
	process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
process.on("SIGHUP", shutdown)
