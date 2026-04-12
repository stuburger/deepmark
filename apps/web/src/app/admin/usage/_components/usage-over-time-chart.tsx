"use client"

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart"
import { formatTokens } from "@/lib/admin/usage/pricing"
import type { UsageByDate } from "@/lib/admin/usage/types"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

const chartConfig = {
	ocr_tokens: { label: "OCR", color: "hsl(var(--chart-1))" },
	grading_tokens: { label: "Grading", color: "hsl(var(--chart-2))" },
	enrichment_tokens: { label: "Enrichment", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig

export function UsageOverTimeChart({ data }: { data: UsageByDate[] }) {
	if (data.length === 0) {
		return (
			<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
				No usage data yet
			</div>
		)
	}

	const chartData = data.map((d) => ({
		...d,
		date: d.date.slice(5), // "MM-DD" for compact labels
	}))

	return (
		<ChartContainer config={chartConfig} className="h-48 w-full">
			<AreaChart
				data={chartData}
				margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
			>
				<CartesianGrid strokeDasharray="3 3" vertical={false} />
				<XAxis dataKey="date" tick={{ fontSize: 11 }} />
				<YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatTokens(v)} />
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value) =>
								typeof value === "number" ? formatTokens(value) : value
							}
						/>
					}
				/>
				<Area
					type="monotone"
					dataKey="ocr_tokens"
					stackId="1"
					fill="var(--color-ocr_tokens)"
					stroke="var(--color-ocr_tokens)"
					fillOpacity={0.4}
				/>
				<Area
					type="monotone"
					dataKey="grading_tokens"
					stackId="1"
					fill="var(--color-grading_tokens)"
					stroke="var(--color-grading_tokens)"
					fillOpacity={0.4}
				/>
				<Area
					type="monotone"
					dataKey="enrichment_tokens"
					stackId="1"
					fill="var(--color-enrichment_tokens)"
					stroke="var(--color-enrichment_tokens)"
					fillOpacity={0.4}
				/>
			</AreaChart>
		</ChartContainer>
	)
}
