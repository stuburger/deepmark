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
import { Sparkles } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type * as Y from "yjs"
import "./annotation-marks.css"
import { AnnotationShortcuts } from "./annotation-shortcuts"
import { AnnotationToolbar } from "./annotation-toolbar"
import { CommentSidebar } from "./comment-sidebar"
import {
	HoverHighlightPlugin,
	setAnnotationHighlight,
} from "./hover-highlight-plugin"
import { InsertParagraphPlugin } from "./insert-paragraph-plugin"
import { MARK_ACTIONS } from "./mark-actions"
import { McqTableNode } from "./mcq-table-node"
import { QuestionAnswerNode } from "./question-answer-node"
import { useDerivedAnnotations } from "./use-derived-annotations"
import { useTokenHighlight } from "./use-token-highlight"

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
	onAskDeepMark,
	toolbarSlot,
	aoOpen,
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
	/**
	 * Selection → "Talk to DeepMark". When the user selects text and clicks
	 * the bubble trigger, the host opens the chat panel with this text
	 * attached as a context chip. `questionNumber` is `null` when the
	 * selection isn't inside a `questionAnswer` node (cover page, stray
	 * paragraph) — the chat shows it as a "Selection" chip instead.
	 * Marking actions (formatting, AO marks, eraser) are handled by the
	 * floating toolbar + 1–7 keyboard shortcuts, so the bubble is now a
	 * single-purpose entry point to the chat.
	 */
	onAskDeepMark?: (input: {
		text: string
		questionNumber: string | null
	}) => void
	/**
	 * DOM target for the AnnotationToolbar pill. When set (the editor's
	 * identity bar in ResultsPanel passes its centre slot), the toolbar
	 * renders into it via React Portal so it visually lives in the chrome
	 * bar; otherwise the toolbar is rendered inline above the editor body
	 * (loading-state fallback, in case the slot hasn't mounted yet).
	 */
	toolbarSlot?: HTMLElement | null
	/**
	 * Whether the comment sidebar is toggled open below `lg`. At lg+ the
	 * sidebar is always visible regardless of this flag (it's the default
	 * inline column). Below lg the host (ResultsPanel chrome bar) drives
	 * this via a trigger button.
	 */
	aoOpen?: boolean
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
	const onActiveAnnotationChangeRef = useRef(setActiveAnnotationId)
	onActiveAnnotationChangeRef.current = setActiveAnnotationId
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
					onActiveAnnotationChangeRef,
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
						"prose prose-sm dark:prose-invert max-w-none focus:outline-none pl-3 pr-4 py-6 sm:pl-4 sm:pr-6 sm:py-8",
				},
			},
		},
		// Re-instantiate ONLY when ydoc identity changes (submission switch),
		// when the provider's awareness arrives (post-WS connect), or when
		// the user query first resolves (so CollaborationCaret can mount).
		// We deliberately do NOT depend on `cursorUser?.name` / `?.color`:
		// React Query's referential identity for `data` can subtly flip
		// between renders, which would recreate the Editor on every render
		// and trigger a TipTap-internal storm where the cursor plugin's
		// destroy/init each call `awareness.setLocalStateField`, broadcasting
		// hundreds of awareness updates per second. Subsequent identity
		// changes are pushed via `editor.commands.updateUser(...)` below.
		[ydoc, !!provider?.awareness, !!cursorUser],
	)

	// Push user identity changes (name, color, image) directly into the
	// awareness state. We bypass `editor.commands.updateUser(...)` because
	// that command is only registered when the CollaborationCaret extension
	// is loaded, which depends on init-time conditions; writing the field
	// straight to awareness is the same single-line operation either way.
	useEffect(() => {
		if (!editor || !cursorUser || !provider?.awareness) return
		provider.awareness.setLocalStateField("user", cursorUser)
	}, [editor, cursorUser, provider])

	// Stable callback ref — avoids re-subscribing the transaction listener
	const stableOnDerived = useCallback(
		(anns: StudentPaperAnnotation[]) => onDerivedAnnotations?.(anns),
		[onDerivedAnnotations],
	)

	// Derive annotations from PM state for the scan overlay.
	useDerivedAnnotations(editor, stableOnDerived)

	useTokenHighlight(editor, activeAnnotationId, onTokenHighlight)

	// Paint the active annotation's mark range with the
	// `is-active-annotation` decoration class so CSS can darken the mark and
	// render the cursor-style left edge. Editor identity is stable for the
	// lifetime of the doc; only `activeAnnotationId` actually drives repaints.
	useEffect(() => {
		if (!editor) return
		setAnnotationHighlight(editor, activeAnnotationId)
	}, [editor, activeAnnotationId])

	// Resolve the scrollable ancestor for BubbleMenu's Floating UI autoUpdate.
	// Default is `window`, but our editor scrolls inside Base UI's ScrollArea
	// viewport, so window scroll never fires — without this the bubble stays
	// pinned to viewport coords as the page scrolls under it. We render the
	// bubble only after we've found the target so Floating UI's autoUpdate is
	// wired correctly on first mount.
	const [bubbleScrollTarget, setBubbleScrollTarget] = useState<
		HTMLElement | undefined
	>()
	useEffect(() => {
		if (!editor) return
		const target = editor.view.dom.closest('[data-slot="scroll-area-viewport"]')
		if (target instanceof HTMLElement) setBubbleScrollTarget(target)
	}, [editor])

	// Floating UI's autoUpdate can't keep up with fast scrolling — even with
	// updateDelay: 0 the bubble lags behind the selection rect during the
	// scroll, then snaps to the right place when the user stops. We hide it
	// for the duration of the scroll instead and let it reappear in its
	// settled position. The bubble's intrinsic show/hide (selection-driven)
	// uses `display`, so toggling `visibility` here doesn't fight with it.
	const bubbleRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!bubbleScrollTarget) return
		let revealTimer: ReturnType<typeof setTimeout> | null = null
		const onScroll = () => {
			const el = bubbleRef.current
			if (el) el.style.visibility = "hidden"
			if (revealTimer) clearTimeout(revealTimer)
			revealTimer = setTimeout(() => {
				const cur = bubbleRef.current
				if (cur) cur.style.visibility = "visible"
			}, 250)
		}
		bubbleScrollTarget.addEventListener("scroll", onScroll, { passive: true })
		return () => {
			bubbleScrollTarget.removeEventListener("scroll", onScroll)
			if (revealTimer) clearTimeout(revealTimer)
		}
	}, [bubbleScrollTarget])

	if (!editor) return null

	const annotationToolbar = (
		<AnnotationToolbar
			editor={editor}
			actions={MARK_ACTIONS}
			onMarkApplied={handleMarkApplied}
		/>
	)

	return (
		// items-stretch so the AO sidebar column grows to match the editor's
		// height — without it the divider border-l on the sidebar would only
		// span the cards' intrinsic height, not the full editor surface.
		<div className="flex items-stretch">
			{/* Document body — flows directly on the page surface (no inner sheet).
			    No max-width: editor takes whatever horizontal space the panel
			    gives it (minus the AO sidebar when visible). */}
			<div className="flex-1 min-w-0 flex flex-col">
				{/* Annotation toolbar pill — portaled into the editor identity
				    bar's centre slot when available. Falls back to inline
				    rendering above the document body if the slot hasn't
				    mounted yet (e.g. transient initial render). */}
				{toolbarSlot
					? createPortal(annotationToolbar, toolbarSlot)
					: annotationToolbar}

				{/* Selection bubble — single-purpose "Talk to DeepMark" trigger.
				    Marking actions (formatting + AO marks + eraser) live on the
				    floating toolbar and 1–7 keyboard shortcuts.
				    Gated on `bubbleScrollTarget` so Floating UI's autoUpdate
				    binds to the ScrollArea viewport on first mount. */}
				{onAskDeepMark && bubbleScrollTarget && (
					<BubbleMenu
						ref={bubbleRef}
						editor={editor}
						updateDelay={0}
						options={{ scrollTarget: bubbleScrollTarget }}
					>
						<button
							type="button"
							onMouseDown={(e) => {
								e.preventDefault()
								const { from, to, $from } = editor.state.selection
								const text = editor.state.doc.textBetween(from, to, " ").trim()
								if (!text) return
								// Walk up the selection ancestors to find the enclosing
								// questionAnswer node (if any) and pull its question
								// number off the attrs so the chat can label the chip.
								let questionNumber: string | null = null
								for (let depth = $from.depth; depth > 0; depth--) {
									const node = $from.node(depth)
									if (node.type.name === "questionAnswer") {
										const attrs = node.attrs as {
											questionNumber?: string | null
										}
										questionNumber = attrs.questionNumber ?? null
										break
									}
								}
								onAskDeepMark({ text, questionNumber })
							}}
							className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-foreground/95 backdrop-blur-md px-2.5 py-1.5 text-xs font-medium text-background shadow-toolbar"
						>
							<Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
							Talk to <span className="text-primary">DeepMark</span>
						</button>
					</BubbleMenu>
				)}

				{/* Editor content */}
				<div className="flex-1">
					<EditorContent editor={editor} />
				</div>
			</div>

			{/* Comment sidebar — always visible at lg+; below lg it's
			    toggleable via the trigger in the editor identity bar
			    (drives the `aoOpen` prop). Light left border distinguishes
			    the AO column from the editor surface (non-resizable). */}
			<div
				className={cn(
					"w-52 shrink-0 border-l border-border-quiet pl-3",
					aoOpen ? "block" : "hidden lg:block",
				)}
			>
				<CommentSidebar
					editor={editor}
					activeAnnotationId={activeAnnotationId}
					onActiveAnnotationChange={setActiveAnnotationId}
				/>
			</div>
		</div>
	)
}
