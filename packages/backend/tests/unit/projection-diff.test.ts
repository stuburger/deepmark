import type { StudentPaperAnnotation } from "@mcp-gcse/shared"
import { describe, expect, it } from "vitest"
import {
	type AnnotationRow,
	buildDesiredRows,
	diffAnnotations,
} from "../../src/lib/annotations/projection-diff"

/**
 * The diff function is the load-bearing piece of the projection Lambda —
 * it decides whether re-projecting a Y.Doc snapshot churns every row or
 * just the one(s) that changed. These tests pin the contract:
 *
 * - Stable ids survive re-projection (no churn for unchanged marks).
 * - Payload edits become updates, not delete+insert.
 * - Removed marks become deletes.
 * - JSON key-order in `payload` and `bbox` is canonicalised so PG-normalised
 *   jsonb reads compare equal to freshly-built JS objects.
 *
 * No DB. No transaction. The wrapper that turns a DiffPlan into Prisma
 * calls is a thin shim; behaviour lives here.
 */

function row(overrides: Partial<AnnotationRow> = {}): AnnotationRow {
	return {
		id: "ann-1",
		source: "ai",
		grading_run_id: "grun-1",
		question_id: "q1",
		page_order: 0,
		overlay_type: "annotation",
		sentiment: "positive",
		payload: { reason: "good", signal: "tick" },
		anchor_token_start_id: "tok-1",
		anchor_token_end_id: "tok-2",
		bbox: [10, 20, 30, 40],
		sort_order: 0,
		...overrides,
	}
}

function derivedAnnotation(
	overrides: Partial<StudentPaperAnnotation> = {},
): StudentPaperAnnotation {
	return {
		id: "ann-1",
		grading_run_id: null,
		source: "ai",
		question_id: "q1",
		page_order: 0,
		overlay_type: "annotation",
		sentiment: "positive",
		payload: { reason: "good", signal: "tick" } as never,
		anchor_token_start_id: "tok-1",
		anchor_token_end_id: "tok-2",
		bbox: [10, 20, 30, 40],
		...overrides,
	} as StudentPaperAnnotation
}

describe("buildDesiredRows", () => {
	it("assigns sort_order from input order", () => {
		const rows = buildDesiredRows(
			[
				derivedAnnotation({ id: "a" }),
				derivedAnnotation({ id: "b" }),
				derivedAnnotation({ id: "c" }),
			],
			"grun-1",
		)
		expect(rows.map((r) => [r.id, r.sort_order])).toEqual([
			["a", 0],
			["b", 1],
			["c", 2],
		])
	})

	it("nulls grading_run_id for teacher rows; sets it for ai rows", () => {
		const rows = buildDesiredRows(
			[
				derivedAnnotation({ id: "ai-row", source: "ai" }),
				derivedAnnotation({ id: "teacher-row", source: "teacher" }),
			],
			"grun-1",
		)
		expect(rows[0]).toMatchObject({ id: "ai-row", grading_run_id: "grun-1" })
		expect(rows[1]).toMatchObject({ id: "teacher-row", grading_run_id: null })
	})
})

