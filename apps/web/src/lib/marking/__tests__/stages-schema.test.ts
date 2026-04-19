import { describe, expect, it } from "vitest"
import { jobStagesSchema } from "../stages/schema"

describe("jobStagesSchema", () => {
	const validWireFrame = {
		jobId: "job_1",
		ocr: {
			status: "done",
			runId: "ocr_1",
			startedAt: "2026-04-17T10:00:00.000Z",
			completedAt: "2026-04-17T10:01:00.000Z",
			error: null,
		},
		grading: {
			status: "generating",
			runId: "grading_1",
			startedAt: "2026-04-17T10:01:00.000Z",
			completedAt: null,
			error: null,
		},
		annotation: {
			status: "not_started",
			runId: null,
			startedAt: null,
			completedAt: null,
			error: null,
		},
	}

	it("parses a valid SSE frame", () => {
		const result = jobStagesSchema.safeParse(validWireFrame)
		expect(result.success).toBe(true)
	})

	it("coerces ISO strings to Date instances", () => {
		const result = jobStagesSchema.parse(validWireFrame)
		expect(result.ocr.startedAt).toBeInstanceOf(Date)
		expect(result.ocr.completedAt).toBeInstanceOf(Date)
		expect(result.ocr.startedAt?.toISOString()).toBe("2026-04-17T10:00:00.000Z")
	})

	it("preserves null dates as null", () => {
		const result = jobStagesSchema.parse(validWireFrame)
		expect(result.annotation.startedAt).toBe(null)
		expect(result.annotation.completedAt).toBe(null)
	})

	it("accepts Date instances in addition to strings", () => {
		// The server-action path produces real Date objects; the schema
		// should accept them unchanged.
		const frame = {
			...validWireFrame,
			ocr: {
				...validWireFrame.ocr,
				startedAt: new Date("2026-04-17T10:00:00Z"),
			},
		}
		const result = jobStagesSchema.parse(frame)
		expect(result.ocr.startedAt).toBeInstanceOf(Date)
	})

	it("rejects unknown status values", () => {
		const frame = {
			...validWireFrame,
			ocr: { ...validWireFrame.ocr, status: "bogus" },
		}
		const result = jobStagesSchema.safeParse(frame)
		expect(result.success).toBe(false)
	})

	it("rejects missing required fields", () => {
		const frame = {
			...validWireFrame,
			ocr: { status: "done", runId: "ocr_1" }, // missing startedAt/completedAt/error
		}
		const result = jobStagesSchema.safeParse(frame)
		expect(result.success).toBe(false)
	})

	it("rejects non-string jobId", () => {
		const frame = { ...validWireFrame, jobId: 123 }
		const result = jobStagesSchema.safeParse(frame)
		expect(result.success).toBe(false)
	})
})
