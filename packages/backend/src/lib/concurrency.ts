/**
 * Worker-pool helper: process `items` with at most `concurrency` in-flight
 * tasks, preserving input order in the result.
 *
 * Replaces the unbounded `Promise.all(items.map(fn))` pattern that pinned
 * production memory in the 2026-05-04 batch-classify OOM incident — for
 * any work where each in-flight task holds non-trivial memory (parsed PDFs,
 * image buffers, in-flight HTTP requests) the unbounded form scales heap
 * with input size and crashes Lambda.
 */
export async function concurrencyLimit<T, R>(
	concurrency: number,
	items: readonly T[],
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new Error(
			`concurrencyLimit: concurrency must be a positive integer, got ${concurrency}`,
		)
	}

	const results = new Array<R>(items.length)
	let nextIndex = 0

	async function worker(): Promise<void> {
		while (true) {
			const i = nextIndex++
			if (i >= items.length) return
			// biome-ignore lint/style/noNonNullAssertion: bounded by length check above
			results[i] = await fn(items[i]!, i)
		}
	}

	const workerCount = Math.min(concurrency, items.length)
	await Promise.all(Array.from({ length: workerCount }, () => worker()))
	return results
}
