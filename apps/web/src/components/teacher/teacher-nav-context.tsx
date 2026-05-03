"use client"

import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useState,
} from "react"

type TeacherNavContextValue = {
	open: boolean
	setOpen: (open: boolean) => void
}

const TeacherNavContext = createContext<TeacherNavContextValue | null>(null)

export function useTeacherNav(): TeacherNavContextValue {
	const ctx = useContext(TeacherNavContext)
	if (!ctx) {
		throw new Error("useTeacherNav must be used within <TeacherNavProvider>")
	}
	return ctx
}

export function TeacherNavProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false)

	// The body class lets us blur the page chrome (icon rail + content) while
	// the slide-over menu is open. The blur rule lives in globals.css.
	useEffect(() => {
		document.body.classList.toggle("teacher-nav-open", open)
		return () => document.body.classList.remove("teacher-nav-open")
	}, [open])

	return (
		<TeacherNavContext.Provider value={{ open, setOpen }}>
			{children}
		</TeacherNavContext.Provider>
	)
}
