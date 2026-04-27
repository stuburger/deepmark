"use client"

import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import {
	Bold,
	Box,
	Check,
	ChevronsUp,
	Circle,
	Eraser,
	Italic,
	Link2,
	Underline,
	X,
} from "lucide-react"
import {
	applyAnnotationMark,
	canApplyAnnotations,
	hasAnnotationMarkInSelection,
	removeAllAnnotationMarks,
} from "./apply-annotation-mark"
import { CollaboratorAvatars } from "./collaborator-avatars"
import type { MARK_ACTIONS } from "./mark-actions"
import { useCollaborators } from "./use-collaborators"

// ─── Icon maps ───────────────────────────────────────────────────────────────

const MARK_ICONS: Record<string, React.ReactNode> = {
	tick: <Check className="h-3.5 w-3.5" />,
	cross: <X className="h-3.5 w-3.5" />,
	annotationUnderline: <Underline className="h-3.5 w-3.5" />,
	doubleUnderline: <ChevronsUp className="h-3.5 w-3.5 rotate-90" />,
	box: <Box className="h-3.5 w-3.5" />,
	circle: <Circle className="h-3.5 w-3.5" />,
	chain: <Link2 className="h-3.5 w-3.5" />,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Divider() {
	return <div className="mx-1 h-4 w-px bg-border" />
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AnnotationToolbar({
	editor,
	actions,
	onMarkApplied,
	provider,
}: {
	editor: Editor
	actions: typeof MARK_ACTIONS
	onMarkApplied?: (annotationId: string) => void
	provider?: HocuspocusProvider | null
}) {
	const { hasSelection, annotationContextOk } = useEditorState({
		editor,
		selector: (ctx) => ({
			hasSelection:
				ctx.editor.state.selection.from !== ctx.editor.state.selection.to,
			annotationContextOk: canApplyAnnotations(ctx.editor),
		}),
	})

	const collaborators = useCollaborators(provider)

	return (
		<TooltipProvider delay={300}>
			<div className="sticky top-0 z-10 flex items-center gap-0.5 border-b bg-white/90 dark:bg-zinc-950/90 backdrop-blur-sm px-4 py-1.5 rounded-t">
				{/* ── Formatting zone: always available when there's a selection ── */}
				{(
					[
						{
							cmd: "toggleBold",
							key: "bold",
							icon: <Bold className="h-3.5 w-3.5" />,
							label: "Bold",
							shortcut: "⌘B",
						},
						{
							cmd: "toggleItalic",
							key: "italic",
							icon: <Italic className="h-3.5 w-3.5" />,
							label: "Italic",
							shortcut: "⌘I",
						},
						{
							cmd: "toggleUnderline",
							key: "underline",
							icon: <Underline className="h-3.5 w-3.5" />,
							label: "Underline",
							shortcut: "⌘U",
						},
					] as const
				).map(({ cmd, key, icon, label, shortcut }) => (
					<Tooltip key={key}>
						<TooltipTrigger
							render={
								<button
									type="button"
									onMouseDown={(e) => {
										e.preventDefault()
										editor.chain().focus()[cmd]().run()
									}}
									disabled={!hasSelection}
									className={cn(
										"relative flex items-center justify-center rounded w-8 h-7 text-xs font-medium transition-colors",
										"hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed",
										editor.isActive(key) &&
											"bg-primary text-primary-foreground hover:bg-primary/90",
									)}
								/>
							}
						>
							{icon}
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{label}
							<kbd className="ml-1.5 rounded border bg-muted px-1 py-0.5 text-[10px] font-mono">
								{shortcut}
							</kbd>
						</TooltipContent>
					</Tooltip>
				))}

				<Divider />

				{/* ── Annotation zone: only active when inside a questionAnswer ── */}
				{actions.map((action) => {
					const isActive = editor.isActive(action.name)
					const canAnnotate = annotationContextOk

					return (
						<Tooltip key={action.name}>
							<TooltipTrigger
								render={
									<button
										type="button"
										onMouseDown={(e) => {
											e.preventDefault()
											const id = applyAnnotationMark(
												editor,
												action.name,
												action.attrs,
											)
											if (id) onMarkApplied?.(id)
										}}
										disabled={!canAnnotate}
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

				<Divider />

				{/* Remove all annotation marks in selection */}
				<Tooltip>
					<TooltipTrigger
						render={
							<button
								type="button"
								onMouseDown={(e) => {
									e.preventDefault()
									removeAllAnnotationMarks(editor)
								}}
								disabled={
									!annotationContextOk || !hasAnnotationMarkInSelection(editor)
								}
								className={cn(
									"relative flex items-center justify-center rounded w-8 h-7 text-xs font-medium transition-colors",
									"hover:bg-destructive/10 hover:text-destructive",
									"disabled:opacity-30 disabled:cursor-not-allowed",
								)}
							/>
						}
					>
						<Eraser className="h-3.5 w-3.5" />
					</TooltipTrigger>
					<TooltipContent side="bottom">Remove all annotations</TooltipContent>
				</Tooltip>

				<div className="ml-auto flex items-center gap-3">
					<span className="text-[10px] text-muted-foreground hidden sm:block">
						Select text, then press{" "}
						<kbd className="rounded border bg-muted px-1 py-0.5 font-mono">
							1
						</kbd>
						–
						<kbd className="rounded border bg-muted px-1 py-0.5 font-mono">
							7
						</kbd>
					</span>
					<CollaboratorAvatars users={collaborators} />
				</div>
			</div>
		</TooltipProvider>
	)
}
