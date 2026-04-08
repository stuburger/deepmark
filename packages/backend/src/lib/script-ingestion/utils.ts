export function guessMime(key: string): string {
	const ext = key.toLowerCase().split(".").pop() ?? ""
	const mimeMap: Record<string, string> = {
		pdf: "application/pdf",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		png: "image/png",
		gif: "image/gif",
		webp: "image/webp",
	}
	return mimeMap[ext] ?? "application/octet-stream"
}

export function scriptCountIsPlausible(
	detectedCount: number,
	pagesPerScript: number,
	totalPages: number,
): boolean {
	if (totalPages === 0) return false
	const min = totalPages / (pagesPerScript * 3)
	const max = totalPages / (pagesPerScript * 0.5)
	return detectedCount >= min && detectedCount <= max
}
