"use client"

import { Mic, Plus } from "lucide-react"
import { useState } from "react"

import { TalkToDeepMarkDialog } from "./talk-to-deepmark-dialog"

// Centred chat anchor on the dashboard. Per Geoff's v2 design this is the
// primary interaction surface — large, pill-shaped, lighter styling. Click
// opens the Talk to DeepMark dialog. The 24px radius is the single named
// exception to the v1.1 no-pills rule (see --radius-pill in globals.css).
export function AskAnythingPill() {
	const [open, setOpen] = useState(false)

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex h-[42px] w-full max-w-[600px] cursor-text items-center gap-3 rounded-pill border border-border bg-card/95 px-4 text-left shadow-tile transition-colors hover:bg-card"
			>
				<Plus className="size-3.5 shrink-0 text-ink-tertiary" />
				<span className="flex-1 text-[13px] text-ink-tertiary">
					Ask anything
				</span>
				<Mic className="size-3.5 shrink-0 text-ink-tertiary" />
			</button>

			<TalkToDeepMarkDialog open={open} onOpenChange={setOpen} />
		</>
	)
}
