"use client"

import { useEffect, useState } from "react"

// Renders today's date in the user's locale, mono uppercase, e.g.
// "MONDAY, 28 APRIL 2026". Client-side so the date matches the user's
// timezone, not the server's. Renders empty until mounted to avoid
// hydration mismatch.
export function DashboardDateEyebrow() {
	const [text, setText] = useState("")
	useEffect(() => {
		const today = new Date().toLocaleDateString(undefined, {
			weekday: "long",
			day: "numeric",
			month: "long",
			year: "numeric",
		})
		setText(today)
	}, [])

	return (
		<div className="font-mono text-[10px] tracking-[0.08em] uppercase text-foreground">
			{text || " "}
		</div>
	)
}
