"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { type VariantProps, cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
	"group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				secondary:
					"bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
				destructive:
					"bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
				outline:
					"border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
				ghost:
					"hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
				link: "text-primary underline-offset-4 hover:underline",

				/* Domain badges — DeepMark v1.1 spec.
				   All mono, uppercase, tighter tracking. Explicit colour values
				   below come from the spec's badge palette and don't appear elsewhere. */
				"status-marking":
					"font-mono uppercase tracking-[0.06em] text-[9px] bg-[rgba(255,0,0,0.1)] text-[rgba(160,0,0,0.85)] border-[rgba(255,0,0,0.25)]",
				"status-review":
					"font-mono uppercase tracking-[0.06em] text-[9px] bg-[rgba(127,255,167,0.2)] text-[#1A5E3A] border-[rgba(127,255,167,0.5)]",
				"status-done":
					"font-mono uppercase tracking-[0.06em] text-[9px] bg-transparent text-ink-secondary border-black/15",

				ao1: "font-mono uppercase tracking-[0.06em] text-[9px] bg-teal-light text-[#016E88] border-[rgba(1,173,208,0.22)]",
				ao2: "font-mono uppercase tracking-[0.06em] text-[9px] bg-[rgba(107,79,160,0.08)] text-[#4A2D8E] border-[rgba(107,79,160,0.18)]",
				ao3: "font-mono uppercase tracking-[0.06em] text-[9px] bg-[rgba(60,138,98,0.09)] text-[#1F5E38] border-[rgba(60,138,98,0.2)]",

				www: "font-mono uppercase tracking-[0.06em] text-[9px] bg-[rgba(60,138,98,0.1)] text-[#1F5E38] border-[rgba(60,138,98,0.2)]",
				ebi: "font-mono uppercase tracking-[0.06em] text-[9px] bg-[rgba(196,136,58,0.1)] text-[#7A4A10] border-[rgba(196,136,58,0.2)]",

				/* Score pills — solid colour, white text, bold mono number */
				"score-full":
					"font-mono font-bold text-[11px] bg-success text-white px-3",
				"score-part":
					"font-mono font-bold text-[11px] bg-warning text-white px-3",
				"score-low":
					"font-mono font-bold text-[11px] bg-destructive text-white px-3",

				/* Kanban phase badges — pair with KanbanChip border */
				"phase-queued":
					"font-mono uppercase tracking-[0.06em] text-[9px] bg-card text-ink-secondary border-black/10",
				"phase-extract":
					"font-mono uppercase tracking-[0.06em] text-[9px] bg-card text-ink border-phase-extract",
				"phase-grading":
					"font-mono uppercase tracking-[0.06em] text-[9px] bg-card text-ink border-phase-grading",
				"phase-annotate":
					"font-mono uppercase tracking-[0.06em] text-[9px] bg-card text-ink border-phase-annotate",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
)

function Badge({
	className,
	variant = "default",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant }), className),
			},
			props,
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	})
}

export { Badge, badgeVariants }
