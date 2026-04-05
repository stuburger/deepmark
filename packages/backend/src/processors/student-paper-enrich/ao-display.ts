/**
 * Maps internal AO categories to exam-board-specific display labels.
 * Falls back to the category itself if no mapping is found.
 */
const AO_DISPLAY: Record<string, Record<string, string>> = {
	AQA: { AO1: "AO1", AO2: "AO2", AO3: "AO3" },
	Edexcel: { AO1: "K", AO2: "App", AO3: "An" },
	OCR: { AO1: "AO1", AO2: "AO2", AO3: "AO3" },
}

export function aoDisplayLabel(
	examBoard: string | null,
	category: string,
): string {
	return AO_DISPLAY[examBoard ?? "AQA"]?.[category] ?? category
}
