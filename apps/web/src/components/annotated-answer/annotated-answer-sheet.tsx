"use client"

import {
	type TextMark,
	type TokenAlignment,
	alignTokensToAnswer,
	deriveTextMarks,
} from "@/lib/marking/token-alignment"
import type {
	GradingResult,
	PageToken,
	StudentPaperAnnotation,
} from "@/lib/marking/types"
import { cn } from "@/lib/utils"
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
import { useCallback, useMemo } from "react"
import "./annotation-marks.css"
import { annotationMarks } from "./annotation-marks"
import { buildAnnotatedDoc } from "./build-doc"
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

export function AnnotatedAnswerSheet({
	gradingResults,
	annotations,
	pageTokens,
	onDerivedAnnotations,
}: {
	gradingResults: GradingResult[]
	annotations: StudentPaperAnnotation[]
	pageTokens: PageToken[]
	onDerivedAnnotations?: (annotations: StudentPaperAnnotation[]) => void
}) {
	// Compute marks + alignment maps per question
	const { marksByQuestion, alignmentByQuestion, tokensByQuestion } =
		useMemo(() => {
			const marks = new Map<string, TextMark[]>()
			const alignments = new Map<string, TokenAlignment>()
			const tokensMap = new Map<string, PageToken[]>()

			for (const r of gradingResults) {
				if (r.marking_method === "deterministic") continue

				const qTokens = pageTokens.filter(
					(t) => t.question_id === r.question_id,
				)
				if (qTokens.length === 0) continue

				tokensMap.set(r.question_id, qTokens)

				const qAnnotations = annotations.filter(
					(a) => a.question_id === r.question_id,
				)

				const alignment = alignTokensToAnswer(r.student_answer, qTokens)
				if (Object.keys(alignment.tokenMap).length === 0) continue

				alignments.set(r.question_id, alignment)

				if (qAnnotations.length === 0) continue
				const derived = deriveTextMarks(qAnnotations, alignment)
				if (derived.length > 0) {
					marks.set(r.question_id, derived)
				}
			}

			return {
				marksByQuestion: marks,
				alignmentByQuestion: alignments,
				tokensByQuestion: tokensMap,
			}
		}, [gradingResults, annotations, pageTokens])

	// Build PM document
	const doc = useMemo(
		() => buildAnnotatedDoc(gradingResults, marksByQuestion),
		[gradingResults, marksByQuestion],
	)

	const editor = useEditor(
		{
			immediatelyRender: false,
			editable: true,
			extensions: [
				Document.extend({ content: "questionAnswer+" }),
				Text,
				HardBreak,
				History,
				QuestionAnswerNode,
				...annotationMarks,
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
	// Calls stableOnDerived synchronously inside the transaction handler.
	useDerivedAnnotations(
		editor,
		alignmentByQuestion,
		tokensByQuestion,
		stableOnDerived,
	)

	if (!editor) return null

	return (
		<div className="rounded-xl border shadow-sm overflow-hidden">
			<div className="bg-zinc-50 dark:bg-zinc-900 border-b px-5 py-3">
				<span className="text-xs font-mono font-bold tracking-widest uppercase text-muted-foreground">
					Annotated Answer Sheet
				</span>
			</div>
			<div className="bg-white dark:bg-zinc-950 relative">
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
		</div>
	)
}
