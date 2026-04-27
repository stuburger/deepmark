"use client"

import type { StudentPaperAnnotation } from "@/lib/marking/types"
import { useCurrentUser } from "@/lib/users/use-current-user"
import { cn } from "@/lib/utils"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import { OcrTokenMark, ParagraphNode, annotationMarks } from "@mcp-gcse/shared"
import BoldExtension from "@tiptap/extension-bold"
import Collaboration from "@tiptap/extension-collaboration"
import CollaborationCaret from "@tiptap/extension-collaboration-caret"
import Document from "@tiptap/extension-document"
import HardBreak from "@tiptap/extension-hard-break"
import ItalicExtension from "@tiptap/extension-italic"
import Text from "@tiptap/extension-text"
import UnderlineExtension from "@tiptap/extension-underline"
import { EditorContent, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
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
import { useCallback, useRef, useState } from "react"
import type * as Y from "yjs"
import "./annotation-marks.css"
import { AnnotationShortcuts } from "./annotation-shortcuts"
import { AnnotationToolbar } from "./annotation-toolbar"
import {
	applyAnnotationMark,
	canApplyAnnotations,
	hasAnnotationMarkInSelection,
	removeAllAnnotationMarks,
} from "./apply-annotation-mark"
import { CommentSidebar } from "./comment-sidebar"
import { HoverHighlightPlugin } from "./hover-highlight-plugin"
import { InsertParagraphPlugin } from "./insert-paragraph-plugin"
import { MARK_ACTIONS } from "./mark-actions"
import { McqTableNode } from "./mcq-table-node"
import { QuestionAnswerNode } from "./question-answer-node"
import { useDerivedAnnotations } from "./use-derived-annotations"
import { useTokenHighlight } from "./use-token-highlight"

// ─── Bubble menu icons ─────────────────────────────────────────────────────

const BUBBLE_ICONS: Record<string, React.ReactNode> = {
	tick: <Check className="h-3.5 w-3.5" />,
	cross: <X className="h-3.5 w-3.5" />,
	annotationUnderline: <Underline className="h-3.5 w-3.5" />,
	doubleUnderline: <ChevronsUp className="h-3.5 w-3.5 rotate-90" />,
	box: <Box className="h-3.5 w-3.5" />,
	circle: <Circle className="h-3.5 w-3.5" />,
	chain: <Link2 className="h-3.5 w-3.5" />,
}

const BUBBLE_ERASER = <Eraser className="h-3.5 w-3.5" />

// ─── Main component ─────────────────────────────────────────────────────────

/**
 * Pure PM editor component. Content is owned by a Yjs Y.Doc via the
 * Collaboration extension; local edits are CRDT ops that sync through
 * HocuspocusProvider + IndexedDB. Grading data (scores, overrides, feedback)
 * is consumed by NodeViews via GradingDataContext.
 *
 * Doc content is authored entirely server-side: the OCR Lambda seeds question
 * skeletons + answer text + ocrToken marks, and the grading Lambda overlays
 * AI annotation marks. Teachers add their own marks via the editor; those
 * flow back through the Collaboration extension and the projection Lambda
 * picks them up via the `source: "teacher"` mark attr.
 */
export function AnnotatedAnswerSheet({
	ydoc,
	provider,
	onDerivedAnnotations,
	onTokenHighlight,
}: {
	ydoc: Y.Doc
	/**
	 * HocuspocusProvider for awareness — `null` in `indexeddb-only` mode
	 * (see `useYDoc` rollback flag), in which case CollaborationCursor is
	 * skipped and the editor is single-user.
	 */
	provider?: HocuspocusProvider | null
	onDerivedAnnotations?: (annotations: StudentPaperAnnotation[]) => void
	onTokenHighlight?: (tokenIds: string[] | null) => void
}) {
	const { cursorUser } = useCurrentUser()
	// Active annotation card state — driven by cursor position, sidebar clicks,
	// or mark application.
	const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(
		null,
	)

	// Callback for when a mark is applied (shortcut/toolbar) — activates the card
	const handleMarkApplied = useCallback((annotationId: string) => {
		setActiveAnnotationId(annotationId)
	}, [])

	// Mutable refs so plugins always read current values.
	const onAnnotationHoverRef = useRef(setActiveAnnotationId)
	onAnnotationHoverRef.current = setActiveAnnotationId
	const onMarkAppliedRef = useRef(handleMarkApplied)
	onMarkAppliedRef.current = handleMarkApplied

	// Editor is bound to the Y.Doc via the Collaboration extension. Content
	// flows through CRDT ops — no content prop, no setContent sync dance.
	// The editor re-creates if ydoc identity changes (submission switch).
	const editor = useEditor(
		{
			immediatelyRender: false,
			editable: true,
			extensions: [
				Document.extend({
					content: "(paragraph | questionAnswer | mcqTable)+",
				}),
				Text,
				HardBreak,
				BoldExtension,
				ItalicExtension,
				UnderlineExtension,
				ParagraphNode,
				QuestionAnswerNode,
				McqTableNode,
				...annotationMarks,
				OcrTokenMark,
				AnnotationShortcuts.configure({ onMarkAppliedRef }),
				HoverHighlightPlugin.configure({
					onAnnotationHoverRef,
				}),
				InsertParagraphPlugin,
				Collaboration.configure({ document: ydoc, field: "doc" }),
				// Caret + selection highlight for other connected teachers.
				// Note: in TipTap 3.x this extension was renamed from
				// `extension-collaboration-cursor` (which used the upstream
				// y-prosemirror ySyncPluginKey and is now incompatible with
				// the @tiptap/y-tiptap fork that Collaboration v3.22 ships).
				// Skipped when:
				//   - no HocuspocusProvider (indexeddb-only kill switch), OR
				//   - the provider exists but its awareness is null (the field
				//     is `Awareness | null` mid-setup — passing it through
				//     causes the cursor plugin to crash on awareness.doc), OR
				//   - the current user query hasn't resolved yet.
				// The editor's deps array re-runs when any of these arrive.
				...(provider?.awareness && cursorUser
					? [
							CollaborationCaret.configure({
								provider,
								user: cursorUser,
								// y-tiptap's default selectionRender appends a hex alpha
								// byte (`${color}70`) to user.color, which produces invalid
								// CSS for HSL colors and the selection silently vanishes.
								// We pre-compute a translucent variant in `useCurrentUser`
								// (`selectionColor`) and emit it here as the background.
								selectionRender: (user) => ({
									class: "collaboration-carets__selection",
									style: `background-color: ${
										(user as { selectionColor?: string }).selectionColor ??
										user.color
									}`,
									nodeName: "span",
									"data-user": user.name,
								}),
							}),
						]
					: []),
			],
			editorProps: {
				attributes: {
					class:
						"prose prose-sm dark:prose-invert max-w-none focus:outline-none px-12 py-10",
				},
			},
		},
		// Re-instantiate when the provider's awareness arrives (post-WS
		// connect) or when the current user resolves — both are needed to
		// register the CollaborationCursor extension. ydoc identity already
		// triggers re-creation on submission switch. We key on
		// `!!provider?.awareness` rather than `provider` itself so we don't
		// rebuild the editor on every provider field change.
		[ydoc, !!provider?.awareness, cursorUser?.name, cursorUser?.color],
	)

	// Stable callback ref — avoids re-subscribing the transaction listener
	const stableOnDerived = useCallback(
		(anns: StudentPaperAnnotation[]) => onDerivedAnnotations?.(anns),
		[onDerivedAnnotations],
	)

	// Derive annotations from PM state for the scan overlay.
	useDerivedAnnotations(editor, stableOnDerived)

	useTokenHighlight(editor, activeAnnotationId, onTokenHighlight)

	if (!editor) return null

	return (
		<div className="flex justify-center gap-0">
			{/* A4 page — the document */}
			<div className="w-full max-w-[210mm] bg-white dark:bg-zinc-950 shadow-lg rounded border border-zinc-200 dark:border-zinc-800 min-h-[297mm] flex flex-col">
				{/* Floating toolbar — sticky at top of page */}
				<AnnotationToolbar
					editor={editor}
					actions={MARK_ACTIONS}
					onMarkApplied={handleMarkApplied}
				/>

				{/* Bubble menu — appears on selection */}
				<BubbleMenu
					editor={editor}
					className="flex items-center gap-0.5 rounded-lg border bg-background shadow-lg px-1 py-0.5"
				>
					{/* Formatting: always available */}
					{(
						[
							{
								cmd: "toggleBold",
								key: "bold",
								icon: <Bold className="h-3.5 w-3.5" />,
								label: "Bold",
							},
							{
								cmd: "toggleItalic",
								key: "italic",
								icon: <Italic className="h-3.5 w-3.5" />,
								label: "Italic",
							},
							{
								cmd: "toggleUnderline",
								key: "underline",
								icon: <Underline className="h-3.5 w-3.5" />,
								label: "Underline",
							},
						] as const
					).map(({ cmd, key, icon, label }) => (
						<button
							key={key}
							type="button"
							onMouseDown={(e) => {
								e.preventDefault()
								editor.chain().focus()[cmd]().run()
							}}
							className={cn(
								"flex items-center justify-center rounded w-7 h-7 transition-colors",
								"hover:bg-muted",
								editor.isActive(key) &&
									"bg-primary text-primary-foreground hover:bg-primary/90",
							)}
							title={label}
						>
							{icon}
						</button>
					))}

					{/* Annotation marks: only in questionAnswer context */}
					{canApplyAnnotations(editor) && (
						<>
							<div className="mx-0.5 h-4 w-px bg-border" />

							{MARK_ACTIONS.map((action) => {
								const isActive = editor.isActive(action.name)
								return (
									<button
										key={action.name}
										type="button"
										onMouseDown={(e) => {
											e.preventDefault()
											const id = applyAnnotationMark(
												editor,
												action.name,
												action.attrs,
											)
											if (id) handleMarkApplied(id)
										}}
										className={cn(
											"flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
											"hover:bg-muted",
											isActive &&
												"bg-primary text-primary-foreground hover:bg-primary/90",
										)}
										title={`${action.label} (${action.key})`}
									>
										{BUBBLE_ICONS[action.name]}
										<kbd className="text-[9px] font-mono opacity-50 ml-0.5">
											{action.key}
										</kbd>
									</button>
								)
							})}

							<div className="mx-0.5 h-4 w-px bg-border" />

							<button
								type="button"
								onMouseDown={(e) => {
									e.preventDefault()
									removeAllAnnotationMarks(editor)
								}}
								disabled={!hasAnnotationMarkInSelection(editor)}
								className={cn(
									"flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
									"hover:bg-destructive/10 hover:text-destructive",
									"disabled:opacity-30 disabled:cursor-not-allowed",
								)}
								title="Remove all annotations"
							>
								{BUBBLE_ERASER}
								<span className="hidden sm:inline">Clear</span>
							</button>
						</>
					)}
				</BubbleMenu>

				{/* Editor content */}
				<div className="flex-1">
					<EditorContent editor={editor} />
				</div>
			</div>

			{/* Comment sidebar — right margin, outside the page */}
			<div className="w-52 shrink-0 hidden xl:block">
				<CommentSidebar
					editor={editor}
					hoveredAnnotationId={activeAnnotationId}
					onHoverAnnotation={setActiveAnnotationId}
				/>
			</div>
		</div>
	)
}
