import type { Plan } from "@mcp-gcse/db"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Resource } from "sst"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button-variants"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { auth } from "@/lib/auth"
import { getCurrentPeriodUsage, getSharedBalance } from "@/lib/billing/ledger"
import { formatPrice } from "@/lib/billing/plans"
import { TRIAL_PAPER_CAP } from "@/lib/billing/types"
import { db } from "@/lib/db"

import { getCurrency } from "@/lib/billing/currency"

import { BuyTopUpButton } from "./_components/buy-topup-button"
import { ManageSubscriptionButton } from "./_components/manage-subscription-button"

export const dynamic = "force-dynamic"

const PLAN_LABEL: Record<Plan, string> = {
	pro_monthly: "Pro · Monthly",
	limitless_monthly: "Limitless · Monthly",
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
		const [usage, balance, currency] = await Promise.all([
			user.plan === "pro_monthly"
				? getCurrentPeriodUsage(session.userId)
				: Promise.resolve(null),
			getSharedBalance(session.userId),
			getCurrency(),
		])
		return (
			<PaidBlock
				plan={user.plan}
				status={user.subscription_status}
				periodEnd={user.current_period_end}
				hasCustomer={Boolean(user.stripe_customer_id)}
				usage={usage}
				balance={balance}
				currency={currency}
			/>
		)
	}

	const balance = await getSharedBalance(session.userId)
	return <TrialBlock balance={balance} />
}

function AdminBlock() {
	return (
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
	)
}

function TrialBlock({ balance }: { balance: number }) {
	// `cap` framing only makes sense if no PPU/top-up credits have inflated
	// the balance beyond the trial allowance. When that happens (purchased
	// papers), drop the "of N" framing and just show what's left.
	const isPureTrial = balance <= TRIAL_PAPER_CAP
	const used = Math.max(0, TRIAL_PAPER_CAP - balance)
	const pct = isPureTrial
		? Math.min(100, Math.round((used / TRIAL_PAPER_CAP) * 100))
		: 0
	return (
		<div className="space-y-6">
			<p className="text-sm text-muted-foreground">
				{isPureTrial
					? "You're on the free trial."
					: "You have purchased papers available."}
			</p>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-baseline justify-between text-lg">
						<span>{isPureTrial ? "Free trial" : "Paper balance"}</span>
						<span className="text-sm font-normal text-muted-foreground">
							{balance} {balance === 1 ? "paper" : "papers"} remaining
						</span>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{isPureTrial ? <Progress value={pct} /> : null}
					<p className="text-sm text-muted-foreground">
						{balance > 0
							? `Mark ${balance} more ${balance === 1 ? "paper" : "papers"} from your current balance, or upgrade for more.`
							: "Out of papers. Buy a set or subscribe to keep marking."}
					</p>
					<div>
						<Link href="/pricing" className={buttonVariants({ size: "lg" })}>
							{balance > 0 ? "Upgrade to Pro" : "See pricing"}
						</Link>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}

type PaidBlockProps = {
	plan: Plan
	status: string
	periodEnd: Date | null
	hasCustomer: boolean
	usage: Awaited<ReturnType<typeof getCurrentPeriodUsage>>
	balance: number
	currency: "gbp" | "usd"
}

function PaidBlock(props: PaidBlockProps) {
	const planLabel = PLAN_LABEL[props.plan] ?? props.plan
	const isCappedPro = props.plan === "pro_monthly"
	const topUpPrice = Resource.StripeConfig.topUp[props.currency]
	const topUpPriceLabel = formatPrice(topUpPrice.amount, props.currency)

	return (
		<div className="space-y-6">
			<p className="text-sm text-muted-foreground">
				Manage your subscription, payment method, and invoices.
			</p>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center justify-between text-lg">
						<span>{planLabel}</span>
						<Badge variant={STATUS_TONE[props.status] ?? "secondary"}>
							{props.status.replace(/_/g, " ")}
						</Badge>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{props.periodEnd ? (
						<p className="text-sm text-muted-foreground">
							{props.status === "canceled" ? "Access ends " : "Renews "}
							<span className="font-medium text-foreground">
								{props.periodEnd.toLocaleDateString("en-GB", {
									day: "numeric",
									month: "long",
									year: "numeric",
								})}
							</span>
						</p>
					) : null}
					{props.hasCustomer ? (
						<ManageSubscriptionButton />
					) : (
						<p className="text-sm text-muted-foreground">
							No customer record yet — try refreshing in a minute.
						</p>
					)}
				</CardContent>
			</Card>

			{isCappedPro ? (
				<UsageCard
					usage={props.usage}
					balance={props.balance}
					currency={props.currency}
					topUpPriceLabel={topUpPriceLabel}
					topUpPapers={Resource.StripeConfig.topUp.papersPerPurchase}
				/>
			) : null}
		</div>
	)
}

type UsageCardProps = {
	usage: Awaited<ReturnType<typeof getCurrentPeriodUsage>>
	balance: number
	currency: "gbp" | "usd"
	topUpPriceLabel: string
	topUpPapers: number
}

function UsageCard(props: UsageCardProps) {
	if (!props.usage) {
		// Capped Pro user whose first invoice hasn't landed yet — happens
		// briefly between checkout completion and webhook delivery. Show a
		// minimal balance line; the proper meter appears once the grant lands.
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Marking allowance</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Setting up your allowance — refresh in a minute.
					</p>
				</CardContent>
			</Card>
		)
	}

	const remaining = Math.max(0, props.usage.grantSize - props.usage.consumed)
	const pct = Math.min(
		100,
		Math.round((props.usage.consumed / props.usage.grantSize) * 100),
	)
	// Cross-period extras = any PPU / top-up / admin credit on top of the
	// monthly grant. Computed by subtracting "what's left of this period's
	// grant" from the total balance.
	const extras = Math.max(0, props.balance - remaining)

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-baseline justify-between text-lg">
					<span>This month's allowance</span>
					<span className="font-mono text-sm font-normal text-muted-foreground">
						{props.usage.consumed} of {props.usage.grantSize} used
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<Progress value={pct} />
				<div className="text-sm text-muted-foreground">
					{props.usage.periodEndsAt ? (
						<p>
							Resets{" "}
							<span className="font-medium text-foreground">
								{props.usage.periodEndsAt.toLocaleDateString("en-GB", {
									day: "numeric",
									month: "long",
								})}
							</span>
						</p>
					) : null}
					{extras > 0 ? (
						<p className="mt-1">
							Plus <span className="font-medium text-foreground">{extras}</span>{" "}
							{extras === 1 ? "paper" : "papers"} from sets / top-ups (no
							expiry).
						</p>
					) : null}
				</div>
				<div className="flex flex-col gap-2 sm:flex-row">
					<BuyTopUpButton
						currency={props.currency}
						priceLabel={props.topUpPriceLabel}
						papersPerPurchase={props.topUpPapers}
					/>
					<Link
						href="/pricing"
						className={buttonVariants({ variant: "outline" })}
					>
						Compare plans
					</Link>
				</div>
			</CardContent>
		</Card>
	)
}
