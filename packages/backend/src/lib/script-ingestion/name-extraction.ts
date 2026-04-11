import { runBatch } from "@/lib/infra/run-batch"
import { callExtractNameFromPage } from "@/lib/script-ingestion/classify-calls"
import type { PageGroup } from "@/lib/script-ingestion/types"

/**
 * Extracts student names from the first non-blank page of each group
 * using Gemini vision. Mutates group.proposedName in place.
 */
export async function extractNames(groups: PageGroup[]): Promise<void> {
	const results = await runBatch(
		groups,
		async (group) => {
			const firstPage = group.pages.find((p) => p.jpegBuffer !== null)
			if (!firstPage?.jpegBuffer) return { name: null, confidence: 0.0 }
			return callExtractNameFromPage(firstPage.jpegBuffer)
		},
		10,
	)

	for (let i = 0; i < groups.length; i++) {
		const group = groups[i]
		if (group) group.proposedName = results[i]?.name ?? null
	}
}
