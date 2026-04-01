"use client"

import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import type { JobQuestion } from "@/lib/pdf-ingestion/job-lifecycle"
import { MarkSchemeDetail } from "./mark-scheme-detail"

export function QuestionsList({
	questions,
	isProcessing,
}: { questions: JobQuestion[]; isProcessing: boolean }) {
	if (questions.length === 0) {
		return (
			<p className="py-6 text-center text-sm text-muted-foreground">
				{isProcessing ? "Extracting questions…" : "No questions found."}
			</p>
		)
	}

	return (
		<Accordion className="space-y-2">
			{questions.map((q, i) => {
				const ms = q.mark_schemes[0]
				return (
					<AccordionItem
						key={q.id}
						value={q.id}
						className="rounded-lg border px-4"
					>
						<AccordionTrigger className="hover:no-underline py-3">
							<div className="flex items-center gap-3 flex-1 text-left mr-2">
								<span className="shrink-0 text-xs font-mono text-muted-foreground w-5">
									{i + 1}.
								</span>
								<p className="text-sm font-medium line-clamp-2 flex-1">
									{q.text}
								</p>
								<div className="flex items-center gap-1.5 shrink-0">
									{q.points != null && (
										<Badge variant="outline" className="tabular-nums text-xs">
											{q.points}pt
										</Badge>
									)}
									{ms ? (
										<Badge variant="secondary" className="text-xs">
											Scheme
										</Badge>
									) : (
										<Badge
											variant="outline"
											className="text-xs text-muted-foreground"
										>
											No scheme
										</Badge>
									)}
									{ms && ms.test_runs.length > 0 && (
										<Badge
											variant="outline"
											className="text-xs border-blue-300 text-blue-700"
										>
											{ms.test_runs.filter((t) => t.converged).length}/
											{ms.test_runs.length} converged
										</Badge>
									)}
								</div>
							</div>
						</AccordionTrigger>
						<AccordionContent className="pb-4">
							{ms ? (
								<MarkSchemeDetail ms={ms} />
							) : (
								<p className="text-sm text-muted-foreground">
									No mark scheme extracted for this question.
								</p>
							)}
						</AccordionContent>
					</AccordionItem>
				)
			})}
		</Accordion>
	)
}
