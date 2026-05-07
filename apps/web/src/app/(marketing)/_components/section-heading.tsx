import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { MarkTick } from "./mark-ornaments"

type Props = {
	children: ReactNode
	align?: "left" | "center"
	className?: string
}

export function SectionHeading({
	children,
	align = "center",
	className,
}: Props) {
	return (
		<div
			className={cn(
				"relative flex w-fit",
				align === "center" && "mx-auto",
				className,
			)}
		>
			<MarkTick
				className={cn(
					"absolute -top-2 -left-5 size-6 text-error-500 [transform:rotate(-14deg)] sm:-top-3 sm:-left-10 sm:size-7",
				)}
			/>
			<h2
				className={cn(
					"text-balance text-3xl font-semibold tracking-tight sm:text-4xl",
					align === "center" && "text-center",
				)}
			>
				{children}
			</h2>
		</div>
	)
}
