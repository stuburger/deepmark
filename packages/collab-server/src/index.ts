import { Database } from "@hocuspocus/extension-database"
import { Server } from "@hocuspocus/server"
import type { ResourceRole } from "@mcp-gcse/shared"
import { parseDocumentName } from "@mcp-gcse/shared/collab"
import { Resource } from "sst"
import { AuthFailure, verifyOpenAuthToken } from "./auth"
import { CollabLogger } from "./logger"
import { loadSnapshot, saveSnapshot } from "./persistence"

const port = Number(process.env.PORT ?? 1234)
const collabAuthzUrl = process.env.COLLAB_AUTHZ_URL

async function authorizeUserDocument(
	userId: string,
	documentName: string,
): Promise<{ role: ResourceRole }> {
	if (!collabAuthzUrl) {
		throw new AuthFailure("missing collab authorization endpoint")
	}

	const response = await fetch(collabAuthzUrl, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${Resource.CollabServiceSecret.value}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ userId, documentName }),
	})
	if (!response.ok) {
		throw new AuthFailure(`collab authorization returned ${response.status}`)
	}
	const body = (await response.json()) as { role: ResourceRole }
	return { role: body.role }
}

const server = new Server({
	port,
	name: "deepmark-collab",

	async onAuthenticate({ token, documentName, connectionConfig }) {
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

		const { role } = await authorizeUserDocument(claims.userId, documentName)
		// Submission viewers can load the doc to read it but every Y.Doc update
		// they emit is dropped by Hocuspocus — the editor on the client is also
		// rendered read-only via SubmissionView's `readOnly` prop, but flipping
		// connectionConfig.readOnly is the authoritative server-side guard
		// against a tampered client trying to write.
		if (role === "viewer") {
			connectionConfig.readOnly = true
		}

		return { userId: claims.userId, role: "user" as const, resourceRole: role }
	},

	extensions: [
		new Database({
			fetch: ({ documentName }) => loadSnapshot(documentName),
			store: ({ documentName, state }) => saveSnapshot(documentName, state),
		}),
		// Connect/disconnect lifecycle logger. See logger.ts for why we
		// don't use @hocuspocus/extension-logger.
		new CollabLogger(),
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
