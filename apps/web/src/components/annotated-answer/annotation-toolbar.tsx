"use client"

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Editor } from "@tiptap/core"
import {
	Box,
	Check,
	ChevronsUp,
	Circle,
	Link2,
	Underline,
	X,
} from "lucide-react"
import { applyAnnotationMark } from "./apply-annotation-mark"
import type { MARK_ACTIONS } from "./mark-actions"

// ─── Icon map ───────────────────────────────────────────────────────────────

const MARK_ICONS: Record<string, React.ReactNode> = {
	tick: <Check className="h-3.5 w-3.5" />,
	cross: <X className="h-3.5 w-3.5" />,
	annotationUnderline: <Underline className="h-3.5 w-3.5" />,
	doubleUnderline: <ChevronsUp className="h-3.5 w-3.5 rotate-90" />,
	box: <Box className="h-3.5 w-3.5" />,
	circle: <Circle className="h-3.5 w-3.5" />,
	chain: <Link2 className="h-3.5 w-3.5" />,
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AnnotationToolbar({
	editor,
	actions,
	onMarkApplied,
}: {
	editor: Editor
	actions: typeof MARK_ACTIONS
	onMarkApplied?: (annotationId: string) => void
}) {
	return (
		<TooltipProvider delay={300}>
			<div className="sticky top-0 z-10 flex items-center gap-0.5 border-b bg-white/90 dark:bg-zinc-950/90 backdrop-blur-sm px-4 py-1.5 rounded-t">
				{actions.map((action) => {
					const isActive = editor.isActive(action.name)
					const hasSelection =
						editor.state.selection.from !== editor.state.selection.to

					return (
						<Tooltip key={action.name}>
							<TooltipTrigger
								render={
									<button
										type="button"
										onClick={() => {
											const id = applyAnnotationMark(
												editor,
												action.name,
												action.attrs,
											)
											if (id) onMarkApplied?.(id)
										}}
										disabled={!hasSelection}
										className={cn(
											"relative flex items-center justify-center rounded w-8 h-7 text-xs font-medium transition-colors",
											"hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed",
											isActive &&
												"bg-primary text-primary-foreground hover:bg-primary/90",
										)}
									/>
								}
							>
								{MARK_ICONS[action.name]}
								<span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-mono text-muted-foreground leading-none">
									{action.key}
								</span>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{action.label}
								<kbd className="ml-1.5 rounded border bg-muted px-1 py-0.5 text-[10px] font-mono">
									{action.key}
								</kbd>
							</TooltipContent>
						</Tooltip>
					)
				})}

				<div className="ml-auto text-[10px] text-muted-foreground hidden sm:block">
					Select text, then press{" "}
					<kbd className="rounded border bg-muted px-1 py-0.5 font-mono">1</kbd>
					–
					<kbd className="rounded border bg-muted px-1 py-0.5 font-mono">7</kbd>
				</div>
			</div>
		</TooltipProvider>
	)
}
