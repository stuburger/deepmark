"use client"

import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react"

type TeacherPageTitleContextValue = {
	title: string | null
	setTitle: (title: string | null) => void
}

const TeacherPageTitleContext =
	createContext<TeacherPageTitleContextValue | null>(null)

/**
 * Page-driven title for the mobile app bar. Pages opt in by calling
 * `usePageTitle("…")` from a client component; the title is shown in the
 * mobile app bar (h-12) above the page content.
 *
 * Pages that already render a large hero (dashboard greeting, exam-paper
 * detail's mobile header) can skip this — leaving the app bar as just a
 * hamburger is fine.
 */
export function TeacherPageTitleProvider({
	children,
}: { children: ReactNode }) {
	const [title, setTitle] = useState<string | null>(null)
	const value = useMemo(() => ({ title, setTitle }), [title])
	return (
		<TeacherPageTitleContext.Provider value={value}>
			{children}
		</TeacherPageTitleContext.Provider>
	)
}

export function useTeacherPageTitleContext(): TeacherPageTitleContextValue {
	const ctx = useContext(TeacherPageTitleContext)
	if (!ctx) {
		throw new Error(
			"useTeacherPageTitleContext must be used within <TeacherPageTitleProvider>",
		)
	}
	return ctx
}

/**
 * Set the mobile app bar title for the lifetime of the calling component.
 * Clears on unmount so navigating away leaves the bar empty (the next page
 * sets its own title or skips it).
 */
export function usePageTitle(title: string | null) {
	const { setTitle } = useTeacherPageTitleContext()
	useEffect(() => {
		setTitle(title)
		return () => setTitle(null)
	}, [title, setTitle])
}
