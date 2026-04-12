"use client"

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart"
import { formatTokens } from "@/lib/admin/usage/pricing"
import type { UsageByStage } from "@/lib/admin/usage/types"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

const chartConfig = {
	prompt_tokens: { label: "Prompt", color: "hsl(var(--chart-1))" },
	completion_tokens: { label: "Completion", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig

const STAGE_LABELS: Record<string, string> = {
	ocr: "OCR",
	grading: "Grading",
	enrichment: "Enrichment",
}

export function TokensByStageChart({ data }: { data: UsageByStage[] }) {
	if (data.length === 0) {
		return (
			<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
				No usage data yet
			</div>
		)
	}

	const chartData = data
		.map((d) => ({
			stage: STAGE_LABELS[d.stage] ?? d.stage,
			prompt_tokens: d.prompt_tokens,
			completion_tokens: d.completion_tokens,
			total: d.prompt_tokens + d.completion_tokens,
		}))
		.sort((a, b) => b.total - a.total)

	return (
		<ChartContainer config={chartConfig} className="h-48 w-full">
			<BarChart
				data={chartData}
				layout="vertical"
				margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
			>
				<CartesianGrid strokeDasharray="3 3" horizontal={false} />
				<XAxis
					type="number"
					tick={{ fontSize: 11 }}
					tickFormatter={(v) => formatTokens(v)}
				/>
				<YAxis
					type="category"
					dataKey="stage"
					tick={{ fontSize: 12 }}
					width={80}
				/>
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value) =>
								typeof value === "number" ? formatTokens(value) : value
							}
						/>
					}
				/>
				<Bar
					dataKey="prompt_tokens"
					stackId="tokens"
					fill="var(--color-prompt_tokens)"
					radius={[0, 0, 0, 0]}
				/>
				<Bar
					dataKey="completion_tokens"
					stackId="tokens"
					fill="var(--color-completion_tokens)"
					radius={[0, 4, 4, 0]}
				/>
			</BarChart>
		</ChartContainer>
	)
}
