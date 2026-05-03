"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

// Lora dashboard greeting. Per the v1.1 design system (with Geoff's v2
// override), this is the only place Lora appears in the product. Do not use
// this component anywhere else — that's the rule, not a suggestion.
// Spec: geoff_ui_claude_design/v2/deepmark_design_system.html section 02.

type GreetingProps = {
	name: string
	className?: string
}

function timeOfDay(hour: number): "morning" | "afternoon" | "evening" {
	if (hour < 12) return "morning"
	if (hour < 18) return "afternoon"
	return "evening"
}

const TYPE_INTERVAL_MS = 32 // ~30 chars/sec
const TYPE_INITIAL_DELAY_MS = 100

export function Greeting({ name, className }: GreetingProps) {
	// Render a stable greeting on the server, then update to a time-of-day
	// phrase once we know the user's local hour. Avoids hydration mismatch.
	const [phase, setPhase] = useState<
		"morning" | "afternoon" | "evening" | null
	>(null)
	const [typedLength, setTypedLength] = useState(0)

	useEffect(() => {
		setPhase(timeOfDay(new Date().getHours()))
	}, [])

	const fullText = phase ? `Good ${phase}, ${name}.` : `Hello, ${name}.`

	useEffect(() => {
		if (!phase) return

		// Skip the typewriter for users who prefer reduced motion. Cheaper than
		// fighting accessibility settings — they get the final string instantly.
		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches
		if (reduceMotion) {
			setTypedLength(fullText.length)
			return
		}

		setTypedLength(0)
		const start = window.setTimeout(() => {
			const interval = window.setInterval(() => {
				setTypedLength((n) => {
					if (n >= fullText.length) {
						window.clearInterval(interval)
						return n
					}
					return n + 1
				})
			}, TYPE_INTERVAL_MS)
		}, TYPE_INITIAL_DELAY_MS)

		return () => window.clearTimeout(start)
	}, [phase, fullText.length])

	// Reserve space with an invisible suffix so the heading doesn't reflow as
	// characters appear. Screen readers get the full string via aria-label and
	// skip the per-character animation entirely.
	const visible = fullText.slice(0, typedLength)
	const hidden = fullText.slice(typedLength)

	return (
		<h1
			className={cn(
				"font-editorial text-[clamp(36px,5vw,52px)] leading-[1.1] font-normal tracking-[-0.01em] text-foreground",
				className,
			)}
			aria-label={fullText}
		>
			<span aria-hidden>{visible}</span>
			<span aria-hidden className="opacity-0">
				{hidden}
			</span>
		</h1>
	)
}
