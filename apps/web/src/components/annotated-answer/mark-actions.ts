/**
 * Single source of truth for annotation mark actions used by the
 * floating toolbar, bubble menu, and keyboard shortcuts.
 */
export type MarkAction = {
	/** Tiptap mark name */
	name: string
	/** Display label */
	label: string
	/** Keyboard shortcut key (bare number, fires only when text is selected) */
	key: string
	/** Default attrs applied when toggling the mark */
	attrs?: Record<string, unknown>
}

export const MARK_ACTIONS: MarkAction[] = [
	{
		name: "tick",
		label: "Tick",
		key: "1",
		attrs: { sentiment: "positive" },
	},
	{
		name: "cross",
		label: "Cross",
		key: "2",
		attrs: { sentiment: "negative" },
	},
	{
		name: "annotationUnderline",
		label: "Underline",
		key: "3",
		attrs: { sentiment: "positive" },
	},
	{
		name: "doubleUnderline",
		label: "Double underline",
		key: "4",
		attrs: { sentiment: "positive" },
	},
	{
		name: "box",
		label: "Box",
		key: "5",
		attrs: { sentiment: "positive" },
	},
	{
		name: "circle",
		label: "Circle",
		key: "6",
		attrs: { sentiment: "negative" },
	},
	{
		name: "chain",
		label: "Chain",
		key: "7",
		attrs: { sentiment: "neutral", chainType: "reasoning" },
	},
]
