import { cn } from "@/lib/utils"

type OrnamentProps = {
	className?: string
}

export function MarkTick({ className }: OrnamentProps) {
	return (
		<svg
			viewBox="0 0 32 22"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			role="presentation"
			aria-hidden="true"
			className={cn("inline-block", className)}
		>
			<path d="M2 12 Q 5.5 14, 9 18.5 Q 14 8.5, 30 3" />
		</svg>
	)
}

export function WavyUnderline({ className }: OrnamentProps) {
	return (
		<svg
			viewBox="0 0 100 8"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.4"
			strokeLinecap="round"
			preserveAspectRatio="none"
			role="presentation"
			aria-hidden="true"
			className={cn("block", className)}
		>
			<path d="M1 4.5 Q 12.5 0, 25 4.5 T 50 4.5 T 75 4.5 T 99 4.5" />
		</svg>
	)
}

export function MarkedStamp({ className }: OrnamentProps) {
	return (
		<div
			aria-hidden
			className={cn(
				"flex size-20 items-center justify-center rounded-full border-2 border-error-500 text-error-600 [transform:rotate(-12deg)]",
				className,
			)}
		>
			<span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
				marked
			</span>
		</div>
	)
}
