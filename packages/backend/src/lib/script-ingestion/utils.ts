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
