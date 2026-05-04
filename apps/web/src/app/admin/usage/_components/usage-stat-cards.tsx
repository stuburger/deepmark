"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCost, formatTokens } from "@/lib/admin/usage/pricing"
import type { UsageSummary } from "@/lib/admin/usage/types"
import { Coins, FileText, TrendingDown, Zap } from "lucide-react"

export function UsageStatCards({ summary }: { summary: UsageSummary }) {
	const cards = [
		{
			title: "Total Tokens",
			value: formatTokens(summary.total_tokens),
			description: `${formatTokens(summary.total_prompt_tokens)} prompt · ${formatTokens(summary.total_completion_tokens)} completion`,
			icon: Zap,
			color: "text-primary",
		},
		{
			title: "Estimated Cost",
			value: formatCost(summary.estimated_cost),
			description: "Based on published model pricing",
			icon: Coins,
			color: "text-success",
		},
		{
			title: "Papers Marked",
			value: summary.papers_marked.toLocaleString(),
			description: "Completed grading runs",
			icon: FileText,
			color: "text-ink-500",
		},
		{
			title: "Avg Tokens / Paper",
			value: formatTokens(summary.avg_tokens_per_paper),
			description: "Across all pipeline stages",
			icon: TrendingDown,
			color: "text-warning",
		},
	]

	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{cards.map(({ title, value, description, icon: Icon, color }) => (
				<Card key={title}>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">{title}</CardTitle>
						<Icon className={`h-4 w-4 ${color}`} />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{value}</div>
						<p className="text-xs text-muted-foreground">{description}</p>
					</CardContent>
				</Card>
			))}
		</div>
	)
}