describe("diffAnnotations", () => {
	it("idempotent: re-projecting the same rows produces no ops", () => {
		const same = [row({ id: "a" }), row({ id: "b" }), row({ id: "c" })]
		const plan = diffAnnotations(same, same.map((r) => ({ ...r })))
		expect(plan).toEqual({ inserts: [], updates: [], deleteIds: [] })
	})

	it("append-only: a new id becomes one insert; existing rows untouched", () => {
		const existing = [row({ id: "a" }), row({ id: "b" })]
		const desired = [
			row({ id: "a" }),
			row({ id: "b" }),
			row({ id: "c", sort_order: 2 }),
		]
		const plan = diffAnnotations(existing, desired)
		expect(plan.inserts.map((r) => r.id)).toEqual(["c"])
		expect(plan.updates).toEqual([])
		expect(plan.deleteIds).toEqual([])
	})

	it("payload edit: same id, different payload becomes one update", () => {
		const existing = [row({ id: "a", payload: { reason: "old" } })]
		const desired = [row({ id: "a", payload: { reason: "new" } })]
		const plan = diffAnnotations(existing, desired)
		expect(plan.inserts).toEqual([])
		expect(plan.deleteIds).toEqual([])
		expect(plan.updates.map((r) => r.id)).toEqual(["a"])
		expect(plan.updates[0]?.payload).toEqual({ reason: "new" })
	})

	it("removal: id missing from desired becomes one delete", () => {
		const existing = [row({ id: "a" }), row({ id: "b" })]
		const desired = [row({ id: "a" })]
		const plan = diffAnnotations(existing, desired)
		expect(plan.inserts).toEqual([])
		expect(plan.updates).toEqual([])
		expect(plan.deleteIds).toEqual(["b"])
	})

	it("payload key-order doesn't trigger false updates", () => {
		// PG jsonb returns keys in stored order (often alphabetical after
		// normalisation); freshly-built JS objects preserve insertion order.
		// canonicalJson sorts keys before comparing so these are equal.
		const existing = [
			row({
				id: "a",
				payload: { reason: "good", signal: "tick", ao_category: "AO1" },
			}),
		]
		const desired = [
			row({
				id: "a",
				payload: { signal: "tick", ao_category: "AO1", reason: "good" },
			}),
		]
		const plan = diffAnnotations(existing, desired)
		expect(plan).toEqual({ inserts: [], updates: [], deleteIds: [] })
	})

	it("bbox array order is preserved (arrays compare as ordered, not as sets)", () => {
		const existing = [row({ id: "a", bbox: [10, 20, 30, 40] })]
		const desired = [row({ id: "a", bbox: [40, 30, 20, 10] })]
		const plan = diffAnnotations(existing, desired)
		expect(plan.updates.map((r) => r.id)).toEqual(["a"])
	})

	it("sort_order change is treated as an update, not a churn", () => {
		const existing = [
			row({ id: "a", sort_order: 0 }),
			row({ id: "b", sort_order: 1 }),
		]
		// The two annotations swap positions in the doc → both rows update.
		const desired = [
			row({ id: "a", sort_order: 1 }),
			row({ id: "b", sort_order: 0 }),
		]
		const plan = diffAnnotations(existing, desired)
		expect(plan.inserts).toEqual([])
		expect(plan.deleteIds).toEqual([])
		expect(plan.updates.map((r) => r.id).sort()).toEqual(["a", "b"])
	})

	it("mixed change set: one insert + one update + one delete + one unchanged", () => {
		const existing = [
			row({ id: "keep" }),
			row({ id: "edit", payload: { reason: "old" } }),
			row({ id: "remove" }),
		]
		const desired = [
			row({ id: "keep" }),
			row({ id: "edit", payload: { reason: "new" } }),
			row({ id: "add", sort_order: 2 }),
		]
		const plan = diffAnnotations(existing, desired)
		expect(plan.inserts.map((r) => r.id)).toEqual(["add"])
		expect(plan.updates.map((r) => r.id)).toEqual(["edit"])
		expect(plan.deleteIds).toEqual(["remove"])
	})

	it("source and grading_run_id changes are detected", () => {
		const existing = [
			row({ id: "a", source: "ai", grading_run_id: "grun-1" }),
		]
		const desired = [
			row({ id: "a", source: "teacher", grading_run_id: null }),
		]
		const plan = diffAnnotations(existing, desired)
		expect(plan.updates.map((r) => r.id)).toEqual(["a"])
	})

	it("empty desired with non-empty existing deletes everything", () => {
		const existing = [row({ id: "a" }), row({ id: "b" })]
		const plan = diffAnnotations(existing, [])
		expect(plan.deleteIds.sort()).toEqual(["a", "b"])
		expect(plan.inserts).toEqual([])
		expect(plan.updates).toEqual([])
	})

	it("empty existing with non-empty desired is all inserts", () => {
		const desired = [row({ id: "a" }), row({ id: "b", sort_order: 1 })]
		const plan = diffAnnotations([], desired)
		expect(plan.inserts.map((r) => r.id)).toEqual(["a", "b"])
		expect(plan.updates).toEqual([])
		expect(plan.deleteIds).toEqual([])
	})
})
