import { describe, expect, it } from "vitest"
import { deriveScanStatus } from "../status"

describe("deriveScanStatus", () => {
	it("returns 'pending' when both runs are null", () => {
		expect(deriveScanStatus(null, null)).toBe("pending")
	})

	it("returns 'failed' when OCR failed and grading row hasn't progressed past pending", () => {
		// Regression for a real production incident: the grading_runs row is
		// created upfront at submit time with status='pending', so a genuine
		// OCR failure used to resolve through the grading branch as
		// "text_extracted" and the UI showed "Grading queued" instead of
		// "Failed".
		expect(deriveScanStatus("failed", "pending")).toBe("failed")
	})

	it("returns 'failed' when OCR failed even if no grading row exists", () => {
		expect(deriveScanStatus("failed", null)).toBe("failed")
	})

	it("returns 'cancelled' when OCR was cancelled regardless of grading row", () => {
		expect(deriveScanStatus("cancelled", "pending")).toBe("cancelled")
		expect(deriveScanStatus("cancelled", null)).toBe("cancelled")
	})

	it("returns 'ocr_complete' when grading is complete (legacy name for 'grading complete')", () => {
		expect(deriveScanStatus("complete", "complete")).toBe("ocr_complete")
	})

	it("returns 'grading' while grading is processing", () => {
		expect(deriveScanStatus("complete", "processing")).toBe("grading")
	})

	it("returns 'failed' when grading failed", () => {
		expect(deriveScanStatus("complete", "failed")).toBe("failed")
	})

	it("returns 'text_extracted' when OCR is complete and grading is queued", () => {
		expect(deriveScanStatus("complete", "pending")).toBe("text_extracted")
	})

	it("returns 'text_extracted' when OCR is complete and no grading row exists", () => {
		expect(deriveScanStatus("complete", null)).toBe("text_extracted")
	})

	it("returns 'processing' while OCR is running, regardless of upfront-pending grading row", () => {
		// The grading_runs row is created at submit time with status='pending',
		// so a pending grading row isn't a meaningful signal — OCR's real state
		// must show through. Otherwise the UI labels in-flight extraction as
		// "Grading queued", which is wrong.
		expect(deriveScanStatus("processing", null)).toBe("processing")
		expect(deriveScanStatus("processing", "pending")).toBe("processing")
	})

	it("returns 'pending' when OCR is pending, regardless of upfront-pending grading row", () => {
		expect(deriveScanStatus("pending", null)).toBe("pending")
		expect(deriveScanStatus("pending", "pending")).toBe("pending")
	})
})
