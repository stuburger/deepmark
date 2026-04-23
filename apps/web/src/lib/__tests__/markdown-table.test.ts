import { describe, expect, it } from "vitest"
import { parseMarkdownTable } from "../markdown-table"

describe("parseMarkdownTable", () => {
	it("parses a simple three-column pipe-table", () => {
		const md = [
			"| Year | Revenue | Profit |",
			"|------|---------|--------|",
			"| 2024 | 1.2m    | 120k   |",
			"| 2025 | 1.8m    | 240k   |",
		].join("\n")

		const parsed = parseMarkdownTable(md)
		expect(parsed).not.toBeNull()
		expect(parsed?.headers).toEqual(["Year", "Revenue", "Profit"])
		expect(parsed?.rows).toEqual([
			["2024", "1.2m", "120k"],
			["2025", "1.8m", "240k"],
		])
	})

	it("tolerates missing outer pipes and extra whitespace", () => {
		const md = ["Col A | Col B", "--- | ---", "x | y"].join("\n")
		const parsed = parseMarkdownTable(md)
		expect(parsed?.headers).toEqual(["Col A", "Col B"])
		expect(parsed?.rows).toEqual([["x", "y"]])
	})

	it("returns null when the separator row is missing", () => {
		const md = ["| a | b |", "| c | d |"].join("\n")
		expect(parseMarkdownTable(md)).toBeNull()
	})

	it("returns null for plain prose", () => {
		expect(parseMarkdownTable("This is just a case study.")).toBeNull()
	})

	it("drops empty trailing rows", () => {
		const md = ["| h |", "| - |", "| r1 |", "|   |"].join("\n")
		const parsed = parseMarkdownTable(md)
		expect(parsed?.rows).toEqual([["r1"]])
	})
})
