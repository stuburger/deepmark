import { cn } from "@/lib/utils"
import type { HTMLAttributes } from "react"

const KIND_TO_BG = {
	success: "bg-success",
	warning: "bg-warning",
	error: "bg-destructive",
	info: "bg-primary",
	neutral: "bg-ink-tertiary",
} as const

export type StatusDotKind = keyof typeof KIND_TO_BG

type StatusDotProps = {
	kind: StatusDotKind
	size?: "xs" | "sm"
} & HTMLAttributes<HTMLSpanElement>

export function StatusDot({
	kind,
	size = "sm",
	className,
	...rest
}: StatusDotProps) {
	return (
		<span
			aria-hidden
			className={cn(
				"inline-block shrink-0 rounded-full",
				size === "xs" ? "size-1.5" : "size-2",
				KIND_TO_BG[kind],
				className,
			)}
			{...rest}
		/>
	)
}
