"use client"

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart"
import { formatCost } from "@/lib/admin/usage/pricing"
import type { UsageByModel } from "@/lib/admin/usage/types"
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"

const chartConfig = {
	estimated_cost: { label: "Cost", color: "hsl(var(--chart-5))" },
} satisfies ChartConfig

const PROVIDER_COLORS: Record<string, string> = {
	google: "hsl(210, 80%, 55%)",
	anthropic: "hsl(25, 85%, 55%)",
}

export function CostByModelChart({ data }: { data: UsageByModel[] }) {
	if (data.length === 0) {
		return (
			<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
				No usage data yet
			</div>
		)
	}

	const chartData = data.map((d) => ({
		model: d.model,
		provider: d.provider,
		estimated_cost: Math.round(d.estimated_cost * 100) / 100,
	}))

	return (
		<ChartContainer config={chartConfig} className="h-48 w-full">
			<BarChart
				data={chartData}
				margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
			>
				<CartesianGrid strokeDasharray="3 3" vertical={false} />
				<XAxis
					dataKey="model"
					tick={{ fontSize: 10 }}
					interval={0}
					angle={-20}
					textAnchor="end"
					height={50}
				/>
				<YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCost(v)} />
				<ChartTooltip
					content={
						<ChartTooltipContent
							formatter={(value) =>
								typeof value === "number" ? formatCost(value) : value
							}
						/>
					}
				/>
				<Bar dataKey="estimated_cost" radius={[4, 4, 0, 0]}>
					{chartData.map((entry) => (
						<Cell
							key={entry.model}
							fill={PROVIDER_COLORS[entry.provider] ?? "hsl(var(--chart-5))"}
						/>
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	)
}
