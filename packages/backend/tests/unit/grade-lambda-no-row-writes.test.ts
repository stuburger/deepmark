import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const HERE = dirname(fileURLToPath(import.meta.url))
const GRADE_PROCESSOR = resolve(
	HERE,
	"../../src/processors/student-paper-grade.ts",
)

/**
 * Regression test for the "grade Lambda no longer writes Answer / MarkingResult
 * rows" invariant set up by the marking-result single-projection refactor.
 *
 * After the refactor, those rows are produced exclusively by the
 * annotation-projection Lambda (driven from the Yjs doc). If someone
 * re-adds a direct write here, the projection becomes a second writer
 * and the whole "single source of truth" claim falls over — silently —
 * because both writers would happily insert and the rows would diverge
 * over time.
 *
 * This is a static-source check rather than a live-Lambda invocation
 * because exercising the real grade Lambda requires `sst dev`, real LLM
 * spend, and an OCR fixture to drive. The static check is cheap, runs
 * on every CI pass, and catches the exact regression that matters.
 */
describe("grade Lambda lifecycle — no row writes", () => {
	const src = readFileSync(GRADE_PROCESSOR, "utf-8")

	it("does not import the deleted persist-answers helpers", () => {
		expect(src).not.toContain("persist-answers")
		expect(src).not.toContain("persistAnswerRows")
		expect(src).not.toContain("persistAnswerRowsIfLinked")
	})

	it("does not call db.answer.create / createMany", () => {
		expect(src).not.toMatch(/db\.answer\.create\b/)
		expect(src).not.toMatch(/db\.answer\.createMany\b/)
		expect(src).not.toMatch(/db\.answer\.upsert\b/)
		expect(src).not.toMatch(/tx\.answer\.create\b/)
	})

	it("does not call db.markingResult.create / createMany", () => {
		expect(src).not.toMatch(/db\.markingResult\.create\b/)
		expect(src).not.toMatch(/db\.markingResult\.createMany\b/)
		expect(src).not.toMatch(/db\.markingResult\.upsert\b/)
		expect(src).not.toMatch(/tx\.markingResult\.create\b/)
	})

	it("still owns the grading_run lifecycle (status, timestamps)", () => {
		// Sanity check: the grade Lambda DID keep the lifecycle write.
		// If this disappears, something else has gone wrong.
		expect(src).toMatch(/db\.gradingRun\.update/)
		expect(src).toContain('status: "complete"')
	})
})
