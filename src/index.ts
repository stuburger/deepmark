import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MongoClient } from "mongodb";
import { Resource } from "sst";

interface Personality {
  name: string;
  description?: string;
  instructions: string;
  preferences?: Record<string, any>;
}

const MONGO_URI = Resource.MongoDbUri.value;

export const mongoClient = new MongoClient(MONGO_URI);

const db = mongoClient.db("mcp-persona");
const personalities = db.collection<Personality>("personalities");

// Create MCP server instance
const server = new Server(
  {
    name: "mcp-personality",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// Tool Management
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list-personalities",
        description: "List all available personalities",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "create-personality",
        description: "Add or update a personality",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the personality" },
            description: {
              type: "string",
              description: "Description of the personality",
            },
            instructions: {
              type: "string",
              description: "Instructions for the LLM",
            },
            preferences: {
              type: "object",
              description: "Preferences for the personality",
            },
          },
          required: ["name", "instructions"],
        },
      },
      {
        name: "delete-personality",
        description: "Delete a personality by name",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the personality to delete",
            },
          },
          required: ["name"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "list-personalities") {
    try {
      const all = await personalities.find().toArray();
      return {
        content: [
          {
            type: "text",
            text: all.length
              ? all
                  .map(
                    (p) => `- ${p.name}: ${p.description || "No description"}`
                  )
                  .join("\n")
              : "No personalities found.",
          },
        ],
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err}` }] };
    }
  }

  if (name === "create-personality") {
    const { name, description, instructions, preferences } = args as any;
    try {
      const result = await personalities.updateOne(
        { name },
        { $set: { name, description, instructions, preferences } },
        { upsert: true }
      );
      if (result.matchedCount > 0) {
        return {
          content: [{ type: "text", text: `Updated personality '${name}'.` }],
        };
      } else {
        return {
          content: [{ type: "text", text: `Added new personality '${name}'.` }],
        };
      }
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err}` }] };
    }
  }

  if (name === "delete-personality") {
    const { name } = args as any;
    try {
      const result = await personalities.deleteOne({ name });
      if (result.deletedCount > 0) {
        return {
          content: [{ type: "text", text: `Deleted personality '${name}'.` }],
        };
      } else {
        return {
          content: [{ type: "text", text: `Personality '${name}' not found.` }],
        };
      }
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err}` }] };
    }
  }

  throw new Error(`Tool not found: ${name}`);
});

// Start the server
async function main() {
  await mongoClient.connect();
  console.error("Connected to MongoDB");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-personality MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
