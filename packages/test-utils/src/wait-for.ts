export async function waitFor<T>(
	fn: () => Promise<T | null | undefined>,
	{ timeout = 120_000, interval = 3_000 } = {},
): Promise<T> {
	const deadline = Date.now() + timeout
	while (Date.now() < deadline) {
		const result = await fn()
		if (result != null) return result
		await new Promise((r) => setTimeout(r, interval))
	}
	throw new Error(`waitFor timed out after ${timeout}ms`)
}
