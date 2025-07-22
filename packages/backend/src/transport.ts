import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { ErrorCodes, VisibleError } from "./error"

export async function getStatelessTransport({ server }: { server: McpServer }) {
	const transport = new StreamableHTTPServerTransport({
		sessionIdGenerator: undefined, // Stateless mode
	})

	try {
		await server.connect(transport)

		transport.onerror = console.error.bind(console)
	} catch (error) {
		console.error(error)
		throw new VisibleError(
			"internal",
			ErrorCodes.Server.INTERNAL_ERROR,
			"Internal server error",
		)
	}

	return transport
}
