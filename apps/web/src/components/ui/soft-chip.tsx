import { cn } from "@/lib/utils"
import type { HTMLAttributes } from "react"

const KIND_TO_CLASS = {
	success: "bg-success-50 text-success-800 border-success-200",
	warning: "bg-warning-50 text-warning-800 border-warning-200",
	error: "bg-error-50 text-error-700 border-error-200",
	info: "bg-teal-50 text-teal-800 border-teal-200",
	neutral: "bg-muted text-muted-foreground border-border",
} as const

export type SoftChipKind = keyof typeof KIND_TO_CLASS

type SoftChipProps = {
	kind: SoftChipKind
} & HTMLAttributes<HTMLSpanElement>

export function SoftChip({
	kind,
	className,
	children,
	...rest
}: SoftChipProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
				KIND_TO_CLASS[kind],
				className,
			)}
			{...rest}
		>
			{children}
		</span>
	)
}
