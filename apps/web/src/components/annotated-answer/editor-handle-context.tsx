"use client"

import type { Editor } from "@tiptap/core"
import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react"

/**
 * Lightweight context that exposes the live TipTap Editor instance to
 * sibling subtrees (e.g. the Talk to DeepMark chat panel) without prop-
 * drilling through ResultsPanel → MarkingResults → grading-results-panel
 * → AnnotatedAnswerSheet.
 *
 * The provider holds a ref so the consumer reads the CURRENT editor at
 * dispatch time — not at render time. Tool-call dispatchers don't need
 * re-renders when the editor identity changes; they just need to be able
 * to read `editorRef.current` synchronously inside the callback.
 *
 * The editor host (AnnotatedAnswerSheet) calls `useRegisterEditorHandle`
 * to write itself into the ref. Consumers call `useEditorHandle` to read.
 */

type EditorHandleContextValue = {
	editorRef: React.MutableRefObject<Editor | null>
}

const EditorHandleContext = createContext<EditorHandleContextValue | null>(null)

export function EditorHandleProvider({ children }: { children: ReactNode }) {
	const editorRef = useRef<Editor | null>(null)
	const value = useMemo(() => ({ editorRef }), [])
	return (
		<EditorHandleContext.Provider value={value}>
			{children}
		</EditorHandleContext.Provider>
	)
}

/**
 * Read access — returns `() => Editor | null` so callers grab the current
 * editor at the moment they need it (e.g. inside an async tool callback).
 * Returning the ref itself would leak the React contract; the getter
 * function is a stable handle that always resolves to the latest value.
 */
export function useEditorHandle(): () => Editor | null {
	const ctx = useContext(EditorHandleContext)
	if (!ctx) {
		// Outside the provider — return a no-op getter so consumers can be
		// mounted in surfaces (dashboard, /teacher/talk) where no editor
		// exists.
		return () => null
	}
	return () => ctx.editorRef.current
}

/**
 * Editor-host side. Writes `editor` into the context's ref on every
 * change; clears on unmount. Safe to call when `editor` is null (e.g.
 * during the brief window before `useEditor` returns an instance).
 */
export function useRegisterEditorHandle(editor: Editor | null): void {
	const ctx = useContext(EditorHandleContext)
	useEffect(() => {
		if (!ctx) return
		ctx.editorRef.current = editor
		return () => {
			if (ctx.editorRef.current === editor) {
				ctx.editorRef.current = null
			}
		}
	}, [ctx, editor])
}
