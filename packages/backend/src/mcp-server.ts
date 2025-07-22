import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { MongoClient } from "mongodb"
import { Resource } from "sst"

interface Personality {
	name: string
	description?: string
	instructions: string
	preferences?: Record<string, string>
}

const MONGO_URI = Resource.MongoDbUri.value

export const mongoClient = new MongoClient(MONGO_URI)

mongoClient.connect()
console.error("Connected to MongoDB")

const db = mongoClient.db("mcp-persona")
const personalitiesCollection = db.collection<Personality>("personalities")

// Create MCP server instance
export const server = new McpServer({
	name: "mcp-personality",
	version: "1.0.0",
	capabilities: {
		resources: {},
		tools: {},
	},
})

// server.registerTool(
// 	"list-personalities",
// 	{
// 		title: "List Personalities",
// 		description: "List all available personalities",
// 	},
// 	async () => {
// 		try {
// 			const all = await personalitiesCollection.find().toArray()
// 			return {
// 				content: [
// 					{
// 						type: "text",
// 						text: all.length
// 							? all
// 									.map(
// 										(p) => `- ${p.name}: ${p.description || "No description"}`,
// 									)
// 									.join("\n")
// 							: "No personalities found.",
// 					},
// 				],
// 			}
// 		} catch (err) {
// 			return { content: [{ type: "text", text: `Error: ${err}` }] }
// 		}
// 	},
// )

