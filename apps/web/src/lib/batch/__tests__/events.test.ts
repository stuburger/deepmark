import { describe, expect, it } from "vitest"
import { type JobEvent, deriveProgress, parseJobEvents } from "../events"

const at = (s: string) => `2026-05-04T20:00:${s.padStart(2, "0")}.000Z`

describe("parseJobEvents", () => {
	it("returns an empty array for null/undefined", () => {
		expect(parseJobEvents(null)).toEqual([])
		expect(parseJobEvents(undefined)).toEqual([])
	})

	it("parses a valid event array", () => {
		const raw = [
			{ kind: "started", at: at("00") },
			{ kind: "complete", at: at("30"), totalScripts: 25 },
		]
		const parsed = parseJobEvents(raw)
		expect(parsed).toHaveLength(2)
		expect(parsed[0]?.kind).toBe("started")
		expect(parsed[1]).toEqual({
			kind: "complete",
			at: at("30"),
			totalScripts: 25,
		})
	})

	it("rejects malformed entries", () => {
		expect(() => parseJobEvents([{ kind: "what", at: at("00") }])).toThrow()
		expect(() =>
			parseJobEvents([{ kind: "complete", at: at("00") }]),
		).toThrow()
	})
})

describe("deriveProgress", () => {
	it("returns idle state when no events", () => {
		const p = deriveProgress([])
		expect(p.currentStep).toBe("idle")
		expect(p.sourceFiles).toEqual([])
		expect(p.failureReason).toBeUndefined()
	})

	it("tracks the started event", () => {
		const events: JobEvent[] = [{ kind: "started", at: at("00") }]
		const p = deriveProgress(events)
		expect(p.currentStep).toBe("started")
	})

	it("aggregates per-source-file extract progress", () => {
		const sourceKey = "batches/abc/source/gwaugh.pdf"
		const events: JobEvent[] = [
			{ kind: "started", at: at("00") },
			{ kind: "source_file_started", at: at("01"), sourceKey, totalPages: 700 },
			{
				kind: "pages_extracted",
				at: at("60"),
				sourceKey,
				processed: 700,
				total: 700,
			},
		]
		const p = deriveProgress(events)
		expect(p.sourceFiles).toHaveLength(1)
		expect(p.sourceFiles[0]).toMatchObject({
			sourceKey,
			totalPages: 700,
			pagesExtracted: 700,
			currentPhase: "extract_done",
		})
		expect(p.currentStep).toBe("extracting")
	})

	it("transitions through OCR progress to segmentation", () => {
		const sourceKey = "batches/abc/source/gwaugh.pdf"
		const events: JobEvent[] = [
			{ kind: "started", at: at("00") },
			{ kind: "source_file_started", at: at("01"), sourceKey, totalPages: 700 },
			{
				kind: "pages_extracted",
				at: at("60"),
				sourceKey,
				processed: 700,
				total: 700,
			},
			{
				kind: "vision_progress",
				at: at("80"),
				sourceKey,
				processed: 350,
				total: 700,
			},
		]
		const p = deriveProgress(events)
		expect(p.currentStep).toBe("ocr")
		expect(p.sourceFiles[0]?.currentPhase).toBe("ocr")
		expect(p.sourceFiles[0]?.pagesOcrd).toBe(350)
	})

	it("marks source file complete on segmentation_complete", () => {
		const sourceKey = "batches/abc/source/gwaugh.pdf"
		const events: JobEvent[] = [
			{ kind: "started", at: at("00") },
			{ kind: "source_file_started", at: at("01"), sourceKey, totalPages: 700 },
			{
				kind: "pages_extracted",
				at: at("60"),
				sourceKey,
				processed: 700,
				total: 700,
			},
			{
				kind: "vision_progress",
				at: at("90"),
				sourceKey,
				processed: 700,
				total: 700,
			},
			{
				kind: "segmentation_complete",
				at: at("95"),
				sourceKey,
				scriptCount: 25,
			},
		]
		const p = deriveProgress(events)
		expect(p.sourceFiles[0]?.currentPhase).toBe("done")
		expect(p.sourceFiles[0]?.scriptCount).toBe(25)
	})

	it("captures terminal complete state", () => {
		const sourceKey = "batches/abc/source/gwaugh.pdf"
		const events: JobEvent[] = [
			{ kind: "started", at: at("00") },
			{ kind: "source_file_started", at: at("01"), sourceKey, totalPages: 700 },
			{
				kind: "segmentation_complete",
				at: at("95"),
				sourceKey,
				scriptCount: 25,
			},
			{ kind: "complete", at: at("99"), totalScripts: 25 },
		]
		const p = deriveProgress(events)
		expect(p.currentStep).toBe("complete")
		expect(p.totalScripts).toBe(25)
	})

	it("captures terminal failed state with reason", () => {
		const events: JobEvent[] = [
			{ kind: "started", at: at("00") },
			{ kind: "failed", at: at("30"), reason: "PDF too large" },
		]
		const p = deriveProgress(events)
		expect(p.currentStep).toBe("failed")
		expect(p.failureReason).toBe("PDF too large")
	})

	it("handles multiple source files", () => {
		const a = "batches/x/source/a.pdf"
		const b = "batches/x/source/b.pdf"
		const events: JobEvent[] = [
			{ kind: "started", at: at("00") },
			{ kind: "source_file_started", at: at("01"), sourceKey: a, totalPages: 100 },
			{ kind: "source_file_started", at: at("02"), sourceKey: b, totalPages: 50 },
			{
				kind: "pages_extracted",
				at: at("30"),
				sourceKey: a,
				processed: 100,
				total: 100,
			},
		]
		const p = deriveProgress(events)
		expect(p.sourceFiles.map((f) => f.sourceKey)).toEqual([a, b])
		expect(p.sourceFiles[0]?.currentPhase).toBe("extract_done")
		expect(p.sourceFiles[1]?.currentPhase).toBe("extract")
	})
})
