import { db } from "@/db"
import {
	type LlmModelEntry,
	getLlmConfig as sharedGetLlmConfig,
} from "@mcp-gcse/shared"

/**
 * Loads the model fallback chain for a call site from the DB.
 * Delegates to the shared pure config loader with the backend's DB client.
 */
export async function getLlmConfig(key: string): Promise<LlmModelEntry[]> {
	return sharedGetLlmConfig(key, async (k) => {
		const row = await db.llmCallSite.findUnique({ where: { key: k } })
		return row ? (row.models as LlmModelEntry[]) : null
	})
}
