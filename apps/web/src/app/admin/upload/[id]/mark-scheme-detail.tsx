"use client"

import { Badge } from "@/components/ui/badge"
import type { JobMarkScheme } from "@/lib/pdf-ingestion/job-lifecycle"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import { capitalize } from "./job-status-config"

export function MarkSchemeDetail({ ms }: { ms: JobMarkScheme }) {
	const [showTestRuns, setShowTestRuns] = useState(false)

	return (
		<div className="space-y-3">
			<div>
				<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
					Mark scheme description
				</p>
				<p className="text-sm leading-relaxed whitespace-pre-wrap">
					{ms.description}
				</p>
			</div>

			{ms.mark_points.length > 0 && (
				<div>
					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
						Mark points ({ms.points_total} marks ·{" "}
						{capitalize(ms.marking_method.replace(/_/g, " "))})
					</p>
					<div className="space-y-1.5">
						{ms.mark_points.map((mp) => (
							<div key={mp.point_number} className="flex gap-2 text-sm">
								<span className="shrink-0 font-mono text-xs text-muted-foreground w-5 pt-0.5">
									{mp.point_number}.
								</span>
								<div>
									<span className="font-medium">{mp.description}</span>
									{mp.criteria !== mp.description && (
										<span className="text-muted-foreground">
											{" "}
											— {mp.criteria}
										</span>
									)}
									<Badge
										variant="outline"
										className="ml-2 text-xs tabular-nums"
									>
										{mp.points}pt
									</Badge>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{ms.test_runs.length > 0 && (
				<div>
					<button
						type="button"
						onClick={() => setShowTestRuns((v) => !v)}
						className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						{showTestRuns ? (
							<ChevronUp className="h-3 w-3" />
						) : (
							<ChevronDown className="h-3 w-3" />
						)}
						Adversarial test runs ({ms.test_runs.length})
					</button>
					{showTestRuns && (
						<div className="mt-2 space-y-2">
							{ms.test_runs.map((tr) => (
								<div
									key={tr.id}
									className="rounded-md border p-2.5 space-y-1.5"
								>
									<div className="flex items-center gap-2 text-xs">
										<span className="text-muted-foreground">Target</span>
										<span className="font-mono font-medium">
											{tr.target_score}
										</span>
										<span className="text-muted-foreground">→ Actual</span>
										<span
											className={`font-mono font-medium ${tr.converged ? "text-green-600" : "text-amber-600"}`}
										>
											{tr.actual_score}
										</span>
										{tr.converged ? (
											<Badge variant="secondary" className="text-xs">
												Converged
											</Badge>
										) : (
											<Badge
												variant="outline"
												className="text-xs border-amber-300 text-amber-700"
											>
												Δ{tr.delta > 0 ? "+" : ""}
												{tr.delta}
											</Badge>
										)}
									</div>
									<details className="text-xs">
										<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
											Grader reasoning
										</summary>
										<p className="mt-1.5 text-muted-foreground whitespace-pre-wrap leading-relaxed pl-2 border-l">
											{tr.grader_reasoning}
										</p>
									</details>
									<details className="text-xs">
										<summary className="cursor-pointer text-muted-foreground hover:text-foreground">
											Synthetic student answer
										</summary>
										<p className="mt-1.5 text-muted-foreground whitespace-pre-wrap leading-relaxed pl-2 border-l">
											{tr.student_answer}
										</p>
									</details>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	)
}
