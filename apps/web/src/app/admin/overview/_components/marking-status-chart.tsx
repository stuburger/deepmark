"use client"

import {
	type ChartConfig,
	ChartContainer,
	ChartTooltipContent,
} from "@/components/ui/chart"
import { Cell, Legend, Pie, PieChart, Tooltip } from "recharts"

type Props = {
	data: { status: string; count: number }[]
}

const STATUS_COLORS: Record<string, string> = {
	pending: "var(--color-pending)",
	completed: "var(--color-completed)",
	failed: "var(--color-failed)",
}

const chartConfig = {
	pending: { label: "Pending", color: "hsl(var(--chart-3))" },
	completed: { label: "Completed", color: "hsl(var(--chart-1))" },
	failed: { label: "Failed", color: "hsl(var(--chart-5))" },
} satisfies ChartConfig

export function MarkingStatusChart({ data }: Props) {
	const chartData = data.map((d) => ({
		name: d.status.charAt(0).toUpperCase() + d.status.slice(1),
		value: d.count,
		fill: STATUS_COLORS[d.status] ?? "hsl(var(--chart-2))",
	}))

	if (chartData.length === 0) {
		return (
			<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
				No answer data yet
			</div>
		)
	}

	return (
		<ChartContainer config={chartConfig} className="h-48 w-full">
			<PieChart>
				<Pie
					data={chartData}
					dataKey="value"
					nameKey="name"
					cx="50%"
					cy="50%"
					outerRadius={70}
				>
					{chartData.map((entry) => (
						<Cell key={entry.name} fill={entry.fill} />
					))}
				</Pie>
				<Tooltip content={<ChartTooltipContent />} />
				<Legend />
			</PieChart>
		</ChartContainer>
	)
}
