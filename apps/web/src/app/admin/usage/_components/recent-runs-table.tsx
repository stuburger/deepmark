"use client"

import { Badge } from "@/components/ui/badge"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { formatTokens } from "@/lib/admin/usage/pricing"
import type { RecentRun } from "@/lib/admin/usage/types"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"

const STAGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
	ocr: "default",
	grading: "secondary",
	enrichment: "outline",
}

const CALL_SITE_LABELS: Record<string, string> = {
	"student-paper-extraction": "Answer Extraction",
	"handwriting-ocr": "Handwriting OCR",
	"vision-token-reconciliation": "Token Reconciliation",
	"vision-attribution": "Vision Attribution",
	grading: "Grading",
	"llm-annotations": "Annotations",
}

export function RecentRunsTable({ data }: { data: RecentRun[] }) {
	const [expandedId, setExpandedId] = useState<string | null>(null)

	if (data.length === 0) {
		return <p className="text-sm text-muted-foreground py-4">No runs yet</p>
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-8" />
					<TableHead>Date</TableHead>
					<TableHead>Student</TableHead>
					<TableHead>Paper</TableHead>
					<TableHead>Stage</TableHead>
					<TableHead>Model</TableHead>
					<TableHead className="text-right">Calls</TableHead>
					<TableHead className="text-right">Prompt</TableHead>
					<TableHead className="text-right">Completion</TableHead>
					<TableHead className="text-right">Total</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{data.map((run) => {
					const isExpanded = expandedId === run.id
					return (
						<>
							<TableRow
								key={run.id}
								className="cursor-pointer hover:bg-muted/50"
								onClick={() => setExpandedId(isExpanded ? null : run.id)}
							>
								<TableCell className="w-8 px-2">
									{isExpanded ? (
										<ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
									) : (
										<ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
									)}
								</TableCell>
								<TableCell className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
									{run.completed_at
										? new Date(run.completed_at).toLocaleDateString("en-GB", {
												day: "2-digit",
												month: "short",
												hour: "2-digit",
												minute: "2-digit",
											})
										: "—"}
								</TableCell>
								<TableCell className="text-sm">{run.student_name}</TableCell>
								<TableCell className="text-sm max-w-48 truncate">
									{run.paper_title}
								</TableCell>
								<TableCell>
									<Badge
										variant={STAGE_VARIANT[run.stage] ?? "outline"}
										className="text-[10px] uppercase"
									>
										{run.stage}
									</Badge>
								</TableCell>
								<TableCell className="text-xs font-mono">{run.model}</TableCell>
								<TableCell className="text-right tabular-nums">
									{run.total_calls}
								</TableCell>
								<TableCell className="text-right tabular-nums text-muted-foreground">
									{formatTokens(run.prompt_tokens)}
								</TableCell>
								<TableCell className="text-right tabular-nums text-muted-foreground">
									{formatTokens(run.completion_tokens)}
								</TableCell>
								<TableCell className="text-right tabular-nums font-medium">
									{formatTokens(run.prompt_tokens + run.completion_tokens)}
								</TableCell>
							</TableRow>
							{isExpanded && run.call_sites.length > 0 && (
								<TableRow key={`${run.id}-detail`}>
									<TableCell />
									<TableCell colSpan={9}>
										<div className="bg-muted/30 rounded-md p-3 space-y-1">
											<p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
												Call Site Breakdown
											</p>
											{run.call_sites.map((cs) => (
												<div
													key={cs.call_site}
													className="flex items-center justify-between text-xs"
												>
													<span className="text-muted-foreground">
														{CALL_SITE_LABELS[cs.call_site] ?? cs.call_site}
													</span>
													<div className="flex gap-4 tabular-nums">
														<span className="text-muted-foreground w-16 text-right">
															{formatTokens(cs.prompt_tokens)} in
														</span>
														<span className="text-muted-foreground w-16 text-right">
															{formatTokens(cs.completion_tokens)} out
														</span>
														<span className="font-medium w-16 text-right">
															{formatTokens(
																cs.prompt_tokens + cs.completion_tokens,
															)}
														</span>
													</div>
												</div>
											))}
										</div>
									</TableCell>
								</TableRow>
							)}
						</>
					)
				})}
			</TableBody>
		</Table>
	)
}
