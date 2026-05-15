import { describe, expect, it } from "vitest"
import { renderLoRMarkScheme } from "../../src/processors/paper-bundle/render-mark-scheme"
import type { PaperBundleLoRExtraction } from "../../src/processors/paper-bundle/schema"

function singleSkill(): PaperBundleLoRExtraction {
	return {
		indicative_content:
			"Strong responses analyse the writer's use of imagery to evoke isolation.",
		ao_dimensions: [
			{
				ao_code: "AO2",
				marks: 20,
				description: "Language analysis",
				levels: [
					{
						level: 1,
						mark_range: [1, 5],
						descriptor_bullets: [
							"Simple awareness of language choices",
							"Limited textual support",
						],
					},
					{
						level: 2,
						mark_range: [6, 10],
						descriptor_bullets: [
							"Some explanation of language effects",
							"Relevant textual references",
						],
					},
				],
			},
		],
		marker_notes: "Cap at Level 1 if response ignores the extract.",
		extras: null,
	}
}

function multiSkill(): PaperBundleLoRExtraction {
	return {
		indicative_content: "Imaginative writing inspired by the picture.",
		ao_dimensions: [
			{
				ao_code: "AO5",
				marks: 24,
				description: "Content / structure / register",
				levels: [
					{
						level: 1,
						mark_range: [1, 6],
						descriptor_bullets: ["Basic awareness of purpose"],
					},
					{
						level: 2,
						mark_range: [7, 12],
						descriptor_bullets: ["Some control of register"],
					},
				],
			},
			{
				ao_code: "AO6",
				marks: 16,
				description: "Vocabulary / SPaG",
				levels: [
					{
						level: 1,
						mark_range: [1, 4],
						descriptor_bullets: ["Basic vocabulary, frequent errors"],
					},
					{
						level: 2,
						mark_range: [5, 8],
						descriptor_bullets: ["Some range of vocabulary"],
					},
				],
			},
		],
		marker_notes: null,
		extras: null,
	}
}

describe("renderLoRMarkScheme", () => {
	it("renders single-skill LoR with one dimension", () => {
		const out = renderLoRMarkScheme(singleSkill())
		expect(out).toBe(
			[
				"## Indicative content",
				"",
				"Strong responses analyse the writer's use of imagery to evoke isolation.",
				"",
				"## Assessment dimensions",
				"",
				"### AO2 — Language analysis (20 marks)",
				"",
				"**Level 1 (1–5 marks)**",
				"- Simple awareness of language choices",
				"- Limited textual support",
				"",
				"**Level 2 (6–10 marks)**",
				"- Some explanation of language effects",
				"- Relevant textual references",
				"",
				"## Marker notes",
				"",
				"Cap at Level 1 if response ignores the extract.",
			].join("\n"),
		)
	})

	it("renders multi-skill LoR with parallel AO grids in printed order", () => {
		const out = renderLoRMarkScheme(multiSkill())
		expect(out).toContain("### AO5 — Content / structure / register (24 marks)")
		expect(out).toContain("### AO6 — Vocabulary / SPaG (16 marks)")
		// AO5 must precede AO6 in printed order.
		expect(out.indexOf("AO5")).toBeLessThan(out.indexOf("AO6"))
		// Marks total reflected per dimension, not summed.
		expect(out).toContain("(24 marks)")
		expect(out).toContain("(16 marks)")
	})

	it("is byte-identical across repeated calls with the same input (repeatability)", () => {
		const a = renderLoRMarkScheme(multiSkill())
		const b = renderLoRMarkScheme(multiSkill())
		expect(a).toBe(b)
	})

	it("appends extras verbatim at the end with no header", () => {
		const intermediate = singleSkill()
		intermediate.extras =
			"Shared note: refer to the writing assessment grids when marking Q5 and Q6."
		const out = renderLoRMarkScheme(intermediate)
		expect(out.endsWith(intermediate.extras)).toBe(true)
		// No header injected.
		expect(out).not.toContain("## Extras")
	})

	it("falls back to a description-only header when ao_code is empty (no-AO LoR)", () => {
		const out = renderLoRMarkScheme({
			indicative_content: "",
			ao_dimensions: [
				{
					ao_code: "",
					marks: 6,
					description: "Overall response quality",
					levels: [
						{
							level: 1,
							mark_range: [1, 2],
							descriptor_bullets: ["Basic"],
						},
					],
				},
			],
			marker_notes: null,
			extras: null,
		})
		expect(out).toContain("### Overall response quality (6 marks)")
	})

	it("renders single-mark level as 'N mark' not 'N–N marks'", () => {
		const out = renderLoRMarkScheme({
			indicative_content: "",
			ao_dimensions: [
				{
					ao_code: "AO1",
					marks: 1,
					description: "",
					levels: [
						{
							level: 1,
							mark_range: [1, 1],
							descriptor_bullets: ["Identifies the term"],
						},
					],
				},
			],
			marker_notes: null,
			extras: null,
		})
		expect(out).toContain("**Level 1 (1 mark)**")
		expect(out).toContain("### AO1 (1 mark)")
	})

	it("omits the indicative-content header when indicative_content is empty", () => {
		const out = renderLoRMarkScheme({
			indicative_content: "",
			ao_dimensions: [
				{
					ao_code: "AO1",
					marks: 6,
					description: "",
					levels: [
						{
							level: 1,
							mark_range: [1, 2],
							descriptor_bullets: ["Basic"],
						},
					],
				},
			],
			marker_notes: null,
			extras: null,
		})
		expect(out).not.toContain("## Indicative content")
		expect(out.startsWith("## Assessment dimensions")).toBe(true)
	})

	it("omits the marker-notes header when marker_notes is null or blank", () => {
		const intermediate = singleSkill()
		intermediate.marker_notes = null
		const out = renderLoRMarkScheme(intermediate)
		expect(out).not.toContain("## Marker notes")
	})
})
