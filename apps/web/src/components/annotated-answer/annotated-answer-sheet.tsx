"use client"

import { charRangeToTokens } from "@/lib/marking/alignment/reverse"
import type { TokenAlignment } from "@/lib/marking/token-alignment"
import type { PageToken, StudentPaperAnnotation } from "@/lib/marking/types"
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
import { McqAnswerNode } from "./mcq-answer-node"
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

// ─── Helpers: resolve PM ranges to scan token IDs ──────────────────────────

/** Maps a PM doc position range to OCR token IDs via the alignment data. */
function resolveTokensForRange(
	editor: { state: { doc: import("@tiptap/pm/model").Node } },
	from: number,
	to: number,
	alignmentByQuestion: Map<string, TokenAlignment>,
	tokensByQuestion: Map<string, PageToken[]>,
): string[] | null {
	const $from = editor.state.doc.resolve(from)

	// Find the questionAnswer ancestor
	let questionId: string | null = null
	let nodeStart = 0
	for (let d = $from.depth; d >= 0; d--) {
		const ancestor = $from.node(d)
		if (ancestor.type.name === "questionAnswer") {
			questionId = ancestor.attrs.questionId as string | null
			nodeStart = $from.start(d)
			break
		}
	}
	if (!questionId) return null

	const alignment = alignmentByQuestion.get(questionId)
	const tokens = tokensByQuestion.get(questionId)
	if (!alignment || !tokens) return null

	const charFrom = from - nodeStart
	const charTo = to - nodeStart
	const span = charRangeToTokens(charFrom, charTo, alignment, tokens)
	return span?.tokenIds ?? null
}

/** Maps an annotation ID to its OCR token IDs by finding the mark in the doc. */
function resolveTokensForAnnotation(
	editor: { state: { doc: import("@tiptap/pm/model").Node } },
	annotationId: string,
	alignmentByQuestion: Map<string, TokenAlignment>,
	tokensByQuestion: Map<string, PageToken[]>,
): string[] | null {
	let result: string[] | null = null

	editor.state.doc.descendants((node, pos) => {
		if (result) return false
		if (node.type.name !== "questionAnswer") return

		const questionId = node.attrs.questionId as string | null
		if (!questionId) return

		const alignment = alignmentByQuestion.get(questionId)
		const tokens = tokensByQuestion.get(questionId)
		if (!alignment || !tokens) return

		node.forEach((child, childOffset) => {
			if (result) return
			if (!child.isText || !child.marks.length) return

			for (const mark of child.marks) {
				if ((mark.attrs.annotationId as string | null) !== annotationId)
					continue
				const span = charRangeToTokens(
					childOffset,
					childOffset + child.nodeSize,
					alignment,
					tokens,
				)
				if (span) result = span.tokenIds
				return
			}
		})
	})

	return result
}

// ─── Main component ─────────────────────────────────────────────────────────

/**
 * Pure PM editor component. Renders a tiptap document with annotation marks,
 * floating toolbar, bubble menu, comment sidebar, and hover word linking.
 *
 * Grading data (scores, overrides, feedback) is consumed by NodeViews via
 * GradingDataContext — the provider must be wrapped by the parent.
 */
export function AnnotatedAnswerSheet({
	doc,
	alignmentByQuestion,
	tokensByQuestion,
	onDerivedAnnotations,
	onTokenHighlight,
}: {
	doc: JSONContent
	alignmentByQuestion: Map<string, TokenAlignment>
	tokensByQuestion: Map<string, PageToken[]>
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
				Document.extend({ content: "(questionAnswer | mcqAnswer)+" }),
				Text,
				HardBreak,
				History,
				QuestionAnswerNode,
				McqAnswerNode,
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
	useDerivedAnnotations(
		editor,
		alignmentByQuestion,
		tokensByQuestion,
		stableOnDerived,
	)

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
				const tokenIds = resolveTokensForRange(
					editor,
					from,
					to,
					alignmentByQuestion,
					tokensByQuestion,
				)
				onTokenHighlight(tokenIds)
				return
			}

			// Priority 2: active annotation card → highlight its words
			if (activeAnnotationId) {
				const tokenIds = resolveTokensForAnnotation(
					editor,
					activeAnnotationId,
					alignmentByQuestion,
					tokensByQuestion,
				)
				onTokenHighlight(tokenIds)
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
	}, [
		editor,
		activeAnnotationId,
		alignmentByQuestion,
		tokensByQuestion,
		onTokenHighlight,
	])

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
