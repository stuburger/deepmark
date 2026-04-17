import { describe, expect, it } from "vitest"
import { deriveStageStatus } from "../stages/derive"
import { allTerminal, isTerminal } from "../stages/types"
import type { JobStages, StageStatus } from "../stages/types"

describe("deriveStageStatus", () => {
	it("maps null to not_started", () => {
		expect(deriveStageStatus(null)).toBe("not_started")
	})

	it("maps pending to generating", () => {
		expect(deriveStageStatus("pending")).toBe("generating")
	})

	it("maps processing to generating", () => {
		expect(deriveStageStatus("processing")).toBe("generating")
	})

	it("maps complete to done", () => {
		expect(deriveStageStatus("complete")).toBe("done")
	})

	it("maps failed to failed", () => {
		expect(deriveStageStatus("failed")).toBe("failed")
	})

	it("maps cancelled to cancelled", () => {
		// cancelled only exists on OcrStatus and GradingStatus, not
		// EnrichmentStatus; we surface it distinctly so the submission-level
		// cancelled phase renders its own panel.
		expect(deriveStageStatus("cancelled")).toBe("cancelled")
	})
})

describe("isTerminal", () => {
	it.each<[StageStatus, boolean]>([
		["not_started", false],
		["generating", false],
		["done", true],
		["failed", true],
		["cancelled", true],
	])("returns %s for %s", (status, expected) => {
		expect(isTerminal(status)).toBe(expected)
	})
})

describe("allTerminal", () => {
	const stage = (status: StageStatus) => ({
		status,
		runId: null,
		startedAt: null,
		completedAt: null,
		error: null,
	})

	const build = (
		ocr: StageStatus,
		grading: StageStatus,
		enrichment: StageStatus,
	): JobStages => ({
		jobId: "job-1",
		ocr: stage(ocr),
		grading: stage(grading),
		enrichment: stage(enrichment),
	})

	it("is true when every stage is done", () => {
		expect(allTerminal(build("done", "done", "done"))).toBe(true)
	})

	it("is true when every stage is terminal (mixed done/failed)", () => {
		expect(allTerminal(build("done", "failed", "done"))).toBe(true)
	})

	it("is false when any stage is still generating", () => {
		expect(allTerminal(build("done", "generating", "not_started"))).toBe(false)
	})

	it("is false when any stage is not_started", () => {
		expect(allTerminal(build("done", "done", "not_started"))).toBe(false)
	})
})
