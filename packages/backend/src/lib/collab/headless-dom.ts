import { Window } from "happy-dom"

let installed = false

/**
 * Install happy-dom globals onto Node's globalThis so prosemirror-view can
 * construct an EditorView. Idempotent — first call installs, subsequent
 * calls are no-ops. Cold-start cost is ~25 ms.
 *
 * happy-dom is preferred over jsdom in this project because esbuild
 * (SST's bundler) can't co-locate jsdom's `default-stylesheet.css`
 * runtime asset, causing an ENOENT on every Lambda invocation. happy-dom
 * has no off-bundle filesystem reads.
 *
 * Required because prosemirror-view does real DOM construction in its
 * constructor: builds a DOM tree mirroring the doc, attaches a
 * MutationObserver, hooks Selection/Range. The DOM never gets rendered
 * or read back — the only thing that touches it is the editor's own
 * internal read-back during transaction processing.
 */
export function ensureHeadlessDom(): void {
	if (installed) return
	const win = new Window()
	Object.assign(globalThis, {
		window: win,
		document: win.document,
		Node: win.Node,
		Element: win.Element,
		HTMLElement: win.HTMLElement,
		DocumentFragment: win.DocumentFragment,
		Range: win.Range,
		Selection: win.Selection,
		getSelection: win.getSelection?.bind(win),
		MutationObserver: win.MutationObserver,
	})
	installed = true
}
