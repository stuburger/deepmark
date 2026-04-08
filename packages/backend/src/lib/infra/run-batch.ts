/**
 * Processes items in batches with configurable concurrency.
 * Each batch runs in parallel via Promise.all; batches run sequentially.
 */
export async function runBatch<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	batchSize: number,
): Promise<R[]> {
	const results: R[] = []
	for (let i = 0; i < items.length; i += batchSize) {
		const chunk = items.slice(i, i + batchSize)
		const chunkResults = await Promise.all(chunk.map(fn))
		results.push(...chunkResults)
	}
	return results
}
