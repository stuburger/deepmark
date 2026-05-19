import { PDFDocument } from "pdf-lib"

// Skip sampling for short PDFs — the whole file fits in the prompt budget
// and the cover-plus-mid-page signals we need are all visible anyway.
export const CLASSIFY_SAMPLE_THRESHOLD = 10

// 5 pages is enough to discriminate the four labels: cover (candidate-info
// fill state, header), three mid-doc samples (answer-space vs printed
// questions vs mark grid vs source extract), and the back page.
export const CLASSIFY_SAMPLE_PAGES = 5

/**
 * Returns base64-encoded PDF bytes suitable for sending to the classifier.
 *
 * For PDFs over `CLASSIFY_SAMPLE_THRESHOLD` pages, builds a smaller PDF from
 * cover + evenly-spaced mid-doc pages + back page so the payload stays
 * bounded regardless of source size (a 300-page student-script bundle would
 * otherwise sit at ~100 MB base64 and hang the request). The four labels
 * we discriminate (question_paper / mark_scheme / stimulus_pack /
 * scripts_bundle) all have their decisive signals on the cover and mid-doc
 * — full pagination doesn't help the model.
 */
export async function preparePdfForClassify(
	bytes: Uint8Array,
): Promise<string> {
	const source = await PDFDocument.load(bytes, { ignoreEncryption: true })
	const pageCount = source.getPageCount()

	if (pageCount <= CLASSIFY_SAMPLE_THRESHOLD) {
		return Buffer.from(bytes).toString("base64")
	}

	const indices = sampleIndices(pageCount, CLASSIFY_SAMPLE_PAGES)
	const sampled = await PDFDocument.create()
	const copied = await sampled.copyPages(source, indices)
	for (const page of copied) sampled.addPage(page)
	const out = await sampled.save()
	return Buffer.from(out).toString("base64")
}

/**
 * Picks `count` page indices from a `total`-page document: always include
 * the first and last page, then evenly space the rest between them.
 * Returned indices are 0-based, sorted ascending, and unique.
 *
 * When `total <= count`, returns every index in order (no sampling needed).
 */
export function sampleIndices(total: number, count: number): number[] {
	if (total <= count) return Array.from({ length: total }, (_, i) => i)
	const set = new Set<number>([0, total - 1])
	const innerSlots = count - 2
	for (let i = 1; i <= innerSlots; i++) {
		set.add(Math.round((i * (total - 1)) / (innerSlots + 1)))
	}
	return [...set].sort((a, b) => a - b)
}
