"use client"

import { useCallback } from "react"

/**
 * Returns a scroll function that updates the active question (via the provided
 * setter) and smoothly scrolls the visible results panel to that question card.
 */
export function useScrollToQuestion(
	setActiveQuestionNumber: (value: string) => undefined | Promise<unknown>,
) {
	return useCallback(
		(questionNumber: string) => {
			setActiveQuestionNumber(questionNumber)
			// Defer to the next paint so any tab-switch or layout change triggered
			// by the caller has time to render before we measure the DOM.
			requestAnimationFrame(() => {
				// Both mobile and desktop layouts each render a [data-results-panel].
				// Only the currently visible one has a non-zero bounding rect, so we
				// skip panels that are CSS-hidden (display:none → height === 0).
				const allPanels = document.querySelectorAll("[data-results-panel]")
				const panelRoot = Array.from(allPanels).find(
					(el) => (el as HTMLElement).getBoundingClientRect().height > 0,
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
			})
		},
		[setActiveQuestionNumber],
	)
}
