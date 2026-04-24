import { Database } from "@hocuspocus/extension-database"
import { Server } from "@hocuspocus/server"
import { AuthFailure, verifyOpenAuthToken } from "./auth"
import { parseDocumentName } from "./document-name"
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
