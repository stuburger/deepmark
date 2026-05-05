"use client"

import { Menu } from "lucide-react"
import { useTeacherNav } from "./teacher-nav-context"
import { useTeacherPageTitleContext } from "./teacher-page-title-context"

/**
 * Persistent mobile app bar — `md:hidden`, sits in row 1 of the layout grid
 * so it stays at the top of the viewport while main scrolls below it.
 * Standard mobile pattern: hamburger on the left, page title centred-ish,
 * room for a future right-side action.
 *
 * The hamburger styling matches the IconRail trigger exactly so the brand
 * pattern is consistent across breakpoints.
 */
export function MobileAppBar() {
	const { open, setOpen } = useTeacherNav()
	const { title } = useTeacherPageTitleContext()

	return (
		<div className="flex h-12 items-center gap-2 border-b border-border-quiet bg-background/95 backdrop-blur px-2 md:hidden">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-label={open ? "Close menu" : "Open menu"}
				className="flex size-10 shrink-0 items-center justify-center rounded-md text-ink-tertiary transition-colors hover:bg-primary/15 hover:text-primary"
			>
				<Menu className="size-[18px]" strokeWidth={1.2} />
			</button>
			{title && (
				<p className="truncate text-sm font-medium text-foreground">{title}</p>
			)}
		</div>
	)
}
