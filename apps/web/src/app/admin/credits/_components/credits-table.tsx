"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import type { UserCreditRow } from "@/lib/admin/credits/queries"

import { GrantPapersDialog } from "./grant-papers-dialog"
import { UserLedgerSheet } from "./user-ledger-sheet"

type Props = {
	users: UserCreditRow[]
}

export function CreditsTable({ users }: Props) {
	const [grantTarget, setGrantTarget] = useState<UserCreditRow | null>(null)
	const [ledgerTarget, setLedgerTarget] = useState<UserCreditRow | null>(null)

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>User</TableHead>
						<TableHead>Plan</TableHead>
						<TableHead className="text-right">Balance</TableHead>
						<TableHead className="w-[1%]" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{users.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={4}
								className="text-center text-sm text-muted-foreground"
							>
								No users found.
							</TableCell>
						</TableRow>
					) : (
						users.map((u) => (
							<TableRow key={u.id}>
								<TableCell>
									<div className="flex flex-col">
										<span className="font-medium">
											{u.email ?? (
												<em className="text-muted-foreground">no email</em>
											)}
										</span>
										{u.name ? (
											<span className="text-xs text-muted-foreground">
												{u.name}
											</span>
										) : null}
									</div>
								</TableCell>
								<TableCell>
									{u.role === "admin" ? (
										<Badge variant="secondary">admin (uncapped)</Badge>
									) : u.plan ? (
										<div className="flex items-center gap-2">
											<Badge>{planLabel(u.plan)}</Badge>
											{u.subscription_status &&
											u.subscription_status !== "active" ? (
												<Badge variant="outline">
													{u.subscription_status.replace(/_/g, " ")}
												</Badge>
											) : null}
										</div>
									) : (
										<span className="text-sm text-muted-foreground">
											trial / PPU
										</span>
									)}
								</TableCell>
								<TableCell className="text-right font-mono text-sm">
									{u.balance.toLocaleString()}
								</TableCell>
								<TableCell>
									<div className="flex justify-end gap-2">
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setLedgerTarget(u)}
										>
											Ledger
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() => setGrantTarget(u)}
											disabled={u.role === "admin"}
										>
											Grant
										</Button>
									</div>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
			{grantTarget ? (
				<GrantPapersDialog
					userId={grantTarget.id}
					userEmail={grantTarget.email}
					currentBalance={grantTarget.balance}
					open={true}
					onOpenChange={(open) => {
						if (!open) setGrantTarget(null)
					}}
				/>
			) : null}
			{ledgerTarget ? (
				<UserLedgerSheet
					userId={ledgerTarget.id}
					userEmail={ledgerTarget.email}
					open={true}
					onOpenChange={(open) => {
						if (!open) setLedgerTarget(null)
					}}
				/>
			) : null}
		</>
	)
}

function planLabel(plan: string): string {
	switch (plan) {
		case "pro_monthly":
			return "Pro · Monthly"
		case "unlimited_monthly":
			return "Unlimited"
		default:
			return plan
	}
}
