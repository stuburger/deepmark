import { runBatch } from "@/lib/infra/run-batch"
import {
	callClassifyBlankPage,
	callClassifyPageBoundary,
} from "@/lib/script-ingestion/classify-calls"
import type { PageData, PageGroup } from "@/lib/script-ingestion/types"

// ─── Separator mode: split on blank pages ─────────────────────────────────────

export function classifyBoundariesSeparatorMode(
	pages: PageData[],
	blankIndices: Set<number>,
): PageGroup[] {
	const groups: PageGroup[] = []
	let currentPages: PageData[] = []

	for (const page of pages) {
		if (blankIndices.has(page.absoluteIndex)) {
			if (currentPages.length > 0) {
				groups.push({
					pages: currentPages,
					proposedName: null,
					confidence: 0.95,
					hasUncertainPage: false,
				})
				currentPages = []
			}
		} else {
			currentPages.push(page)
		}
	}

	if (currentPages.length > 0) {
		groups.push({
			pages: currentPages,
			proposedName: null,
			confidence: 0.95,
			hasUncertainPage: false,
		})
	}

	return groups
}

// ─── Script-page mode: per-page binary boundary classifier (fan-out/fan-in) ───

export async function classifyBoundariesScriptPageMode(
	pages: PageData[],
	blankIndices: Set<number>,
	nonBlankIndices: number[],
): Promise<PageGroup[]> {
	type BoundaryResult = {
		absoluteIndex: number
		isScriptStart: boolean | null
		confidence: number
	}

	type BlankResult = {
		absoluteIndex: number
		classification: "separator" | "script_page" | "artifact"
	}

	// Fan-out 1: boundary classification for non-blank pages (skip index 0)
	const boundaryInputs = nonBlankIndices
		.filter((idx) => idx > 0)
		.map((idx) => {
			const prevNonBlankIdx = nonBlankIndices.filter((i) => i < idx).pop()
			const prevPage =
				prevNonBlankIdx !== undefined ? (pages[prevNonBlankIdx] ?? null) : null
			return {
				absoluteIndex: idx,
				prevPage,
				currentPage: pages[idx]!,
			}
		})

	// Fan-out 2: blank page 3-context classification
	const blankInputs = [...blankIndices]
		.sort((a, b) => a - b)
		.map((idx) => {
			const prevNonBlankIdx = nonBlankIndices.filter((i) => i < idx).pop()
			const nextNonBlankIdx = nonBlankIndices.find((i) => i > idx)
			return {
				absoluteIndex: idx,
				prevPage:
					prevNonBlankIdx !== undefined
						? (pages[prevNonBlankIdx] ?? null)
						: null,
				nextPage:
					nextNonBlankIdx !== undefined
						? (pages[nextNonBlankIdx] ?? null)
						: null,
			}
		})

	const [boundaryResults, blankResults] = await Promise.all([
		runBatch(
			boundaryInputs,
			async ({ absoluteIndex, prevPage, currentPage }) => {
				const result = await callClassifyPageBoundary(prevPage, currentPage)
				return { absoluteIndex, ...result } satisfies BoundaryResult
			},
			10,
		),
		runBatch(
			blankInputs,
			async ({ absoluteIndex, prevPage, nextPage }) => {
				const classification = await callClassifyBlankPage(prevPage, nextPage)
				return { absoluteIndex, classification } satisfies BlankResult
			},
			10,
		),
	])

	const boundaryMap = new Map(boundaryResults.map((r) => [r.absoluteIndex, r]))
	const blankMap = new Map(blankResults.map((r) => [r.absoluteIndex, r]))

	// Fan-in: walk all pages and build groups
	const groups: PageGroup[] = []
	let currentPages: PageData[] = []
	let currentConfidences: number[] = []
	let hasUncertain = false
	let firstNonBlankSeen = false

	function finalizeGroup() {
		if (currentPages.length === 0) return
		const confidence =
			currentConfidences.length > 0
				? currentConfidences.reduce((a, b) => a + b, 0) /
					currentConfidences.length
				: 0.5
		groups.push({
			pages: currentPages,
			proposedName: null,
			confidence,
			hasUncertainPage: hasUncertain,
		})
		currentPages = []
		currentConfidences = []
		hasUncertain = false
	}

	for (const page of pages) {
		const idx = page.absoluteIndex

		if (blankIndices.has(idx)) {
			const blankResult = blankMap.get(idx)
			const classification = blankResult?.classification ?? "artifact"

			if (classification === "separator") {
				finalizeGroup()
			} else if (classification === "script_page") {
				currentPages.push(page)
				currentConfidences.push(0.7)
			}
			// artifact: skip
		} else {
			if (!firstNonBlankSeen) {
				firstNonBlankSeen = true
				currentPages.push(page)
				currentConfidences.push(1.0)
			} else {
				const result = boundaryMap.get(idx)
				const isStart = result?.isScriptStart ?? null
				const confidence = result?.confidence ?? 0.0

				if (isStart === true) {
					finalizeGroup()
					currentPages.push(page)
					currentConfidences.push(confidence)
				} else if (isStart === false) {
					currentPages.push(page)
					currentConfidences.push(confidence)
				} else {
					currentPages.push(page)
					currentConfidences.push(confidence)
					hasUncertain = true
				}
			}
		}
	}

	finalizeGroup()

	return groups
}
