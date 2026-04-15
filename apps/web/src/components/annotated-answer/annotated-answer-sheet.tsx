"use client"

import type { StudentPaperAnnotation } from "@/lib/marking/types"
import { cn } from "@/lib/utils"
import type { JSONContent } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import HardBreak from "@tiptap/extension-hard-break"
import History from "@tiptap/extension-history"
import Text from "@tiptap/extension-text"
import { EditorContent, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import {
	Box,
	Check,
	ChevronsUp,
	Circle,
	Link2,
	Underline,
	X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import "./annotation-marks.css"
import { annotationMarks } from "./annotation-marks"
import { AnnotationShortcuts } from "./annotation-shortcuts"
import { AnnotationToolbar } from "./annotation-toolbar"
import { applyAnnotationMark } from "./apply-annotation-mark"
import { CommentSidebar } from "./comment-sidebar"
import { HoverHighlightPlugin } from "./hover-highlight-plugin"
import { MARK_ACTIONS } from "./mark-actions"
import { McqTableNode } from "./mcq-table-node"
import { OcrTokenMark } from "./ocr-token-mark"
import { QuestionAnswerNode } from "./question-answer-node"
import { ReadOnlyText } from "./read-only-text"
import { useDerivedAnnotations } from "./use-derived-annotations"

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

// ─── Helpers: resolve PM marks to scan token IDs ────────────────────────────

/**
 * Collects ocrToken mark token IDs from all text nodes in a PM range.
 * Each word in the document carries an ocrToken mark with its OCR token ID,
 * so this is a direct structural lookup — no side-channel alignment needed.
 */
function resolveTokensForRange(
	editor: { state: { doc: import("@tiptap/pm/model").Node } },
	from: number,
	to: number,
): string[] | null {
	const tokenIds: string[] = []
	const seen = new Set<string>()

	editor.state.doc.nodesBetween(from, to, (node) => {
		if (!node.isText) return

		for (const mark of node.marks) {
			if (mark.type.name !== "ocrToken") continue
			const id = mark.attrs.tokenId as string | null
			if (id && !seen.has(id)) {
				seen.add(id)
				tokenIds.push(id)
			}
		}
	})

	return tokenIds.length > 0 ? tokenIds : null
}

/**
 * Finds all ocrToken marks on text that also carries a specific annotation ID.
 * Returns the union of token IDs across all matching text nodes.
 */
function resolveTokensForAnnotation(
	editor: { state: { doc: import("@tiptap/pm/model").Node } },
	annotationId: string,
): string[] | null {
	const tokenIds: string[] = []
	const seen = new Set<string>()

	editor.state.doc.descendants((node) => {
		if (!node.isText) return

		const hasAnnotation = node.marks.some(
			(m) => (m.attrs.annotationId as string | null) === annotationId,
		)
		if (!hasAnnotation) return

		for (const mark of node.marks) {
			if (mark.type.name !== "ocrToken") continue
			const id = mark.attrs.tokenId as string | null
			if (id && !seen.has(id)) {
				seen.add(id)
				tokenIds.push(id)
			}
		}
	})

	return tokenIds.length > 0 ? tokenIds : null
}

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

	const editor = useEditor(
		{
			immediatelyRender: false,
			editable: true,
			extensions: [
				Document.extend({ content: "(questionAnswer | mcqTable)+" }),
				Text,
				HardBreak,
				History,
				QuestionAnswerNode,
				McqTableNode,
				OcrTokenMark,
				...annotationMarks,
				ReadOnlyText,
				AnnotationShortcuts.configure({ onMarkAppliedRef }),
				HoverHighlightPlugin.configure({
					onAnnotationHoverRef,
				}),
			],
			content: doc,
			editorProps: {
				attributes: {
					class:
						"prose prose-sm dark:prose-invert max-w-none focus:outline-none px-12 py-10",
				},
			},
		},
		[doc],
	)

	// Stable callback ref — avoids re-subscribing the transaction listener
	const stableOnDerived = useCallback(
		(anns: StudentPaperAnnotation[]) => onDerivedAnnotations?.(anns),
		[onDerivedAnnotations],
	)

	// Derive annotations from PM state for the scan overlay.
	useDerivedAnnotations(editor, stableOnDerived)

	// Editor → Scan: highlight handwritten words that correspond to the
	// current text selection OR the active annotation card.
	// Selection takes precedence (active user action).
	useEffect(() => {
		if (!editor || !onTokenHighlight) return

		const handleUpdate = () => {
			const { from, to } = editor.state.selection
			const hasSelection = from !== to

			// Priority 1: text selection → highlight those words
			if (hasSelection) {
				onTokenHighlight(resolveTokensForRange(editor, from, to))
				return
			}

			// Priority 2: active annotation card → highlight its words
			if (activeAnnotationId) {
				onTokenHighlight(
					resolveTokensForAnnotation(editor, activeAnnotationId),
				)
				return
			}

			onTokenHighlight(null)
		}

		// Run once immediately + on every transaction
		handleUpdate()
		editor.on("transaction", handleUpdate)
		return () => {
			editor.off("transaction", handleUpdate)
		}
	}, [editor, activeAnnotationId, onTokenHighlight])

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
					{MARK_ACTIONS.map((action) => {
						const isActive = editor.isActive(action.name)
						return (
							<button
								key={action.name}
								type="button"
								onClick={() => {
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
								<span className="hidden sm:inline">{action.label}</span>
								<kbd className="text-[9px] font-mono opacity-50 ml-0.5">
									{action.key}
								</kbd>
							</button>
						)
					})}
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
