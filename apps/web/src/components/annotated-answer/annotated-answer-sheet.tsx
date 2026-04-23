"use client"

import type { StudentPaperAnnotation } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import type { JSONContent } from "@tiptap/core"
import BoldExtension from "@tiptap/extension-bold"
import Document from "@tiptap/extension-document"
import HardBreak from "@tiptap/extension-hard-break"
import History from "@tiptap/extension-history"
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
import { useCallback, useEffect, useRef, useState } from "react"
import "./annotation-marks.css"
import { annotationMarks } from "./annotation-marks"
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
import { OcrTokenMark } from "./ocr-token-mark"
import { ParagraphNode } from "./paragraph-node"
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
 * Pure PM editor component. Renders a tiptap document with annotation marks,
 * floating toolbar, bubble menu, comment sidebar, and hover word linking.
 *
 * OCR token data is embedded in the document as ocrToken marks — no external
 * alignment maps needed. Grading data (scores, overrides, feedback) is
 * consumed by NodeViews via GradingDataContext.
 */
export function AnnotatedAnswerSheet({
	doc,
	onDerivedAnnotations,
	onTokenHighlight,
}: {
	doc: JSONContent
	onDerivedAnnotations?: (annotations: StudentPaperAnnotation[]) => void
	onTokenHighlight?: (tokenIds: string[] | null) => void
}) {
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

	// Editor is created ONCE and persists across doc changes (progressive
	// rendering). Stage updates (OCR → grading → enrichment) apply as
	// setContent calls rather than remounting the whole editor, which would
	// lose focus/selection and create a visible flash.
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
				History,
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
			],
			content: doc,
			editorProps: {
				attributes: {
					class:
						"prose prose-sm dark:prose-invert max-w-none focus:outline-none px-12 py-10",
				},
			},
		},
		[],
	)

	// Sync new doc content into the existing editor when upstream stages
	// produce new data (tokens arrive after OCR, marks arrive after
	// enrichment). Only updates when content actually differs.
	//
	// Cursor preservation: replacing doc content via setContent would
	// normally reset the selection to the start of the doc. Since the
	// pipeline may emit new data while the teacher is actively reading or
	// editing, we snapshot the selection and focus state before the
	// replacement and restore them afterwards. Positions are clamped to
	// the new doc size to guard against structural changes.
	//
	// IME guard: setContent while an IME composition is active can corrupt
	// the composition buffer. We skip the update and reset the fingerprint
	// so the next render retries — by then composition has usually ended.
	const lastDocFpRef = useRef<string>("")
	useEffect(() => {
		if (!editor) return
		const fp = JSON.stringify(doc)
		if (fp === lastDocFpRef.current) return

		if (editor.view.composing) {
			// Leave lastDocFpRef untouched so the next render retries
			return
		}

		lastDocFpRef.current = fp

		const { from, to } = editor.state.selection
		const wasFocused = editor.isFocused

		// Dispatch the content replacement as a raw transaction.
		// addToHistory:false keeps stage-driven updates out of the teacher's
		// undo stack.
		const newDoc = editor.schema.nodeFromJSON(doc)
		const replaceTr = editor.state.tr
			.replaceWith(0, editor.state.doc.content.size, newDoc.content)
			.setMeta("addToHistory", false)
			.setMeta("preventUpdate", true)
		editor.view.dispatch(replaceTr)

		const docSize = editor.state.doc.content.size
		const clampedFrom = Math.min(Math.max(from, 0), docSize)
		const clampedTo = Math.min(Math.max(to, 0), docSize)
		editor.commands.setTextSelection({
			from: clampedFrom,
			to: clampedTo,
		})
		if (wasFocused) editor.commands.focus(undefined, { scrollIntoView: false })
	}, [editor, doc])

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
