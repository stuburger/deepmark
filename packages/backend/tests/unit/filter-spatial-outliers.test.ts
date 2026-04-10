import { describe, expect, it } from "vitest"
import { filterSpatialOutliers } from "../../src/lib/scan-extraction/filter-spatial-outliers"

// Bbox format: [yMin, xMin, yMax, xMax]
type Bbox = [number, number, number, number]

describe("filterSpatialOutliers", () => {
	// ── Real data from submission cmntd6sba00042zw3mifl49xt ──────────────
	// Question 01.7 was assigned 33 tokens. Token 0 ("broke") at y=355 is
	// a stray from the 01.5 answer area. The actual 01.7 answer starts at
	// y=532. The 177px gap between the outlier and the main cluster
	// stretched the hull from y=355→645 (overlapping 01.5 and 01.6).

	const REAL_Q017_BBOXES: Bbox[] = [
		[355, 904, 374, 927], // ← outlier: "broke" (corrected from "it"), in 01.5 region
		[532, 134, 557, 161], // "1"     — actual answer starts here
		[532, 146, 557, 169], // ")"
		[532, 186, 558, 293], // "replace"
		[533, 322, 560, 356], // "it"
		[535, 368, 560, 389], // "&"
		[535, 416, 563, 471], // "by"
		[536, 490, 563, 596], // "saying"
		[539, 634, 565, 707], // "you"
		[539, 728, 567, 795], // "lost"
		[541, 787, 565, 805], // "."
		[542, 820, 555, 849], // "it"
		[542, 864, 555, 904], // "or" → "money"
		[560, 270, 574, 285], // "."
		[561, 134, 578, 222], // "broke" → "or"
		[561, 230, 576, 262], // "it"
		[581, 126, 615, 161], // "2"
		[581, 146, 615, 172], // ")"
		[581, 172, 616, 295], // "refund"
		[583, 320, 619, 387], // "you"
		[584, 400, 619, 462], // "by"
		[584, 469, 621, 575], // "giving"
		[587, 603, 622, 684], // "you"
		[589, 703, 624, 780], // "thes" → "the"
		[596, 793, 621, 908], // "money" → "back"
		[616, 251, 641, 322], // "that"
		[616, 345, 641, 412], // "you"
		[616, 427, 642, 533], // "payed"
		[618, 569, 642, 651], // "paid"
		[618, 682, 642, 745], // "for"
		[619, 757, 644, 803], // "the"
		[619, 828, 645, 956], // "product"
		[619, 952, 644, 971], // "."
	]

	it("removes the stray token from real Q01.7 data", () => {
		const filtered = filterSpatialOutliers(REAL_Q017_BBOXES)

		// The outlier at y=355 should be removed
		expect(filtered).toHaveLength(32)
		expect(filtered.every((b) => b[0] >= 500)).toBe(true)
	})

	it("preserves the correct hull bounds after filtering", () => {
		const filtered = filterSpatialOutliers(REAL_Q017_BBOXES)

		// After removing the outlier, yMin should be ~532, not 355
		const yMin = Math.min(...filtered.map((b) => b[0]))
		const yMax = Math.max(...filtered.map((b) => b[2]))
		expect(yMin).toBeGreaterThanOrEqual(530)
		expect(yMax).toBeLessThanOrEqual(975)
	})

	// ── Edge cases ──────────────────────────────────────────────────────

	it("returns all bboxes when there are no outliers", () => {
		// Tightly packed cluster — no gaps
		const tight: Bbox[] = [
			[100, 50, 120, 200],
			[105, 50, 125, 200],
			[110, 50, 130, 200],
			[115, 50, 135, 200],
		]
		const filtered = filterSpatialOutliers(tight)
		expect(filtered).toHaveLength(4)
	})

	it("returns all bboxes for a single token", () => {
		const single: Bbox[] = [[100, 50, 120, 200]]
		expect(filterSpatialOutliers(single)).toHaveLength(1)
	})

	it("returns all bboxes for two tokens", () => {
		// With only two tokens we can't reliably detect outliers —
		// both could be the "cluster". Keep them both.
		const pair: Bbox[] = [
			[100, 50, 120, 200],
			[500, 50, 520, 200],
		]
		expect(filterSpatialOutliers(pair)).toHaveLength(2)
	})

	it("returns empty for empty input", () => {
		expect(filterSpatialOutliers([])).toHaveLength(0)
	})

	it("removes outliers on both ends", () => {
		// Stray token above AND below the main cluster
		const withBothEnds: Bbox[] = [
			[50, 100, 70, 200], // ← outlier above
			[300, 100, 320, 200],
			[305, 100, 325, 200],
			[310, 100, 330, 200],
			[315, 100, 335, 200],
			[320, 100, 340, 200],
			[800, 100, 820, 200], // ← outlier below
		]
		const filtered = filterSpatialOutliers(withBothEnds)
		expect(filtered).toHaveLength(5)
		expect(filtered.every((b) => b[0] >= 250 && b[0] <= 400)).toBe(true)
	})

	it("keeps a genuinely contiguous tall answer", () => {
		// An answer that spans most of the page — tokens every ~25px from
		// y=100 to y=900. No large gaps, so nothing should be removed.
		const tallAnswer: Bbox[] = Array.from({ length: 32 }, (_, i) => {
			const y = 100 + i * 25
			return [y, 100, y + 20, 300] as Bbox
		})
		const filtered = filterSpatialOutliers(tallAnswer)
		expect(filtered).toHaveLength(32)
	})

	it("handles multiple small clusters — keeps the largest", () => {
		// Cluster A: 3 tokens around y=100
		// Cluster B: 8 tokens around y=500 (largest)
		// Cluster C: 2 tokens around y=900
		const multi: Bbox[] = [
			// Cluster A
			[100, 50, 115, 200],
			[105, 50, 120, 200],
			[110, 50, 125, 200],
			// Cluster B (largest)
			[500, 50, 515, 200],
			[505, 50, 520, 200],
			[510, 50, 525, 200],
			[515, 50, 530, 200],
			[520, 50, 535, 200],
			[525, 50, 540, 200],
			[530, 50, 545, 200],
			[535, 50, 550, 200],
			// Cluster C
			[900, 50, 915, 200],
			[905, 50, 920, 200],
		]
		const filtered = filterSpatialOutliers(multi)
		expect(filtered).toHaveLength(8)
		expect(filtered.every((b) => b[0] >= 490 && b[0] <= 550)).toBe(true)
	})
})
