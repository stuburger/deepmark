import { describe, expect, it } from "vitest"
import { diffAnnotations } from "../annotations/diff"
import type { StudentPaperAnnotation } from "../types"

function mk(
	id: string,
	overrides: Partial<StudentPaperAnnotation> = {},
): StudentPaperAnnotation {
	return {
		id,
		grading_run_id: "run-1",
		question_id: "q1",
		page_order: 1,
		overlay_type: "annotation",
		sentiment: "positive",
		payload: { _v: 1, signal: "tick", reason: "good point" } as never,
		bbox: [0, 0, 100, 100] as [number, number, number, number],
		anchor_token_start_id: "t1",
		anchor_token_end_id: "t2",
		...overrides,
	} as StudentPaperAnnotation
}

describe("diffAnnotations", () => {
	it("returns empty diff when states match", () => {
		const state = [mk("a"), mk("b")]
		const { inserts, updates, deletes } = diffAnnotations(state, state)
		expect(inserts).toEqual([])
		expect(updates).toEqual([])
		expect(deletes).toEqual([])
	})

	it("detects inserts (in editor, not in db)", () => {
		const db = [mk("a")]
		const editor = [mk("a"), mk("b")]
		const { inserts, updates, deletes } = diffAnnotations(db, editor)
		expect(inserts.map((a) => a.id)).toEqual(["b"])
		expect(updates).toEqual([])
		expect(deletes).toEqual([])
	})

	it("detects deletes (in db, not in editor)", () => {
		const db = [mk("a"), mk("b")]
		const editor = [mk("a")]
		const { inserts, updates, deletes } = diffAnnotations(db, editor)
		expect(inserts).toEqual([])
		expect(updates).toEqual([])
		expect(deletes).toEqual(["b"])
	})

	it("detects payload changes as updates", () => {
		const db = [mk("a")]
		const editor = [
			mk("a", {
				payload: { _v: 1, signal: "cross", reason: "wrong" } as never,
			}),
		]
		const { inserts, updates, deletes } = diffAnnotations(db, editor)
		expect(inserts).toEqual([])
		expect(updates.map((a) => a.id)).toEqual(["a"])
		expect(deletes).toEqual([])
	})

	it("handles combined insert + update + delete", () => {
		const db = [mk("a"), mk("b"), mk("c")]
		const editor = [
			mk("a"), // unchanged
			mk("b", { sentiment: "negative" }), // changed
			mk("d"), // new
		]
		const { inserts, updates, deletes } = diffAnnotations(db, editor)
		expect(inserts.map((a) => a.id)).toEqual(["d"])
		expect(updates.map((a) => a.id)).toEqual(["b"])
		expect(deletes).toEqual(["c"])
	})

	describe("with seenIds", () => {
		it("deletes only IDs the editor has seen", () => {
			// DB has a,b,c. Editor only rendered a (others still hydrating).
			// Without seenIds, a naive diff would delete b and c. With
			// seenIds={a}, nothing is deleted because only `a` has been seen
			// and `a` is present in the editor.
			const db = [mk("a"), mk("b"), mk("c")]
			const editor = [mk("a")]
			const seen = new Set(["a"])
			const { deletes } = diffAnnotations(db, editor, seen)
			expect(deletes).toEqual([])
		})

		it("deletes an ID that was seen, then removed from the editor", () => {
			// Teacher loaded `b`, then erased it. `b` is in seenIds and in db
			// but not in editor → legitimate delete.
			const db = [mk("a"), mk("b")]
			const editor = [mk("a")]
			const seen = new Set(["a", "b"])
			const { deletes } = diffAnnotations(db, editor, seen)
			expect(deletes).toEqual(["b"])
		})

		it("does not delete DB rows that were never seen", () => {
			// Mixed: `b` was seen then removed (delete), `c` was never seen
			// because alignment hasn't caught up (protected).
			const db = [mk("a"), mk("b"), mk("c")]
			const editor = [mk("a")]
			const seen = new Set(["a", "b"])
			const { deletes } = diffAnnotations(db, editor, seen)
			expect(deletes).toEqual(["b"])
		})

		it("treats an empty seenIds set as 'nothing seen yet'", () => {
			// Hydration hasn't produced any editor-side observation yet —
			// no deletes should be proposed regardless of db contents.
			const db = [mk("a"), mk("b")]
			const editor: StudentPaperAnnotation[] = []
			const { deletes } = diffAnnotations(db, editor, new Set())
			expect(deletes).toEqual([])
		})
	})
})
