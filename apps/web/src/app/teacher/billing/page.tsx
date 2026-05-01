import Link from "next/link"
import { redirect } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button-variants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { auth } from "@/lib/auth"
import { countCompletedGradingRuns, trialPaperCap } from "@/lib/billing/quota"
import { db } from "@/lib/db"

import { ManageSubscriptionButton } from "./_components/manage-subscription-button"

export const dynamic = "force-dynamic"

const PLAN_LABEL: Record<string, string> = {
	pro_monthly: "Pro · Monthly",
	pro_annual: "Pro · Annual",
}

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive"> = {
	active: "default",
	trialing: "default",
	past_due: "destructive",
	unpaid: "destructive",
	canceled: "secondary",
	incomplete: "secondary",
	incomplete_expired: "secondary",
	paused: "secondary",
}

export default async function BillingPage() {
	const session = await auth()
	if (!session) redirect("/login")

	const user = await db.user.findUniqueOrThrow({
		where: { id: session.userId },
		select: {
			role: true,
			plan: true,
			subscription_status: true,
			current_period_end: true,
			stripe_customer_id: true,
		},
	})

	if (user.role === "admin") {
		return <AdminBlock />
	}

	if (user.plan && user.subscription_status) {
		return (
			<PaidBlock
				plan={user.plan}
				status={user.subscription_status}
				periodEnd={user.current_period_end}
				hasCustomer={Boolean(user.stripe_customer_id)}
			/>
		)
	}

	const used = await countCompletedGradingRuns(session.userId)
	return <TrialBlock used={used} cap={trialPaperCap()} />
}

function AdminBlock() {
	return (
		<div className="mx-auto max-w-2xl py-12">
			<Card>
				<CardHeader>
					<CardTitle>Admin account</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Admins have unlimited marking. No subscription required.
					</p>
				</CardContent>
			</Card>
		</div>
	)
}

function TrialBlock({ used, cap }: { used: number; cap: number }) {
	const remaining = Math.max(0, cap - used)
	const pct = Math.min(100, Math.round((used / cap) * 100))
	return (
		<div className="mx-auto max-w-2xl space-y-6 py-12">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					You're on the free trial.
				</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-baseline justify-between text-lg">
						<span>Free trial</span>
						<span className="text-sm font-normal text-muted-foreground">
							{used} / {cap} papers used
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<Progress value={pct} />
					<p className="text-sm text-muted-foreground">
						{remaining > 0
							? `${remaining} ${remaining === 1 ? "paper" : "papers"} left in your trial.`
							: "Trial complete. Upgrade to keep marking."}
					</p>
					<div>
						<Link href="/pricing" className={buttonVariants({ size: "lg" })}>
							Upgrade to Pro
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

function PaidBlock({
	plan,
	status,
	periodEnd,
	hasCustomer,
}: {
	plan: string
	status: string
	periodEnd: Date | null
	hasCustomer: boolean
}) {
	const planLabel = PLAN_LABEL[plan] ?? plan
	return (
		<div className="mx-auto max-w-2xl space-y-6 py-12">
			<div>
				<h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Manage your subscription, payment method, and invoices.
				</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between text-lg">
						<span>{planLabel}</span>
						<Badge variant={STATUS_TONE[status] ?? "secondary"}>
							{status.replace(/_/g, " ")}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{periodEnd ? (
						<p className="text-sm text-muted-foreground">
							{status === "canceled" ? "Access ends " : "Renews "}
							<span className="font-medium text-foreground">
								{periodEnd.toLocaleDateString("en-GB", {
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
							</span>
						</p>
					) : null}
					{hasCustomer ? (
						<ManageSubscriptionButton />
					) : (
						<p className="text-sm text-muted-foreground">
							No customer record yet — try refreshing in a minute.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
