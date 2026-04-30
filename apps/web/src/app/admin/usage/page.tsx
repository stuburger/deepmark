import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { getUsageAnalytics } from "@/lib/admin/usage/queries"
import { CostByModelChart } from "./_components/cost-by-model-chart"
import { PerUserTable } from "./_components/per-user-table"
import { RecentRunsTable } from "./_components/recent-runs-table"
import { TokensByCallSiteChart } from "./_components/tokens-by-call-site-chart"
import { TokensByStageChart } from "./_components/tokens-by-stage-chart"
import { UsageOverTimeChart } from "./_components/usage-over-time-chart"
import { UsageStatCards } from "./_components/usage-stat-cards"

export default async function UsagePage() {
	const result = await getUsageAnalytics()
	const data = result?.data
	if (!data) {
		return (
			<div className="p-6 text-sm text-destructive">
				{result?.serverError ?? "Failed to load usage analytics"}
			</div>
		)
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">
					Usage Analytics
				</h1>
				<p className="text-sm text-muted-foreground">
					LLM token usage and cost breakdown across the marking pipeline. PDF
					ingestion costs are not yet tracked.
				</p>
			</div>

			<UsageStatCards summary={data.summary} />

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Tokens by Pipeline Stage</CardTitle>
						<CardDescription>
							Prompt vs completion tokens across OCR, grading, and annotation
						</CardDescription>
					</CardHeader>
					<CardContent>
						<TokensByStageChart data={data.byStage} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Tokens by Call Site</CardTitle>
						<CardDescription>
							Breakdown by individual LLM call site within each stage
						</CardDescription>
					</CardHeader>
					<CardContent>
						<TokensByCallSiteChart data={data.byCallSite} />
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Cost by Model</CardTitle>
						<CardDescription>
							Estimated cost per model based on published pricing
						</CardDescription>
					</CardHeader>
					<CardContent>
						<CostByModelChart data={data.byModel} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Usage Over Time</CardTitle>
						<CardDescription>
							Daily token usage stacked by pipeline stage
						</CardDescription>
					</CardHeader>
					<CardContent>
						<UsageOverTimeChart data={data.byDate} />
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Usage by User</CardTitle>
					<CardDescription>
						Token consumption and estimated cost per user
					</CardDescription>
				</CardHeader>
				<CardContent>
					<PerUserTable data={data.byUser} />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Recent Runs</CardTitle>
					<CardDescription>
						Last 20 pipeline runs — click to expand call site breakdown
					</CardDescription>
				</CardHeader>
				<CardContent>
					<RecentRunsTable data={data.recentRuns} />
				</CardContent>
			</Card>
		</div>
	)
}
