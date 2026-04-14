"use client"

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart"
import { formatTokens } from "@/lib/admin/usage/pricing"
import type { UsageByCallSite } from "@/lib/admin/usage/types"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

const chartConfig = {
	prompt_tokens: { label: "Prompt", color: "hsl(var(--chart-3))" },
	completion_tokens: { label: "Completion", color: "hsl(var(--chart-4))" },
} satisfies ChartConfig

const CALL_SITE_LABELS: Record<string, string> = {
	"student-paper-extraction": "Answer Extraction",
	"handwriting-ocr": "Handwriting OCR",
	"vision-attribution": "Vision Attribution",
	"token-answer-mapping": "Token Correction + Mapping",
	grading: "Grading",
	"llm-annotations": "Annotations",
}

export function TokensByCallSiteChart({ data }: { data: UsageByCallSite[] }) {
	if (data.length === 0) {
		return (
			<div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
				No usage data yet
			</div>
		)
	}

	const chartData = data.map((d) => ({
		call_site: CALL_SITE_LABELS[d.call_site] ?? d.call_site,
		prompt_tokens: d.prompt_tokens,
		completion_tokens: d.completion_tokens,
	}))

	return (
		<ChartContainer config={chartConfig} className="h-64 w-full">
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
					dataKey="call_site"
					tick={{ fontSize: 11 }}
					width={130}
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
