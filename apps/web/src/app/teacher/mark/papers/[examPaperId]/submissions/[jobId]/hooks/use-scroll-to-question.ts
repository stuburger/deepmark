"use client"

import { useCallback, useState } from "react"

export function useScrollToQuestion() {
	const [activeQuestionNumber, setActiveQuestionNumber] = useState<
		string | null
	>(null)

	const scrollToQuestion = useCallback((questionNumber: string) => {
		setActiveQuestionNumber(questionNumber)
		// Find the panel root, then its ScrollArea viewport (the actual scrollable
		// element). Both mobile and desktop layouts render DigitalPanelContent
		// simultaneously (one is CSS-hidden), so querying within the panel
		// guarantees we target the visible desktop element.
		const panelRoot = document.querySelector(
			"[data-results-panel]",
		) as HTMLElement | null
		if (!panelRoot) return
		const viewport = panelRoot.querySelector(
			"[data-slot='scroll-area-viewport']",
		) as HTMLElement | null
		const scrollEl = viewport ?? panelRoot
		const el = scrollEl.querySelector(
			`[id="question-${questionNumber}"]`,
		) as HTMLElement | null
		if (!el) return
		const scrollRect = scrollEl.getBoundingClientRect()
		const elRect = el.getBoundingClientRect()
		scrollEl.scrollTo({
			top: scrollEl.scrollTop + (elRect.top - scrollRect.top) - 16,
			behavior: "smooth",
		})
	}, [])

	return { activeQuestionNumber, scrollToQuestion }
}
