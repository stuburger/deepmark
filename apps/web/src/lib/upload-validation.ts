/** Client-side file validation before upload — catches common issues early. */

const MAX_PDF_SIZE_MB = 50
const MAX_IMAGE_SIZE_MB = 20
const MAX_PDF_SIZE_BYTES = MAX_PDF_SIZE_MB * 1024 * 1024
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024

const PDF_MIME_TYPES = new Set(["application/pdf"])
const IMAGE_MIME_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/tiff",
])

type ValidateResult =
	| { ok: true }
	| { ok: false; error: string }

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Validate a file intended as a PDF document (question paper, mark scheme, exemplar).
 * Only PDFs accepted.
 */
export function validatePdfFile(file: File): ValidateResult {
	if (!PDF_MIME_TYPES.has(file.type) && !file.name.toLowerCase().endsWith(".pdf")) {
		return { ok: false, error: `"${file.name}" is not a PDF. Please upload a .pdf file.` }
	}

	if (file.size > MAX_PDF_SIZE_BYTES) {
		return {
			ok: false,
			error: `"${file.name}" is too large (${formatSize(file.size)}). Maximum PDF size is ${MAX_PDF_SIZE_MB} MB.`,
		}
	}

	if (file.size === 0) {
		return { ok: false, error: `"${file.name}" is empty. Please select a valid file.` }
	}

	return { ok: true }
}

/**
 * Validate a file intended as a student script upload.
 * Accepts PDFs and common image formats.
 */
export function validateScriptFile(file: File): ValidateResult {
	const isPdf = PDF_MIME_TYPES.has(file.type) || file.name.toLowerCase().endsWith(".pdf")
	const isImage = IMAGE_MIME_TYPES.has(file.type)

	if (!isPdf && !isImage) {
		return {
			ok: false,
			error: `"${file.name}" is not a supported format. Please upload a PDF or image (JPEG, PNG).`,
		}
	}

	const maxBytes = isPdf ? MAX_PDF_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES
	const maxLabel = isPdf ? `${MAX_PDF_SIZE_MB} MB` : `${MAX_IMAGE_SIZE_MB} MB`

	if (file.size > maxBytes) {
		return {
			ok: false,
			error: `"${file.name}" is too large (${formatSize(file.size)}). Maximum size is ${maxLabel}.`,
		}
	}

	if (file.size === 0) {
		return { ok: false, error: `"${file.name}" is empty. Please select a valid file.` }
	}

	return { ok: true }
}
