"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

type Props = {
	data: { subject: string; count: number }[]
}

const chartConfig = {
	count: { label: "Questions", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig

export function QuestionsBySubjectChart({ data }: Props) {
	if (data.length === 0) {
		return (
			<div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
				No question data yet
			</div>
		)
	}

	const chartData = data.map((d) => ({
		subject: d.subject.charAt(0).toUpperCase() + d.subject.slice(1),
		count: d.count,
	}))

	return (
		<ChartContainer config={chartConfig} className="h-48 w-full">
			<BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
				<CartesianGrid strokeDasharray="3 3" vertical={false} />
				<XAxis dataKey="subject" tick={{ fontSize: 12 }} />
				<YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
				<Tooltip content={<ChartTooltipContent />} />
				<Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
			</BarChart>
		</ChartContainer>
	)
}
