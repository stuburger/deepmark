import { DOC_FRAGMENT_NAME } from "@mcp-gcse/shared"
import { useEffect, useState } from "react"
import type * as Y from "yjs"

/**
 * Subscribes to Y.Doc updates and reports whether the doc currently contains
 * at least one `questionAnswer` or `mcqTable` block. Used to gate UI on
 * whether the OCR Lambda has finished seeding the document.
 */
export function useDocHasQuestionBlocks(ydoc: Y.Doc | null): boolean {
	const [hasBlocks, setHasBlocks] = useState(false)

	useEffect(() => {
		if (!ydoc) return
		const fragment = ydoc.getXmlFragment(DOC_FRAGMENT_NAME)
		const check = () => {
			let found = false
			fragment.forEach((child) => {
				if (found) return
				const name = (child as { nodeName?: string }).nodeName
				if (name === "questionAnswer" || name === "mcqTable") found = true
			})
			setHasBlocks(found)
		}
		check()
		ydoc.on("update", check)
		return () => {
			ydoc.off("update", check)
		}
	}, [ydoc])

	return hasBlocks
}
