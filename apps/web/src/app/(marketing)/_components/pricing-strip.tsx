import Link from "next/link"

import { buttonVariants } from "@/components/ui/button-variants"

export function PricingStrip() {
	return (
		<section className="border-b border-border/40 bg-muted/20">
			<div className="mx-auto max-w-3xl px-6 py-16 text-center">
				<p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Founders' pricing — first 100 customers
				</p>
				<p className="mt-3 text-2xl font-medium tracking-tight sm:text-3xl">
					50% off year one.
				</p>
				<p className="mt-3 text-base text-muted-foreground">
					Start with 20 papers free. No card needed.
				</p>
				<div className="mt-6">
					<Link href="/pricing" className={buttonVariants({ size: "lg" })}>
						See pricing
					</Link>
				</div>
			</div>
		</section>
	)
}
