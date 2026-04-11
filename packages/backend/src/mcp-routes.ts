import { toFetchResponse, toReqRes } from "fetch-to-node"
import { type Context, Hono } from "hono"
import { authMiddleware } from "./auth/auth-middleware"
import { server } from "./mcp-server"
import { getStatelessTransport } from "./transport"
import type { HonoEnv } from "./types"

// authMiddleware MUST be registered first so it runs before route handlers.
// In Hono, handlers execute in registration order — middleware added after
// routes would run after them, leaving c.get("auth") undefined.
export const mcpRoutes = new Hono<HonoEnv>()
	.use("*", authMiddleware)
	.post("/", async (c) => {
		const { req, res } = toReqRes(c.req.raw)

		const transport = await getStatelessTransport({ server })

		res.on("close", () => {
			transport.close()
			server.close()
		})

		// The MCP SDK requires both content types in the Accept header for POST requests.
		// Some MCP clients (e.g. Claude Desktop) omit text/event-stream on notifications,
		// which causes the transport to return 406. Normalise here before delegating.
		const accept = req.headers.accept as string | undefined
		if (
			!accept?.includes("application/json") ||
			!accept?.includes("text/event-stream")
		) {
			req.headers.accept = "application/json, text/event-stream"
		}

		const auth = c.get("auth")
		Object.assign(req, { auth })
		await transport.handleRequest(req, res, await c.req.json())

		return toFetchResponse(res)
	})
	.get("/", handleSessionRequest)
	.delete("/", handleSessionRequest)

async function handleSessionRequest(c: Context) {
	const { req, res } = toReqRes(c.req.raw)

	const transport = await getStatelessTransport({ server })

	res.on("close", () => {
		transport.close()
		server.close()
	})

	const auth = c.get("auth")
	Object.assign(req, { auth })

	await transport.handleRequest(req, res)
}
