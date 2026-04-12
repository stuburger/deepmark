"use client"

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import { formatCost, formatTokens } from "@/lib/admin/usage/pricing"
import type { UsageByUser } from "@/lib/admin/usage/types"

export function PerUserTable({ data }: { data: UsageByUser[] }) {
	if (data.length === 0) {
		return (
			<p className="text-sm text-muted-foreground py-4">No user data yet</p>
		)
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>User</TableHead>
					<TableHead className="text-right">Papers</TableHead>
					<TableHead className="text-right">Total Tokens</TableHead>
					<TableHead className="text-right">Prompt</TableHead>
					<TableHead className="text-right">Completion</TableHead>
					<TableHead className="text-right">Est. Cost</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{data.map((u) => (
					<TableRow key={u.user_id}>
						<TableCell>
							<div>
								<p className="font-medium text-sm">{u.user_name}</p>
								<p className="text-xs text-muted-foreground">{u.user_email}</p>
							</div>
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{u.papers_marked}
						</TableCell>
						<TableCell className="text-right tabular-nums font-medium">
							{formatTokens(u.total_tokens)}
						</TableCell>
						<TableCell className="text-right tabular-nums text-muted-foreground">
							{formatTokens(u.prompt_tokens)}
						</TableCell>
						<TableCell className="text-right tabular-nums text-muted-foreground">
							{formatTokens(u.completion_tokens)}
						</TableCell>
						<TableCell className="text-right tabular-nums font-medium">
							{formatCost(u.estimated_cost)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}
