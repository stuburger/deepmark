import { describe, expect, it } from "vitest"

import { pdfRendererRequestSchema } from "../../../src/processors/pdf-renderer/schema"

const validRequest = {
	jobId: "abc-123",
	sections: [
		{
			bucket: "scans",
			key: "pdf-exports/p/j/000-cover.html",
			footerLabel: "Cover",
		},
		{
			bucket: "scans",
			key: "pdf-exports/p/j/001-student-a.html",
			footerLabel: "Pat Doe",
		},
		{
			bucket: "scans",
			key: "pdf-exports/p/j/002-student-b.html",
			footerLabel: "Jamie Roe",
		},
	],
	output: { bucket: "scans", key: "pdf-exports/p/j/output.pdf" },
	printLayout: "duplex" as const,
}

describe("pdfRendererRequestSchema", () => {
	it("accepts a well-formed request", () => {
		expect(pdfRendererRequestSchema.parse(validRequest)).toEqual(validRequest)
	})

	it("accepts a single-section request (single-student, no cover)", () => {
		const r = pdfRendererRequestSchema.parse({
			...validRequest,
			sections: [validRequest.sections[0]],
		})
		expect(r.sections).toHaveLength(1)
	})

	it("accepts each printLayout variant", () => {
		for (const layout of ["none", "duplex", "duplex_2up"] as const) {
			const r = pdfRendererRequestSchema.parse({
				...validRequest,
				printLayout: layout,
			})
			expect(r.printLayout).toBe(layout)
		}
	})

	it("rejects an unknown printLayout", () => {
		expect(() =>
			pdfRendererRequestSchema.parse({
				...validRequest,
				printLayout: "booklet",
			}),
		).toThrow()
	})

	it("rejects a missing jobId", () => {
		const { jobId: _omit, ...rest } = validRequest
		expect(() => pdfRendererRequestSchema.parse(rest)).toThrow()
	})

	it("accepts sections without a footerLabel (label is optional)", () => {
		const r = pdfRendererRequestSchema.parse({
			...validRequest,
			sections: [{ bucket: "scans", key: "pdf-exports/p/j/x.html" }],
		})
		expect(r.sections[0]?.footerLabel).toBeUndefined()
	})

	it("rejects an empty sections array (must have at least one section)", () => {
		expect(() =>
			pdfRendererRequestSchema.parse({
				...validRequest,
				sections: [],
			}),
		).toThrow()
	})

	it("rejects an empty bucket or key (catches accidental empty-string env)", () => {
		expect(() =>
			pdfRendererRequestSchema.parse({
				...validRequest,
				sections: [{ bucket: "", key: "x" }],
			}),
		).toThrow()
		expect(() =>
			pdfRendererRequestSchema.parse({
				...validRequest,
				output: { bucket: "scans", key: "" },
			}),
		).toThrow()
	})
})
