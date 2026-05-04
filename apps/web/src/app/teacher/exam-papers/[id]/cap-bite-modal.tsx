"use client"

import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import type { Currency } from "@/lib/billing/types"

import { BuyTopUpButton } from "../../billing/_components/buy-topup-button"

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Human-readable insufficient-balance message (after sentinel-stripping). */
	message: string
	currency: Currency
	topUpPriceLabel: string
	topUpPapers: number
	/** Where Stripe should land the user after a successful top-up. */
	returnPath: string
}

/**
 * Cap-bite modal — surfaced when a batch commit fails because the user's
 * balance can't cover the staged scripts. Replaces the generic toast for the
 * batch path so the user can resolve the gate inline (top-up) without losing
 * their staging work.
 *
 * Two CTAs:
 *  - Top-up (primary): adds papers to the balance, returns mid-flow to the
 *    same exam paper page so the user can re-commit.
 *  - See plans: secondary, for users who'd rather subscribe / upgrade.
 *
 * The "See plans" link is plan-agnostic — the /pricing page itself handles
 * the right messaging for whoever lands there. Plan-contextual button copy
 * (e.g. trial users seeing "Buy a set" instead of "Top-up") is a post-launch
 * polish item.
 */
export function CapBiteModal(props: Props) {
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Not enough papers</DialogTitle>
					<DialogDescription>{props.message}</DialogDescription>
				</DialogHeader>
				<p className="text-sm text-muted-foreground">
					Top up to keep marking this batch, or see the full plan options.
				</p>
				<DialogFooter className="flex-col gap-2 sm:flex-row">
					<Link
						href="/pricing"
						className={buttonVariants({ variant: "outline" })}
					>
						See plans
					</Link>
					<BuyTopUpButton
						currency={props.currency}
						priceLabel={props.topUpPriceLabel}
						papersPerPurchase={props.topUpPapers}
						returnPath={props.returnPath}
					/>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
