/**
 * Renders every page of a PDF file to a JPEG using pdfjs-dist (pure-JS, runs
 * in the browser). Returns one File per page, ready to be uploaded as
 * image/jpeg.
 *
 * This lets the existing pipeline (Cloud Vision OCR → bounding-box overlay)
 * work on documents that were originally submitted as PDFs, since Cloud Vision
 * requires raster images and BoundingBoxViewer overlays need an <img> element.
 */
export async function convertPdfToJpegs(file: File): Promise<File[]> {
	const pdfjsLib = await import("pdfjs-dist")

	// Point pdfjs at its worker via a webpack-processed URL — no CDN dependency.
	pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
		"pdfjs-dist/build/pdf.worker.min.mjs",
		import.meta.url,
	).href

	const arrayBuffer = await file.arrayBuffer()
	const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

	const basename = file.name.replace(/\.pdf$/i, "")
	const jpegFiles: File[] = []

	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		const page = await pdf.getPage(pageNum)

		// Scale so the longest dimension is ≤ 2480 px (≈ A4 @ 300 dpi) —
		// high enough for Cloud Vision OCR without producing enormous files.
		const base = page.getViewport({ scale: 1 })
		const scale = Math.min(3, 2480 / Math.max(base.width, base.height))
		const viewport = page.getViewport({ scale })

		const canvas = document.createElement("canvas")
		canvas.width = viewport.width
		canvas.height = viewport.height
		const ctx = canvas.getContext("2d")
		if (!ctx) throw new Error("Could not get 2D canvas context")

		await page.render({ canvasContext: ctx, canvas, viewport }).promise

		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(b) =>
					b ? resolve(b) : reject(new Error("canvas.toBlob returned null")),
				"image/jpeg",
				0.92,
			)
		})

		jpegFiles.push(
			new File([blob], `${basename}-p${pageNum}.jpg`, { type: "image/jpeg" }),
		)
	}

	return jpegFiles
}
