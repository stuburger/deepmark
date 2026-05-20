"use client"

import { type ReactNode, createContext, useContext, useMemo } from "react"

/**
 * Routes the `linkToScan` tool's request from the chat panel to the
 * submission view, without coupling the two via window CustomEvents.
 *
 * The provider lives in `SubmissionView` (which owns the scan-vs-chat
 * panel state and the scrollToQuestion helper); the consumer is the
 * chat surface's `linkToScan` tool callback.
 *
 * Sibling-subtree pattern, same shape as `EditorHandleProvider` — the
 * chat panel is a sibling of the scan panel under a shared parent, so
 * prop-drilling would mean reaching up several layers.
 */

export type LinkToScanRequest = {
	questionId: string
	tokenStart?: string
	tokenEnd?: string
}

type LinkToScanContextValue = {
	linkToScan: (input: LinkToScanRequest) => void
}

const LinkToScanContext = createContext<LinkToScanContextValue | null>(null)

export function LinkToScanProvider({
	children,
	onLinkToScan,
}: {
	children: ReactNode
	onLinkToScan: (input: LinkToScanRequest) => void
}) {
	const value = useMemo(() => ({ linkToScan: onLinkToScan }), [onLinkToScan])
	return (
		<LinkToScanContext.Provider value={value}>
			{children}
		</LinkToScanContext.Provider>
	)
}

/**
 * Returns a `linkToScan` invoker. Falls back to a no-op when used
 * outside a provider so the chat panel can still mount on surfaces
 * (dashboard, /teacher/talk) where no scan view exists.
 */
export function useLinkToScan(): (input: LinkToScanRequest) => void {
	const ctx = useContext(LinkToScanContext)
	if (!ctx) return () => {}
	return ctx.linkToScan
}
