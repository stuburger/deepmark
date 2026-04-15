import { Mark } from "@tiptap/core"

/**
 * Data-only mark that binds each word in the student answer to its OCR token.
 * Every word that was aligned to a Cloud Vision token carries this mark with
 * the token's ID, bounding box, and page number. This makes the PM document
 * the single source of truth for the text↔scan mapping — no side-channel
 * lookup table needed.
 *
 * Renders as an invisible <span data-token-id="…"> for easy DOM inspection.
 */
export const OcrTokenMark = Mark.create({
	name: "ocrToken",
	inclusive: false,

	addAttributes() {
		return {
			tokenId: { default: null },
			/** [yMin, xMin, yMax, xMax] normalised 0–1000 */
			bbox: { default: null },
			pageOrder: { default: 0 },
		}
	},

	parseHTML() {
		return [{ tag: "span[data-token-id]" }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			{ "data-token-id": HTMLAttributes.tokenId as string },
			0,
		]
	},
})
