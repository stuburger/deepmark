import { describe, expect, it } from "vitest"
import { deriveAnnotationStatus } from "../status"

describe("deriveAnnotationStatus", () => {
	it("returns null when the submission has no grading run", () => {
		expect(deriveAnnotationStatus(null)).toBe(null)
	})

	it("returns 'failed' when annotation_error is set (regardless of completed_at)", () => {
		expect(
			deriveAnnotationStatus({
				status: "complete",
				annotations_completed_at: new Date(),
				annotation_error: "LLM timeout",
			}),
		).toBe("failed")
	})

	it("returns 'complete' when annotations_completed_at is set and no error", () => {
		expect(
			deriveAnnotationStatus({
				status: "complete",
				annotations_completed_at: new Date(),
				annotation_error: null,
			}),
		).toBe("complete")
	})

	it("returns 'processing' when grading is still processing", () => {
		expect(
			deriveAnnotationStatus({
				status: "processing",
				annotations_completed_at: null,
				annotation_error: null,
			}),
		).toBe("processing")
	})

	it("returns 'pending' when grading hasn't started and no annotations exist", () => {
		expect(
			deriveAnnotationStatus({
				status: "pending",
				annotations_completed_at: null,
				annotation_error: null,
			}),
		).toBe("pending")
	})

	it("prioritises annotation_error over a 'processing' grading status", () => {
		expect(
			deriveAnnotationStatus({
				status: "processing",
				annotations_completed_at: null,
				annotation_error: "LLM timeout",
			}),
		).toBe("failed")
	})
})
