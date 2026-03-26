import ImageAnnotatorClient from "@google-cloud/vision"
import { Resource } from "sst"

export type VisionToken = {
	para_index: number
	line_index: number
	word_index: number
	text_raw: string
	/** [yMin, xMin, yMax, xMax] normalised 0–1000, same coord system as StudentPaperAnswerRegion */
	bbox: [number, number, number, number]
	/** Average symbol-level confidence from Cloud Vision, 0–1 */
	confidence: number | null
}

export type VisionPageResult = {
	/** Raw Cloud Vision full-text annotation response for this page (stored to S3) */
	rawResponse: unknown
	tokens: VisionToken[]
}

/**
 * Runs Google Cloud Vision Document Text Detection on a single base64-encoded
 * image page. Returns word-level tokens with pixel coordinates normalised to
 * the 0–1000 system used throughout the student paper pipeline, plus the raw
 * response for archiving to S3.
 *
 * Uses an API key from the CloudVisionApiKey SST secret. The key must have
 * the Cloud Vision API enabled in the GCP project.
 */
export async function runVisionOcr(
	imageBase64: string,
	mimeType: string,
): Promise<VisionPageResult> {
	const apiKey = Resource.CloudVisionApiKey.value

	const client = new ImageAnnotatorClient.ImageAnnotatorClient({
		apiKey,
	})

	const [response] = await client.documentTextDetection({
		image: { content: imageBase64 },
		imageContext: {
			languageHints: ["en"],
		},
	})

	const fullText = response.fullTextAnnotation
	if (!fullText || !fullText.pages || fullText.pages.length === 0) {
		return { rawResponse: response, tokens: [] }
	}

	const page = fullText.pages[0]
	const pageWidth = page?.width ?? 1
	const pageHeight = page?.height ?? 1

	const tokens: VisionToken[] = []

	let paraIdx = 0
	for (const block of page?.blocks ?? []) {
		for (const para of block.paragraphs ?? []) {
			let lineIdx = 0
			let wordIdx = 0

			// Cloud Vision does not expose explicit line objects — we infer lines
			// by grouping words whose bounding boxes share overlapping y-ranges.
			// For the token model we use a simple sequential word_index per paragraph
			// and derive line breaks from y-position changes.
			const words = para.words ?? []

			// Group into lines by vertical proximity (words whose midpoint y
			// falls within ±15% of the paragraph height of the previous word).
			const lines: (typeof words)[] = []
			let currentLine: typeof words = []
			let prevMidY: number | null = null

			const paraBox = para.boundingBox?.vertices ?? []
			const paraTopY = Math.min(...paraBox.map((v) => v.y ?? 0))
			const paraBottomY = Math.max(...paraBox.map((v) => v.y ?? 0))
			const paraHeight = Math.max(paraBottomY - paraTopY, 1)

			for (const word of words) {
				const verts = word.boundingBox?.vertices ?? []
				const midY =
					verts.length > 0
						? verts.reduce((s, v) => s + (v.y ?? 0), 0) / verts.length
						: 0

				if (prevMidY === null || Math.abs(midY - prevMidY) < paraHeight * 0.5) {
					currentLine.push(word)
				} else {
					lines.push(currentLine)
					currentLine = [word]
					lineIdx++
				}
				prevMidY = midY
			}
			if (currentLine.length > 0) lines.push(currentLine)

			lineIdx = 0
			for (const line of lines) {
				wordIdx = 0
				for (const word of line) {
					const verts = word.boundingBox?.vertices ?? []

					// Compute bounding box from vertices
					const xs = verts.map((v) => v.x ?? 0)
					const ys = verts.map((v) => v.y ?? 0)

					if (xs.length === 0 || ys.length === 0) {
						wordIdx++
						continue
					}

					const xMin = Math.min(...xs)
					const xMax = Math.max(...xs)
					const yMin = Math.min(...ys)
					const yMax = Math.max(...ys)

					// Normalise pixel coords → 0–1000
					const normYMin = Math.round((yMin / pageHeight) * 1000)
					const normXMin = Math.round((xMin / pageWidth) * 1000)
					const normYMax = Math.round((yMax / pageHeight) * 1000)
					const normXMax = Math.round((xMax / pageWidth) * 1000)

					// Reconstruct word text from symbols
					const symbols = word.symbols ?? []
					const text = symbols.map((s) => s.text ?? "").join("")
					if (!text.trim()) {
						wordIdx++
						continue
					}

					// Average symbol confidence
					const confidences = symbols
						.map((s) => s.confidence)
						.filter((c): c is number => c != null)
					const avgConfidence =
						confidences.length > 0
							? confidences.reduce((a, b) => a + b, 0) / confidences.length
							: null

					tokens.push({
						para_index: paraIdx,
						line_index: lineIdx,
						word_index: wordIdx,
						text_raw: text,
						bbox: [normYMin, normXMin, normYMax, normXMax],
						confidence: avgConfidence,
					})

					wordIdx++
				}
				lineIdx++
			}

			paraIdx++
		}
	}

	return { rawResponse: response, tokens }
}
