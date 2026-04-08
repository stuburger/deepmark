export function formatAoAllocations(
	allocations: Array<{ ao_code: string; marks: number }> | undefined,
): string | undefined {
	if (!allocations?.length) return undefined
	return allocations
		.map((a) => `${a.ao_code}: ${a.marks} mark${a.marks !== 1 ? "s" : ""}`)
		.join(", ")
}
