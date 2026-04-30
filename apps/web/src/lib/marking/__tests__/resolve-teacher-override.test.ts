import { resolveTeacherOverride } from "@/lib/marking/overrides/resolve"
import type { TeacherOverride } from "@/lib/marking/types"
import type { TeacherOverrideAttrs } from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"

const docOverride = (
	score: number,
	feedback: string | null = null,
): TeacherOverrideAttrs => ({
	score,
	reason: "doc reason",
	feedback,
	setBy: "user-1",
	setAt: "2026-04-27T00:00:00Z",
})

const pgRow = (overrides: Partial<TeacherOverride> = {}): TeacherOverride => ({
	id: "pg-1",
	submission_id: "sub-1",
	question_id: "q-1",
	score_override: 5,
	reason: "pg reason",
	feedback_override: "pg feedback",
	created_at: new Date(),
	updated_at: new Date(),
	...overrides,
})

describe("resolveTeacherOverride", () => {
	it("returns undefined when neither source has data", () => {
		expect(resolveTeacherOverride(null, null, undefined)).toBeUndefined()
	})

	it("returns the PG row when only PG has data", () => {
		const r = resolveTeacherOverride(null, null, pgRow())
		expect(r).toEqual({
			score_override: 5,
			reason: "pg reason",
			feedback_override: "pg feedback",
		})
	})

	it("returns the doc override when only the doc has data", () => {
		const r = resolveTeacherOverride(docOverride(7), null, undefined)
		expect(r).toEqual({
			score_override: 7,
			reason: "doc reason",
			feedback_override: null,
		})
	})

	it("doc wins over PG when both are set (the reload-persistence guarantee)", () => {
		const r = resolveTeacherOverride(docOverride(8), "doc feedback", pgRow())
		expect(r).toEqual({
			score_override: 8,
			reason: "doc reason",
			feedback_override: "doc feedback",
		})
	})

	it("falls back to PG when docOverride.score is null (legacy doc)", () => {
		// `score: null` means the attr exists on the block but no override has
		// been written — treat as missing so PG fallback still resolves.
		const stale = { ...docOverride(0), score: null }
		const r = resolveTeacherOverride(stale, null, pgRow())
		expect(r?.score_override).toBe(5)
		expect(r?.feedback_override).toBe("pg feedback")
	})

	it("docFeedbackOverride beats docOverride.feedback when both present", () => {
		// The dedicated `teacherFeedbackOverride` attr is what feedback edits
		// land on, so it should win over the legacy `feedback` field embedded
		// inside `teacherOverride`.
		const r = resolveTeacherOverride(
			docOverride(8, "embedded feedback"),
			"dedicated feedback",
			undefined,
		)
		expect(r?.feedback_override).toBe("dedicated feedback")
	})

	it("falls back to docOverride.feedback when teacherFeedbackOverride is null", () => {
		const r = resolveTeacherOverride(
			docOverride(8, "embedded feedback"),
			null,
			undefined,
		)
		expect(r?.feedback_override).toBe("embedded feedback")
	})
})
