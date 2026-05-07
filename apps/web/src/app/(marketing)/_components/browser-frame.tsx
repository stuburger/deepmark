import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type Props = {
	url?: string
	children: ReactNode
	className?: string
}

export function BrowserFrame({
	url = "deepmark.io",
	children,
	className,
}: Props) {
	return (
		<div
			className={cn(
				"overflow-hidden rounded-xl border border-border bg-card shadow-tile",
				className,
			)}
		>
			<div className="flex items-center gap-2 border-b border-border-quiet bg-muted px-3 py-2">
				<div className="flex gap-1.5">
					<span className="size-2.5 rounded-full bg-ink-200" />
					<span className="size-2.5 rounded-full bg-ink-200" />
					<span className="size-2.5 rounded-full bg-ink-200" />
				</div>
				<div className="ml-3 flex flex-1 items-center justify-center">
					<span className="rounded border border-border-quiet bg-background px-3 py-0.5 font-mono text-[11px] text-muted-foreground">
						{url}
					</span>
				</div>
			</div>
			<div className="bg-card">{children}</div>
		</div>
	)
}
