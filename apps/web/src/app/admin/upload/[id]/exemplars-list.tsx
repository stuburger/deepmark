"use client"

import { Badge } from "@/components/ui/badge"
import type { JobExemplar } from "@/lib/pdf-ingestion/job-lifecycle"

export function ExemplarsList({ exemplars }: { exemplars: JobExemplar[] }) {
	if (exemplars.length === 0) return null
	return (
		<div className="space-y-2">
			{exemplars.map((ex) => (
				<div key={ex.id} className="rounded-lg border p-3 space-y-1">
					<div className="flex items-center gap-2">
						<Badge variant="outline" className="text-xs">
							L{ex.level}
						</Badge>
						{ex.expected_score != null && (
							<Badge variant="secondary" className="text-xs">
								{ex.expected_score} marks
							</Badge>
						)}
						{ex.mark_band && (
							<span className="text-xs text-muted-foreground">
								{ex.mark_band}
							</span>
						)}
					</div>
					<p className="text-xs text-muted-foreground line-clamp-1">
						{ex.raw_question_text}
					</p>
					<p className="text-sm line-clamp-3">{ex.answer_text}</p>
				</div>
			))}
		</div>
	)
}
