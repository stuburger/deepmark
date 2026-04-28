import { DOC_FRAGMENT_NAME } from "@mcp-gcse/shared"
import { useEffect, useState } from "react"
import type * as Y from "yjs"

export type DocScoreTotals = {
	awarded: number
	max: number
	hasData: boolean
}

const EMPTY: DocScoreTotals = { awarded: 0, max: 0, hasData: false }

type RawTeacherOverride = { score?: number | null } | null | undefined
type RawMcqRow = {
	awardedScore?: number | null
	maxScore?: number | null
	teacherOverride?: RawTeacherOverride
}

function effectiveScore(
	awardedScore: number | null | undefined,
	override: RawTeacherOverride,
): number {
	const overrideScore = override?.score
	if (typeof overrideScore === "number") return overrideScore
	return awardedScore ?? 0
}

/**
 * Live totals computed from the Y.Doc. Walks top-level `questionAnswer` and
 * `mcqTable` nodes, summing each block's effective awarded score
 * (`teacherOverride.score ?? awardedScore`) and `maxScore`. Subscribes to doc
 * updates so teacher edits in the editor reflect in the toolbar without
 * waiting for the projection Lambda → Postgres round-trip.
 *
 * `hasData` flips true once the doc contains any block with a non-null
 * `maxScore`; before that, callers should fall back to the server payload to
 * avoid showing 0/0 during initial sync.
 */
export function useDocScoreTotals(ydoc: Y.Doc | null): DocScoreTotals {
	const [totals, setTotals] = useState<DocScoreTotals>(EMPTY)

	useEffect(() => {
		if (!ydoc) {
			setTotals(EMPTY)
			return
		}
		const fragment = ydoc.getXmlFragment(DOC_FRAGMENT_NAME)

		const recompute = () => {
			let awarded = 0
			let max = 0
			let hasData = false

			fragment.forEach((child) => {
				const el = child as unknown as {
					nodeName?: string
					getAttribute?: (name: string) => unknown
				}
				const name = el.nodeName
				const get = el.getAttribute?.bind(el)
				if (!name || !get) return

				if (name === "questionAnswer") {
					const maxScore = get("maxScore") as number | null | undefined
					const awardedScore = get("awardedScore") as number | null | undefined
					const override = get("teacherOverride") as RawTeacherOverride
					if (maxScore != null) {
						max += maxScore
						hasData = true
					}
					awarded += effectiveScore(awardedScore, override)
					return
				}

				if (name === "mcqTable") {
					const rows = (get("results") as RawMcqRow[] | null | undefined) ?? []
					for (const row of rows) {
						if (row.maxScore != null) {
							max += row.maxScore
							hasData = true
						}
						awarded += effectiveScore(row.awardedScore, row.teacherOverride)
					}
				}
			})

			setTotals((prev) =>
				prev.awarded === awarded && prev.max === max && prev.hasData === hasData
					? prev
					: { awarded, max, hasData },
			)
		}

		recompute()
		ydoc.on("update", recompute)
		return () => {
			ydoc.off("update", recompute)
		}
	}, [ydoc])

	return totals
}
