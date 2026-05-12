"use client"

import { useState } from "react"

import { cn } from "@/lib/utils"

const WWW_TEXT =
	"Confident grasp of the inputs and products. Naming chloroplasts up front is a strong opener — most students forget to anchor the location."

const EBF_TEXT =
	"Push the explanation one stage further: name the light-dependent and light-independent reactions and you'd hit top-band on every mark scheme this exam board has run for the last six years."

const FB_MESSAGES = [
	"You're the reason a student got it right today.",
	"1,247 papers marked by your school this term. That's mostly you.",
	"Have you stretched in the last hour? Two minutes. Go.",
	"Take the next 30 seconds. Look out of a window.",
	"Tomorrow-you will thank present-you. Stop at 10pm.",
	"A small thank-you to past-you for prepping this lesson.",
	"Marking with care? They can tell. Honestly.",
	"You've earned the next cup of tea. Just saying.",
]

type Tag = "www" | "ebf" | "fb"

export function MarkingFeedbackTags() {
	const [openTag, setOpenTag] = useState<Tag>("www")
	const [fbIndex, setFbIndex] = useState(0)

	function handleClick(tag: Tag) {
		if (tag === "fb" && openTag === "fb") {
			setFbIndex((i) => (i + 1) % FB_MESSAGES.length)
			return
		}
		setOpenTag(tag)
	}

	const content =
		openTag === "www"
			? WWW_TEXT
			: openTag === "ebf"
				? EBF_TEXT
				: FB_MESSAGES[fbIndex]

	const contentKey = openTag === "fb" ? `fb-${fbIndex}` : openTag

	return (
		<div className="mt-5 border-t border-border-quiet pt-4">
			<div className="flex flex-wrap gap-1.5">
				<TagChip
					label="WWW"
					tone="success"
					active={openTag === "www"}
					onClick={() => handleClick("www")}
				/>
				<TagChip
					label="EBF"
					tone="warning"
					active={openTag === "ebf"}
					onClick={() => handleClick("ebf")}
				/>
				<TagChip
					label="FB"
					tone="info"
					active={openTag === "fb"}
					onClick={() => handleClick("fb")}
				/>
			</div>

			<p
				key={contentKey}
				className="mt-3 font-sans text-xs leading-relaxed text-muted-foreground"
			>
				{content}
			</p>
		</div>
	)
}

type Tone = "success" | "warning" | "info"

const TONE_CLASSES: Record<Tone, { base: string; active: string }> = {
	success: {
		base: "bg-success-50 text-success-700",
		active: "bg-success-100 text-success-800",
	},
	warning: {
		base: "bg-warning-50 text-warning-800",
		active: "bg-warning-100 text-warning-900",
	},
	info: {
		base: "bg-teal-50 text-primary",
		active: "bg-teal-100 text-teal-700",
	},
}

/* Vanilla <button> rather than the shared <Button> component: these are
   discoverable easter-egg tags, not standard CTAs. Per the design ask there is
   intentionally no hover state, no cursor-pointer, and no focus ring beyond
   the default — they should read as static marking annotations until clicked. */
function TagChip({
	label,
	tone,
	active,
	onClick,
}: {
	label: string
	tone: Tone
	active: boolean
	onClick: () => void
}) {
	const { base, active: activeClass } = TONE_CLASSES[tone]
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"select-none rounded-[5px] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide cursor-default focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
				active ? activeClass : base,
			)}
		>
			{label}
		</button>
	)
}
