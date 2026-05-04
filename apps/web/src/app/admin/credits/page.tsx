import { listUsersWithBalance } from "@/lib/admin/credits/queries"

import { CreditsTable } from "./_components/credits-table"

export const dynamic = "force-dynamic"

export default async function CreditsPage() {
	const result = await listUsersWithBalance()

	if (result?.serverError) {
		return (
			<div className="p-6 text-sm text-destructive">{result.serverError}</div>
		)
	}

	const users = result?.data?.users ?? []

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Credits</h1>
				<p className="text-sm text-muted-foreground">
					Issue paper grants to users (e.g. for outage compensation, founder
					perks, support cases). Negative grants reverse a prior grant.
				</p>
			</div>
			<CreditsTable users={users} />
		</div>
	)
}
