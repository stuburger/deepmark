"use client"

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
	Circle,
	Highlighter,
	Link2,
	Underline,
	X,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useGradingData } from "./grading-data-context"
import "./annotation-marks.css"
import { annotationMarks } from "./annotation-marks"
import { CommentSidebar } from "./comment-sidebar"
import {
	HoverHighlightPlugin,
	setAnnotationHighlight,
	setHoverHighlight,
} from "./hover-highlight-plugin"
import { McqAnswerNode } from "./mcq-answer-node"
import { QuestionAnswerNode } from "./question-answer-node"
import { useDerivedAnnotations } from "./use-derived-annotations"

// ─── Bubble menu toolbar ────────────────────────────────────────────────────

type MarkAction = {
	name: string
	icon: React.ReactNode
	label: string
	attrs?: Record<string, unknown>
}

const MARK_ACTIONS: MarkAction[] = [
	{
		name: "tick",
		icon: <Check className="h-3.5 w-3.5" />,
		label: "Tick",
		attrs: { sentiment: "positive" },
	},
	{
		name: "cross",
		icon: <X className="h-3.5 w-3.5" />,
		label: "Cross",
		attrs: { sentiment: "negative" },
	},
	{
		name: "annotationUnderline",
		icon: <Underline className="h-3.5 w-3.5" />,
		label: "Underline",
		attrs: { sentiment: "positive" },
	},
	{
		name: "box",
		icon: <Box className="h-3.5 w-3.5" />,
		label: "Box",
		attrs: { sentiment: "positive" },
	},
	{
		name: "circle",
		icon: <Circle className="h-3.5 w-3.5" />,
		label: "Circle",
		attrs: { sentiment: "negative" },
	},
	{
		name: "chain",
		icon: <Link2 className="h-3.5 w-3.5" />,
		label: "Chain",
		attrs: { sentiment: "neutral", chainType: "reasoning" },
	},
	{
		name: "aoTag",
		icon: <Highlighter className="h-3.5 w-3.5" />,
		label: "AO Tag",
		attrs: { sentiment: "positive", display: "AO1", category: "AO1" },
	},
]

// ─── Main component ─────────────────────────────────────────────────────────

/**
 * Pure PM editor component. Renders a tiptap document with annotation marks,
 * bubble menu toolbar, comment sidebar, and hover word linking.
 *
 * Grading data (scores, overrides, feedback) is consumed by NodeViews via
 * GradingDataContext — the provider must be wrapped by the parent.
 */
export function AnnotatedAnswerSheet({
	doc,
	alignmentByQuestion,
	tokensByQuestion,
	onDerivedAnnotations,
	hoveredTokenId,
	onTokenHighlight,
}: {
	doc: JSONContent
	alignmentByQuestion: Map<string, TokenAlignment>
	tokensByQuestion: Map<string, PageToken[]>
	onDerivedAnnotations?: (annotations: StudentPaperAnnotation[]) => void
	hoveredTokenId?: string | null
	onTokenHighlight?: (tokenIds: string[] | null) => void
}) {
	// Comment sidebar hover state — declared early so its setter can go into a ref.
	const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(
		null,
	)

	// Mutable refs so the hover plugin always reads current values
	// even though the plugin instance is created once per editor lifetime.
	const alignmentRef = useRef(alignmentByQuestion)
	alignmentRef.current = alignmentByQuestion
	const tokensRef = useRef(tokensByQuestion)
	tokensRef.current = tokensByQuestion
	const onTokenHighlightRef = useRef(onTokenHighlight)
	onTokenHighlightRef.current = onTokenHighlight
	const onAnnotationHoverRef = useRef(setHoveredAnnotationId)
	onAnnotationHoverRef.current = setHoveredAnnotationId

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
				HoverHighlightPlugin.configure({
					alignmentRef,
					tokensRef,
					onTokenHighlightRef,
					onAnnotationHoverRef,
				}),
			],
			content: doc,
			editorProps: {
				attributes: {
					class:
						"prose prose-sm dark:prose-invert max-w-none focus:outline-none px-5 py-3",
				},
			},
		},
		[doc],
	)

	// Stable callback ref — avoids re-subscribing the transaction listener
	// every time the parent re-renders with a new callback identity.
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

	// Persist changed answer text when editing is toggled off.
	// Reads from GradingDataContext (provided by parent) — the only context
	// dependency in this component. Kept here because it needs the editor ref.
	const { isEditing, answers, onAnswerSaved } = useGradingData()
	const prevEditingRef = useRef(isEditing)
	useEffect(() => {
		if (prevEditingRef.current && !isEditing && editor) {
			editor.state.doc.descendants((node) => {
				if (node.type.name !== "questionAnswer") return
				const questionId = node.attrs.questionId as string | null
				if (!questionId) return
				const currentText = node.textContent
				const originalText = answers[questionId] ?? ""
				if (currentText !== originalText) {
					onAnswerSaved(questionId, currentText)
				}
			})
		}
		prevEditingRef.current = isEditing
	}, [isEditing, editor, answers, onAnswerSaved])

	// Scan → PM hover: when a token is hovered on the scan, highlight it in PM
	useEffect(() => {
		if (!editor) return
		setHoverHighlight(editor, hoveredTokenId ?? null, alignmentByQuestion)
	}, [editor, hoveredTokenId, alignmentByQuestion])

	// Sidebar → PM: highlight the mark range when a sidebar card is hovered
	useEffect(() => {
		if (!editor) return
		setAnnotationHighlight(editor, hoveredAnnotationId)
	}, [editor, hoveredAnnotationId])

	if (!editor) return null

	return (
		<div className="rounded-xl border shadow-sm overflow-hidden">
			<div className="bg-white dark:bg-zinc-950 relative flex">
				{/* Editor — takes remaining space */}
				<div className="flex-1 min-w-0 relative">
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
									onClick={() =>
										editor
											.chain()
											.focus()
											.toggleMark(action.name, action.attrs)
											.run()
									}
									className={cn(
										"flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors",
										"hover:bg-muted",
										isActive &&
											"bg-primary text-primary-foreground hover:bg-primary/90",
									)}
									title={action.label}
								>
									{action.icon}
									<span className="hidden sm:inline">{action.label}</span>
								</button>
							)
						})}
					</BubbleMenu>
					<EditorContent editor={editor} />
				</div>

				{/* Comment sidebar — positioned alongside editor */}
				<div className="w-48 shrink-0 border-l bg-zinc-50/50 dark:bg-zinc-900/30 overflow-y-auto hidden lg:block">
					<CommentSidebar
						editor={editor}
						hoveredAnnotationId={hoveredAnnotationId}
						onHoverAnnotation={setHoveredAnnotationId}
					/>
				</div>
			</div>
		</div>
	)
}
