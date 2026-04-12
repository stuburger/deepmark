import { Mark, mergeAttributes } from "@tiptap/core"

/** Shared attrs for all annotation marks. */
const sharedAttrs = {
	sentiment: { default: "neutral" },
	reason: { default: null },
	annotationId: { default: null },
}

// ─── Mark signals ───────────────────────────────────────────────────────────

export const TickMark = Mark.create({
	name: "tick",
	addAttributes() {
		return { ...sharedAttrs }
	},
	parseHTML() {
		return [{ tag: 'span[data-mark-type="tick"]' }]
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-mark-type": "tick",
				class: "underline decoration-green-500 decoration-2 underline-offset-2",
				title: HTMLAttributes.reason ?? undefined,
			}),
			0,
		]
	},
})

export const CrossMark = Mark.create({
	name: "cross",
	addAttributes() {
		return { ...sharedAttrs }
	},
	parseHTML() {
		return [{ tag: 'span[data-mark-type="cross"]' }]
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-mark-type": "cross",
				class: "underline decoration-red-500 decoration-2 underline-offset-2",
				title: HTMLAttributes.reason ?? undefined,
			}),
			0,
		]
	},
})

export const UnderlineMark = Mark.create({
	name: "annotationUnderline",
	addAttributes() {
		return { ...sharedAttrs }
	},
	parseHTML() {
		return [{ tag: 'span[data-mark-type="underline"]' }]
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-mark-type": "underline",
				class: "underline decoration-blue-500 decoration-2 underline-offset-2",
				title: HTMLAttributes.reason ?? undefined,
			}),
			0,
		]
	},
})

export const DoubleUnderlineMark = Mark.create({
	name: "doubleUnderline",
	addAttributes() {
		return { ...sharedAttrs }
	},
	parseHTML() {
		return [{ tag: 'span[data-mark-type="double_underline"]' }]
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-mark-type": "double_underline",
				class:
					"underline decoration-double decoration-green-600 decoration-2 underline-offset-2",
				title: HTMLAttributes.reason ?? undefined,
			}),
			0,
		]
	},
})

export const BoxMark = Mark.create({
	name: "box",
	addAttributes() {
		return { ...sharedAttrs }
	},
	parseHTML() {
		return [{ tag: 'span[data-mark-type="box"]' }]
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-mark-type": "box",
				class: "ring-1 ring-purple-500 rounded-sm px-0.5",
				title: HTMLAttributes.reason ?? undefined,
			}),
			0,
		]
	},
})

export const CircleMark = Mark.create({
	name: "circle",
	addAttributes() {
		return { ...sharedAttrs }
	},
	parseHTML() {
		return [{ tag: 'span[data-mark-type="circle"]' }]
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-mark-type": "circle",
				class: "ring-1 ring-amber-500 rounded-full px-0.5",
				title: HTMLAttributes.reason ?? undefined,
			}),
			0,
		]
	},
})

// ─── Tag (AO badge) ────────────────────────────────────────────────────────

export const AoTagMark = Mark.create({
	name: "aoTag",
	addAttributes() {
		return {
			...sharedAttrs,
			display: { default: null },
			category: { default: null },
			awarded: { default: null },
			quality: { default: null },
		}
	},
	parseHTML() {
		return [{ tag: 'span[data-mark-type="ao_tag"]' }]
	},
	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-mark-type": "ao_tag",
				"data-tag-display": HTMLAttributes.display ?? "",
				title: HTMLAttributes.reason ?? undefined,
			}),
			0,
		]
	},
})

// ─── Chain highlight ────────────────────────────────────────────────────────

export const ChainMark = Mark.create({
	name: "chain",
	addAttributes() {
		return {
			...sharedAttrs,
			chainType: { default: "reasoning" },
			phrase: { default: null },
		}
	},
	parseHTML() {
		return [{ tag: 'span[data-mark-type="chain"]' }]
	},
	renderHTML({ HTMLAttributes }) {
		const ct = HTMLAttributes.chainType as string
		const bgClass =
			ct === "evaluation"
				? "bg-amber-100/40 dark:bg-amber-900/20"
				: ct === "judgement"
					? "bg-violet-100/40 dark:bg-violet-900/20"
					: "bg-blue-100/40 dark:bg-blue-900/20"
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-mark-type": "chain",
				class: bgClass,
				title: HTMLAttributes.phrase ?? undefined,
			}),
			0,
		]
	},
})

// ─── All marks as array ─────────────────────────────────────────────────────

export const annotationMarks = [
	TickMark,
	CrossMark,
	UnderlineMark,
	DoubleUnderlineMark,
	BoxMark,
	CircleMark,
	AoTagMark,
	ChainMark,
]
