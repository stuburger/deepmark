"use client"

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts"

export type GradeBandDatum = { label: string; count: number; color: string }

export function GradeDistributionChart({ data }: { data: GradeBandDatum[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Grade distribution</CardTitle>
				<CardDescription>
					Number of students in each score band.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ResponsiveContainer width="100%" height={200}>
					<BarChart data={data} barCategoryGap="30%">
						<CartesianGrid strokeDasharray="3 3" vertical={false} />
						<XAxis
							dataKey="label"
							tick={{ fontSize: 12 }}
							axisLine={false}
							tickLine={false}
						/>
						<YAxis
							allowDecimals={false}
							tick={{ fontSize: 12 }}
							axisLine={false}
							tickLine={false}
							width={30}
						/>
						<Tooltip
							formatter={(value) => [value, "Students"]}
							cursor={{ fill: "hsl(var(--muted))" }}
						/>
						<Bar dataKey="count" radius={[4, 4, 0, 0]}>
							{data.map((entry) => (
								<Cell key={entry.label} fill={entry.color} />
							))}
						</Bar>
					</BarChart>
				</ResponsiveContainer>
			</CardContent>
		</Card>
	)
}
