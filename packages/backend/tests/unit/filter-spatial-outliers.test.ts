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

	// ── Real data: Q02.5 paragraph gap bug (Opus, page 3) ──────────────
	// Opus correctly assigned ALL 163 tokens on page 3 to Q02.5.
	// But a 36px paragraph gap between the first paragraph (y≈68-216) and
	// the second paragraph (y≈252+) caused filterSpatialOutliers to split
	// and discard the 46-token first paragraph as an "outlier", shrinking
	// the answer_region from [68,...] to [252,...].
	//
	// A 46-token cluster (28% of total) is NOT an outlier — it's a paragraph.

	const REAL_Q025_PAGE3_BBOXES: Bbox[] = [
		// Paragraph 1: "they are distracted this leads to ... less profit."
		// 46 tokens, y≈68-243
		[68, 157, 92, 230],   // "they"
		[68, 251, 92, 303],   // "are"
		[68, 328, 95, 506],   // "distracted"
		[71, 536, 95, 609],   // "this"
		[71, 628, 98, 738],   // "leads"
		[73, 753, 98, 795],   // "to"
		[74, 787, 98, 805],   // "."
		[90, 149, 124, 320],  // "customers"
		[93, 326, 126, 450],  // "noticing"
		[96, 469, 129, 544],  // "that"
		[98, 554, 130, 613],  // "the"
		[99, 628, 132, 743],  // "quality"
		[102, 757, 133, 801], // "is"
		[102, 799, 135, 902], // "worse"
		[121, 155, 145, 199], // "in"
		[121, 201, 147, 293], // "their"
		[123, 308, 148, 374], // "tea"
		[124, 395, 150, 490], // "bags"
		[127, 508, 153, 571], // "and"
		[129, 607, 156, 795], // "customers"
		[132, 795, 157, 879], // "will"
		[147, 153, 176, 278], // "become"
		[150, 295, 178, 347], // "de"
		[150, 360, 181, 523], // "satisfied"
		[151, 341, 178, 358], // "-"
		[153, 544, 184, 705], // "therefore"
		[157, 722, 185, 814], // "sales"
		[159, 839, 188, 914], // "will"
		[175, 146, 201, 211], // "go"
		[175, 218, 203, 316], // "down"
		[176, 331, 206, 483], // "because"
		[179, 494, 207, 563], // "the"
		[181, 573, 210, 722], // "product"
		[184, 736, 210, 799], // "isn't"
		[185, 818, 210, 858], // "as"
		[200, 151, 230, 243], // "good"
		[203, 251, 231, 299], // "as"
		[203, 308, 231, 347], // "it"
		[204, 347, 233, 441], // "used"
		[206, 458, 236, 510], // "to"
		[207, 502, 236, 550], // "be"
		[207, 544, 237, 644], // "which"
		[210, 663, 239, 751], // "means"
		[212, 768, 241, 839], // "less"
		[213, 851, 243, 954], // "profit"
		[216, 956, 243, 975], // "."
		// ── 36px paragraph gap here (y=216 → y=252) ──
		// Paragraph 2+: "Overall I think that Taylors should increase ..."
		// 117 tokens, y≈252-705
		[252, 136, 280, 264], // "Overall"
		[255, 274, 279, 303], // "I"
		[256, 310, 281, 408], // "think"
		[258, 423, 284, 490], // "that"
		[259, 510, 287, 636], // "Taylors"
		[262, 646, 290, 776], // "should"
		[265, 795, 293, 935], // "increase"
		[281, 138, 310, 226], // "their"
		[283, 234, 313, 370], // "customer"
		[286, 379, 316, 563], // "engagement"
		[290, 579, 317, 642], // "be"
		[293, 732, 319, 768], // "I"
		[293, 776, 323, 916], // "decided"
		[310, 136, 341, 220], // "this"
		[311, 218, 344, 389], // "because"
		[316, 393, 347, 529], // "building"
		[317, 536, 351, 730], // "relationships"
		[321, 738, 353, 814], // "with"
		[323, 816, 356, 977], // "customers"
		[335, 136, 364, 207], // "can"
		[335, 215, 363, 266], // "be"
		[335, 268, 366, 385], // "highly"
		[336, 395, 369, 575], // "beneficial"
		[341, 594, 369, 644], // "for"
		[341, 655, 369, 709], // "the"
		[341, 718, 372, 870], // "business"
		[367, 299, 391, 339], // "e"
		[367, 351, 393, 435], // "and"
		[369, 448, 393, 487], // "it"
		[370, 496, 396, 563], // "can"
		[370, 579, 397, 657], // "help"
		[372, 678, 400, 805], // "increase"
		[375, 816, 401, 906], // "sales"
		[393, 138, 415, 205], // "and"
		[393, 224, 418, 395], // "customers"
		[396, 408, 419, 475], // "will"
		[397, 492, 421, 582], // "have"
		[400, 607, 424, 726], // "positive"
		[403, 751, 427, 881], // "reviews"
		[406, 870, 427, 891], // "."
		[421, 134, 449, 190], // "for"
		[421, 203, 450, 270], // "the"
		[422, 280, 450, 431], // "company"
		[424, 431, 450, 452], // ","
		[424, 452, 453, 592], // "however"
		[427, 607, 456, 684], // "when"
		[428, 707, 458, 885], // "employees"
		[443, 136, 474, 205], // "are"
		[444, 218, 477, 387], // "building"
		[449, 402, 479, 502], // "these"
		[450, 517, 484, 741], // "relationships"
		[455, 757, 486, 843], // "that"
		[456, 831, 487, 923], // "they"
		[468, 134, 496, 224], // "need"
		[471, 236, 498, 278], // "to"
		[471, 285, 501, 395], // "ensure"
		[476, 416, 502, 496], // "that"
		[477, 515, 505, 609], // "they"
		[480, 617, 507, 688], // "can"
		[481, 705, 510, 797], // "still"
		[484, 820, 514, 925], // "make"
		[496, 128, 526, 220], // "sure"
		[498, 234, 527, 299], // "the"
		[501, 316, 532, 450], // "quality"
		[504, 471, 532, 519], // "of"
		[505, 525, 533, 586], // "the"
		[507, 596, 536, 730], // "product"
		[510, 757, 536, 789], // "is"
		[511, 795, 539, 847], // "as"
		[511, 849, 541, 941], // "good"
		[526, 130, 553, 182], // "as"
		[526, 186, 553, 222], // "it"
		[526, 226, 556, 295], // "can"
		[527, 297, 556, 362], // "be"
		[527, 354, 554, 381], // "."
		[529, 377, 557, 450], // "In"
		[529, 446, 559, 515], // "the"
		[530, 536, 559, 623], // "case"
		[532, 649, 561, 757], // "study"
		[533, 764, 561, 837], // "to"
		[535, 860, 563, 933], // "the"
		[554, 138, 582, 291], // "company"
		[557, 299, 584, 395], // "have"
		[559, 410, 585, 506], // "spent"
		[560, 523, 587, 594], // "over"
		[561, 613, 587, 655], // "of"
		[563, 768, 588, 793], // "£"
		[563, 793, 591, 944], // "484000"
		[581, 142, 607, 180], // "in"
		[581, 195, 610, 379], // "charitable"
		[584, 391, 613, 577], // "community"
		[588, 582, 618, 755], // "activities"
		[593, 780, 619, 822], // "in"
		[594, 824, 621, 883], // "the"
		[596, 897, 622, 948], // "UK"
		[606, 123, 633, 203], // "and"
		[609, 211, 634, 270], // "64"
		[609, 253, 633, 282], // ","
		[609, 268, 637, 425], // "1123,075"
		[613, 429, 641, 611], // "going"
		[621, 720, 646, 782], // "to"
		[621, 772, 649, 923], // "support"
		[624, 900, 650, 967], // "the"
		[631, 119, 658, 169], // "to"
		[631, 186, 661, 276], // "this"
		[634, 291, 664, 404], // "shows"
		[637, 416, 665, 504], // "that"
		[640, 515, 668, 586], // "the"
		[641, 596, 673, 755], // "company"
		[646, 766, 674, 845], // "has"
		[656, 130, 687, 278], // "realised"
		[661, 293, 690, 356], // "the"
		[662, 356, 695, 536], // "importance"
		[668, 544, 696, 584], // "of"
		[668, 603, 701, 757], // "customer"
		[673, 757, 705, 923], // "engagement"
		[677, 925, 704, 946], // "."
	]

	it("preserves all tokens in Q02.5 multi-paragraph answer (no false split on paragraph gap)", () => {
		const filtered = filterSpatialOutliers(REAL_Q025_PAGE3_BBOXES)

		// All 163 tokens should be preserved — the 36px paragraph gap is
		// NOT an outlier, it's a normal paragraph break.
		expect(filtered).toHaveLength(163)
	})

	it("hull of Q02.5 filtered tokens covers both paragraphs", () => {
		const filtered = filterSpatialOutliers(REAL_Q025_PAGE3_BBOXES)

		const yMin = Math.min(...filtered.map((b) => b[0]))
		const yMax = Math.max(...filtered.map((b) => b[2]))

		// Must start from the first paragraph (~68), not the second (~252)
		expect(yMin).toBeLessThanOrEqual(68)
		expect(yMax).toBeGreaterThanOrEqual(700)
	})

	it("still removes a single stray token from Q02.5 data", () => {
		// Add a single stray token at y=900 (far below the answer)
		const withStray: Bbox[] = [
			...REAL_Q025_PAGE3_BBOXES,
			[900, 500, 920, 600], // stray token
		]
		const filtered = filterSpatialOutliers(withStray)

		// The stray should be removed, but all 163 real tokens kept
		expect(filtered).toHaveLength(163)
		expect(filtered.every((b) => b[0] <= 680)).toBe(true)
	})

	it("still removes a stray token from Q01.7 data with the new algorithm", () => {
		// The original Q01.7 bug: 1 stray token at y=355, main cluster at y=532+
		// This must STILL be filtered — 1 token vs 32 is genuinely an outlier.
		const filtered = filterSpatialOutliers(REAL_Q017_BBOXES)
		expect(filtered).toHaveLength(32)
		expect(filtered.every((b) => b[0] >= 500)).toBe(true)
	})
})
