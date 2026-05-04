"use client"

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { parseMarkdownTable } from "@/lib/markdown-table"
import { ChevronDown, FileText, ImageOff } from "lucide-react"
import { useState } from "react"

type StimulusContentType = "text" | "table" | "image"

/**
 * Shared "Show attached content" collapsible. Used in:
 *  - the exam-paper editor (per question)
 *  - the submission results view (per question inside the Prosemirror
 *    question-answer node view)
 *
 * Branches on `content_type`:
 *  - "text"  — whitespace-preserved paragraph render (default)
 *  - "table" — parses the markdown pipe-table into an HTML table; falls
 *              back to plain text if the content doesn't parse
 *  - "image" — S3 key would live in `content`; the extractor doesn't yet
 *              produce image stimuli, so this branch renders a placeholder
 *              badge. When image extraction lands, wire a signed-URL
 *              <img> render here.
 */
export function StimulusDisclosure({
	stimuli,
	size = "sm",
}: {
	stimuli: Array<{
		label: string
		content: string
		content_type?: StimulusContentType
	}>
	/** "sm" matches question-list density; "xs" for inline-in-editor density. */
	size?: "sm" | "xs"
}) {
	const [open, setOpen] = useState(false)
	if (stimuli.length === 0) return null

	const labels = stimuli.map((s) => s.label).join(", ")
	const triggerText = `${open ? "Hide" : "Show"} attached content`

	return (
		<Collapsible open={open} onOpenChange={setOpen} className="mb-2">
			<CollapsibleTrigger
				className={[
					"inline-flex items-center gap-1.5 rounded-md",
					size === "xs" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
					"font-medium",
					"bg-warning-50 text-warning-800 hover:bg-warning-100",
					"dark:bg-warning-950/40 dark:text-warning-300 dark:hover:bg-warning-950/60",
					"border border-warning-200 dark:border-warning-900",
					"transition-colors",
				].join(" ")}
			>
				<FileText className="h-3 w-3" aria-hidden />
				<span>
					{triggerText}
					<span className="font-normal opacity-75"> ({labels})</span>
				</span>
				<ChevronDown
					className={[
						"h-3 w-3 transition-transform",
						open ? "rotate-180" : "",
					].join(" ")}
					aria-hidden
				/>
			</CollapsibleTrigger>
			<CollapsibleContent className="mt-2 space-y-3">
				{stimuli.map((stim) => (
					<div
						key={stim.label}
						className={[
							"rounded-md border px-3 py-2",
							"bg-zinc-50/70 dark:bg-zinc-900/40",
							"border-zinc-200 dark:border-zinc-700",
						].join(" ")}
					>
						<div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 mb-1">
							{stim.label}
						</div>
						<StimulusBody stim={stim} />
					</div>
				))}
			</CollapsibleContent>
		</Collapsible>
	)
}

function StimulusBody({
	stim,
}: {
	stim: { content: string; content_type?: StimulusContentType }
}) {
	const kind = stim.content_type ?? "text"

	if (kind === "table") {
		const parsed = parseMarkdownTable(stim.content)
		if (parsed) return <MarkdownTable table={parsed} />
	}

	if (kind === "image") {
		// Image extraction from PDFs isn't wired yet — the extractor currently
		// only emits text/table. When it does, `stim.content` will hold an S3
		// key and this branch should render an <img> via a signed URL.
		return (
			<div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
				<ImageOff className="h-3.5 w-3.5" aria-hidden />
				Image stimulus (not yet rendered in app)
			</div>
		)
	}

	return (
		<div className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
			{stim.content}
		</div>
	)
}

function MarkdownTable({
	table,
}: {
	table: { headers: string[]; rows: string[][] }
}) {
	return (
		<div className="overflow-x-auto">
			<table className="text-xs border-collapse w-full">
				<thead>
					<tr>
						{table.headers.map((h, i) => (
							<th
								// biome-ignore lint/suspicious/noArrayIndexKey: headers are stable per stimulus
								key={`h-${i}`}
								className="border border-zinc-300 dark:border-zinc-700 px-2 py-1 text-left font-semibold bg-zinc-100 dark:bg-zinc-800"
							>
								{h}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{table.rows.map((row, ri) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: rows are stable per stimulus
						<tr key={`r-${ri}`}>
							{row.map((cell, ci) => (
								<td
									// biome-ignore lint/suspicious/noArrayIndexKey: cells are stable per row/col
									key={`r-${ri}-c-${ci}`}
									className="border border-zinc-300 dark:border-zinc-700 px-2 py-1"
								>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
