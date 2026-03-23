"use client"

import type { JobEvent } from "@mcp-gcse/db"
import {
	AlertCircle,
	BookOpen,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	FileText,
	Loader2,
	MapPin,
	Scan,
	User,
	Zap,
} from "lucide-react"
import { useState } from "react"

function eventIcon(type: JobEvent["type"]) {
	switch (type) {
		case "ocr_started":
			return <Scan className="h-3.5 w-3.5 text-muted-foreground" />
		case "ocr_complete":
			return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
		case "answers_extracted":
			return <FileText className="h-3.5 w-3.5 text-blue-500" />
		case "student_linked":
			return <User className="h-3.5 w-3.5 text-violet-500" />
		case "exam_paper_selected":
			return <BookOpen className="h-3.5 w-3.5 text-indigo-500" />
		case "grading_started":
			return <Zap className="h-3.5 w-3.5 text-amber-500" />
		case "question_graded":
			return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
		case "region_attribution_started":
		case "region_attribution_complete":
			return <MapPin className="h-3.5 w-3.5 text-teal-500" />
		case "grading_complete":
			return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
		case "job_failed":
			return <AlertCircle className="h-3.5 w-3.5 text-destructive" />
	}
}

function eventLabel(event: JobEvent): string {
	switch (event.type) {
		case "ocr_started":
			return "OCR started"
		case "ocr_complete":
			return "OCR complete"
		case "answers_extracted":
			return `${event.count} answer${event.count !== 1 ? "s" : ""} extracted${event.student_name ? ` · ${event.student_name}` : ""}`
		case "student_linked":
			return `Student linked: ${event.student_name}`
		case "exam_paper_selected":
			return `Paper: ${event.title}`
		case "grading_started":
			return `Marking started · ${event.questions_total} questions`
		case "question_graded":
			return `Q${event.question_number} marked: ${event.awarded}/${event.max}`
		case "region_attribution_started":
			return "Locating answers on scan…"
		case "region_attribution_complete":
			return `${event.questions_located} answer region${event.questions_located !== 1 ? "s" : ""} located`
		case "grading_complete":
			return `Marking complete · ${event.total_awarded}/${event.total_max}`
		case "job_failed":
			return `Failed during ${event.phase}: ${event.error}`
	}
}

function relativeTime(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime()
	const s = Math.floor(ms / 1000)
	if (s < 60) return `${s}s ago`
	const m = Math.floor(s / 60)
	if (m < 60) return `${m}m ago`
	const h = Math.floor(m / 60)
	return `${h}h ago`
}

export function EventLog({
	events,
	isPolling,
}: {
	events: JobEvent[] | null
	isPolling: boolean
}) {
	const [expanded, setExpanded] = useState(false)

	const list = events ?? []

	return (
		<div className="border-t">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
			>
				<span className="flex items-center gap-2">
					{isPolling && (
						<Loader2 className="h-3 w-3 animate-spin text-primary" />
					)}
					Events
					{list.length > 0 && (
						<span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
							{list.length}
						</span>
					)}
				</span>
				{expanded ? (
					<ChevronUp className="h-3.5 w-3.5" />
				) : (
					<ChevronDown className="h-3.5 w-3.5" />
				)}
			</button>

			{expanded && (
				<div className="px-4 pb-4 space-y-2">
					{list.length === 0 ? (
						<p className="text-xs text-muted-foreground italic">
							No events yet.
						</p>
					) : (
						[...list].reverse().map((event, i) => (
							<div key={i} className="flex items-start gap-2">
								<span className="mt-0.5 shrink-0">{eventIcon(event.type)}</span>
								<div className="flex-1 min-w-0">
									<p className="text-xs text-foreground leading-snug">
										{eventLabel(event)}
									</p>
									<p className="text-xs text-muted-foreground/60 tabular-nums">
										{relativeTime(event.at)}
									</p>
								</div>
							</div>
						))
					)}
				</div>
			)}
		</div>
	)
}
